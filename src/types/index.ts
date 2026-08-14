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
    /** 译员昵称(团队译文卡片显示),可为空(导入历史数据时为空) */
    createdBy?: string
    /** 译员 userId(团队译文卡片用来排除"自己的译文",仅协同译员会写入) */
    createdByUserId?: string
    domain?: string
  }
  usageCount?: number
  lastUsedAt?: number
  createdAt: number
  updatedAt: number
}

/** 团队译文记忆库条目（独立于本地 TM，专用于协同翻译中其他译员分享的译文） */
export interface TeamTMEntry {
  id?: ID
  source: string
  target: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  /** 译员昵称（顶级字段，用于复合唯一索引 & 排除自己的译文） */
  createdBy: string
  /** 译员 userId（用于排除自己的译文） */
  createdByUserId: string
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
