import type { TMEntry, MatchResult, LanguageCode, ID } from '@/types'

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
