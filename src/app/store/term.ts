import { create } from 'zustand'

// —— 术语库 store ——
// 使用 localStorage 持久化，简单轻量

export interface Term {
  id: number
  source: string
  target: string
  createdAt: number
  updatedAt: number
}

interface TermStoreState {
  terms: Term[]
  /** 当前选中的术语 id 集合（跨组件共享：ProjectPanel 按钮 + 词典库卡片 Checkbox） */
  selectedIds: Set<number>
  addTerm: (source: string, target: string) => void
  deleteTerm: (id: number) => void
  updateTerm: (id: number, patch: Partial<Pick<Term, 'source' | 'target'>>) => void
  /** 批量删除 */
  deleteTerms: (ids: number[]) => void
  /** 切换某条术语的选中状态 */
  toggleSelect: (id: number) => void
  /** 全选 / 取消全选 */
  selectAll: (ids: number[]) => void
  /** 清空选中 */
  clearSelection: () => void
  /**
   * 批量导入术语（去重）。
   * @param pairs 待导入的术语对列表
   * @param mode 去重模式：'skip' 跳过已存在（按 source 去重）；'overwrite' 覆盖已存在的译文
   * @returns { added, skipped } 新增数与跳过/更新数
   */
  addTerms: (
    pairs: Array<{ source: string; target: string }>,
    mode?: 'skip' | 'overwrite',
  ) => { added: number; skipped: number }
}

const STORAGE_KEY = 'cat.terms'

function loadTerms(): Term[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Term[]
  } catch {
    return []
  }
}

function saveTerms(terms: Term[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(terms))
  } catch {
    /* ignore */
  }
}

let _nextId = Date.now()

export const useTermStore = create<TermStoreState>((set, get) => ({
  terms: loadTerms(),
  selectedIds: new Set<number>(),

  addTerm: (source, target) => {
    const now = Date.now()
    const term: Term = {
      id: _nextId++,
      source: source.trim(),
      target: target.trim(),
      createdAt: now,
      updatedAt: now,
    }
    const terms = [...get().terms, term]
    saveTerms(terms)
    set({ terms })
  },

  deleteTerm: (id) => {
    const terms = get().terms.filter((t) => t.id !== id)
    saveTerms(terms)
    // 同步清除选中状态
    const selectedIds = new Set(get().selectedIds)
    selectedIds.delete(id)
    set({ terms, selectedIds })
  },

  updateTerm: (id, patch) => {
    const terms = get().terms.map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
    )
    saveTerms(terms)
    set({ terms })
  },

  deleteTerms: (ids) => {
    const idSet = new Set(ids)
    const terms = get().terms.filter((t) => !idSet.has(t.id))
    saveTerms(terms)
    // 清空选中（已删除的不存在了）
    const selectedIds = new Set(get().selectedIds)
    for (const id of ids) selectedIds.delete(id)
    set({ terms, selectedIds })
  },

  toggleSelect: (id) => {
    const selectedIds = new Set(get().selectedIds)
    if (selectedIds.has(id)) selectedIds.delete(id)
    else selectedIds.add(id)
    set({ selectedIds })
  },

  selectAll: (ids) => {
    // 如果当前已全选，则取消全选；否则全选
    const current = get().selectedIds
    const allSelected = ids.every((id) => current.has(id))
    set({ selectedIds: allSelected ? new Set<number>() : new Set(ids) })
  },

  clearSelection: () => {
    set({ selectedIds: new Set<number>() })
  },

  addTerms: (pairs, mode = 'skip') => {
    const existing = get().terms
    // 按原文（小写）建索引，去重
    const bySourceLower = new Map<string, Term>()
    for (const t of existing) bySourceLower.set(t.source.trim().toLowerCase(), t)
    let added = 0
    let skipped = 0
    const now = Date.now()
    const nextTerms = [...existing]
    for (const p of pairs) {
      const s = p.source.trim()
      const t = p.target.trim()
      if (!s || !t) { skipped++; continue }
      const key = s.toLowerCase()
      const found = bySourceLower.get(key)
      if (found) {
        if (mode === 'overwrite') {
          // 覆盖译文
          const idx = nextTerms.findIndex((x) => x.id === found.id)
          if (idx >= 0) {
            nextTerms[idx] = { ...found, source: s, target: t, updatedAt: now }
          }
          bySourceLower.set(key, { ...found, source: s, target: t, updatedAt: now })
        }
        skipped++
        continue
      }
      // 新增
      const term: Term = {
        id: _nextId++,
        source: s,
        target: t,
        createdAt: now,
        updatedAt: now,
      }
      bySourceLower.set(key, term)
      nextTerms.push(term)
      added++
    }
    saveTerms(nextTerms)
    set({ terms: nextTerms })
    return { added, skipped }
  },
}))
