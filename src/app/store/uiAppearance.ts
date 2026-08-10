/**
 * UI 外观设置（字体 + 字号）。
 * 通过 CSS 变量作用于 rc-dock 内所有面板的内容区，不影响顶部栏/底部栏/rc-dock tab 按钮本身。
 */

import { create } from 'zustand'

/** 字体预设 id 与对应 font-family fallback 栈 */
export interface FontPreset {
  id: string
  label: string
  fontFamily: string
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'system',
    label: '系统默认',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'yahei',
    label: '微软雅黑',
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
  },
  {
    id: 'pingfang',
    label: '苹方 PingFang SC',
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'noto',
    label: '思源黑体 Noto Sans SC',
    fontFamily: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'sitka',
    label: 'Sitka Text',
    fontFamily: '"Sitka Text", "Cambria", "Georgia", "PingFang SC", serif',
  },
  {
    id: 'mono',
    label: '等宽字体',
    fontFamily:
      'Consolas, "JetBrains Mono", "Fira Code", "Source Code Pro", Menlo, Monaco, "Courier New", monospace',
  },
]

export const DEFAULT_FONT_ID = 'system'
export const DEFAULT_FONT_SIZE = 14
export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 20

interface UiAppearanceState {
  /** 当前选中字体预设 id（FONTS 中的 key） */
  fontFamilyId: string
  /** 基准字号 px（body2 = 1x，其他 variant 按比例缩放） */
  fontSize: number

  setFontFamilyId: (id: string) => void
  setFontSize: (size: number) => void
  /** 重置字体 + 字号为默认值 */
  resetAppearance: () => void
}

const STORAGE_KEY = 'cat.uiAppearance'

interface PersistShape {
  fontFamilyId?: string
  fontSize?: number
}

function loadPersist(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PersistShape
  } catch {
    return {}
  }
}

function savePersist(s: PersistShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** 根据 id 查找字体栈；找不到则用系统默认兜底 */
export function resolveFontFamily(id: string): string {
  const f = FONT_PRESETS.find((x) => x.id === id)
  return (f ?? FONT_PRESETS[0]).fontFamily
}

const initial = loadPersist()

export const useUiAppearanceStore = create<UiAppearanceState>((set, get) => ({
  fontFamilyId: initial.fontFamilyId ?? DEFAULT_FONT_ID,
  fontSize: clampFontSize(initial.fontSize),

  setFontFamilyId: (id) => {
    set({ fontFamilyId: id })
    savePersist({ fontFamilyId: id, fontSize: get().fontSize })
  },
  setFontSize: (size) => {
    const s = clampFontSize(size)
    set({ fontSize: s })
    savePersist({ fontFamilyId: get().fontFamilyId, fontSize: s })
  },
  resetAppearance: () => {
    set({ fontFamilyId: DEFAULT_FONT_ID, fontSize: DEFAULT_FONT_SIZE })
    savePersist({ fontFamilyId: DEFAULT_FONT_ID, fontSize: DEFAULT_FONT_SIZE })
  },
}))

function clampFontSize(size: number | undefined | null): number {
  if (size == null || Number.isNaN(size)) return DEFAULT_FONT_SIZE
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)))
}

/** CSS 变量名（和 index.css 中保持一致） */
export const CSS_VAR_FONT_FAMILY = '--app-content-font-family'
export const CSS_VAR_FONT_SIZE = '--app-content-font-size'

/**
 * 把 store 当前字体/字号写入 document.documentElement 的 CSS 变量。
 * AppShell 初始化时调用一次，之后 store 订阅变化时再次调用即可。
 */
export function applyAppearanceToRoot(): void {
  if (typeof document === 'undefined') return
  const { fontFamilyId, fontSize } = useUiAppearanceStore.getState()
  const root = document.documentElement
  root.style.setProperty(CSS_VAR_FONT_FAMILY, resolveFontFamily(fontFamilyId))
  root.style.setProperty(CSS_VAR_FONT_SIZE, `${fontSize}px`)
}
