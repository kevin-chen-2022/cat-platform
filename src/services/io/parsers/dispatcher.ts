import type { ParseOptions, ParseResult } from './types'
import { parsePdf } from './pdf'
import { parseTxt, parseMd } from './txt'
import { parseDocx } from './docx'

export type ParseableFormat = 'pdf' | 'txt' | 'md' | 'markdown' | 'docx' | 'doc' | 'xliff' | 'json' | 'csv'

export function detectFormat(filename: string): ParseableFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'pdf': return 'pdf'
    case 'txt': return 'txt'
    case 'md':
    case 'markdown': return 'md'
    case 'docx': return 'docx'
    case 'doc': return 'doc'
    case 'xliff':
    case 'xlf': return 'xliff'
    case 'json': return 'json'
    case 'csv': return 'csv'
    default: return null
  }
}

export async function parseFile(
  file: File,
  opts: ParseOptions,
): Promise<ParseResult> {
  const format = detectFormat(file.name)
  if (!format) {
    throw new Error(`Unsupported file format: ${file.name}`)
  }

  switch (format) {
    case 'pdf': {
      const buf = await file.arrayBuffer()
      return parsePdf(buf, opts)
    }
    case 'txt':
    case 'md':
    case 'markdown': {
      const text = await file.text()
      return format === 'txt' ? parseTxt(text, opts) : parseMd(text, opts)
    }
    case 'docx': {
      const buf = await file.arrayBuffer()
      return parseDocx(buf, opts)
    }
    case 'doc':
      throw new Error('旧版 .doc（二进制）格式无法在浏览器内直接解析。请在 Word/WPS 中「另存为 .docx」后再导入，或转成 PDF/TXT 再导入。')
    case 'xliff':
      throw new Error('XLIFF parser not yet implemented.')
    case 'json':
    case 'csv':
      throw new Error(`${format.toUpperCase()} parser not yet implemented.`)
  }
}

export { parsePdf, parseTxt, parseMd, parseDocx }
