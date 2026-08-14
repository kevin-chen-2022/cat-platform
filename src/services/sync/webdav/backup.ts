/**
 * WebDAV 项目备份 / 恢复 + TM 同步高层业务逻辑
 *
 * 设计要点：
 * - 远端目录结构：<root>/cat-platform/<文件名>
 *   - project-backup-YYYYMMDD-HHmmss.json     （全量项目数据快照）
 *   - tm-bundle-YYYYMMDD-HHmmss.json          （TM 条目批量同步）
 * - 备份采用 JSON 文本，覆盖式 PUT；恢复走 GET 后 importAllData(merge)
 * - TM 同步：上传本地 TM（带时间戳），合并远端 TM 到本地（merge by upsert 唯一键）
 * - 所有高层函数返回统一 { ok, message, stats? } 结构，便于 UI 直接 notify
 */
import type { WebdavConfig } from '@/app/store'
import { useSyncStore } from '@/app/store'
import {
  webdavMkcol,
  webdavPut,
  webdavGetText,
  webdavGetBytes,
  webdavList,
  type WebDavOpResult,
  type WebDavEntry,
} from './provider'
import {
  exportFilteredData,
  importAllData,
  compressBundleToGzip,
  decompressBundleFromGzip,
  type CATExportBundle,
  type ImportStats,
  type ImportStrategy,
  type ExportRange,
} from '@/services/io'

/** 远端根目录名（统一存放在根目录下该子目录，避免污染用户根目录） */
export const REMOTE_ROOT_DIR = 'cat-platform'
/** 压缩备份文件后缀 */
export const COMPRESSED_EXT = '.json.gz'
/** 普通文本备份文件后缀 */
export const PLAIN_EXT = '.json'

/** 备份范围选项 */
export type BackupRange = ExportRange

/** 高层操作结果（UI 直接消费） */
export interface BackupResult {
  ok: boolean
  message: string
  /** 远端文件名（上传成功时） */
  remoteName?: string
  /** 远端字节数（上传成功时） */
  remoteSize?: number
  /** 导出的 bundle 概要（备份成功时） */
  bundleSummary?: {
    projects: number
    files: number
    segments: number
    tmEntries: number
    tbEntries: number
  }
}

export interface RestoreResult {
  ok: boolean
  message: string
  /** 远端文件名 */
  remoteName?: string
  /** 导入统计（恢复成功时） */
  stats?: ImportStats
}

export interface TMSyncResult {
  ok: boolean
  message: string
  /** 上传的 TM 条目数 */
  uploadedCount?: number
  /** 从远端合并到本地的 TM 条目数（added + updated） */
  mergedCount?: number
}

/** 远端备份条目（listBackups 返回，已按时间倒序） */
export interface RemoteBackupEntry {
  name: string
  href: string
  /** 解析自文件名的时间戳（ms），解析失败为 null */
  timestamp: number | null
  /** 文件大小（字节） */
  size: number | null
  /** 最后修改时间（服务器返回的原始字符串） */
  lastModified: string | null
  /** 是否为压缩文件 */
  compressed: boolean
  /** 推断的类型：project | tm | unknown */
  kind: 'project' | 'tm' | 'unknown'
}

/* =========================
 * 工具函数
 * ========================= */

/** 生成带时间戳的文件名 */
function timestampName(prefix: string, ext: string): string {
  const d = new Date()
  const p = (n: number) => n.toString().padStart(2, '0')
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${prefix}-${ts}${ext}`
}

/** 从文件名解析时间戳（YYYYMMDD-HHmmss） */
function parseTimestampFromName(name: string): number | null {
  const m = name.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  const t = dt.getTime()
  return Number.isNaN(t) ? null : t
}

/** 推断文件类型 */
function inferKind(name: string): RemoteBackupEntry['kind'] {
  if (name.startsWith('project-backup-')) return 'project'
  if (name.startsWith('tm-bundle-')) return 'tm'
  return 'unknown'
}

/** 确保远端根目录存在（幂等） */
async function ensureRemoteDir(config: WebdavConfig): Promise<WebDavOpResult<void>> {
  return webdavMkcol(config, REMOTE_ROOT_DIR)
}

/** 将任意错误转为 BackupResult.fail */
function failResult(message: string): BackupResult
function failResult(message: string, _kind: 'restore'): RestoreResult
function failResult(message: string, _kind: 'tm'): TMSyncResult
function failResult(message: string, kind?: 'restore' | 'tm'): BackupResult | RestoreResult | TMSyncResult {
  if (kind === 'restore') return { ok: false, message }
  if (kind === 'tm') return { ok: false, message }
  return { ok: false, message }
}

/* =========================
 * 项目备份（上传）
 * ========================= */

export interface UploadBackupOptions {
  range: BackupRange
  currentProjectId?: number | string | null
  /** 是否启用 gzip 压缩（默认 true） */
  compress?: boolean
  /** 自定义文件名（不传则自动生成时间戳名） */
  filename?: string
}

export async function uploadProjectBackup(opts: UploadBackupOptions): Promise<BackupResult> {
  const config = useSyncStore.getState().webdav
  if (!config.url || !config.username || !config.password) {
    return failResult('请先填写并测试 WebDAV 连接配置')
  }

  // 1. 导出本地数据
  let bundle: CATExportBundle
  try {
    bundle = await exportFilteredData({
      range: opts.range,
      currentProjectId: opts.currentProjectId,
      excludeSettings: true,
    })
  } catch (e) {
    return failResult(`导出本地数据失败：${(e as Error).message}`)
  }

  if (bundle.projects.length === 0 && bundle.segments.length === 0) {
    return failResult('本地无项目数据可备份')
  }

  // 2. 序列化（可选压缩）
  const useCompress = opts.compress !== false
  let body: string | ArrayBuffer
  let contentType: string
  let ext: string
  let originalSize = 0
  try {
    if (useCompress) {
      const { payload, originalSize: orig } = compressBundleToGzip(bundle)
      body = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer
      contentType = 'application/gzip'
      ext = COMPRESSED_EXT
      originalSize = orig
    } else {
      const json = JSON.stringify(bundle)
      body = json
      contentType = 'application/json; charset=utf-8'
      ext = PLAIN_EXT
      originalSize = new Blob([json]).size
    }
  } catch (e) {
    return failResult(`序列化数据失败：${(e as Error).message}`)
  }

  // 3. 确保远端目录
  const dirRes = await ensureRemoteDir(config)
  if (!dirRes.ok) {
    return failResult(`创建远端目录失败：${dirRes.message}`)
  }

  // 4. 上传
  const name = opts.filename ?? timestampName('project-backup', ext)
  const path = `${REMOTE_ROOT_DIR}/${name}`
  const putRes = await webdavPut(config, path, body, contentType)
  if (!putRes.ok) {
    return failResult(`上传失败：${putRes.message}`)
  }

  return {
    ok: true,
    message: `已备份到 ${path}（原始 ${formatBytes(originalSize)}${useCompress ? `，压缩后已上传` : ''}）`,
    remoteName: name,
    remoteSize: originalSize,
    bundleSummary: {
      projects: bundle.projects.length,
      files: bundle.files.length,
      segments: bundle.segments.length,
      tmEntries: bundle.tmEntries.length,
      tbEntries: bundle.tbEntries.length,
    },
  }
}

/* =========================
 * 列出远端备份
 * ========================= */

export async function listRemoteBackups(): Promise<{
  ok: boolean
  message: string
  entries: RemoteBackupEntry[]
}> {
  const config = useSyncStore.getState().webdav
  if (!config.url || !config.username || !config.password) {
    return { ok: false, message: '请先填写并测试 WebDAV 连接配置', entries: [] }
  }
  const res = await webdavList(config, REMOTE_ROOT_DIR)
  if (!res.ok || !res.data) {
    return { ok: false, message: res.message, entries: [] }
  }
  const entries = (res.data as WebDavEntry[])
    .filter((e) => !e.isCollection)
    .map((e): RemoteBackupEntry => {
      const compressed = e.displayName.endsWith(COMPRESSED_EXT)
      return {
        name: e.displayName,
        href: e.href,
        timestamp: parseTimestampFromName(e.displayName),
        size: e.contentLength ?? null,
        lastModified: e.lastModified ?? null,
        compressed,
        kind: inferKind(e.displayName),
      }
    })
    // 时间倒序（null 排最后）
    .sort((a, b) => {
      if (a.timestamp == null && b.timestamp == null) return a.name.localeCompare(b.name)
      if (a.timestamp == null) return 1
      if (b.timestamp == null) return -1
      return b.timestamp - a.timestamp
    })
  return { ok: true, message: `共 ${entries.length} 项`, entries }
}

/* =========================
 * 项目恢复（下载 + 导入）
 * ========================= */

export interface RestoreOptions {
  /** 远端文件名 */
  remoteName: string
  /** 导入策略，默认 merge */
  strategy?: ImportStrategy
}

export async function restoreProjectBackup(opts: RestoreOptions): Promise<RestoreResult> {
  const config = useSyncStore.getState().webdav
  if (!config.url || !config.username || !config.password) {
    return failResult('请先填写并测试 WebDAV 连接配置', 'restore')
  }
  if (!opts.remoteName) {
    return failResult('请指定要恢复的备份文件名', 'restore')
  }

  const path = `${REMOTE_ROOT_DIR}/${opts.remoteName}`
  const isCompressed = opts.remoteName.endsWith(COMPRESSED_EXT)

  let bundle: CATExportBundle
  try {
    if (isCompressed) {
      // 压缩文件：用 arrayBuffer 下载，避免 text() 解码破坏字节
      const getRes = await webdavGetBytes(config, path)
      if (!getRes.ok || getRes.data == null) {
        return failResult(`下载备份失败：${getRes.message}`, 'restore')
      }
      bundle = decompressBundleFromGzip<CATExportBundle>(getRes.data)
    } else {
      const getRes = await webdavGetText(config, path)
      if (!getRes.ok || getRes.data == null) {
        return failResult(`下载备份失败：${getRes.message}`, 'restore')
      }
      bundle = JSON.parse(getRes.data) as CATExportBundle
    }
  } catch (e) {
    return failResult(`解析备份数据失败：${(e as Error).message}`, 'restore')
  }

  if (!bundle || bundle.version !== '1.0') {
    return failResult('备份文件格式不正确或版本不兼容', 'restore')
  }

  const strategy: ImportStrategy = opts.strategy ?? 'merge'
  let stats: ImportStats
  try {
    stats = await importAllData(bundle, strategy)
  } catch (e) {
    return failResult(`导入数据失败：${(e as Error).message}`, 'restore')
  }

  return {
    ok: true,
    message: `已从 ${opts.remoteName} 恢复（策略：${strategy}）`,
    remoteName: opts.remoteName,
    stats,
  }
}

/* =========================
 * TM 同步（双向：上传本地 + 合并远端）
 * ========================= */

export interface TMSyncOptions {
  /** 是否上传本地 TM 到远端（默认 true） */
  upload?: boolean
  /** 是否从远端最新 TM 合并到本地（默认 true） */
  download?: boolean
}

export async function syncTM(opts: TMSyncOptions = {}): Promise<TMSyncResult> {
  const config = useSyncStore.getState().webdav
  if (!config.url || !config.username || !config.password) {
    return failResult('请先填写并测试 WebDAV 连接配置', 'tm')
  }
  const doUpload = opts.upload !== false
  const doDownload = opts.download !== false
  let uploadedCount = 0
  let mergedCount = 0

  // 1. 上传本地 TM
  if (doUpload) {
    let bundle: CATExportBundle
    try {
      bundle = await exportFilteredData({ range: 'all', excludeSettings: true })
    } catch (e) {
      return failResult(`导出本地 TM 失败：${(e as Error).message}`, 'tm')
    }
    if (bundle.tmEntries.length > 0) {
      const dirRes = await ensureRemoteDir(config)
      if (!dirRes.ok) {
        return failResult(`创建远端目录失败：${dirRes.message}`, 'tm')
      }
      // 仅上传 TM 条目（构造精简 bundle，避免误恢复项目数据）
      const tmOnly: CATExportBundle = {
        version: '1.0',
        exportedAt: Date.now(),
        projects: [],
        files: [],
        folders: [],
        segments: [],
        tmEntries: bundle.tmEntries,
        tbEntries: [],
      }
      const { payload } = compressBundleToGzip(tmOnly)
      const body = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer
      const name = timestampName('tm-bundle', COMPRESSED_EXT)
      const path = `${REMOTE_ROOT_DIR}/${name}`
      const putRes = await webdavPut(config, path, body, 'application/gzip')
      if (!putRes.ok) {
        return failResult(`上传 TM 失败：${putRes.message}`, 'tm')
      }
      uploadedCount = bundle.tmEntries.length
    }
  }

  // 2. 合并远端最新 TM 到本地
  if (doDownload) {
    const listRes = await listRemoteBackups()
    if (!listRes.ok) {
      // 上传成功但拉取列表失败时，仍返回上传结果
      if (doUpload) {
        return {
          ok: true,
          message: `已上传 ${uploadedCount} 条 TM 到远端；但拉取远端备份列表失败：${listRes.message}`,
          uploadedCount,
          mergedCount: 0,
        }
      }
      return failResult(`拉取远端备份列表失败：${listRes.message}`, 'tm')
    }
    const latestTM = listRes.entries.find((e) => e.kind === 'tm')
    if (latestTM) {
      const path = `${REMOTE_ROOT_DIR}/${latestTM.name}`
      const getRes = await webdavGetBytes(config, path)
      if (!getRes.ok || getRes.data == null) {
        if (doUpload && uploadedCount > 0) {
          return {
            ok: true,
            message: `已上传 ${uploadedCount} 条 TM；下载远端 TM 失败：${getRes.message}`,
            uploadedCount,
            mergedCount: 0,
          }
        }
        return failResult(`下载远端 TM 失败：${getRes.message}`, 'tm')
      }
      try {
        const tmBundle = decompressBundleFromGzip<CATExportBundle>(getRes.data)
        if (tmBundle?.tmEntries?.length) {
          const stats = await importAllData(
            { ...tmBundle, projects: [], files: [], folders: [], segments: [], tbEntries: [] },
            'merge',
          )
          mergedCount = stats.tmEntries.added + stats.tmEntries.skipped
        }
      } catch (e) {
        if (doUpload && uploadedCount > 0) {
          return {
            ok: true,
            message: `已上传 ${uploadedCount} 条 TM；合并远端 TM 失败：${(e as Error).message}`,
            uploadedCount,
            mergedCount: 0,
          }
        }
        return failResult(`合并远端 TM 失败：${(e as Error).message}`, 'tm')
      }
    }
  }

  const parts: string[] = []
  if (doUpload) parts.push(`上传 ${uploadedCount} 条`)
  if (doDownload) parts.push(`合并 ${mergedCount} 条`)
  return {
    ok: true,
    message: `TM 同步完成：${parts.join('，')}`,
    uploadedCount,
    mergedCount,
  }
}

/* =========================
 * 辅助：格式化字节
 * ========================= */
export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
