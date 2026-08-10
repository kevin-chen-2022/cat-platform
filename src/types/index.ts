export type ID = number | string

export type LanguageCode = string

export type SegmentStatus =
  | 'untranslated'
  | 'draft'
  | 'translated'
  | 'reviewing'
  | 'approved'
  | 'rejected'

export interface Project {
  id?: ID
  name: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  description?: string
  createdAt: number
  updatedAt: number
  meta?: Record<string, unknown>
}

export interface File {
  id?: ID
  projectId: ID
  folderId?: ID | null
  name: string
  format: 'xliff' | 'txt' | 'md' | 'markdown' | 'docx' | 'json' | 'csv' | 'pdf'
  sourceContent?: string
  /**
   * 原始文件二进制（仅 docx / pdf 在导入时保留），用于「原格式预览」。
   * IndexedDB 原生支持 Blob 存储，浏览器 File 对象本身就是 Blob 子类可直接存入。
   * txt/md 等纯文本格式不保留（体积小且纯文本预览已够用）。
   */
  rawBlob?: Blob
  /** 同父级下的同级排序号，越小越靠前；0 或 undefined 时按 name 兜底排 */
  position?: number
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id?: ID
  projectId: ID
  parentId?: ID | null
  name: string
  /** 同父级下的同级排序号，越小越靠前；0 或 undefined 时按 name 兜底排 */
  position?: number
  createdAt: number
  updatedAt: number
}

export interface BBox {
  page: number
  x: number
  y: number
  w: number
  h: number
}

export interface Segment {
  id?: ID
  fileId: ID
  index: number
  source: string
  target: string
  status: SegmentStatus
  notes?: string
  matchScore?: number
  matchSource?: 'tm' | 'mt' | 'human'
  locked?: boolean
  bbox?: BBox
  createdAt: number
  updatedAt: number
}

export interface TMEntry {
  id?: ID
  source: string
  target: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  projectId?: ID
  meta?: {
    sourceFile?: string
    createdBy?: string
    domain?: string
  }
  usageCount?: number
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

export interface TBEntry {
  id?: ID
  term: string
  translation: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  /** 归属项目 ID；为空表示全局共享 */
  projectId?: ID
  definition?: string
  context?: string
  partOfSpeech?: string
  forbidden?: boolean
  note?: string
  createdAt: number
  updatedAt: number
}

export interface MTProviderConfig {
  id: string
  name: string
  type: 'deepl' | 'google' | 'baidu' | 'youdao' | 'openai' | 'custom'
  enabled: boolean
  apiKey?: string
  endpoint?: string
  priority: number
  settings?: Record<string, unknown>
}

export interface MatchResult {
  entry: TMEntry
  score: number
}

export interface QAIssue {
  id?: ID
  segmentId: ID
  type:
    | 'term_mismatch'
    | 'number_mismatch'
    | 'tag_mismatch'
    | 'empty_target'
    | 'duplicate'
    | 'length_ratio'
    | 'custom'
  severity: 'info' | 'warning' | 'error'
  message: string
  resolved?: boolean
  createdAt: number
}

export type ThemeMode = 'light' | 'dark'

export type LayoutMode = 'desktop' | 'mobile' | 'tablet'

export type ParseGranularity = 'sentence' | 'paragraph' | 'mixed'

export type PreviewMode = 'pdf-overlay' | 'pdf-reflow' | 'html'

export type LayoutType = 'user' | 'last'
export type WorkbenchMode = 'translate' | 'dictionary' | 'memory'

export interface SavedLayout {
  id?: ID
  name: string
  type: LayoutType
  dockLayout: unknown
  activeProjectId?: ID
  activeFileId?: ID
  savedAt: number
}

export interface DockPanelKey {
  editor: string
  tm: string
  tb: string
  mt: string
  project: string
  qa: string
  settings: string
}
