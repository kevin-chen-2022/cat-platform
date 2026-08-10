import type { CATExportBundle } from '@/services/io'
import {
  exportFilteredData,
  compressBundleToGzip,
  decompressBundleFromGzip,
  importAllData,
  SETTINGS_KEYS,
  getSetting,
  setSetting,
  downloadJSON,
} from '@/services/io'
import { db, type BackupSnapshot } from '@/data/db'

export interface BackupStatus {
  enabled: boolean
  intervalMin: number
  keep: number
  lastAt: number | null
  count: number
  /** 压缩比（平均），用于 UI 展示 */
  avgRatio?: number
}

/** 快照时的上下文信息，由调用方（UI/store）传入，避免循环依赖 */
export interface SnapshotContext {
  currentProjectId?: string | number | null
  currentProjectName?: string
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const [enabled, intervalMin, keep] = await Promise.all([
    getSetting<boolean>(SETTINGS_KEYS.BACKUP_SNAPSHOT_ENABLED, true),
    getSetting<number>(SETTINGS_KEYS.BACKUP_SNAPSHOT_INTERVAL_MIN, 5),
    getSetting<number>(SETTINGS_KEYS.BACKUP_SNAPSHOT_KEEP, 10),
  ])
  const rows = await db.backupSnapshots.orderBy('createdAt').reverse().limit(1).toArray()
  const count = await db.backupSnapshots.count()
  let avgRatio: number | undefined
  if (count > 0) {
    const recent = await db.backupSnapshots.orderBy('createdAt').reverse().limit(Math.min(count, 5)).toArray()
    const totalOrg = recent.reduce((s, r) => s + r.originalSize, 0)
    const totalCmp = recent.reduce((s, r) => s + r.compressedSize, 0)
    if (totalOrg > 0) avgRatio = totalCmp / totalOrg
  }
  return {
    enabled,
    intervalMin: clampInterval(intervalMin),
    keep: clampKeep(keep),
    lastAt: rows[0]?.createdAt ?? null,
    count,
    avgRatio,
  }
}

function clampInterval(v: number): number {
  const n = Number.isFinite(v) ? Math.floor(v) : 5
  return Math.max(1, Math.min(n, 24 * 60)) // 1min ~ 24h
}
function clampKeep(v: number): number {
  const n = Number.isFinite(v) ? Math.floor(v) : 10
  return Math.max(1, Math.min(n, 1000)) // 1 ~ 1000 份
}

export async function updateBackupConfig(opts: {
  enabled?: boolean
  intervalMin?: number
  keep?: number
}): Promise<void> {
  if (opts.enabled != null) await setSetting(SETTINGS_KEYS.BACKUP_SNAPSHOT_ENABLED, opts.enabled)
  if (opts.intervalMin != null) await setSetting(SETTINGS_KEYS.BACKUP_SNAPSHOT_INTERVAL_MIN, clampInterval(opts.intervalMin))
  if (opts.keep != null) await setSetting(SETTINGS_KEYS.BACKUP_SNAPSHOT_KEEP, clampKeep(opts.keep))
  // 触发调度器刷新（如果已 install）
  try {
    await BackupScheduler.refreshFromSettings()
  } catch {
    /* ignore */
  }
}

/** 列出所有自动快照（按 createdAt 倒序） */
export async function listSnapshots(limit = 100): Promise<BackupSnapshot[]> {
  return db.backupSnapshots.orderBy('createdAt').reverse().limit(limit).toArray()
}

/** 删除单条快照 */
export async function deleteSnapshot(id: number): Promise<void> {
  await db.backupSnapshots.delete(id)
}

/** 清理所有快照 */
export async function clearAllSnapshots(): Promise<void> {
  await db.backupSnapshots.clear()
}

/** 立即创建一个快照并写入 backupSnapshots；滚动保留 keep 份 */
export async function createSnapshot(
  ctx: SnapshotContext = {},
  opts?: { force?: boolean },
): Promise<BackupSnapshot | null> {
  const cfg = await getBackupStatus()
  if (!cfg.enabled && !opts?.force) return null

  const bundle = (await exportFilteredData({
    range: 'all',
    excludeSettings: false,
  })) as CATExportBundle

  let compressed: ReturnType<typeof compressBundleToGzip>
  try {
    compressed = compressBundleToGzip(bundle)
  } catch (e) {
    // 压缩失败：退化到未压缩，确保仍能留下备份
    const json = JSON.stringify(bundle)
    const u8 = new TextEncoder().encode(json)
    compressed = { payload: u8, originalSize: u8.length, compressedSize: u8.length }
  }

  const row: Omit<BackupSnapshot, 'id'> = {
    createdAt: Date.now(),
    compression: compressed.originalSize === compressed.compressedSize ? 'none' : 'gzip',
    payload: compressed.payload,
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
    summary: {
      projectCount: bundle.projects.length,
      fileCount: bundle.files.length,
      segmentCount: bundle.segments.length,
      tmCount: bundle.tmEntries.length,
      tbCount: bundle.tbEntries.length,
      currentProjectId: ctx.currentProjectId ?? null,
      currentProjectName: ctx.currentProjectName,
    },
  }

  const id = await db.backupSnapshots.add(row as BackupSnapshot)

  // 滚动清理：按 createdAt 升序，保留 keep 份
  const total = await db.backupSnapshots.count()
  if (total > cfg.keep) {
    const extra = total - cfg.keep
    const olds = await db.backupSnapshots.orderBy('createdAt').limit(extra).primaryKeys()
    await db.backupSnapshots.bulkDelete(olds)
  }

  return (await db.backupSnapshots.get(id)) ?? null
}

export interface RestoreOptions {
  /** 是否同时恢复 db.settings（默认 true） */
  restoreSettings?: boolean
  /** 恢复时的通知回调（恢复完成时调用，用于 UI 层提示） */
  onReloadNeeded?: () => Promise<void> | void
}

/** 从快照恢复（解压缩 → importAllData wipe；可选是否恢复设置） */
export async function restoreSnapshot(
  snapshot: BackupSnapshot,
  opts: RestoreOptions = {},
): Promise<void> {
  const bundle = decompressBundleFromGzip<CATExportBundle>(snapshot.payload)
  const { restoreSettings = true } = opts

  // 1. 恢复主体（wipe=重建）；importAllData 不会触碰 settings
  await importAllData(bundle, 'wipe')

  // 2. settings 单独恢复
  if (restoreSettings && bundle.settings) {
    const entries = Object.entries(bundle.settings)
    await db.transaction('rw', [db.settings], async () => {
      for (const [key, value] of entries) {
        if (!key) continue
        try {
          await db.settings.put({ key, value })
        } catch {
          /* ignore bad keys */
        }
      }
    })
  }
}

/** 导出某个快照为下载（方便迁移） */
export async function downloadSnapshot(snapshot: BackupSnapshot): Promise<void> {
  const bundle = decompressBundleFromGzip<CATExportBundle>(snapshot.payload)
  const d = new Date(snapshot.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  downloadJSON(bundle, `autosnapshot-${stamp}.cat-project.json`)
}

/* =====================================================
 * 全量本地备份提醒（顶部 Banner 非打断提示）helpers
 * ===================================================== */
export interface ReminderStatus {
  enabled: boolean
  intervalHour: number
  lastFullDownloadAt: number | null
  /** 是否应该提示 */
  shouldRemind: boolean
}

export async function getBackupReminderStatus(): Promise<ReminderStatus> {
  const [enabled, intervalHour, lastAt] = await Promise.all([
    getSetting<boolean>(SETTINGS_KEYS.BACKUP_REMINDER_ENABLED, true),
    getSetting<number>(SETTINGS_KEYS.BACKUP_REMINDER_INTERVAL_HOUR, 24),
    getSetting<number | null>(SETTINGS_KEYS.BACKUP_LAST_FULL_DOWNLOAD_AT, null),
  ])
  const intervalMs = Math.max(1, intervalHour) * 60 * 60 * 1000
  const shouldRemind = Boolean(
    enabled && (!lastAt || Date.now() - lastAt > intervalMs),
  )
  return {
    enabled,
    intervalHour: Math.max(1, intervalHour),
    lastFullDownloadAt: lastAt,
    shouldRemind,
  }
}

export async function markFullBackupDone(): Promise<void> {
  await setSetting<number>(SETTINGS_KEYS.BACKUP_LAST_FULL_DOWNLOAD_AT, Date.now())
}

export async function updateBackupReminderConfig(opts: {
  enabled?: boolean
  intervalHour?: number
}): Promise<void> {
  if (opts.enabled != null) await setSetting(SETTINGS_KEYS.BACKUP_REMINDER_ENABLED, opts.enabled)
  if (opts.intervalHour != null) {
    await setSetting(
      SETTINGS_KEYS.BACKUP_REMINDER_INTERVAL_HOUR,
      Math.max(1, Math.min(24 * 30, Math.floor(opts.intervalHour))),
    )
  }
}

/* =====================================================
 * 轮询式调度器（单例）
 * - 按分钟间隔触发 createSnapshot
 * - beforeunload / visibilitychange hidden 时各做一次
 * ===================================================== */
type Listener = (status: BackupStatus) => void

/** 获取快照上下文（lazy import，避免 services/io 直接引用 app store → 循环依赖） */
async function getSnapshotContextSafe(): Promise<SnapshotContext> {
  try {
    const mod = await import(
      /* @vite-ignore */
      '@app/store'
    )
    const st = (mod.useProjectStore as any)?.getState?.()
    if (!st) return {}
    const currentProjectId = st.currentProjectId
    const currentProjectName =
      Array.isArray(st.projects)
        ? st.projects.find((p: any) => p?.id === currentProjectId)?.name
        : undefined
    return { currentProjectId, currentProjectName }
  } catch {
    return {}
  }
}

class SchedulerSingleton {
  private timer: ReturnType<typeof setInterval> | null = null
  private intervalMs: number = 5 * 60 * 1000
  private keep = 10
  private enabled = true
  private listeners = new Set<Listener>()
  private bound = false

  private onBeforeUnload = () => {
    try {
      // fire-and-forget：同步方式尝试留一份
      getSnapshotContextSafe()
        .then((ctx) => createSnapshot(ctx, { force: true }))
        .catch(() => {})
    } catch {
      /* ignore */
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      try {
        getSnapshotContextSafe()
          .then((ctx) => createSnapshot(ctx, { force: false }))
          .catch(() => {})
      } catch {
        /* ignore */
      }
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    void this.emit()
    return () => {
      this.listeners.delete(l)
    }
  }

  private async emit() {
    try {
      const status = await getBackupStatus()
      this.listeners.forEach((l) => l(status))
    } catch {
      /* ignore */
    }
  }

  async install() {
    if (this.bound) return
    this.bound = true

    const cfg = await getBackupStatus()
    this.enabled = cfg.enabled
    this.intervalMs = clampInterval(cfg.intervalMin) * 60 * 1000
    this.keep = clampKeep(cfg.keep)

    this.restartTimer()

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.onBeforeUnload)
      document.addEventListener('visibilitychange', this.onVisibility)
    }

    void this.emit()
  }

  async refreshFromSettings() {
    const cfg = await getBackupStatus()
    this.enabled = cfg.enabled
    this.intervalMs = clampInterval(cfg.intervalMin) * 60 * 1000
    this.keep = clampKeep(cfg.keep)
    this.restartTimer()
    void this.emit()
  }

  private restartTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (!this.enabled) return
    this.timer = setInterval(() => {
      getSnapshotContextSafe()
        .then((ctx) => createSnapshot(ctx, { force: false }))
        .then(() => this.emit())
        .catch(() => {})
    }, this.intervalMs)
  }

  async triggerNow(ctx: SnapshotContext = {}) {
    await createSnapshot(ctx, { force: true })
    void this.emit()
  }
}

export const BackupScheduler = new SchedulerSingleton()
