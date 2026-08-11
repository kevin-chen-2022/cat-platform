/**
 * QA 质检 store
 *
 * 管理翻译质量检查结果、AI质检配置。
 * - 规则质检结果仅存内存（每次扫描覆盖）
 * - AI质检开关与提示词持久化到 localStorage
 * - resolved 状态持久化到 Dexie qaIssues 表（可选，当前版本仅内存）
 */
import { create } from 'zustand'
import type { ID, QAIssue, Segment, SegmentStatus } from '@/types'
import type { TokenUsage } from './aiQA'
import { callAiChat, useAiQAStore, AI_PROVIDER_META } from './aiQA'
import type { AiProviderKey } from './aiQA'
import { matchTermsForSource } from '@/shared/utils/termMatch'
import { htmlToPlainText, needsTranslation } from '@/shared/utils/segmentFilter'
import { useProjectStore } from './project'

// —— AI 质检默认提示词 ——
export const AI_QA_CHECK_SYSTEM_PROMPT = `你是一位严谨的翻译质检专家。请检查用户提供的译文是否存在以下问题：
1. 术语不一致（未使用约定译法）
2. 数字/标签/占位符丢失
3. 漏译、错译、多译
4. 语法错误、表达不通顺
5. 风格/语气与原文不符

输出格式要求（严格 JSON 数组）：
[
  {"severity": "error", "message": "具体问题描述"},
  {"severity": "warning", "message": "具体问题描述"}
]

severity 取值：error（严重）/ warning（警告）/ info（提示）。
如译文无问题，输出空数组 []。只输出 JSON，不要任何额外说明。`

const STORAGE_KEY = 'cat.qaSettings'

interface PersistShape {
  aiEnabled: boolean
  aiPrompt: string
  autoLabelEnabled: boolean
  followMode: boolean
}

function loadPersist(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { aiEnabled: false, aiPrompt: AI_QA_CHECK_SYSTEM_PROMPT, autoLabelEnabled: false, followMode: false }
    const parsed = JSON.parse(raw) as Partial<PersistShape>
    return {
      aiEnabled: parsed.aiEnabled ?? false,
      aiPrompt: parsed.aiPrompt ?? AI_QA_CHECK_SYSTEM_PROMPT,
      autoLabelEnabled: parsed.autoLabelEnabled ?? false,
      followMode: parsed.followMode ?? false,
    }
  } catch {
    return { aiEnabled: false, aiPrompt: AI_QA_CHECK_SYSTEM_PROMPT, autoLabelEnabled: false, followMode: false }
  }
}

function savePersist(s: PersistShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // 忽略写入失败
  }
}

interface QAState {
  /** 所有质检问题（含已解决） */
  issues: QAIssue[]
  /** 质检进行中 */
  loading: boolean
  /** 上次扫描范围 */
  scanScope: 'segment' | 'file' | null
  /** 上次扫描时间戳 */
  lastScanAt: number
  /** 上次扫描的段ID（segment模式）或文件ID（file模式） */
  lastScanTargetId: ID | null

  // AI 质检
  aiEnabled: boolean
  aiPrompt: string
  aiTokenUsage: TokenUsage | null

  // 自动标注
  autoLabelEnabled: boolean

  // 跟随模式：开启后切换段自动质检当前段（规则 + AI按当前设置）
  followMode: boolean
  /** 全文件质检中止标志（true 时循环跳出） */
  fileScanAborted: boolean
  /** 正在进行AI质检的段ID集合（用于UI显示loading占位） */
  aiChecking: Record<string, boolean>

  // 动作
  /** 对单段执行规则质检 */
  scanSegment: (seg: Segment, terms: { source: string; target?: string }[]) => QAIssue[]
  /** 对多段执行规则质检（含重复检测） */
  scanSegments: (segs: Segment[], terms: { source: string; target?: string }[]) => QAIssue[]
  /** 标记问题已解决 */
  resolveIssue: (segmentId: ID, type: QAIssue['type'], message: string) => void
  /** 清空所有问题 */
  clearIssues: () => void
  /** AI质检开关 */
  setAiEnabled: (enabled: boolean) => void
  /** 设置AI质检提示词 */
  setAiPrompt: (prompt: string) => void
  /** 恢复默认AI质检提示词 */
  resetAiPrompt: () => void
  /** 设置AI质检token用量 */
  setAiTokenUsage: (usage: TokenUsage | null) => void
  /** 合并AI质检返回的问题 */
  mergeAiIssues: (segmentId: ID, aiIssues: { severity: string; message: string }[]) => void
  /** 自动标注开关 */
  setAutoLabelEnabled: (enabled: boolean) => void
  /** 根据当前issues对指定段（或全部）执行自动标注（改段状态） */
  applyAutoLabel: (segmentIds?: ID[]) => Promise<void>
  /** 跟随模式开关（持久化） */
  setFollowMode: (enabled: boolean) => void
  /** 请求中止全文件质检 */
  abortFileScan: () => void
  /** 重置中止标志 */
  resetAbort: () => void
  /** 批量设置AI质检中标志（多段传入，用于全文件开始前预置） */
  setAiChecking: (segmentIds: ID[], checking: boolean) => void
  /** 对单段执行AI质检（读取当前 aiEnabled/providers/prompt 设置）。成功返回true，失败抛错。 */
  runAiCheckForSegment: (seg: Segment) => Promise<boolean>
}

// —— 质检规则实现 ——

/** 提取文本中的数字（含小数、百分号、逗号分隔） */
function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d,]*\.?\d*\s*%?/g)
  return matches ? matches.filter((s) => s.trim()) : []
}

/** 提取 HTML 标签和常见占位符 */
function extractTags(text: string): string[] {
  const tags: string[] = []
  // HTML 标签：<tag>...</tag> 或 <tag/>
  const htmlMatches = text.match(/<\/?[a-zA-Z][^>]*>/g)
  if (htmlMatches) tags.push(...htmlMatches)
  // 常见占位符：{0} {name} %s %d ${var} {{var}}
  const placeholderMatches = text.match(/\{\{?\w+\}?\}|\$\{\w+\}|%[sdf]/g)
  if (placeholderMatches) tags.push(...placeholderMatches)
  return tags
}

/** 对单段执行规则质检（不含重复检测，重复需多段上下文） */
function checkSegment(seg: Segment, terms: { source: string; target?: string }[]): QAIssue[] {
  const issues: QAIssue[] = []
  const segId = seg.id!
  const now = Date.now()
  const srcPlain = htmlToPlainText(seg.source || '')
  const tgtPlain = htmlToPlainText(seg.target || '')

  // 空译文
  if (srcPlain.trim() && !tgtPlain.trim()) {
    issues.push({
      segmentId: segId, type: 'empty_target', severity: 'error',
      message: '有原文但译文为空', createdAt: now,
    })
    return issues // 空译文时其他检查无意义
  }

  // 术语一致性
  const matchedTerms = matchTermsForSource(srcPlain, terms)
  for (const term of matchedTerms) {
    if (!term.target) continue
    const escaped = term.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const regex = new RegExp(escaped, 'i')
      if (!regex.test(tgtPlain)) {
        issues.push({
          segmentId: segId, type: 'term_mismatch', severity: 'warning',
          message: `术语「${term.source}」应译为「${term.target}」，译文中未找到`, createdAt: now,
        })
      }
    } catch {
      // 忽略正则错误
    }
  }

  // 数字一致性
  const srcNumbers = extractNumbers(srcPlain)
  if (srcNumbers.length > 0) {
    for (const num of srcNumbers) {
      if (!tgtPlain.includes(num)) {
        issues.push({
          segmentId: segId, type: 'number_mismatch', severity: 'error',
          message: `数字「${num}」在译文中缺失`, createdAt: now,
        })
      }
    }
  }

  // 标签/占位符一致性
  const srcTags = extractTags(seg.source || '')
  if (srcTags.length > 0) {
    for (const tag of srcTags) {
      if (!seg.target?.includes(tag)) {
        issues.push({
          segmentId: segId, type: 'tag_mismatch', severity: 'error',
          message: `标签/占位符「${tag}」在译文中缺失`, createdAt: now,
        })
      }
    }
  }

  // 长度比例
  if (srcPlain.length > 10 && tgtPlain.length > 0) {
    const ratio = tgtPlain.length / srcPlain.length
    if (ratio < 0.3) {
      issues.push({
        segmentId: segId, type: 'length_ratio', severity: 'info',
        message: `译文长度仅为原文的 ${Math.round(ratio * 100)}%，可能存在漏译`, createdAt: now,
      })
    } else if (ratio > 3.0) {
      issues.push({
        segmentId: segId, type: 'length_ratio', severity: 'info',
        message: `译文长度为原文的 ${Math.round(ratio * 100)}%，可能存在冗余`, createdAt: now,
      })
    }
  }

  return issues
}

/** 全文件重复检测：相同原文有不同译文 */
function checkDuplicates(segs: Segment[]): QAIssue[] {
  const issues: QAIssue[] = []
  const now = Date.now()
  // source → Set<target>
  const map = new Map<string, Set<string>>()
  for (const seg of segs) {
    const src = htmlToPlainText(seg.source || '').trim()
    const tgt = htmlToPlainText(seg.target || '').trim()
    if (!src || !tgt) continue
    if (!map.has(src)) map.set(src, new Set())
    map.get(src)!.add(tgt)
  }
  for (const seg of segs) {
    const src = htmlToPlainText(seg.source || '').trim()
    const tgt = htmlToPlainText(seg.target || '').trim()
    if (!src || !tgt) continue
    const targets = map.get(src)
    if (targets && targets.size > 1) {
      issues.push({
        segmentId: seg.id!, type: 'duplicate', severity: 'warning',
        message: `相同原文存在 ${targets.size} 种不同译文`, createdAt: now,
      })
    }
  }
  return issues
}

/** 根据该段未解决问题的最高严重度，推算目标状态 */
function inferStatusFromIssues(unresolved: QAIssue[], hasTarget: boolean): SegmentStatus | null {
  if (!unresolved.length) {
    // 无问题，且有译文 → approved；空译文不改
    return hasTarget ? 'approved' : null
  }
  if (unresolved.some((i) => i.severity === 'error')) return 'rejected'
  if (unresolved.some((i) => i.severity === 'warning')) return 'reviewing'
  // 只有 info
  return hasTarget ? 'approved' : null
}

export const useQAStore = create<QAState>((set, get) => ({
  issues: [],
  loading: false,
  scanScope: null,
  lastScanAt: 0,
  lastScanTargetId: null,
  aiEnabled: loadPersist().aiEnabled,
  aiPrompt: loadPersist().aiPrompt,
  aiTokenUsage: null,
  autoLabelEnabled: loadPersist().autoLabelEnabled,
  followMode: loadPersist().followMode,
  fileScanAborted: false,
  aiChecking: {},

  scanSegment: (seg, terms) => {
    const newIssues = checkSegment(seg, terms)
    // 单段质检模式：清空所有旧问题，只保留当前段的规则质检结果
    // AI质检结果会在 runAiCheck → mergeAiIssues 中追加到当前段
    set({
      issues: newIssues,
      scanScope: 'segment',
      lastScanAt: Date.now(),
      lastScanTargetId: seg.id ?? null,
    })
    // 自动标注
    if (get().autoLabelEnabled) {
      get().applyAutoLabel([seg.id!]).catch(() => {})
    }
    return newIssues
  },

  scanSegments: (segs, terms) => {
    let newIssues: QAIssue[] = []
    for (const seg of segs) {
      newIssues.push(...checkSegment(seg, terms))
    }
    newIssues.push(...checkDuplicates(segs))
    set({
      issues: newIssues,
      scanScope: 'file',
      lastScanAt: Date.now(),
      lastScanTargetId: segs[0]?.fileId ?? null,
    })
    // 自动标注（所有参与扫描的段）
    if (get().autoLabelEnabled && segs.length > 0) {
      get()
        .applyAutoLabel(segs.map((s) => s.id!).filter((id): id is ID => id != null))
        .catch(() => {})
    }
    return newIssues
  },

  resolveIssue: (segmentId, type, message) => {
    set({
      issues: get().issues.map((i) =>
        i.segmentId === segmentId && i.type === type && i.message === message
          ? { ...i, resolved: !i.resolved }
          : i,
      ),
    })
  },

  clearIssues: () => {
    set({ issues: [], scanScope: null, lastScanAt: 0, lastScanTargetId: null, aiTokenUsage: null, aiChecking: {} })
  },

  setAiEnabled: (enabled) => {
    set({ aiEnabled: enabled })
    savePersist({ aiEnabled: enabled, aiPrompt: get().aiPrompt, autoLabelEnabled: get().autoLabelEnabled, followMode: get().followMode })
  },

  setAiPrompt: (prompt) => {
    set({ aiPrompt: prompt })
    savePersist({ aiEnabled: get().aiEnabled, aiPrompt: prompt, autoLabelEnabled: get().autoLabelEnabled, followMode: get().followMode })
  },

  resetAiPrompt: () => {
    set({ aiPrompt: AI_QA_CHECK_SYSTEM_PROMPT })
    savePersist({
      aiEnabled: get().aiEnabled,
      aiPrompt: AI_QA_CHECK_SYSTEM_PROMPT,
      autoLabelEnabled: get().autoLabelEnabled,
      followMode: get().followMode,
    })
  },

  setAiTokenUsage: (usage) => {
    set({ aiTokenUsage: usage })
  },

  mergeAiIssues: (segmentId, aiIssues) => {
    const now = Date.now()
    // 移除该段旧的 AI 问题（custom 类型）
    const others = get().issues.filter(
      (i) => !(i.segmentId === segmentId && i.type === 'custom'),
    )
    let mapped: QAIssue[] = aiIssues.map((ai) => ({
      segmentId,
      type: 'custom' as const,
      severity: (['error', 'warning', 'info'].includes(ai.severity) ? ai.severity : 'info') as QAIssue['severity'],
      message: ai.message,
      createdAt: now,
    }))
    // AI返回空数组时，添加一条info提示，让用户明确知道AI已检查且未发现额外问题
    if (mapped.length === 0) {
      mapped = [{
        segmentId,
        type: 'custom' as const,
        severity: 'info',
        message: 'AI质检通过，未发现额外问题',
        createdAt: now,
      }]
    }
    const merged = [...others, ...mapped]
    set({ issues: merged })
    // AI问题合并后，如果开启自动标注，更新该段状态
    if (get().autoLabelEnabled) {
      get().applyAutoLabel([segmentId]).catch(() => {})
    }
  },

  setAutoLabelEnabled: (enabled) => {
    set({ autoLabelEnabled: enabled })
    savePersist({
      aiEnabled: get().aiEnabled,
      aiPrompt: get().aiPrompt,
      autoLabelEnabled: enabled,
      followMode: get().followMode,
    })
  },

  setFollowMode: (enabled) => {
    set({ followMode: enabled })
    savePersist({
      aiEnabled: get().aiEnabled,
      aiPrompt: get().aiPrompt,
      autoLabelEnabled: get().autoLabelEnabled,
      followMode: enabled,
    })
  },

  abortFileScan: () => {
    set({ fileScanAborted: true })
  },

  resetAbort: () => {
    set({ fileScanAborted: false })
  },

  setAiChecking: (segmentIds, checking) => {
    const next = { ...get().aiChecking }
    for (const id of segmentIds) {
      const key = String(id)
      if (checking) next[key] = true
      else delete next[key]
    }
    set({ aiChecking: next })
  },

  applyAutoLabel: async (segmentIds?: ID[]) => {
    const { issues } = get()
    const p = useProjectStore.getState()
    const segs = segmentIds
      ? p.segments.filter((s) => s.id != null && segmentIds.includes(s.id))
      : p.segments
    if (segs.length === 0) return
    for (const seg of segs) {
      if (seg.id == null) continue
      const segIssues = issues.filter(
        (i) => i.segmentId === seg.id && !i.resolved,
      )
      const hasTarget = !!htmlToPlainText(seg.target || '').trim()
      const target = inferStatusFromIssues(segIssues, hasTarget)
      if (target && target !== seg.status) {
        await p.updateSegment(seg.id, { status: target })
      }
    }
  },

  runAiCheckForSegment: async (seg) => {
    // 每次调用实时读取设置，响应用户中途调整
    if (!get().aiEnabled) return false
    if (!seg.source?.trim() || !seg.target?.trim()) return false
    const { providers } = useAiQAStore.getState()
    const pKeys = Object.keys(AI_PROVIDER_META) as AiProviderKey[]
    const k = pKeys.find((kk) => providers[kk].enabled)
    if (!k) return false
    // 设置 AI 质检中标志
    get().setAiChecking([seg.id!], true)
    try {
      const srcPlain = htmlToPlainText(seg.source)
      const tgtPlain = htmlToPlainText(seg.target)
      const userPrompt = `【原文】\n${srcPlain}\n\n【译文】\n${tgtPlain}`
      const messages = [
        { role: 'system' as const, content: get().aiPrompt },
        { role: 'user' as const, content: userPrompt },
      ]
      const { content, usage } = await callAiChat(k, providers[k], messages)
      set({ aiTokenUsage: usage ?? null })
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : []
        if (Array.isArray(parsed)) {
          get().mergeAiIssues(seg.id!, parsed)
          return true
        }
      } catch {
        // JSON 解析失败
      }
      return false
    } finally {
      // 成功/失败均移除 AI 质检中标志
      get().setAiChecking([seg.id!], false)
    }
  },
}))
