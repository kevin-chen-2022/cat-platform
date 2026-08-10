import { create } from 'zustand'

// —— 词典查询设置 store ——
// 使用 localStorage 持久化，记录用户的词典方式偏好与勾选状态

/** 词典查询方式（互斥） */
export type DictMode = 'online' | 'local'

/** 在线词典勾选状态 */
export interface OnlineDictState {
  /** 必应词典 */
  bing: boolean
  /** 有道词典 */
  youdao: boolean
  /** 欧路词典 */
  eudic: boolean
}

/** 本地词典勾选状态 */
export interface LocalDictState {
  /** 欧路词典 */
  eudic: boolean
  /** 有道词典 */
  youdao: boolean
  /** 必应词典 */
  bing: boolean
}

/** 在线词典 URL 构造 */
export const ONLINE_DICT_URL: Record<keyof OnlineDictState, (word: string) => string> = {
  bing: (w) => `https://cn.bing.com/dict/search?q=${encodeURIComponent(w)}`,
  youdao: (w) => `https://dict.youdao.com/w/${encodeURIComponent(w)}/`,
  eudic: (w) => `https://dict.eudic.net/dict/${encodeURIComponent(w)}`,
}

/**
 * 已知不支持 iframe 嵌入的在线词典（通过 X-Frame-Options / CSP frame-ancestors 拦截）。
 * 这些词典在 DictPanel 中不渲染 iframe，改为显示提示 + "在新窗口打开"按钮。
 * 注：经实测，有道词典无 X-Frame-Options 头，可正常嵌入；欧路词典为 SAMEORIGIN，禁止嵌入。
 */
export const EMBED_UNSUPPORTED: Set<keyof OnlineDictState> = new Set<keyof OnlineDictState>([
  'eudic',
])

/** 本地词典自定义协议 URL 构造 */
export const LOCAL_DICT_URL: Record<keyof LocalDictState, (word: string) => string> = {
  eudic: (w) => `eudic://dict/${encodeURIComponent(w)}`,
  youdao: (w) => `youdao://dict/${encodeURIComponent(w)}`,
  bing: (w) => `bingdict://search?word=${encodeURIComponent(w)}`,
}

/** 在线词典显示名 */
export const ONLINE_DICT_LABEL: Record<keyof OnlineDictState, string> = {
  bing: '必应词典',
  youdao: '有道词典',
  eudic: '欧路词典',
}

/** 本地词典显示名 */
export const LOCAL_DICT_LABEL: Record<keyof LocalDictState, string> = {
  eudic: '欧路词典',
  youdao: '有道词典',
  bing: '必应词典',
}

interface DictionarySettingsState {
  /** 当前选中的查询方式（在线 / 本地，互斥） */
  mode: DictMode
  /** 在线词典勾选状态 */
  online: OnlineDictState
  /** 本地词典勾选状态 */
  local: LocalDictState
  /** 当前查询词（由原文"词典查询"按钮写入） */
  queryWord: string
  /** 查询时间戳，用于触发重新查询（即使词相同） */
  queryTimestamp: number

  setMode: (mode: DictMode) => void
  toggleOnline: (key: keyof OnlineDictState) => void
  toggleLocal: (key: keyof LocalDictState) => void
  setQueryWord: (word: string) => void
}

const STORAGE_KEY = 'cat.dictionarySettings'

interface PersistShape {
  mode: DictMode
  online: OnlineDictState
  local: LocalDictState
}

function loadSettings(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // 默认：在线模式 + 必应词典勾选
      return {
        mode: 'online',
        online: { bing: true, youdao: false, eudic: false },
        local: { eudic: false, youdao: false, bing: false },
      }
    }
    return JSON.parse(raw) as PersistShape
  } catch {
    return {
      mode: 'online',
      online: { bing: true, youdao: false, eudic: false },
      local: { eudic: false, youdao: false, bing: false },
    }
  }
}

function saveSettings(s: PersistShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const initial = loadSettings()

export const useDictionaryStore = create<DictionarySettingsState>((set, get) => ({
  mode: initial.mode,
  online: initial.online,
  local: initial.local,
  queryWord: '',
  queryTimestamp: 0,

  setMode: (mode) => {
    set({ mode })
    saveSettings({ mode, online: get().online, local: get().local })
  },

  toggleOnline: (key) => {
    const online = { ...get().online, [key]: !get().online[key] }
    set({ online })
    saveSettings({ mode: get().mode, online, local: get().local })
  },

  toggleLocal: (key) => {
    const local = { ...get().local, [key]: !get().local[key] }
    set({ local })
    saveSettings({ mode: get().mode, online: get().online, local })
  },

  setQueryWord: (word) => {
    set({ queryWord: word, queryTimestamp: Date.now() })
  },
}))
