import { create } from 'zustand'
import { db } from '@data/db'
import type { TMEntry, LanguageCode, ID } from '@/types'

// —— 翻译记忆库 store ——
// 数据源为 Dexie db.tmEntries（IndexedDB），与术语库的 localStorage 不同
// 跨组件共享：ProjectPanel 按钮 + 项目记忆库卡片 Checkbox

type TMScope = 'project' | 'global'

interface TMStoreState {
  /** 当前加载的记忆条目 */
  entries: TMEntry[]
  loading: boolean
  /** 当前选中的条目 id 集合 */
  selectedIds: Set<number>
  /** 过滤范围：当前项目 / 全局（projectId 为空的条目） */
  scope: TMScope
  /**
   * 加载条目
   * @param projectId 当前项目 id（scope=project 时按此过滤）
   * @param sourceLang 源语言（可选，附加过滤）
   * @param targetLang 目标语言（可选，附加过滤）
   */
  loadEntries: (projectId: ID | null | undefined, sourceLang?: LanguageCode, targetLang?: LanguageCode) => Promise<void>
  /** 添加条目（自动去重，复合唯一索引 source+target+sourceLang+targetLang） */
  addEntry: (entry: Omit<TMEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TMEntry | null>
  /**
   * 批量导入条目（用于导入词典/复制导入等场景）
   * 去重规则：复合唯一索引 [source+target+sourceLang+targetLang]
   * @param pairs 术语对列表（仅 source/target）
   * @param ctx 语言对/归属项目上下文
   * @param mode skip=跳过重复，overwrite=覆写已有条目 meta/updatedAt
   * @returns { added, skipped, updated }
   */
  addEntries: (
    pairs: Array<{ source: string; target: string }>,
    ctx: { sourceLang: LanguageCode; targetLang: LanguageCode; projectId?: ID },
    mode?: 'skip' | 'overwrite',
  ) => Promise<{ added: number; skipped: number; updated: number }>
  /** 更新条目 */
  updateEntry: (id: number, patch: Partial<Pick<TMEntry, 'source' | 'target' | 'meta'>>) => Promise<void>
  /** 删除单条 */
  deleteEntry: (id: number) => Promise<void>
  /** 批量删除 */
  deleteEntries: (ids: number[]) => Promise<void>
  /** 切换选中状态 */
  toggleSelect: (id: number) => void
  /** 全选 / 取消全选 */
  selectAll: (ids: number[]) => void
  /** 清空选中 */
  clearSelection: () => void
  /** 设置范围 */
  setScope: (scope: TMScope) => void
}

export const useTMStore = create<TMStoreState>((set, get) => ({
  entries: [],
  loading: false,
  selectedIds: new Set<number>(),
  scope: 'project',

  loadEntries: async (projectId, sourceLang, targetLang) => {
    set({ loading: true })
    try {
      let rows: TMEntry[] = []
      const scope = get().scope
      if (scope === 'project' && projectId != null) {
        // 项目范围:本项目专用条目 + 全局共享条目(projectId 为 null/undefined,协同翻译收到的译文)
        const all = await db.tmEntries.toArray()
        rows = all.filter((e) => e.projectId == null || e.projectId === projectId)
      } else if (scope === 'global') {
        // 全局：projectId 为 null/undefined 的条目（跨项目共享）
        const all = await db.tmEntries.toArray()
        rows = all.filter((e) => e.projectId == null)
      } else {
        rows = await db.tmEntries.toArray()
      }
      // 附加语言对过滤
      if (sourceLang) rows = rows.filter((e) => e.sourceLang === sourceLang)
      if (targetLang) rows = rows.filter((e) => e.targetLang === targetLang)
      set({ entries: rows })
    } catch (err) {
      console.error('[useTMStore:loadEntries]', err)
      set({ entries: [] })
    } finally {
      set({ loading: false })
    }
  },

  addEntry: async (entry) => {
    const now = Date.now()
    const newEntry: TMEntry = {
      ...entry,
      createdAt: now,
      updatedAt: now,
    }
    try {
      // 先按 v8 新复合键查：同[source+sourceLang+targetLang+projectId] → 覆盖 target
      const existing = await db.tmEntries
        .where('[source+sourceLang+targetLang+projectId]')
        .equals([
          newEntry.source,
          newEntry.sourceLang,
          newEntry.targetLang,
          (newEntry.projectId as number | undefined) ?? undefined,
        ] as any)
        .first()
      if (existing) {
        await db.tmEntries.update(existing.id as number, {
          target: newEntry.target,
          updatedAt: now,
          meta: newEntry.meta ?? existing.meta,
          usageCount: (existing.usageCount ?? 0) + 1,
          lastUsedAt: now,
        })
        const refreshed = { ...existing, target: newEntry.target, updatedAt: now }
        set({
          entries: get().entries.map((e) => (e.id === refreshed.id ? { ...e, ...refreshed } : e)),
        })
        return refreshed
      }
      const id = await db.tmEntries.add(newEntry)
      const added = { ...newEntry, id: id as number }
      set({ entries: [...get().entries, added] })
      return added
    } catch (err) {
      // 其他异常（非唯一键冲突）记日志，避免静默吞
      console.warn('[useTMStore:addEntry] 写入失败:', err)
      return null
    }
  },

  addEntries: async (pairs, ctx, mode = 'skip') => {
    const { sourceLang, targetLang, projectId } = ctx
    let added = 0
    let skipped = 0
    let updated = 0
    const now = Date.now()
    const pid = (projectId as number | undefined) ?? undefined
    // 按 v8 新复合键 [source+sourceLang+targetLang+projectId] 构建 existingKey 映射
    const existingKey = new Map<string, TMEntry>()
    try {
      const all = await db.tmEntries.toArray()
      for (const e of all) {
        if (e.sourceLang === sourceLang && e.targetLang === targetLang && String(e.projectId ?? '__GLOBAL__') === String(pid ?? '__GLOBAL__')) {
          const k = e.source.trim().toLowerCase()
          existingKey.set(k, e)
        }
      }
    } catch { /* ignore */ }
    const toAdd: Array<Omit<TMEntry, 'id' | 'createdAt' | 'updatedAt'> & { createdAt: number; updatedAt: number }> = []
    const toUpdate: Array<{ id: number; patch: Partial<TMEntry> }> = []
    for (const p of pairs) {
      const s = p.source.trim()
      const t = p.target.trim()
      if (!s || !t) { skipped++; continue }
      const k = s.toLowerCase()
      const found = existingKey.get(k)
      if (found) {
        if (mode === 'overwrite') {
          // overwrite 模式：覆盖 target + updatedAt（核心新规则：同原文覆盖旧译文）
          toUpdate.push({
            id: found.id as number,
            patch: { target: t, updatedAt: now, projectId: found.projectId ?? pid },
          })
          updated++
        } else {
          skipped++
        }
        continue
      }
      toAdd.push({
        source: s,
        target: t,
        sourceLang,
        targetLang,
        projectId: pid,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
      })
      existingKey.set(k, { id: -1, source: s, target: t, sourceLang, targetLang, createdAt: now, updatedAt: now } as TMEntry)
    }
    // 批量写入新增
    if (toAdd.length > 0) {
      try {
        const ids = await db.tmEntries.bulkAdd(toAdd, { allKeys: true }) as number[]
        added = ids.filter((x) => x != null).length
      } catch {
        // bulkAdd 若全部冲突则会失败，降级为"先查再更新/新增"，确保同原文覆盖旧译文
        for (const e of toAdd) {
          try {
            const cur = await db.tmEntries
              .where('[source+sourceLang+targetLang+projectId]')
              .equals([e.source, e.sourceLang, e.targetLang, e.projectId ?? undefined] as any)
              .first()
            if (cur) {
              await db.tmEntries.update(cur.id as number, { target: e.target, updatedAt: now })
              updated++
            } else {
              await db.tmEntries.add(e)
              added++
            }
          } catch { skipped++ }
        }
      }
    }
    // 批量更新（覆写模式 / 降级写入时的 update）
    if (toUpdate.length > 0) {
      for (const u of toUpdate) {
        try { await db.tmEntries.update(u.id, u.patch) } catch { /* ignore */ }
      }
    }
    // 刷新 store.entries（按当前 scope）以保持 UI 同步
    const scope = get().scope
    const allAfter = await db.tmEntries.toArray()
    let rows = allAfter
    if (scope === 'project' && projectId != null) {
      rows = allAfter.filter((e) => e.projectId === projectId)
    } else if (scope === 'global') {
      rows = allAfter.filter((e) => e.projectId == null)
    }
    set({ entries: rows })
    return { added, skipped, updated }
  },

  updateEntry: async (id, patch) => {
    const updateData = { ...patch, updatedAt: Date.now() }
    try {
      await db.tmEntries.update(id, updateData)
      set({
        entries: get().entries.map((e) =>
          e.id === id ? { ...e, ...updateData } : e,
        ),
      })
    } catch (err) {
      console.error('[useTMStore:updateEntry]', err)
    }
  },

  deleteEntry: async (id) => {
    try {
      await db.tmEntries.delete(id)
      const entries = get().entries.filter((e) => e.id !== id)
      const selectedIds = new Set(get().selectedIds)
      selectedIds.delete(id)
      set({ entries, selectedIds })
    } catch (err) {
      console.error('[useTMStore:deleteEntry]', err)
    }
  },

  deleteEntries: async (ids) => {
    try {
      await db.tmEntries.bulkDelete(ids)
      const idSet = new Set(ids)
      const entries = get().entries.filter((e) => !idSet.has(e.id as number))
      const selectedIds = new Set(get().selectedIds)
      for (const id of ids) selectedIds.delete(id)
      set({ entries, selectedIds })
    } catch (err) {
      console.error('[useTMStore:deleteEntries]', err)
    }
  },

  toggleSelect: (id) => {
    const selectedIds = new Set(get().selectedIds)
    if (selectedIds.has(id)) selectedIds.delete(id)
    else selectedIds.add(id)
    set({ selectedIds })
  },

  selectAll: (ids) => {
    const current = get().selectedIds
    const allSelected = ids.every((id) => current.has(id))
    set({ selectedIds: allSelected ? new Set<number>() : new Set(ids) })
  },

  clearSelection: () => {
    set({ selectedIds: new Set<number>() })
  },

  setScope: (scope) => {
    set({ scope, selectedIds: new Set<number>() })
  },
}))
