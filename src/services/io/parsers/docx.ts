import mammoth from 'mammoth'
import type { ParseOptions, ParseResult, ParsedSegment } from './types'

const SENTENCE_END = /([。！？!?\.])\s*/g

function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const parts = trimmed
    .split(SENTENCE_END)
    .reduce<string[]>((acc, part, i) => {
      if (i % 2 === 0 && part) acc.push(part)
      else if (i % 2 === 1 && acc.length) acc[acc.length - 1] += part
      return acc
    }, [])
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts : [trimmed]
}

/**
 * 从 mammoth 生成的 HTML 中按顺序提取段落（含列表项、表格单元格、段落）。
 * mammoth 的 HTML 语义：
 *   <p> 段落；<li> 列表项；<table><tr><td> 单元格
 * 我们使用简单的 DOM 解析（浏览器环境），按 DOM 顺序将各块作为一个"段落"单元。
 */
function extractParagraphsFromHtml(html: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const blocks = doc.querySelectorAll('p, li, td, th, h1, h2, h3, h4, h5, h6, pre, blockquote')
  const paragraphs: string[] = []
  for (const el of Array.from(blocks)) {
    const text = (el.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) paragraphs.push(text)
  }
  // 兜底：如果 DOM 解析异常没取到，则用换行分隔的纯文本回退
  if (paragraphs.length === 0) {
    const plain = (doc.body?.textContent ?? '').replace(/\u00a0/g, ' ')
    return plain
      .split(/\n{2,}|\n(?=\S)/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }
  return paragraphs
}

export async function parseDocx(
  arrayBuffer: ArrayBuffer,
  opts: ParseOptions = { granularity: 'paragraph' },
): Promise<ParseResult> {
  const warnings: string[] = []
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    { includeDefaultStyleMap: true, ignoreEmptyParagraphs: true },
  )
  if (result.messages && result.messages.length > 0) {
    for (const m of result.messages) {
      if (m.type === 'warning') warnings.push(m.message)
    }
  }
  const paragraphs = extractParagraphsFromHtml(result.value || '')
  const segments: ParsedSegment[] = []
  let idx = 0
  for (const p of paragraphs) {
    if (!p) continue
    if (opts.granularity === 'sentence' || opts.granularity === 'mixed') {
      const sentences = splitSentences(p)
      const isMixedLong = opts.granularity === 'mixed' && sentences.length === 1 && p.length > 200
      if (!isMixedLong) {
        for (const s of sentences) {
          if (s.trim()) segments.push({ index: idx++, source: s, target: '', status: 'untranslated' })
        }
        continue
      }
    }
    segments.push({ index: idx++, source: p, target: '', status: 'untranslated' })
  }
  return {
    segments,
    meta: { sourceFormat: 'docx', parserVersion: '1.0.0', warnings },
  }
}
