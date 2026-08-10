import type { Project, File as ProjectFile, Folder, Segment, TMEntry, TBEntry, ID, SavedLayout } from '@/types'
import { gzipSync, strToU8, zlibSync, decompressSync, unzlibSync, strFromU8 } from 'fflate'

/* =========================
 * 术语/记忆库的通用导入导出（Pair 行模型）
 * ========================= */
export {
  parsePairFile,
  exportPairFile,
  type PairFormat,
  type PairExportFormat,
  type PairRow,
  type ParsePairResult,
  type PairExportMeta,
} from './term-tm-io'

/* =========================
 * Type definitions
 * ========================= */
export interface CATExportBundle {
  version: '1.0'
  exportedAt: number
  projects: Project[]
  files: ProjectFile[]
  folders: Folder[]
  segments: Segment[]
  tmEntries: TMEntry[]
  tbEntries: TBEntry[]
  /** 仅当 "excludeSettings=false"（默认的 settings 单独导出文件）时填充 */
  settings?: Record<string, unknown>
}

export type ExportRange = 'all' | 'current'

export type ImportStrategy =
  | 'merge'      // 按 id upsert，冲突以导入的为准（覆盖），不删现有的
  | 'append'     // 所有 id 全部重写为新项目（project/files/segments），不覆盖现有；TM/TB 仍走 upsert 因为有复合唯一索引
  | 'wipe'       // 先清库（projects/files/folders/segments/tmEntries/tbEntries 全删；settings 不动）再写入

export interface ImportStats {
  projects: { added: number; overwritten: number; wiped: boolean }
  files: number
  folders: number
  segments: number
  tmEntries: { added: number; skipped: number }
  tbEntries: { added: number; skipped: number }
}

/* =========================
 * Settings keys (集中定义，避免拼写分散)
 * ========================= */
export const SETTINGS_KEYS = {
  /** 最近打开的项目（最多 10 项） */
  RECENT_PROJECTS: 'recentProjects',
  /** 最近一次另存为选择的导出范围（all/current） */
  LAST_PROJECT_SAVE_RANGE: 'lastProjectSaveRange',
  /** 自动快照：是否启用 */
  BACKUP_SNAPSHOT_ENABLED: 'backup.snapshot.enabled',
  /** 自动快照：分钟间隔 */
  BACKUP_SNAPSHOT_INTERVAL_MIN: 'backup.snapshot.intervalMin',
  /** 自动快照：保留份数 */
  BACKUP_SNAPSHOT_KEEP: 'backup.snapshot.keep',
  /** 全量本地备份提醒：是否启用 */
  BACKUP_REMINDER_ENABLED: 'backup.reminder.enabled',
  /** 全量本地备份提醒：小时间隔 */
  BACKUP_REMINDER_INTERVAL_HOUR: 'backup.reminder.intervalHour',
  /** 上次全量下载备份的时间戳（ms），用于提醒判断 */
  BACKUP_LAST_FULL_DOWNLOAD_AT: 'backup.lastFullDownloadAt',
} as const

/* =========================
 * 项目级 导入/导出
 * ========================= */
export async function exportFilteredData(opts: {
  range: ExportRange
  currentProjectId?: ID | null
  excludeSettings?: boolean
}): Promise<CATExportBundle> {
  const { db } = await import('@/data/db')
  const { range, currentProjectId, excludeSettings = false } = opts

  const allProjects = await db.projects.toArray()
  let projects = allProjects
  let files = await db.files.toArray()
  let folders = await db.folders.toArray()

  if (range === 'current') {
    const pid = currentProjectId as number | undefined
    projects = pid != null ? allProjects.filter((p) => p.id === pid) : []
    const projectIdSet = new Set<number>(projects.map((p) => p.id as number))
    files = files.filter((f) => projectIdSet.has(f.projectId as number))
    folders = folders.filter((fo) => projectIdSet.has(fo.projectId as number))
  }

  const fileIdSet = new Set<number>(files.map((f) => f.id as number))
  const projectIdSet = new Set<number>(projects.map((p) => p.id as number))

  const allSegments = await db.segments.toArray()
  const segments = allSegments.filter((s) => fileIdSet.has(s.fileId as number))

  const allTM = await db.tmEntries.toArray()
  const allTB = await db.tbEntries.toArray()

  // range=current 时：仅导出该项目相关的 TM/TB（projectId 属于当前项目）+ 跨项目全局 TM/TB（projectId 未限定）
  let tmEntries = allTM
  let tbEntries = allTB
  if (range === 'current') {
    tmEntries = allTM.filter((t) => t.projectId == null || projectIdSet.has(t.projectId as number))
    tbEntries = allTB.filter((t) => t.projectId == null || projectIdSet.has(t.projectId as number))
  }

  const bundle: CATExportBundle = {
    version: '1.0',
    exportedAt: Date.now(),
    projects,
    files,
    folders,
    segments,
    tmEntries,
    tbEntries,
  }

  if (!excludeSettings) {
    const settingsRows = await db.settings.toArray()
    const settings: Record<string, unknown> = {}
    for (const row of settingsRows) settings[row.key] = row.value
    bundle.settings = settings
  }

  return bundle
}

/** 向后兼容：原 exportAllData = 全量导出（不含 settings） */
export async function exportAllData(): Promise<CATExportBundle> {
  return exportFilteredData({ range: 'all', excludeSettings: true })
}

/** append 模式下的批量写入辅助：
 *  关键点：Dexie `++id` 表的自增主键只能在 `bulkPut` 真正写入时才能确定。
 *  所以不能先在内存里给临时 string id（DB 会另分配 number id）导致受控 Select value 与 DB 真实 id 不匹配。
 *  正确流程：先剥离旧 id → 按顺序 bulkPut 获取 Dexie 返回的真实 id 数组 → 建立 旧id→新id 映射 → 重写下游外键 → 写下游表
 */
function remapKey<T>(oldVal: T | null | undefined, map: Map<any, number>): T | number | null | undefined {
  if (oldVal == null) return oldVal
  return map.has(oldVal) ? (map.get(oldVal) as number) : oldVal
}

/** 执行 append 模式的完整写入：返回新旧映射（供调用方做统计等用） */
async function executeAppendImport(
  db: any,
  bundle: CATExportBundle,
): Promise<{
  stats: {
    projects: number; files: number; folders: number; segments: number
    tmAdded: number; tmSkipped: number
    tbAdded: number; tbSkipped: number
  }
}> {
  const now = Date.now()
  const table = [db.projects, db.files, db.folders, db.segments, db.tmEntries, db.tbEntries]
  let tmAdded = 0, tmSkipped = 0, tbAdded = 0, tbSkipped = 0

  await db.transaction('rw', table, async () => {

  // 1. projects：剥离旧 id 后 bulkPut，得到真实自增 id
  const oldProjectIds = bundle.projects.map((p) => p.id!)
  const projectRows: Project[] = bundle.projects.map((p) => ({
    ...p,
    id: undefined as any,
    createdAt: p.createdAt,
    updatedAt: now,
  }))
  const newProjectIds: number[] = await db.projects.bulkPut(projectRows, { allKeys: true })
  const projectIdMap = new Map<number | string, number>()
  oldProjectIds.forEach((oid, i) => projectIdMap.set(oid, newProjectIds[i]))

  // 2. folders：剥离旧 id + 重写 projectId 后 bulkPut，得到真实自增 id
  const oldFolderIds = (bundle.folders ?? []).map((f) => f.id!)
  const folderRows: Folder[] = (bundle.folders ?? []).map((f) => ({
    ...f,
    id: undefined as any,
    projectId: remapKey(f.projectId, projectIdMap) as any,
    parentId: f.parentId, // 稍后按 folderIdMap 重写
    createdAt: f.createdAt,
    updatedAt: now,
  }))
  const newFolderIds: number[] = (bundle.folders?.length ?? 0) > 0
    ? await db.folders.bulkPut(folderRows, { allKeys: true })
    : []
  const folderIdMap = new Map<number | string, number>()
  oldFolderIds.forEach((oid, i) => folderIdMap.set(oid, newFolderIds[i]))
  // 二次重写 folders 的 parentId 引用
  if (newFolderIds.length > 0) {
    const patch: { key: number; changes: Partial<Folder> }[] = []
    for (let i = 0; i < folderRows.length; i++) {
      const row = folderRows[i]
      if (row.parentId != null && folderIdMap.has(row.parentId as number)) {
        patch.push({
          key: newFolderIds[i],
          changes: { parentId: folderIdMap.get(row.parentId as number)! as any },
        })
      }
    }
    if (patch.length > 0) await db.folders.bulkUpdate(patch)
  }

  // 3. files：剥离旧 id + 重写 projectId / folderId 后 bulkPut，得到真实自增 id
  const oldFileIds = bundle.files.map((f) => f.id!)
  const fileRows: ProjectFile[] = bundle.files.map((f) => ({
    ...f,
    id: undefined as any,
    projectId: remapKey(f.projectId, projectIdMap) as any,
    folderId: remapKey(f.folderId, folderIdMap) as any,
    createdAt: f.createdAt,
    updatedAt: now,
  }))
  const newFileIds: number[] = bundle.files.length > 0
    ? await db.files.bulkPut(fileRows, { allKeys: true })
    : []
  const fileIdMap = new Map<number | string, number>()
  oldFileIds.forEach((oid, i) => fileIdMap.set(oid, newFileIds[i]))

  // 4. segments：重写 fileId（projectId 不由 segment 直接持有）
  const segmentRows: Segment[] = bundle.segments.map((s) => ({
    ...s,
    id: undefined as any,
    fileId: remapKey(s.fileId, fileIdMap) as any,
    createdAt: s.createdAt,
    updatedAt: now,
  }))
  if (segmentRows.length > 0) await db.segments.bulkAdd(segmentRows)

  // 5. TM/TB：重写 projectId（projectId 映射好后，走正常写入流程由 Dexie 自增 id）
  const tmRows: TMEntry[] = bundle.tmEntries.map((t) => ({
    ...t,
    id: undefined as any,
    projectId: remapKey(t.projectId, projectIdMap) as any,
    createdAt: t.createdAt,
    updatedAt: now,
  }))
  const tbRows: TBEntry[] = bundle.tbEntries.map((t) => ({
    ...t,
    id: undefined as any,
    projectId: remapKey(t.projectId, projectIdMap) as any,
    createdAt: t.createdAt,
    updatedAt: now,
  }))
  if (tmRows.length > 0) {
    try {
      const before = await db.tmEntries.count()
      await db.tmEntries.bulkPut(tmRows)
      const after = await db.tmEntries.count()
      tmAdded = after - before
      tmSkipped = Math.max(0, tmRows.length - (after - before))
    } catch {
      for (const row of tmRows) {
        try {
          const before = await db.tmEntries.count()
          await db.tmEntries.put(row)
          const after = await db.tmEntries.count()
          if (after > before) tmAdded++
          else tmSkipped++
        } catch { tmSkipped++ }
      }
    }
  }
  if (tbRows.length > 0) {
    try {
      const before = await db.tbEntries.count()
      await db.tbEntries.bulkPut(tbRows)
      const after = await db.tbEntries.count()
      tbAdded = after - before
      tbSkipped = Math.max(0, tbRows.length - (after - before))
    } catch {
      for (const row of tbRows) {
        try {
          const before = await db.tbEntries.count()
          await db.tbEntries.put(row)
          const after = await db.tbEntries.count()
          if (after > before) tbAdded++
          else tbSkipped++
        } catch { tbSkipped++ }
      }
    }
  }

  }) // 事务结束

  return {
    stats: {
      projects: bundle.projects.length,
      files: bundle.files.length,
      folders: bundle.folders?.length ?? 0,
      segments: bundle.segments.length,
      tmAdded,
      tmSkipped,
      tbAdded,
      tbSkipped,
    },
  }
}

const _idCounter = Date.now()
let _idSeq = 0
function newIdInternal(prefix: string): string {
  return `${prefix}_${_idCounter.toString(36)}_${(_idSeq++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export async function importAllData(
  bundle: CATExportBundle,
  strategy: ImportStrategy,
): Promise<ImportStats> {
  const { db } = await import('@/data/db')
  const stats: ImportStats = {
    projects: { added: 0, overwritten: 0, wiped: strategy === 'wipe' },
    files: 0,
    folders: 0,
    segments: 0,
    tmEntries: { added: 0, skipped: 0 },
    tbEntries: { added: 0, skipped: 0 },
  }

  if (strategy === 'append') {
    // append 路径：严格按顺序写入 + 以 Dexie bulkPut 返回的真实自增 id 作为映射基准
    const r = await executeAppendImport(db, bundle)
    stats.projects.added = r.stats.projects
    stats.projects.overwritten = 0
    stats.folders = r.stats.folders
    stats.files = r.stats.files
    stats.segments = r.stats.segments
    stats.tmEntries.added = r.stats.tmAdded
    stats.tmEntries.skipped = r.stats.tmSkipped
    stats.tbEntries.added = r.stats.tbAdded
    stats.tbEntries.skipped = r.stats.tbSkipped
    return stats
  }

  // merge / wipe 路径：保留原流程（bulkPut，同 id 覆盖）
  await db.transaction(
    'rw',
    [db.projects, db.files, db.folders, db.segments, db.tmEntries, db.tbEntries],
    async () => {
      if (strategy === 'wipe') {
        await Promise.all([
          db.projects.clear(),
          db.files.clear(),
          db.folders.clear(),
          db.segments.clear(),
          db.tmEntries.clear(),
          db.tbEntries.clear(),
        ])
      }

      // === projects：merge/wipe = bulkPut（id 同则覆盖）===
      if (bundle.projects?.length) {
        const preCount = stats.projects.wiped ? 0 : await db.projects.count()
        const rows = bundle.projects as any[]
        await db.projects.bulkPut(rows)
        const postCount = await db.projects.count()
        stats.projects.added = Math.max(0, postCount - preCount)
        stats.projects.overwritten = strategy === 'merge' ? Math.max(0, bundle.projects.length - stats.projects.added) : 0
      }

      if (bundle.folders?.length) {
        await db.folders.bulkPut(bundle.folders as any[])
        stats.folders = bundle.folders.length
      }

      if (bundle.files?.length) {
        await db.files.bulkPut(bundle.files as any[])
        stats.files = bundle.files.length
      }

      if (bundle.segments?.length) {
        await db.segments.bulkPut(bundle.segments as any[])
        stats.segments = bundle.segments.length
      }

      // === TM / TB：因为有复合唯一索引，bulkPut 对重复键会以新的覆盖（符合 merge 语义）===
      if (bundle.tmEntries?.length) {
        try {
          const before = await db.tmEntries.count()
          await db.tmEntries.bulkPut(bundle.tmEntries as any[])
          const after = await db.tmEntries.count()
          stats.tmEntries.added = after - before
          stats.tmEntries.skipped = Math.max(0, bundle.tmEntries.length - (after - before))
        } catch {
          // 兼容 bulk 失败：fallback 单条 put
          let added = 0
          let skipped = 0
          for (const row of bundle.tmEntries) {
            try {
              const before = await db.tmEntries.count()
              await db.tmEntries.put(row as any)
              const after = await db.tmEntries.count()
              if (after > before) added++
              else skipped++
            } catch { skipped++ }
          }
          stats.tmEntries.added = added
          stats.tmEntries.skipped = skipped
        }
      }
      if (bundle.tbEntries?.length) {
        try {
          const before = await db.tbEntries.count()
          await db.tbEntries.bulkPut(bundle.tbEntries as any[])
          const after = await db.tbEntries.count()
          stats.tbEntries.added = after - before
          stats.tbEntries.skipped = Math.max(0, bundle.tbEntries.length - (after - before))
        } catch {
          let added = 0
          let skipped = 0
          for (const row of bundle.tbEntries) {
            try {
              const before = await db.tbEntries.count()
              await db.tbEntries.put(row as any)
              const after = await db.tbEntries.count()
              if (after > before) added++
              else skipped++
            } catch { skipped++ }
          }
          stats.tbEntries.added = added
          stats.tbEntries.skipped = skipped
        }
      }
    },
  )

  // settings：用户要求 settings 单独导入导出；项目级导入"不触碰 settings"
  // if (workBundle.settings) 这里我们忽略，避免把 settings 覆盖
  return stats
}

/* =========================
 * Settings 单独导入 / 导出
 * ========================= */
export interface CATSettngsBundle {
  version: '1.0'
  exportedAt: number
  settings: Record<string, unknown>
}

export async function exportSettings(): Promise<CATSettngsBundle> {
  const { db } = await import('@/data/db')
  const rows = await db.settings.toArray()
  const settings: Record<string, unknown> = {}
  for (const r of rows) settings[r.key] = r.value
  return { version: '1.0', exportedAt: Date.now(), settings }
}

export async function importSettings(bundle: CATSettngsBundle): Promise<{ applied: number; skipped: number }> {
  if (!bundle || bundle.version !== '1.0' || !bundle.settings) {
    throw new Error('无效的设置文件格式')
  }
  const { db } = await import('@/data/db')
  const entries = Object.entries(bundle.settings)
  let applied = 0
  let skipped = 0
  await db.transaction('rw', [db.settings], async () => {
    for (const [key, value] of entries) {
      if (!key) { skipped++; continue }
      try {
        await db.settings.put({ key, value })
        applied++
      } catch {
        skipped++
      }
    }
  })
  return { applied, skipped }
}

/* =========================
 * Recent Projects helper（读写 db.settings）
 * ========================= */
export interface RecentProjectEntry {
  id: ID
  name: string
  sourceLang?: string
  targetLang?: string
  openedAt: number
}

const RECENT_LIMIT = 10

export async function getRecentProjects(): Promise<RecentProjectEntry[]> {
  const { db } = await import('@/data/db')
  const row = await db.settings.get(SETTINGS_KEYS.RECENT_PROJECTS)
  if (!row) return []
  const arr = row.value as RecentProjectEntry[]
  return Array.isArray(arr) ? arr : []
}

export async function pushRecentProject(entry: RecentProjectEntry): Promise<void> {
  const { db } = await import('@/data/db')
  const list = await getRecentProjects()
  const filtered = list.filter((x) => String(x.id) !== String(entry.id))
  const next = [entry, ...filtered].slice(0, RECENT_LIMIT)
  await db.settings.put({ key: SETTINGS_KEYS.RECENT_PROJECTS, value: next })
}

export async function removeRecentProject(id: ID): Promise<void> {
  const { db } = await import('@/data/db')
  const list = await getRecentProjects()
  const next = list.filter((x) => String(x.id) !== String(id))
  await db.settings.put({ key: SETTINGS_KEYS.RECENT_PROJECTS, value: next })
}

/* =========================
 * 设置 key-value helpers（任意读写 db.settings，带默认值）
 * ========================= */
export async function getSetting<T = unknown>(key: string, fallback: T): Promise<T> {
  const { db } = await import('@/data/db')
  const row = await db.settings.get(key)
  if (!row) return fallback
  return (row.value as T) ?? fallback
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const { db } = await import('@/data/db')
  await db.settings.put({ key, value })
}

/* =========================
 * 通用：下载 / 读文件
 * ========================= */
export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filename)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readJSONFile<T = unknown>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)) as T)
      } catch (e) {
        reject(e)
      }
    }
    reader.readAsText(file, 'utf-8')
  })
}

export function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(file)
  })
}

export function splitTextIntoSegments(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+|(?<=[。！？.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function newId(prefix: string): ID {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/* =========================
 * 用户设置（localStorage + db.settings + 自定义布局）导入 / 导出
 * ========================= */
const LS_KEYS = [
  'cat.theme',
  'cat.uiAppearance',
  'cat.aiqaSettings',
  'cat.mtSettings',
  'cat.dictionarySettings',
  'cat.terms',
] as const

export interface CATUserSettingsBundle {
  version: '1.0'
  exportedAt: number
  localStorage: Partial<Record<typeof LS_KEYS[number], string>>
  dbSettings: Record<string, unknown>
  userLayouts: Array<Omit<SavedLayout, 'id'>>
}

export async function exportUserSettings(): Promise<CATUserSettingsBundle> {
  const lsSnapshot: CATUserSettingsBundle['localStorage'] = {}
  for (const k of LS_KEYS) {
    const v = localStorage.getItem(k)
    if (v != null) lsSnapshot[k] = v
  }
  const { db } = await import('@/data/db')
  const settingsRows = await db.settings.toArray()
  const dbSettings: Record<string, unknown> = {}
  for (const r of settingsRows) dbSettings[r.key] = r.value
  const userLayouts = await db.layouts.where('type').equals('user').toArray()
  const userLayoutsNoId = userLayouts.map(({ id: _id, ...rest }) => rest)
  return {
    version: '1.0',
    exportedAt: Date.now(),
    localStorage: lsSnapshot,
    dbSettings,
    userLayouts: userLayoutsNoId,
  }
}

export interface ImportUserSettingsStats {
  localStorage: { applied: number; skipped: number }
  dbSettings: { applied: number; skipped: number }
  userLayouts: { added: number; overwritten: number; skipped: number }
}

export async function importUserSettings(bundle: CATUserSettingsBundle): Promise<ImportUserSettingsStats> {
  if (!bundle || bundle.version !== '1.0') {
    throw new Error('无效的用户设置文件格式')
  }
  const stats: ImportUserSettingsStats = {
    localStorage: { applied: 0, skipped: 0 },
    dbSettings: { applied: 0, skipped: 0 },
    userLayouts: { added: 0, overwritten: 0, skipped: 0 },
  }
  // localStorage
  if (bundle.localStorage) {
    for (const k of LS_KEYS) {
      const v = bundle.localStorage[k]
      if (v === undefined) continue
      try {
        if (v === null) localStorage.removeItem(k)
        else localStorage.setItem(k, v)
        stats.localStorage.applied++
      } catch {
        stats.localStorage.skipped++
      }
    }
  }
  // db.settings + db.layouts
  const { db } = await import('@/data/db')
  await db.transaction('rw', [db.settings, db.layouts], async () => {
    if (bundle.dbSettings) {
      for (const [key, value] of Object.entries(bundle.dbSettings)) {
        if (!key) { stats.dbSettings.skipped++; continue }
        try {
          await db.settings.put({ key, value })
          stats.dbSettings.applied++
        } catch {
          stats.dbSettings.skipped++
        }
      }
    }
    if (bundle.userLayouts && bundle.userLayouts.length > 0) {
      const existing = await db.layouts.where('type').equals('user').toArray()
      const existingByName = new Map(existing.map((l) => [l.name, l]))
      for (const l of bundle.userLayouts) {
        if (!l?.name || l.type !== 'user') { stats.userLayouts.skipped++; continue }
        try {
          const dup = existingByName.get(l.name)
          if (dup) {
            await db.layouts.put({ ...dup, ...l, id: dup.id, savedAt: Date.now() })
            stats.userLayouts.overwritten++
          } else {
            await db.layouts.add({ ...l, savedAt: l.savedAt ?? Date.now() })
            stats.userLayouts.added++
          }
        } catch {
          stats.userLayouts.skipped++
        }
      }
    }
  })
  return stats
}

export async function downloadUserSettings(): Promise<void> {
  const bundle = await exportUserSettings()
  const ts = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const filename = `cat-user-settings-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.cat-settings.json`
  downloadJSON(bundle, filename)
}

/* =========================
 * fflate 压缩 / 解压缩（BackupSnapshot 用）
 * ========================= */
export function compressBundleToGzip(bundle: CATExportBundle | CATSettngsBundle): {
  payload: Uint8Array
  originalSize: number
  compressedSize: number
} {
  const json = JSON.stringify(bundle)
  const u8 = strToU8(json)
  // zlibSync：带 zlib header（和 ungz/decompressSync 兼容）
  const compressed = zlibSync(u8, { level: 6 })
  return { payload: compressed, originalSize: u8.length, compressedSize: compressed.length }
}

export function decompressBundleFromGzip<T = unknown>(payload: Uint8Array): T {
  const u8 = decompressSync(payload)
  return JSON.parse(strFromU8(u8)) as T
}
