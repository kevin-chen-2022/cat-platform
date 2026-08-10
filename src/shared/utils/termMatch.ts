/**
 * 术语匹配共享工具。
 * 从 TBPanel（术语显示面板）抽取，供术语面板、自动翻译、单段 AI 翻译复用，
 * 保证筛选逻辑和 UI 一致性。
 */

/** 术语最小结构约束（结构化类型，兼容 Term 等任意含 source/target 的对象） */
export interface TermLike {
  source: string
  target?: string
}

/**
 * 过滤出在指定原文中出现过的术语。
 * - 词边界匹配（\b），大小写不敏感
 * - 转义正则特殊字符，避免术语含特殊符号时出错
 *
 * @param source 原文文本
 * @param terms  术语列表
 * @returns      命中的术语子集（保持原顺序）
 */
export function matchTermsForSource<T extends TermLike>(source: string, terms: T[]): T[] {
  if (!source || terms.length === 0) return []
  return terms.filter((t) => {
    if (!t.source) return false
    const escaped = t.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const regex = new RegExp(`\\b${escaped}\\b`, 'i')
      return regex.test(source)
    } catch {
      return false
    }
  })
}

/**
 * 构建术语提示片段，用于追加到 AI 翻译的 user prompt 末尾。
 * 格式：
 *   【术语参考】
 *   source1 → target1
 *   source2 → target2
 *
 * 无命中术语时返回空字符串（调用方无需额外判断）。
 */
export function buildTermHint<T extends TermLike>(source: string, terms: T[]): string {
  const matched = matchTermsForSource(source, terms)
  if (matched.length === 0) return ''
  const lines = matched.map((t) => `${t.source} → ${t.target ?? ''}`)
  return `\n\n【术语参考】\n${lines.join('\n')}`
}
