import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { BBox } from '@/types'
import type { ParseOptions, ParseResult, ParsedSegment } from './types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface TextItem {
  str: string
  transform: [number, number, number, number, number, number]
  width: number
  height: number
  hasEOL: boolean
}

interface Line {
  text: string
  x: number
  y: number
  w: number
  h: number
  page: number
}

interface Paragraph {
  text: string
  bbox: BBox
  lines: Line[]
}

const SENTENCE_END = /([。！？!?\.])\s*/g

function clusterLines(items: TextItem[], page: number, tolerance = 3): Line[] {
  const lines: Line[] = []
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])

  for (const it of sorted) {
    if (!it.str) continue
    const y = it.transform[5]
    const x = it.transform[4]
    const h = it.height || Math.abs(it.transform[3]) || 10
    const existing = lines.find((l) => l.page === page && Math.abs(l.y - y) <= tolerance)
    if (existing) {
      existing.text += it.str
      existing.w = Math.max(existing.w, x + it.width - existing.x)
      existing.h = Math.max(existing.h, h)
    } else {
      lines.push({ text: it.str, x, y, w: it.width, h, page })
    }
  }
  return lines
}

function clusterParagraphs(lines: Line[]): Paragraph[] {
  if (lines.length === 0) return []
  const sorted = [...lines].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
  const paragraphs: Paragraph[] = []
  let current: Paragraph | null = null
  let lastLine: Line | null = null

  for (const line of sorted) {
    if (!line.text.trim()) continue
    const shouldBreak = (() => {
      if (!current || !lastLine) return true
      if (line.page !== lastLine.page) return true
      const gap = lastLine.y - line.y
      const avgH = (lastLine.h + line.h) / 2
      return gap > avgH * 1.6
    })()

    if (shouldBreak) {
      if (current) paragraphs.push(current)
      current = {
        text: line.text,
        bbox: { page: line.page, x: line.x, y: line.y, w: line.w, h: line.h },
        lines: [line],
      }
    } else {
      current!.text += (current!.text.endsWith('-') ? '' : ' ') + line.text
      current!.lines.push(line)
      const b = current!.bbox
      b.x = Math.min(b.x, line.x)
      b.y = Math.min(b.y, line.y)
      b.w = Math.max(b.x + b.w, line.x + line.w) - b.x
      b.h = Math.max(b.y + b.h, line.y + line.h) - b.y
    }
    lastLine = line
  }
  if (current) paragraphs.push(current)
  return paragraphs
}

function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const parts = trimmed
    .split(SENTENCE_END)
    .reduce<string[]>((acc, part, i, arr) => {
      if (i % 2 === 0 && part) acc.push(part)
      else if (i % 2 === 1 && acc.length) acc[acc.length - 1] += part
      return acc
    }, [])
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts : [trimmed]
}

/**
 * 合并多个段落的 bbox 为一个包围盒。
 * 注意：仅适用于同页段落（跨页句子极少见，不在此处理）。
 */
function mergeBboxes(bboxes: BBox[]): BBox | null {
  if (bboxes.length === 0) return null
  const first = bboxes[0]
  let minX = first.x, minY = first.y, maxX = first.x + first.w, maxY = first.y + first.h
  for (let i = 1; i < bboxes.length; i++) {
    const b = bboxes[i]
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { page: first.page, x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function toSegments(
  paragraphs: Paragraph[],
  opts: ParseOptions,
): ParsedSegment[] {
  const segments: ParsedSegment[] = []
  let idx = 0

  // 句子/mixed 模式：全局文本流 + 句子分割
  // 把所有段落拼接成全文，在全文层面按句号分割，确保跨行/跨段落的句子不被拆开。
  // 通过偏移映射回段落的 bbox（句子可能跨多个段落，bbox 取并集）。
  if (opts.granularity === 'sentence' || opts.granularity === 'mixed') {
    // 1. 拼接全文，记录每个段落在全文中的偏移范围
    const paraRanges: Array<{ start: number; end: number; bbox: BBox }> = []
    const fullTextParts: string[] = []
    let offset = 0
    for (const p of paragraphs) {
      const text = p.text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (offset > 0) {
        fullTextParts.push(' ')
        offset += 1
      }
      const start = offset
      fullTextParts.push(text)
      offset += text.length
      paraRanges.push({ start, end: offset, bbox: p.bbox })
    }
    const fullText = fullTextParts.join('')

    if (fullText.length > 0) {
      // 2. 全局句子分割
      const sentences = splitSentences(fullText)

      // mixed 模式：全文只有一个句子且很长时，保持为整段
      const isMixedLong = opts.granularity === 'mixed' && sentences.length === 1 && fullText.length > 200

      if (!isMixedLong) {
        // 3. 为每个句子找到相关段落，计算 bbox 并集
        let searchFrom = 0
        for (const s of sentences) {
          const sNorm = s.trim()
          if (!sNorm) continue
          const sStart = fullText.indexOf(sNorm, searchFrom)
          if (sStart < 0) continue
          const sEnd = sStart + sNorm.length
          searchFrom = sEnd

          // 找到与句子范围重叠的段落
          const overlapping = paraRanges.filter((pr) => pr.start < sEnd && pr.end > sStart)
          if (overlapping.length === 0) continue

          const bbox = overlapping.length === 1
            ? overlapping[0].bbox
            : mergeBboxes(overlapping.map((o) => o.bbox))!

          segments.push({
            index: idx++,
            source: sNorm,
            target: '',
            status: 'untranslated',
            bbox,
          })
        }
        if (segments.length > 0) return segments
      }
    }
  }

  // 段落模式（或句子模式无结果时回退）：逐段落输出
  for (const p of paragraphs) {
    const text = p.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    segments.push({
      index: idx++,
      source: text,
      target: '',
      status: 'untranslated',
      bbox: p.bbox,
    })
  }
  return segments
}

export async function parsePdf(
  data: ArrayBuffer,
  opts: ParseOptions = { granularity: 'paragraph' },
): Promise<ParseResult> {
  const warnings: string[] = []
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const totalPages = pdf.numPages
  const pagesInfo: Array<{ page: number; width: number; height: number }> = []
  const allLines: Line[] = []

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      pagesInfo.push({ page: i, width: viewport.width, height: viewport.height })
      const content = await page.getTextContent()
      const items = content.items as unknown as TextItem[]
      const lines = clusterLines(items, i)
      allLines.push(...lines)
      opts.onProgress?.(i, totalPages)
    } catch (err) {
      warnings.push(`Page ${i} parse failed: ${(err as Error).message}`)
    }
  }

  const paragraphs = clusterParagraphs(allLines)
  const segments = toSegments(paragraphs, opts)

  await pdf.cleanup()

  return {
    segments,
    meta: {
      sourceFormat: 'pdf',
      pageCount: totalPages,
      parserVersion: '1.0.0',
      warnings,
    },
    layoutInfo: { pages: pagesInfo },
  }
}
