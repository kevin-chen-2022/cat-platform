import type { Segment } from '@/types'

/**
 * 判断段落是否需要翻译：有原文且（状态为未译 或 译文为空）。
 *
 * 统一用于：联动逻辑（AI翻译/MT翻译的单段过滤）、批量按钮（自动翻译/TM填充）、跳转下个未译段。
 */
export function needsTranslation(seg: Pick<Segment, 'source' | 'target' | 'status'>): boolean {
  return !!seg.source?.trim() && (seg.status === 'untranslated' || !seg.target?.trim())
}
