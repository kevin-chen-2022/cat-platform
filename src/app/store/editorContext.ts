import { create } from 'zustand'
import type { ID } from '@/types'

// —— 编辑器上下文信息 ——
// 实时记录双语编辑器中原文/译文的选中文本和光标位置，
// 供其他功能块（查词、文本解释、定义术语、机器翻译等）订阅使用。

/** 原文选中信息 */
export interface SourceSelection {
  /** 选中的文本 */
  text: string
  /** 所属段 ID */
  segmentId: ID
  /** 选区起始偏移（相对于原文全文） */
  start: number
  /** 选区结束偏移 */
  end: number
}

/** 译文选中信息 */
export interface TargetSelection {
  /** 选中的文本 */
  text: string
  /** 所属段 ID */
  segmentId: ID
  /** 选区起始偏移（相对于译文全文） */
  start: number
  /** 选区结束偏移 */
  end: number
}

/** 译文光标位置 */
export interface TargetCursorInfo {
  /** 所属段 ID */
  segmentId: ID
  /** 光标偏移（相对于译文全文，字符数） */
  offset: number
}

/** 编辑器上下文完整信息 */
export interface EditorContextInfo {
  /** 当前激活段 ID */
  activeSegmentId: ID | null
  /** 原文选中文本（无选中时为 null） */
  sourceSelection: SourceSelection | null
  /** 译文选中文本（无选中时为 null） */
  targetSelection: TargetSelection | null
  /** 译文光标位置（不在编辑状态时为 null） */
  targetCursor: TargetCursorInfo | null
}

interface EditorContextState extends EditorContextInfo {
  setActiveSegment: (id: ID | null) => void
  setSourceSelection: (sel: SourceSelection | null) => void
  setTargetSelection: (sel: TargetSelection | null) => void
  setTargetCursor: (cursor: TargetCursorInfo | null) => void
  /** 清空所有选中/光标信息（切换段或离开编辑器时调用） */
  clearSelection: () => void

  /**
   * AI 译文 / AI 问答 / 机器翻译 等"非术语"发送文本用：
   * 如果译文当前未处于编辑态（[contenteditable="true"] 不存在），
   * 外部调用本方法把 pendingEditSegmentId 置成目标段 ID，
   * 双语编辑器检测到变化后会自动把该段切换到译文编辑态，
   * React 下一帧渲染后 [contenteditable="true"] 就出现了，外部用 setTimeout 再插入文本。
   */
  pendingEditSegmentId: ID | null
  /** 自增 tick，用来强制 React 重新订阅变化（同一段 ID 多次请求也能触发 useEffect） */
  enterEditModeTick: number
  requestEnterEditMode: (segmentId: ID) => void
}

export const useEditorContextStore = create<EditorContextState>((set) => ({
  activeSegmentId: null,
  sourceSelection: null,
  targetSelection: null,
  targetCursor: null,
  pendingEditSegmentId: null,
  enterEditModeTick: 0,

  setActiveSegment: (id) => set({ activeSegmentId: id }),
  setSourceSelection: (sel) => set({ sourceSelection: sel }),
  setTargetSelection: (sel) => set({ targetSelection: sel }),
  setTargetCursor: (cursor) => set({ targetCursor: cursor }),
  clearSelection: () =>
    set({ sourceSelection: null, targetSelection: null, targetCursor: null }),
  requestEnterEditMode: (segmentId: ID) =>
    set((s) => ({
      pendingEditSegmentId: segmentId,
      enterEditModeTick: s.enterEditModeTick + 1,
    })),
}))
