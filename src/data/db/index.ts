import Dexie, { type Table } from 'dexie'
import type { Project, File, Folder, Segment, TMEntry, TeamTMEntry, TBEntry, MTProviderConfig, QAIssue, SavedLayout } from '@/types'

/** 本地自动快照：fflate 压缩后的完整 bundle（滚动 N 份，分钟级快照） */
export interface BackupSnapshot {
  id?: number
  createdAt: number
  /** 压缩算法：gzip / raw */
  compression: 'gzip' | 'none'
  /** fflate 压缩后的二进制（JSON bundle） */
  payload: Uint8Array
  /** 压缩前的 JSON byte 长度（校验用） */
  originalSize: number
  /** 压缩后的 byte 长度 */
  compressedSize: number
  /** 快照元数据（概览），不展开大对象 */
  summary: {
    projectCount: number
    fileCount: number
    segmentCount: number
    tmCount: number
    tbCount: number
    /** 快照时的激活项目（如有），用于列表快速识别 */
    currentProjectId?: string | number | null
    currentProjectName?: string
  }
}

export class CATDatabase extends Dexie {
  projects!: Table<Project, number>
  files!: Table<File, number>
  folders!: Table<Folder, number>
  segments!: Table<Segment, number>
  tmEntries!: Table<TMEntry, number>
  teamTMEntries!: Table<TeamTMEntry, number>
  tbEntries!: Table<TBEntry, number>
  mtProviders!: Table<MTProviderConfig, string>
  qaIssues!: Table<QAIssue, number>
  settings!: Table<{ key: string; value: unknown }, string>
  layouts!: Table<SavedLayout, number>
  backupSnapshots!: Table<BackupSnapshot, number>

  constructor() {
    super('cat-web-db')
    this.version(1).stores({
      projects: '++id, name, sourceLang, targetLang, createdAt, updatedAt',
      files: '++id, projectId, name, format, createdAt, updatedAt',
      segments: '++id, fileId, index, status, updatedAt',
      tmEntries: '++id, &[source+target+sourceLang+targetLang], sourceLang, targetLang, projectId, createdAt, updatedAt',
      tbEntries: '++id, &[term+translation+sourceLang+targetLang], sourceLang, targetLang, forbidden, createdAt, updatedAt',
      mtProviders: 'id, type, enabled, priority',
      qaIssues: '++id, segmentId, type, severity, resolved, createdAt',
      settings: '&key',
    })
    this.version(2).stores({
      layouts: '++id, name, type, savedAt',
    })
    // v3: 新增 folders 表（项目内文件分类树），files 表加 folderId 索引
    this.version(3).stores({
      projects: '++id, name, sourceLang, targetLang, createdAt, updatedAt',
      files: '++id, projectId, folderId, name, format, createdAt, updatedAt',
      folders: '++id, projectId, parentId, name, createdAt, updatedAt',
      segments: '++id, fileId, index, status, updatedAt',
      tmEntries: '++id, &[source+target+sourceLang+targetLang], sourceLang, targetLang, projectId, createdAt, updatedAt',
      tbEntries: '++id, &[term+translation+sourceLang+targetLang], sourceLang, targetLang, forbidden, createdAt, updatedAt',
      mtProviders: 'id, type, enabled, priority',
      qaIssues: '++id, segmentId, type, severity, resolved, createdAt',
      settings: '&key',
      layouts: '++id, name, type, savedAt',
    })
    // v4: folders / files 加同级排序字段 position，用于 before/after 精确定位拖放
    this.version(4).stores({
      files: '++id, projectId, folderId, name, format, position, createdAt, updatedAt',
      folders: '++id, projectId, parentId, name, position, createdAt, updatedAt',
    })
    // v5: backupSnapshots 自动快照表
    this.version(5).stores({
      backupSnapshots: '++id, createdAt',
    })
    // v6: files 表新增 rawBlob 字段（存原始 docx/pdf 二进制，用于原格式预览）
    //     无新增索引（rawBlob 不用于查询），Dexie 自动存储对象所有属性
    this.version(6).stores({
      files: '++id, projectId, folderId, name, format, position, createdAt, updatedAt',
    })
    // v7: 新增 teamTMEntries 表（团队译文记忆库，独立于本地 tmEntries）
    //     唯一索引 &[source+sourceLang+targetLang+createdBy]：同一译员同一原文只保留一条，后面覆盖前面
    this.version(7).stores({
      teamTMEntries: '++id, &[source+sourceLang+targetLang+createdBy], sourceLang, targetLang, createdBy, createdAt, updatedAt',
    })
    // v8: tmEntries 去重第一步 —— 先建「非唯一」复合索引 [source+sourceLang+targetLang+projectId]
    //     （不能直接建唯一索引 &，因为存量数据中"同原文不同译文"会违反唯一约束导致 createIndex 失败）
    //     upgrade 函数负责删除重复项，只保留每组 updatedAt 最新的一条
    this.version(8).stores({
      tmEntries: '++id, [source+sourceLang+targetLang+projectId], sourceLang, targetLang, projectId, createdAt, updatedAt',
    }).upgrade(async (tx) => {
      try {
        const all = await tx.table('tmEntries').toArray() as TMEntry[]
        if (all.length === 0) return
        const groups = new Map<string, TMEntry[]>()
        for (const e of all) {
          const k = `${e.source}\u0001${e.sourceLang}\u0001${e.targetLang}\u0001${e.projectId ?? '__GLOBAL__'}`
          if (!groups.has(k)) groups.set(k, [])
          groups.get(k)!.push(e)
        }
        const idsToDelete: number[] = []
        for (const list of groups.values()) {
          if (list.length <= 1) continue
          list.sort((a, b) => b.updatedAt - a.updatedAt)
          for (let i = 1; i < list.length; i++) {
            if (list[i].id != null) idsToDelete.push(list[i].id as number)
          }
        }
        if (idsToDelete.length > 0) await tx.table('tmEntries').bulkDelete(idsToDelete)
      } catch (e) {
        console.warn('[db v8 upgrade] dedup skipped:', e)
      }
    })
    // v9: tmEntries 去重第二步 —— 存量重复项已在 v8 upgrade 中清理，现在可以安全地加上唯一约束 &
    this.version(9).stores({
      tmEntries: '++id, &[source+sourceLang+targetLang+projectId], sourceLang, targetLang, projectId, createdAt, updatedAt',
    })
  }
}

export const db = new CATDatabase()

export async function seedInitialData(): Promise<void> {
  const defaults: Array<{ key: string; value: unknown }> = [
    { key: 'theme.mode', value: 'light' },
    { key: 'lang.ui', value: 'zh-CN' },
    { key: 'project.defaultSourceLang', value: 'en' },
    { key: 'project.defaultTargetLang', value: 'zh-CN' },
    { key: 'mt.defaultThreshold', value: 70 },
    // ========== 自动快照默认参数（用户约定：5 分钟 / 保留 10 份） ==========
    { key: 'backup.snapshot.enabled', value: true },
    { key: 'backup.snapshot.intervalMin', value: 5 },
    { key: 'backup.snapshot.keep', value: 10 },
    // ========== 全量本地备份提醒：默认 24 小时提醒一次 ==========
    { key: 'backup.reminder.enabled', value: true },
    { key: 'backup.reminder.intervalHour', value: 24 },
  ]
  const existing = await db.settings.toArray()
  const existKeys = new Set(existing.map((r) => r.key))
  const toAdd = defaults.filter((d) => !existKeys.has(d.key))
  if (toAdd.length > 0) {
    await db.settings.bulkPut(toAdd)
  }

  const mtCount = await db.mtProviders.count()
  if (mtCount === 0) {
    await db.mtProviders.bulkPut([
      {
        id: 'deepl-default',
        name: 'DeepL',
        type: 'deepl',
        enabled: false,
        priority: 1,
        endpoint: 'https://api-free.deepl.com/v2/translate',
      },
      {
        id: 'google-default',
        name: 'Google Translate',
        type: 'google',
        enabled: false,
        priority: 2,
      },
      {
        id: 'baidu-default',
        name: '百度翻译',
        type: 'baidu',
        enabled: false,
        priority: 3,
        endpoint: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
      },
    ])
  }
}
