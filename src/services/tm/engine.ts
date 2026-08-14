import type { TMEntry, TeamTMEntry, MatchResult, LanguageCode, ID } from '@/types'
import { db } from '@data/db'

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  )
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }
  return dp[a.length][b.length]
}

export function similarityScore(a: string, b: string): number {
  if (a === b) return 100
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 100
  const dist = levenshtein(a, b)
  return Math.round((1 - dist / maxLen) * 100)
}

export interface TMQueryOptions {
  sourceLang?: LanguageCode
  targetLang?: LanguageCode
  threshold?: number
  limit?: number
  projectId?: ID
}

export function searchMemory(
  entries: TMEntry[],
  source: string,
  opts: TMQueryOptions,
): MatchResult[] {
  const threshold = opts.threshold ?? 70
  const limit = opts.limit ?? 5
  const matches: MatchResult[] = []
  for (const e of entries) {
    // 语言对过滤：仅在 opts 提供时才过滤（undefined = 不限语言）
    if (opts.sourceLang != null && e.sourceLang !== opts.sourceLang) continue
    if (opts.targetLang != null && e.targetLang !== opts.targetLang) continue
    if (opts.projectId != null && e.projectId != null && e.projectId !== opts.projectId) continue
    const score = similarityScore(source.trim(), e.source.trim())
    if (score >= threshold) {
      matches.push({ entry: e, score })
    }
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * 按源文本精确查询团队译文记忆库条目（100% 匹配 + 语言对匹配）
 * 返回同一原文下的所有译员译文版本（按更新时间倒序），供「团队译文卡片」显示
 */
export async function findTMBySourceExact(
  source: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
): Promise<TeamTMEntry[]> {
  const trimmed = source.trim()
  if (!trimmed) return []
  try {
    const byLang: TeamTMEntry[] = await db.teamTMEntries.where('sourceLang').equals(sourceLang).toArray()
    const rows = byLang.filter(
      (e) =>
        e.targetLang === targetLang &&
        e.source.trim() === trimmed,
    )
    // 按 updatedAt 倒序：优先显示最新分享的译文
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (err) {
    console.warn('[tm/engine] findTMBySourceExact failed:', err)
    return []
  }
}

/**
 * 查询团队译文记忆库中所有匹配指定语言对的条目（供「团队译文自动填充未译段」使用）
 */
export async function loadTeamTMEntries(
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
): Promise<TeamTMEntry[]> {
  try {
    const byLang: TeamTMEntry[] = await db.teamTMEntries.where('sourceLang').equals(sourceLang).toArray()
    return byLang.filter((e) => e.targetLang === targetLang)
  } catch (err) {
    console.warn('[tm/engine] loadTeamTMEntries failed:', err)
    return []
  }
}

/** 清空团队译文记忆库 */
export async function clearTeamTMEntries(): Promise<void> {
  await db.teamTMEntries.clear()
}
