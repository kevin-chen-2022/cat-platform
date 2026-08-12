/**
 * 最近翻译结果缓存 store
 *
 * 用于跨卡片共享 TM / 机器翻译 / AI 翻译的最近一次结果，
 * 供双语编辑器译文按钮区"复制 XXX 译文"按钮读取。
 *
 * - 缓存按 segmentId 分组：切换段时各卡片重新查询会覆盖该段缓存
 * - 仅保留每个段每种来源的最新一条结果，避免无限增长
 * - 纯内存 store，不持久化（刷新即清空，符合"最近一次"语义）
 */
import { create } from 'zustand'
import type { ID } from '@/types'

export type LatestSource = 'tm' | 'mt' | 'ai'

interface LatestEntry {
  text: string
  updatedAt: number
}

interface LatestTranslationsState {
  /** key: `${source}:${segmentId}` */
  entries: Record<string, LatestEntry>
  /** 写入某段某来源的最新结果（text 为空时清除该条） */
  setLatest: (source: LatestSource, segmentId: ID, text: string) => void
  /** 读取某段某来源的最新结果（无则返回 null） */
  getLatest: (source: LatestSource, segmentId: ID) => string | null
  /** 清空全部缓存（切换项目时调用） */
  clearAll: () => void
}

const buildKey = (source: LatestSource, segmentId: ID) => `${source}:${segmentId}`

export const useLatestTranslationsStore = create<LatestTranslationsState>((set, get) => ({
  entries: {},
  setLatest: (source, segmentId, text) => {
    const key = buildKey(source, segmentId)
    set((state) => {
      const next = { ...state.entries }
      if (text.trim()) {
        next[key] = { text, updatedAt: Date.now() }
      } else {
        delete next[key]
      }
      return { entries: next }
    })
  },
  getLatest: (source, segmentId) => {
    const key = buildKey(source, segmentId)
    return get().entries[key]?.text ?? null
  },
  clearAll: () => set({ entries: {} }),
}))
