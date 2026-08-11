import type { Segment } from '@/types'

/**
 * 判断段落是否需要翻译：有原文且（状态为未译 或 译文为空）。
 *
 * 统一用于：联动逻辑（AI翻译/MT翻译的单段过滤）、批量按钮（自动翻译/TM填充）、跳转下个未译段。
 */
export function needsTranslation(seg: Pick<Segment, 'source' | 'target' | 'status'>): boolean {
  return !!seg.source?.trim() && (seg.status === 'untranslated' || !seg.target?.trim())
}

/**
 * 将 HTML 富文本字符串转为纯文本（去除 b/sup/sub/span 等标签）。
 * 使用 DOM 解析，保留标签内的可见文本内容。
 *
 * 统一用于：AI解释/翻译整段提取、正向/反向联动原文传递、TM 搜索。
 * seg.source 存储的是 HTML 字符串（含富文本标注），送入 AI / TM 时需转为纯文本。
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || ''
}
