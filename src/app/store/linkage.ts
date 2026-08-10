/**
 * 翻译联动：集中管理双语编辑器与各功能卡片的联动事件。
 *
 * 架构：规则表 + 分发器。
 * - 规则表（LINKAGE_RULES）：声明"事件 → 目标卡片 → 动作"的映射，新增联动只需加一行。
 * - 分发器（dispatchLinkage）：过滤当前 active tab 命中的规则并执行动作。
 *
 * 触发事件：
 * - segmentActivated：双语编辑器激活新段（防抖 400ms，避免快速切换段时产生大量请求）
 * - sourceSelected：用户选中激活段原文文本（立即响应，不防抖）
 * - targetSelected：用户选中激活段译文文本（暂未实现规则，保留事件类型）
 *
 * 联动对象：翻译布局中所有处于 active 状态的 tab（用户当前正在看的）。
 * 联动时只发数据，不主动切换 tab。
 */

import { getDockRef, collectVisibleTabs, useLayoutStore } from './layout'
import { useProjectStore } from './project'
import { useAiQAStore } from './aiQA'
import { useMachineTranslationStore } from './machineTranslation'
import { useDictionaryStore } from './dictionary'
import { useEditorContextStore } from './editorContext'

// ---- 事件类型 ----
export type LinkageEvent = 'segmentActivated' | 'sourceSelected' | 'targetSelected'

// ---- 联动负载 ----
export interface SegmentActivatedPayload {
  segmentId: string | number | null
  sourceText: string
}
export interface SourceSelectedPayload {
  text: string
  segmentId: string | number | null
  fullSource: string // 整段原文，作为上下文
}
export interface TargetSelectedPayload {
  text: string
  segmentId: string | number | null
}

type LinkagePayload = SegmentActivatedPayload | SourceSelectedPayload | TargetSelectedPayload

// ---- 规则定义 ----
interface LinkageRule {
  event: LinkageEvent
  targetTabId: string
  action: (payload: LinkagePayload) => void
}

// ---- 各目标卡片的动作实现 ----

/** AI翻译：发送原文 → 显示 AI 译文（仅未译段落自动触发，过滤已译状态） */
function sendToAiTranslate(payload: SegmentActivatedPayload): void {
  const text = payload.sourceText?.trim()
  if (!text) return
  // 正向联动过滤：仅未译段落才自动触发 AI 翻译，避免覆盖已译内容
  if (payload.segmentId != null) {
    const seg = useProjectStore.getState().segments.find((s) => s.id === payload.segmentId)
    if (seg && seg.status !== 'untranslated') return
  }
  // 复用 AI翻译的 setTranslate 接口，仅设置 text，保留 src/tgt/domain 现有值
  useAiQAStore.getState().setTranslate({ text })
}

/** 翻译记忆：发送原文 → 显示匹配 TM */
function sendToTM(payload: SegmentActivatedPayload): void {
  const text = payload.sourceText?.trim()
  if (!text) return
  // TM 面板通过 useEditorContextStore 订阅 querySource，这里写入 project store 的临时字段
  // 实际 TM 面板会订阅 linkageQuerySource
  useLinkageTMStore.getState().setQuery(text)
}

/** 机器翻译：发送原文 → 显示机器译文（仅未译段落自动触发，过滤已译状态） */
function sendToMachineTranslate(payload: SegmentActivatedPayload): void {
  const text = payload.sourceText?.trim()
  if (!text) return
  // 正向联动过滤：仅未译段落才自动触发机器翻译，避免覆盖已译内容
  if (payload.segmentId != null) {
    const seg = useProjectStore.getState().segments.find((s) => s.id === payload.segmentId)
    if (seg && seg.status !== 'untranslated') return
  }
  useMachineTranslationStore.getState().setQueryText(text)
}

/** AI问答：发送选中原文 → 显示 AI 回答 */
function sendToAiQA(payload: SourceSelectedPayload): void {
  const text = payload.text?.trim()
  if (!text) return
  // AI问答需要"选中内容"+"整段原文"作为上下文
  useAiQAStore.getState().setQuery(text, payload.fullSource)
}

/** 词典查询：发送选中原文 → 显示词典解释 */
function sendToDict(payload: SourceSelectedPayload): void {
  const word = payload.text?.trim()
  if (!word) return
  useDictionaryStore.getState().setQueryWord(word)
}

/** 片段搜索：发送选中原文 → 显示搜索结果 */
function sendToFragmentSearch(payload: SourceSelectedPayload): void {
  const keyword = payload.text?.trim()
  if (!keyword) return
  useLinkageFragmentSearchStore.getState().setKeyword(keyword)
}

// ---- 规则表 ----
// 新增联动只需在此数组追加一行，无需修改分发器
const LINKAGE_RULES: LinkageRule[] = [
  { event: 'segmentActivated', targetTabId: 'aitranslate', action: (p) => sendToAiTranslate(p as SegmentActivatedPayload) },
  { event: 'segmentActivated', targetTabId: 'tm', action: (p) => sendToTM(p as SegmentActivatedPayload) },
  { event: 'segmentActivated', targetTabId: 'mt', action: (p) => sendToMachineTranslate(p as SegmentActivatedPayload) },
  { event: 'sourceSelected', targetTabId: 'aiqa', action: (p) => sendToAiQA(p as SourceSelectedPayload) },
  { event: 'sourceSelected', targetTabId: 'dict', action: (p) => sendToDict(p as SourceSelectedPayload) },
  { event: 'sourceSelected', targetTabId: 'fragmentSearch', action: (p) => sendToFragmentSearch(p as SourceSelectedPayload) },
  // targetSelected 暂无规则，后续可在此补充
]

// ---- active tab 收集 ----

/**
 * 递归遍历 LayoutData，收集每个 panel 的 activeId（即用户当前正在看的 tab）。
 * 一个 panel 可能含多个 tab，但只有一个 activeId。
 */
function collectActiveTabIds(): string[] {
  const ref = getDockRef()
  if (!ref) return []
  let layout: any
  try {
    layout = ref.saveLayout()
  } catch {
    return []
  }
  if (!layout) return []
  const ids: string[] = []
  const walk = (node: any) => {
    if (!node) return
    // PanelData 含 tabs 和 activeId
    if (Array.isArray(node.tabs) && typeof node.activeId === 'string' && node.activeId) {
      ids.push(node.activeId)
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c)
    }
  }
  // 遍历 dockbox / floatbox / maxbox
  walk(layout.dockbox)
  walk(layout.floatbox)
  walk(layout.maxbox)
  walk(layout.windowbox)
  return ids
}

// ---- 分发器 ----

/**
 * 分发联动事件：遍历规则表，对命中的规则（事件匹配 + 目标 tab 是当前 active）执行动作。
 */
export function dispatchLinkage(event: LinkageEvent, payload: LinkagePayload): void {
  const activeTabIds = collectActiveTabIds()
  if (activeTabIds.length === 0) return
  for (const rule of LINKAGE_RULES) {
    if (rule.event !== event) continue
    if (!activeTabIds.includes(rule.targetTabId)) continue
    try {
      rule.action(payload)
    } catch {
      // 单个规则失败不影响其他规则
    }
  }
}

// ---- 防抖 ----

let segmentActivatedTimer: ReturnType<typeof setTimeout> | null = null
const SEGMENT_DEBOUNCE_MS = 400

/**
 * 激活段联动（防抖 400ms）：快速切换段时只处理最后一次。
 */
export function dispatchSegmentActivated(segmentId: string | number | null, sourceText: string): void {
  if (segmentActivatedTimer) {
    clearTimeout(segmentActivatedTimer)
  }
  segmentActivatedTimer = setTimeout(() => {
    dispatchLinkage('segmentActivated', { segmentId, sourceText })
    segmentActivatedTimer = null
  }, SEGMENT_DEBOUNCE_MS)
}

/**
 * 原文选中控联联动（立即响应，不防抖）。
 */
export function dispatchSourceSelected(text: string, segmentId: string | number | null, fullSource: string): void {
  dispatchLinkage('sourceSelected', { text, segmentId, fullSource })
}

/**
 * 译文选中控联联动（立即响应，不防抖）。
 */
export function dispatchTargetSelected(text: string, segmentId: string | number | null): void {
  dispatchLinkage('targetSelected', { text, segmentId })
}

// ---- TM / 片段搜索的联动专用 store ----
// 这两个面板原本不订阅外部查询字段，新增轻量 store 供联动写入。

import { create } from 'zustand'

interface LinkageTMState {
  querySource: string
  queryTimestamp: number
  setQuery: (source: string) => void
}

export const useLinkageTMStore = create<LinkageTMState>((set) => ({
  querySource: '',
  queryTimestamp: 0,
  setQuery: (source) => set({ querySource: source, queryTimestamp: Date.now() }),
}))

interface LinkageFragmentSearchState {
  queryKeyword: string
  queryTimestamp: number
  setKeyword: (keyword: string) => void
}

export const useLinkageFragmentSearchStore = create<LinkageFragmentSearchState>((set) => ({
  queryKeyword: '',
  queryTimestamp: 0,
  setKeyword: (keyword) => set({ queryKeyword: keyword, queryTimestamp: Date.now() }),
}))

// ============================================================
//  反向联动：功能卡片被用户激活时 → 读取双语编辑器当前状态 → 按需更新卡片内容
// ============================================================

/**
 * 反向联动规则：
 * - 用户切换 tab 时触发
 * - 每个 tab 对应一个 action：读编辑器状态，判断是否新内容，是则写入 store
 * - action 返回 true 表示写入了新内容，false 表示无需更新
 */
interface ReverseLinkageRule {
  targetTabId: string
  action: () => boolean
}

/** 辅助：读当前激活段的原文 */
function readActiveSource(): { segmentId: ID | null; source: string } {
  const p = useProjectStore.getState()
  const id = p.activeSegmentId
  if (id == null) return { segmentId: null, source: '' }
  const seg = p.segments.find((s) => s.id === id)
  return { segmentId: id, source: seg?.source ?? '' }
}

/** 辅助：读当前原文选中文本 + 整段原文上下文 */
function readSourceSelection(): { selected: string; fullSource: string } {
  const sel = useEditorContextStore.getState().sourceSelection
  if (!sel) return { selected: '', fullSource: '' }
  const full = readActiveSource().source
  return { selected: sel.text, fullSource: full }
}

/** 辅助：判断当前是否为翻译布局（非翻译布局不触发反向联动） */
function isTranslateMode(): boolean {
  return useLayoutStore.getState().workbenchMode === 'translate'
}

// ---- 反向动作实现 ----

/** AI翻译反向：激活 AI翻译 tab → 读当前段原文 → 新内容则触发 AI 翻译（仅未译段落） */
function reverseAiTranslate(): boolean {
  const p = useProjectStore.getState()
  const id = p.activeSegmentId
  if (id == null) return false
  const seg = p.segments.find((s) => s.id === id)
  const text = (seg?.source ?? '').trim()
  if (!text) return false
  // 反向联动过滤：仅未译段落才自动触发 AI 翻译，避免覆盖已译内容
  if (seg && seg.status !== 'untranslated') return false
  const s = useAiQAStore.getState()
  if (s.translateText.trim() === text) return false // 相同内容，跳过
  s.setTranslate({ text })
  return true
}

/** 翻译记忆反向：激活 TM tab → 读当前段原文 → 新内容则展示匹配 TM */
function reverseTM(): boolean {
  const { source } = readActiveSource()
  const text = source.trim()
  if (!text) return false
  const s = useLinkageTMStore.getState()
  if (s.querySource.trim() === text) return false
  s.setQuery(text)
  return true
}

/** 机器翻译反向：激活 MT tab → 读当前段原文 → 新内容则触发机器翻译（仅未译段落） */
function reverseMT(): boolean {
  const p = useProjectStore.getState()
  const id = p.activeSegmentId
  if (id == null) return false
  const seg = p.segments.find((s) => s.id === id)
  const text = (seg?.source ?? '').trim()
  if (!text) return false
  // 反向联动过滤：仅未译段落才自动触发机器翻译，避免覆盖已译内容
  if (seg && seg.status !== 'untranslated') return false
  const s = useMachineTranslationStore.getState()
  if (s.queryText.trim() === text) return false
  s.setQueryText(text)
  return true
}

/** AI问答反向：激活 AI问答 tab → 读当前原文选中文本 → 有选中且是新内容则触发 */
function reverseAiQA(): boolean {
  const { selected, fullSource } = readSourceSelection()
  const text = selected.trim()
  if (!text) return false // 严格：无选中文本则不触发
  const s = useAiQAStore.getState()
  if (s.queryText.trim() === text && s.queryContext === fullSource) return false
  s.setQuery(text, fullSource)
  return true
}

/** 词典查询反向：激活 dict tab → 读当前原文选中文本 → 有选中且是新内容则查词典 */
function reverseDict(): boolean {
  const { selected } = readSourceSelection()
  const word = selected.trim()
  if (!word) return false // 严格：无选中文本则不触发
  const s = useDictionaryStore.getState()
  if (s.queryWord.trim() === word) return false
  s.setQueryWord(word)
  return true
}

/** 片段搜索反向：激活 fragmentSearch tab → 读当前原文选中文本 → 有选中且是新内容则搜索 */
function reverseFragmentSearch(): boolean {
  const { selected } = readSourceSelection()
  const keyword = selected.trim()
  if (!keyword) return false // 严格：无选中文本则不触发
  const s = useLinkageFragmentSearchStore.getState()
  if (s.queryKeyword.trim() === keyword) return false
  s.setKeyword(keyword)
  return true
}

// ---- 反向规则表 ----
// 新增反向联动只需在此数组追加一行
const REVERSE_LINKAGE_RULES: ReverseLinkageRule[] = [
  { targetTabId: 'aitranslate', action: reverseAiTranslate },
  { targetTabId: 'tm', action: reverseTM },
  { targetTabId: 'mt', action: reverseMT },
  { targetTabId: 'aiqa', action: reverseAiQA },
  { targetTabId: 'dict', action: reverseDict },
  { targetTabId: 'fragmentSearch', action: reverseFragmentSearch },
]

/**
 * 反向联动分发器：当某个 tab 被用户激活时调用。
 * - 仅翻译布局生效；词典/记忆布局无这些卡片，直接返回。
 * - 按 targetTabId 匹配规则，最多匹配一条。
 * - 动作自带"新内容判定"，相同内容不会重复触发请求。
 */
export function dispatchReverseLinkage(activatedTabId: string): void {
  if (!isTranslateMode()) return
  for (const rule of REVERSE_LINKAGE_RULES) {
    if (rule.targetTabId !== activatedTabId) continue
    try {
      rule.action()
    } catch {
      // 单个规则失败不影响其他（当前只有一条会命中，但 try 防御性保留）
    }
    return // 反向联动每个 tabId 只命中一条规则，找到即返回
  }
}

// 避免未使用 import 报错
void collectVisibleTabs

import type { ID } from '@/types'
