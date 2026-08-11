import { create } from 'zustand'
import { toBaiduLang, toAliLang } from './languages'

// —— 机器翻译设置 store ——
// 使用 localStorage 持久化，记录用户的翻译方式偏好与勾选状态

/** 机器翻译方式（互斥） */
export type MtMode = 'web' | 'api'

/** 网页嵌入翻译勾选状态 */
export interface MtWebState {
  /** 百度翻译 */
  baidu: boolean
  /** 有道翻译 */
  youdao: boolean
  /** 腾讯翻译君 */
  qq: boolean
  /** 阿里翻译 */
  alibaba: boolean
  /** 搜狗翻译 */
  sogou: boolean
  /** 金山词霸 */
  iciba: boolean
}

/** API 翻译勾选状态 + 密钥配置 */
export interface MtApiState {
  /** 百度翻译（需 AppID + 密钥） */
  baidu: { enabled: boolean; appId: string; secret: string }
  /** 彩云小译（需 token） */
  caiyun: { enabled: boolean; token: string }
}

/** 网页翻译 URL 构造（预填查询词，部分网页支持 URL 语言段） */
export const MT_WEB_URL: Record<keyof MtWebState, (text: string, src: string, tgt: string) => string> = {
  baidu: (t, src, tgt) => `https://fanyi.baidu.com/#${toBaiduLang(src)}/${toBaiduLang(tgt)}/${encodeURIComponent(t)}`,
  youdao: (t) => `https://fanyi.youdao.com/?keyfrom=null#textview${encodeURIComponent(t)}`,
  qq: (t) => `https://fanyi.qq.com/?text=${encodeURIComponent(t)}`,
  alibaba: (t, src, tgt) => `https://translate.alibaba.com/#${toAliLang(src)}/${toAliLang(tgt)}/${encodeURIComponent(t)}`,
  sogou: (t) => `https://fanyi.sogou.com/?keyword=${encodeURIComponent(t)}`,
  iciba: (t) => `https://fanyi.iciba.com/?phrase=${encodeURIComponent(t)}`,
}

/** 网页翻译显示名 */
export const MT_WEB_LABEL: Record<keyof MtWebState, string> = {
  baidu: '百度翻译',
  youdao: '有道翻译',
  qq: '腾讯翻译君',
  alibaba: '阿里翻译',
  sogou: '搜狗翻译',
  iciba: '金山词霸',
}

/** API 翻译显示名 */
export const MT_API_LABEL: Record<keyof MtApiState, string> = {
  baidu: '百度翻译 API',
  caiyun: '彩云小译 API',
}

/** 不支持 iframe 嵌入的翻译网页（实测后维护） */
export const MT_EMBED_UNSUPPORTED: Set<keyof MtWebState> = new Set<keyof MtWebState>([])

interface MachineTranslationState {
  /** 当前选中的翻译方式（网页 / API，互斥） */
  mode: MtMode
  /** 网页翻译勾选状态 */
  web: MtWebState
  /** API 翻译勾选状态 + 密钥 */
  api: MtApiState
  /** 源语言（通用代码，如 en / zh-CN / auto；为空时由面板读取项目语言对） */
  srcLang: string
  /** 目标语言（通用代码，如 zh-CN / en） */
  tgtLang: string
  /** 当前待翻译文本（由原文"机器翻译"按钮写入） */
  queryText: string
  /** 查询时间戳，用于触发重新查询 */
  queryTimestamp: number

  setMode: (mode: MtMode) => void
  toggleWeb: (key: keyof MtWebState) => void
  setApi: (key: keyof MtApiState, patch: Partial<MtApiState[keyof MtApiState]>) => void
  setLang: (src: string, tgt: string) => void
  setQueryText: (text: string) => void
}

const STORAGE_KEY = 'cat.mtSettings'

interface PersistShape {
  mode: MtMode
  web: MtWebState
  api: MtApiState
  srcLang: string
  tgtLang: string
}

function defaultSettings(): PersistShape {
  // 默认：网页模式 + 百度翻译勾选；语言对留空，由面板读取项目语言对填充
  return {
    mode: 'web',
    web: { baidu: true, youdao: false, qq: false, alibaba: false, sogou: false, iciba: false },
    api: {
      baidu: { enabled: false, appId: '', secret: '' },
      caiyun: { enabled: false, token: '' },
    },
    srcLang: '',
    tgtLang: '',
  }
}

function loadSettings(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings()
    // 兼容旧版本持久化数据（无 srcLang/tgtLang 字段）
    const parsed = JSON.parse(raw) as Partial<PersistShape>
    return { ...defaultSettings(), ...parsed }
  } catch {
    return defaultSettings()
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

export const useMachineTranslationStore = create<MachineTranslationState>((set, get) => ({
  mode: initial.mode,
  web: initial.web,
  api: initial.api,
  srcLang: initial.srcLang,
  tgtLang: initial.tgtLang,
  queryText: '',
  queryTimestamp: 0,

  setMode: (mode) => {
    set({ mode })
    saveSettings({ mode, web: get().web, api: get().api, srcLang: get().srcLang, tgtLang: get().tgtLang })
  },

  toggleWeb: (key) => {
    const web = { ...get().web, [key]: !get().web[key] }
    set({ web })
    saveSettings({ mode: get().mode, web, api: get().api, srcLang: get().srcLang, tgtLang: get().tgtLang })
  },

  setApi: (key, patch) => {
    const api = { ...get().api, [key]: { ...get().api[key], ...patch } }
    set({ api })
    saveSettings({ mode: get().mode, web: get().web, api, srcLang: get().srcLang, tgtLang: get().tgtLang })
  },

  setLang: (src, tgt) => {
    set({ srcLang: src, tgtLang: tgt })
    saveSettings({ mode: get().mode, web: get().web, api: get().api, srcLang: src, tgtLang: tgt })
  },

  setQueryText: (text) => {
    set({ queryText: text, queryTimestamp: Date.now() })
  },
}))
