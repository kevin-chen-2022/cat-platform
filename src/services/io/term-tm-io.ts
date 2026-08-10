import type { LanguageCode, ID } from '@/types'
import { downloadBlob } from '.'

/** 通用：CSV 行解析（兼容双引号转义） */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
  }
  cells.push(cur)
  return cells
}

export type PairFormat = 'xlsx' | 'xls' | 'csv' | 'json' | 'txt' | 'tsv'
export type PairExportFormat = 'xlsx' | 'csv' | 'json' | 'txt'

export interface PairRow {
  source: string
  target: string
  createdAt?: number
  updatedAt?: number
  sourceLang?: LanguageCode
  targetLang?: LanguageCode
  projectId?: ID
  meta?: Record<string, unknown>
}

export interface ParsePairResult {
  pairs: PairRow[]
  /** 原始文件名 */
  fileName: string
  /** 原始文件格式（检测得到） */
  format: PairFormat
}

/** 从多种格式解析成 PairRow[]；Excel 用 xlsx 库动态 import（不把它打进来） */
export async function parsePairFile(file: File): Promise<ParsePairResult> {
  const lower = file.name.toLowerCase()
  let format: PairFormat = 'txt'
  if (lower.endsWith('.xlsx')) format = 'xlsx'
  else if (lower.endsWith('.xls')) format = 'xls'
  else if (lower.endsWith('.csv')) format = 'csv'
  else if (lower.endsWith('.json')) format = 'json'
  else if (lower.endsWith('.tsv')) format = 'tsv'

  // Excel：xlsx/xls 走 xlsx 库二进制读取
  if (format === 'xlsx' || format === 'xls') {
    const { default: XLSX } = await import('xlsx')
    const reader = new FileReader()
    const result = await new Promise<PairRow[]>((resolve, reject) => {
      reader.onerror = () => reject(reader.error)
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: 'binary' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
          if (aoa.length === 0) { resolve([]); return }
          const first = aoa[0].map((c: any) => String(c ?? '').trim())
          const isHeader = first.length >= 2 && (
            first[0] === '原文' || first[0].toLowerCase() === 'source' ||
            first[0] === '术语原文' || first[0] === '记忆原文'
          )
          const pairs: PairRow[] = []
          for (let i = isHeader ? 1 : 0; i < aoa.length; i++) {
            const row = aoa[i].map((c: any) => String(c ?? '').trim())
            if (row.length >= 2 && row[0] && row[1]) {
              pairs.push({ source: row[0], target: row[1] })
            }
          }
          resolve(pairs)
        } catch (err) { reject(err) }
      }
      reader.readAsBinaryString(file)
    })
    return { pairs: result, fileName: file.name, format }
  }

  const text = await file.text()
  const pairs: PairRow[] = []

  if (format === 'json') {
    const data = JSON.parse(text)
    if (!Array.isArray(data)) throw new Error('JSON 必须是数组')
    for (const item of data) {
      if (item && typeof item === 'object' && typeof item.source === 'string' && typeof item.target === 'string') {
        const row: PairRow = { source: item.source, target: item.target }
        if (typeof item.createdAt === 'number') row.createdAt = item.createdAt
        if (typeof item.updatedAt === 'number') row.updatedAt = item.updatedAt
        if (typeof item.sourceLang === 'string') row.sourceLang = item.sourceLang as LanguageCode
        if (typeof item.targetLang === 'string') row.targetLang = item.targetLang as LanguageCode
        if (item.projectId) row.projectId = item.projectId
        if (item.meta && typeof item.meta === 'object') row.meta = item.meta as Record<string, unknown>
        pairs.push(row)
      }
    }
  } else if (format === 'csv' || format === 'tsv') {
    const raw = text.replace(/^\uFEFF/, '')
    const lines = raw.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length > 0) {
      const firstCells = splitCsvLine(lines[0])
      const isHeader = firstCells.length >= 2 && (
        firstCells[0].toLowerCase() === 'source' || firstCells[0] === '原文' ||
        firstCells[0] === '术语原文' || firstCells[0] === '记忆原文'
      )
      for (let i = isHeader ? 1 : 0; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i])
        if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) {
          pairs.push({ source: cells[0].trim(), target: cells[1].trim() })
        }
      }
    }
  } else {
    // txt：优先 Tab；兼容双空格、破折号、箭头等
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    for (const line of lines) {
      let cells: string[]
      if (line.includes('\t')) cells = line.split('\t')
      else cells = line.split(/\s{2,}|—|→/)
      if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) {
        pairs.push({ source: cells[0].trim(), target: cells.slice(1).join(' ').trim() })
      }
    }
  }

  return { pairs, fileName: file.name, format }
}

export interface PairExportMeta {
  /** 导出前缀名：glossary / memory 等 */
  prefix: string
  /** xlsx 的 sheet 名 */
  sheetName: string
  /** Excel 两列宽（字符数） */
  colWidths?: [number, number]
  /** 是否在导出中含额外字段（JSON 专用：createdAt/sourceLang/...） */
  includeExtendedFields?: boolean
}

/** 把 PairRow[] 导出为多格式 */
export async function exportPairFile(
  rows: PairRow[],
  format: PairExportFormat,
  meta: PairExportMeta,
): Promise<{ fileName: string }> {
  if (rows.length === 0) throw new Error('导出数据为空')
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const fnameBase = `${meta.prefix}_${stamp}`
  const colWidths = meta.colWidths ?? [30, 40]

  if (format === 'xlsx') {
    const { default: XLSX } = await import('xlsx')
    const aoa: any[][] = [['原文', '译文']]
    for (const r of rows) aoa.push([r.source, r.target])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: colWidths[0] }, { wch: colWidths[1] }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, meta.sheetName)
    const fname = `${fnameBase}.xlsx`
    XLSX.writeFile(wb, fname)
    return { fileName: fname }
  }

  let content = ''
  let mime = 'text/plain;charset=utf-8'
  let ext = format

  if (format === 'csv') {
    const out = ['source,target']
    for (const r of rows) {
      const s = (r.source ?? '').replace(/"/g, '""')
      const t = (r.target ?? '').replace(/"/g, '""')
      out.push(`"${s}","${t}"`)
    }
    content = '\uFEFF' + out.join('\n')
    mime = 'text/csv;charset=utf-8'
  } else if (format === 'json') {
    if (meta.includeExtendedFields) {
      content = JSON.stringify(rows.map((r) => ({
        source: r.source,
        target: r.target,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        sourceLang: r.sourceLang,
        targetLang: r.targetLang,
        projectId: r.projectId,
        meta: r.meta,
      })), null, 2)
    } else {
      content = JSON.stringify(rows.map((r) => ({ source: r.source, target: r.target })), null, 2)
    }
    mime = 'application/json;charset=utf-8'
  } else {
    content = rows.map((r) => `${r.source}\t${r.target}`).join('\n')
  }

  const fname = `${fnameBase}.${ext}`
  const blob = new Blob([content], { type: mime })
  downloadBlob(blob, fname)
  return { fileName: fname }
}
