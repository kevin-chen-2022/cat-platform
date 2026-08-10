import type { BBox, ParseGranularity, SegmentStatus } from '@/types'

export interface ParseOptions {
  granularity: ParseGranularity
  sourceLang?: string
  targetLang?: string
  onProgress?: (page: number, totalPages: number) => void
}

export interface ParsedSegment {
  source: string
  target: string
  status: SegmentStatus
  index: number
  bbox?: BBox
  notes?: string
}

export interface ParseResult {
  segments: ParsedSegment[]
  meta: {
    sourceFormat: 'pdf' | 'txt' | 'md' | 'docx' | 'xliff' | 'json' | 'csv'
    pageCount?: number
    langDetected?: string
    parserVersion: string
    warnings: string[]
  }
  layoutInfo?: {
    pages: Array<{
      page: number
      width: number
      height: number
    }>
  }
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  granularity: 'paragraph',
}
