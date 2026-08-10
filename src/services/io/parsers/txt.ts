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

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}|\n(?=\S)/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function toSegments(text: string, opts: ParseOptions, format: 'txt' | 'md'): ParsedSegment[] {
  const segments: ParsedSegment[] = []
  let idx = 0
  const paragraphs = splitParagraphs(text)

  for (const p of paragraphs) {
    if (!p) continue
    if (format === 'md' && /^(#{1,6}\s|[-*+]\s|\d+\.\s|>)/.test(p)) {
      segments.push({ index: idx++, source: p, target: '', status: 'untranslated' })
      continue
    }
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
  return segments
}

export async function parseTxt(
  text: string,
  opts: ParseOptions = { granularity: 'paragraph' },
): Promise<ParseResult> {
  return {
    segments: toSegments(text, opts, 'txt'),
    meta: { sourceFormat: 'txt', parserVersion: '1.0.0', warnings: [] },
  }
}

export async function parseMd(
  text: string,
  opts: ParseOptions = { granularity: 'paragraph' },
): Promise<ParseResult> {
  return {
    segments: toSegments(text, opts, 'md'),
    meta: { sourceFormat: 'md', parserVersion: '1.0.0', warnings: [] },
  }
}
