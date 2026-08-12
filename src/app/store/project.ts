import { create } from 'zustand'
import type { Project, File as ProjectFile, Folder, Segment, ID, ParseGranularity } from '@/types'
import { db } from '@data/db'
import { parseFile, detectFormat } from '@/services/io/parsers/dispatcher'
import { parseTxt } from '@/services/io/parsers/txt'
import type { ParseResult } from '@/services/io/parsers/types'

export interface ImportProgress {
  stage: 'idle' | 'parsing' | 'saving' | 'done' | 'error'
  message: string
  page?: number
  totalPages?: number
}

interface ProjectState {
  currentProjectId: ID | null
  projects: Project[]
  files: ProjectFile[]
  folders: Folder[]
  segments: Segment[]
  activeFileId: ID | null
  activeSegmentId: ID | null
  /** 项目文件面板中被多选（勾选）的文件 id 集合；跨 dialog（如导出）可读 */
  selectedFileIds: Set<ID>
  importProgress: ImportProgress
  /** db.settings 中 project.defaultSourceLang/defaultTargetLang 的本地缓存（加载时填充） */
  defaultSourceLang: string
  defaultTargetLang: string

  loadProjects: () => Promise<void>
  selectProject: (id: ID | null) => Promise<void>
  createProject: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ID>
  deleteProject: (id: ID) => Promise<void>
  renameProject: (id: ID, name: string) => Promise<void>

  loadFiles: (projectId: ID) => Promise<void>
  selectFile: (fileId: ID | null) => Promise<void>
  addFile: (f: Omit<ProjectFile, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ID>
  importFile: (file: File, granularity: ParseGranularity) => Promise<ID | null>
  /** 从剪贴板文本创建/追加「剪贴板翻译」文件，固定句子级粒度 */
  importClipboardText: (text: string) => Promise<{ fileId: ID; newSegmentCount: number; isExisting: boolean; firstNewSegmentId: ID | null } | null>
  moveFile: (
    fileId: ID,
    opts: {
      folderId?: ID | null
      insertBeforeFileId?: ID
      insertAfterFileId?: ID
    },
  ) => Promise<void>
  renameFile: (id: ID, name: string) => Promise<void>
  deleteFiles: (ids: ID[]) => Promise<number>

  setSelectedFileIds: (ids: Set<ID> | Iterable<ID>) => void
  toggleFileSelected: (fileId: ID, opts?: { forceState?: boolean }) => void
  /** 全选/取消指定文件夹下的所有后代文件（父级目录全选/三态的基础） */
  setFolderDescendantsSelected: (folderId: ID, fileIds: ID[], selected: boolean) => void

  loadFolders: (projectId: ID) => Promise<void>
  createFolder: (data: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'position'>) => Promise<ID>
  deleteFolders: (ids: ID[], { removeFiles }: { removeFiles?: boolean }) => Promise<{ deletedFolders: number; deletedFiles: number }>
  renameFolder: (id: ID, name: string) => Promise<void>
  moveFolder: (
    id: ID,
    opts: {
      parentId?: ID | null
      insertBeforeFolderId?: ID
      insertAfterFolderId?: ID
    },
  ) => Promise<void>

  loadSegments: (fileId: ID) => Promise<void>
  updateSegment: (id: ID, patch: Partial<Segment>) => Promise<void>
  mergeSegmentWithNext: (id: ID) => Promise<void>
  splitSegment: (id: ID, splitPos: number) => Promise<void>
  selectSegment: (segmentId: ID | null) => void
}

function formatToFileFormat(filename: string): ProjectFile['format'] {
  const f = detectFormat(filename)
  switch (f) {
    case 'md':
    case 'markdown': return 'md'
    case 'docx': return 'docx'
    case 'pdf': return 'pdf' as ProjectFile['format']
    case 'txt':
    case 'csv':
    case 'json': return f
    default: return 'txt'
  }
}

function parseResultToSegments(result: ParseResult, fileId: ID): Segment[] {
  const now = Date.now()
  return result.segments.map((s) => ({
    fileId,
    index: s.index,
    source: s.source,
    target: s.target,
    status: s.status,
    notes: s.notes,
    bbox: s.bbox,
    createdAt: now,
    updatedAt: now,
  }))
}

/** 按 position 主排序（有定义优先，小的在前），name 次排序兜底；接受带 position/name 的数组 */
export function sortByPositionThenName<T extends { position?: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ap = a.position
    const bp = b.position
    if (ap != null || bp != null) {
      const av = ap ?? Number.MAX_SAFE_INTEGER
      const bv = bp ?? Number.MAX_SAFE_INTEGER
      if (av !== bv) return av - bv
    }
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

const POS_STEP = 1024

/** 计算 before/after 插入位置，并在空间不足时对整层做 position 重整（步长 1024）
 * 返回：
 *   insertPosition:        被插入节点应设的 position
 *   fullRewritePositions:  若需要重整整层兄弟，这里返回其他所有兄弟的新 position（不含被插入节点）
 */
function calcInsertPositionAndMaybeNormalize<
  T extends { id?: ID; position?: number; name: string },
>(args: {
  siblings: T[]
  mode: 'before' | 'after'
  siblingId?: ID | null
}): { insertPosition: number; fullRewritePositions?: Array<{ id: number; position: number }> } {
  const sorted = sortByPositionThenName(args.siblings)
  const len = sorted.length

  // 没有任何兄弟 -> 直接放默认位置
  if (len === 0) {
    return { insertPosition: POS_STEP }
  }

  // 定位 sibling 索引；siblingId 为 null 时，before => 开头，after => 末尾
  const siblingIndex =
    args.siblingId == null
      ? args.mode === 'before'
        ? -1
        : len - 1
      : sorted.findIndex((s) => s.id === args.siblingId)

  // 理想的"插入后逻辑索引"：
  // - siblingIndex == -1（没找到/开头），before => 0，after => len（末尾）
  // - else，before => siblingIndex，after => siblingIndex + 1
  let insertLogicalIndex: number
  if (siblingIndex === -1) {
    insertLogicalIndex = args.mode === 'before' ? 0 : len
  } else {
    insertLogicalIndex = args.mode === 'before' ? siblingIndex : siblingIndex + 1
  }

  // 尝试取插入点两侧的 position
  const beforePos = insertLogicalIndex === 0 ? null : sorted[insertLogicalIndex - 1].position
  const afterPos = insertLogicalIndex >= len ? null : sorted[insertLogicalIndex].position

  const MIN_GAP = 2

  // 用两侧中值估算
  let low: number
  let high: number
  if (beforePos == null && afterPos == null) {
    low = 0
    high = POS_STEP * 2
  } else if (beforePos == null) {
    low = (afterPos as number) - POS_STEP * 2
    high = afterPos as number
  } else if (afterPos == null) {
    low = beforePos
    high = beforePos + POS_STEP * 2
  } else {
    low = beforePos
    high = afterPos
  }

  if (high - low >= MIN_GAP) {
    return { insertPosition: Math.round(low + (high - low) / 2) }
  }

  // 间距不够：先对整个兄弟层重整 position（步长 POS_STEP），再根据 insertLogicalIndex 插入
  const rewrite = sorted.map((s, i) => ({
    id: s.id as number,
    position: (i + 1) * POS_STEP,
  }))
  const insertPosition =
    insertLogicalIndex === 0
      ? POS_STEP / 2
      : insertLogicalIndex >= len
        ? (len + 1) * POS_STEP
        : rewrite[insertLogicalIndex - 1].position + POS_STEP / 2
  return { insertPosition, fullRewritePositions: rewrite }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProjectId: null,
  projects: [],
  files: [],
  folders: [],
  segments: [],
  activeFileId: null,
  activeSegmentId: null,
  selectedFileIds: new Set<ID>(),
  importProgress: { stage: 'idle', message: '' },
  defaultSourceLang: 'en',
  defaultTargetLang: 'zh-CN',

  loadProjects: async () => {
    const [rows, sl, tl] = await Promise.all([
      db.projects.orderBy('updatedAt').reverse().toArray(),
      db.settings.get('project.defaultSourceLang').catch(() => undefined),
      db.settings.get('project.defaultTargetLang').catch(() => undefined),
    ])
    set({
      projects: rows,
      defaultSourceLang: (sl?.value as string) ?? 'en',
      defaultTargetLang: (tl?.value as string) ?? 'zh-CN',
    })
  },

  selectProject: async (id) => {
    set({
      currentProjectId: id,
      files: [],
      folders: [],
      segments: [],
      activeFileId: null,
      activeSegmentId: null,
      selectedFileIds: new Set<ID>(),
    })
    if (id != null) {
      // 写入 recentProjects（异步、fire-and-forget，不要阻塞 tab 切换）
      ;(async () => {
        try {
          const { pushRecentProject } = await import('@/services/io')
          const p = get().projects.find((x) => String(x.id) === String(id))
          if (p) {
            await pushRecentProject({
              id: p.id!,
              name: p.name,
              sourceLang: p.sourceLang,
              targetLang: p.targetLang,
              openedAt: Date.now(),
            })
          }
        } catch { /* ignore */ }
      })()
      await Promise.all([get().loadFiles(id), get().loadFolders(id)])
    }
  },

  createProject: async (data) => {
    const now = Date.now()
    const id = await db.projects.add({ ...data, createdAt: now, updatedAt: now })
    await get().loadProjects()
    return id
  },

  deleteProject: async (id) => {
    // 级联删除：项目本身 + 文件夹 + 文件 + 段 + 项目级 TM/TB 条目
    // 全局共享的 TM/TB 条目（projectId == null）保留
    await db.transaction('rw', [db.projects, db.files, db.folders, db.segments, db.tmEntries, db.tbEntries], async () => {
      const files = await db.files.where({ projectId: id as number }).primaryKeys()
      await db.segments.where('fileId').anyOf(files).delete()
      await db.files.where({ projectId: id as number }).delete()
      await db.folders.where({ projectId: id as number }).delete()
      // 项目级 TM/TB：projectId 等于当前 id 的条目一并清空
      // tmEntries 有 projectId 索引可直接 where；tbEntries 无索引用 filter 全表扫（术语量通常不大）
      await db.tmEntries.where('projectId').equals(id as number).delete()
      const tbIds = await db.tbEntries
        .filter((row) => row.projectId != null && String(row.projectId) === String(id))
        .primaryKeys()
      if (tbIds.length > 0) await db.tbEntries.bulkDelete(tbIds)
      await db.projects.delete(id as number)
    })
    if (get().currentProjectId === id) {
      await get().selectProject(null)
    }
    await get().loadProjects()
    // 同步清理最近项目列表（fire-and-forget，不阻塞主流程）
    ;(async () => {
      try {
        const { removeRecentProject } = await import('@/services/io')
        await removeRecentProject(id)
      } catch { /* ignore */ }
    })()
  },

  renameProject: async (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('项目名称不能为空')
    await db.projects.update(id as number, { name: trimmed, updatedAt: Date.now() })
    await get().loadProjects()
  },

  loadFiles: async (projectId) => {
    const rows = await db.files.where({ projectId: projectId as number }).toArray()
    // 剥离 rawBlob：避免大量二进制数据常驻内存，原格式预览时通过 db.files.get(fileId) 按需读取
    set({ files: sortByPositionThenName(rows.map((f) => ({ ...f, rawBlob: undefined }))) })
  },

  selectFile: async (fileId) => {
    set({ activeFileId: fileId, segments: [], activeSegmentId: null })
    if (fileId != null) {
      await get().loadSegments(fileId)
    }
  },

  addFile: async (f) => {
    const now = Date.now()
    // 默认放在当前 folderId 下的尾部
    const all = await db.files.where({ projectId: f.projectId as number }).toArray()
    const siblings = all.filter((x) => (x.folderId ?? null) === (f.folderId ?? null))
    const { insertPosition, fullRewritePositions } = calcInsertPositionAndMaybeNormalize({
      siblings,
      mode: 'after',
      siblingId: null,
    })

    let id!: ID
    await db.transaction('rw', db.files, async () => {
      if (fullRewritePositions && fullRewritePositions.length > 0) {
        await db.files.bulkUpdate(
          fullRewritePositions.map((r) => ({ key: r.id, changes: { position: r.position } })),
        )
      }
      id = (await db.files.add({ ...f, createdAt: now, updatedAt: now, position: insertPosition })) as ID
    })

    if (get().currentProjectId === f.projectId) {
      await get().loadFiles(f.projectId)
    }
    return id
  },

  importFile: async (file, granularity) => {
    const projectId = get().currentProjectId
    if (projectId == null) {
      set({ importProgress: { stage: 'error', message: '请先选择一个项目' } })
      return null
    }
    try {
      set({ importProgress: { stage: 'parsing', message: `解析 ${file.name}...`, page: 0, totalPages: 0 } })
      const result = await parseFile(file, {
        granularity,
        onProgress: (page, totalPages) =>
          set({ importProgress: { stage: 'parsing', message: `解析第 ${page}/${totalPages} 页`, page, totalPages } }),
      })

      set({ importProgress: { stage: 'saving', message: `写入 ${result.segments.length} 个片段...` } })
      const fileFormat = formatToFileFormat(file.name)
      // docx / pdf 保留原始二进制，供「原格式预览」使用（Browser File 本身即 Blob，可直接存入 IndexedDB）
      const shouldKeepRaw = fileFormat === 'docx' || fileFormat === 'pdf'
      const fileId = await get().addFile({
        projectId,
        name: file.name,
        format: fileFormat,
        ...(shouldKeepRaw ? { rawBlob: file } : {}),
      })

      const segments = parseResultToSegments(result, fileId)
      await db.segments.bulkAdd(segments)

      await get().selectFile(fileId)
      const warningText = result.meta.warnings.length
        ? `（${result.meta.warnings.length} 个警告）`
        : ''
      set({
        importProgress: {
          stage: 'done',
          message: `导入成功：${segments.length} 段${warningText}`,
        },
      })
      return fileId
    } catch (err) {
      set({
        importProgress: { stage: 'error', message: `导入失败：${(err as Error).message}` },
      })
      return null
    }
  },

  importClipboardText: async (text) => {
    const projectId = get().currentProjectId
    if (projectId == null) return null

    const CLIPBOARD_FILE_NAME = '剪贴板翻译'
    const result = await parseTxt(text, { granularity: 'sentence' })
    if (result.segments.length === 0) return null

    // 查找当前项目中是否已有「剪贴板翻译」文件
    const existing = get().files.find(
      (f) => f.projectId === projectId && f.name === CLIPBOARD_FILE_NAME,
    )

    const now = Date.now()

    if (existing && existing.id != null) {
      // 追加到已有文件
      const existingSegs = await db.segments.where({ fileId: existing.id as number }).toArray()
      const maxIndex = existingSegs.reduce((max, s) => Math.max(max, s.index), -1)

      const newSegs: Segment[] = result.segments.map((s, i) => ({
        fileId: existing.id!,
        index: maxIndex + 1 + i,
        source: s.source,
        target: '',
        status: 'untranslated',
        createdAt: now,
        updatedAt: now,
      }))

      const newIds = await db.segments.bulkAdd(newSegs, { allKeys: true }) as ID[]
      await get().selectFile(existing.id)
      // 重新加载 segments 并激活第一个新段
      await get().loadSegments(existing.id)
      get().selectSegment(newIds[0] ?? null)

      return { fileId: existing.id, newSegmentCount: newSegs.length, isExisting: true, firstNewSegmentId: newIds[0] ?? null }
    }

    // 创建新文件
    const fileId = await get().addFile({
      projectId,
      name: CLIPBOARD_FILE_NAME,
      format: 'txt',
    })

    const newSegs: Segment[] = result.segments.map((s, i) => ({
      fileId,
      index: i,
      source: s.source,
      target: '',
      status: 'untranslated',
      createdAt: now,
      updatedAt: now,
    }))

    const newIds = await db.segments.bulkAdd(newSegs, { allKeys: true }) as ID[]
    await get().selectFile(fileId)
    get().selectSegment(newIds[0] ?? null)

    return { fileId, newSegmentCount: newSegs.length, isExisting: false, firstNewSegmentId: newIds[0] ?? null }
  },

  moveFile: async (fileId, opts) => {
    const activeProjectId = get().currentProjectId
    if (activeProjectId == null) return

    let insertBeforeFileId: ID | undefined = opts.insertBeforeFileId
    let insertAfterFileId: ID | undefined = opts.insertAfterFileId
    // 兼容旧调用：moveFile(id, { folderId }) 只传 folderId 当作"放入"语义，默认按 before/after 计算位置
    let targetParentId = opts.folderId

    const now = Date.now()

    // 若有 before/after，先从 sibling 反推 parentId（folderId）
    if (insertBeforeFileId != null || insertAfterFileId != null) {
      const refId = (insertBeforeFileId ?? insertAfterFileId) as ID
      const refRow = get().files.find((f) => f.id === refId)
      if (refRow != null) {
        const parent = refRow.folderId ?? null
        if (targetParentId == null) targetParentId = parent
      }
    }

    // 收集同 layer 的兄弟
    const allFiles = get().files
    const siblings = allFiles.filter((f) => (f.folderId ?? null) === targetParentId && f.id !== fileId)

    let insertPosition: number
    let siblingMode: 'before' | 'after' = 'after'
    let siblingId: ID | null = null
    if (insertBeforeFileId != null) {
      siblingMode = 'before'
      siblingId = insertBeforeFileId
    } else if (insertAfterFileId != null) {
      siblingMode = 'after'
      siblingId = insertAfterFileId
    } else {
      // 纯放入 folderId：放在该 folder 尾部
      siblingMode = 'after'
      siblingId = null
    }
    const calc = calcInsertPositionAndMaybeNormalize({ siblings, mode: siblingMode, siblingId })
    insertPosition = calc.insertPosition

    await db.transaction('rw', db.files, async () => {
      if (calc.fullRewritePositions && calc.fullRewritePositions.length > 0) {
        await db.files.bulkUpdate(
          calc.fullRewritePositions.map((r) => ({
            key: r.id,
            changes: { position: r.position },
          })),
        )
      }
      await db.files.update(fileId as number, {
        folderId: targetParentId,
        position: insertPosition,
        updatedAt: now,
      })
    })

    await get().loadFiles(activeProjectId)
  },
  renameFile: async (id, name) => {
    if (!name || !name.trim()) return
    await db.files.update(id as number, { name: name.trim(), updatedAt: Date.now() })
    const activeProjectId = get().currentProjectId
    if (activeProjectId != null) {
      await get().loadFiles(activeProjectId)
    }
  },

  loadFolders: async (projectId) => {
    const rows = await db.folders.where({ projectId: projectId as number }).toArray()
    set({ folders: sortByPositionThenName(rows) })
  },

  createFolder: async (data) => {
    const now = Date.now()
    // 默认放在 parentId 同层末尾
    const all = await db.folders.where({ projectId: data.projectId as number }).toArray()
    const siblings = all.filter((f) => (f.parentId ?? null) === (data.parentId ?? null))
    const { insertPosition, fullRewritePositions } = calcInsertPositionAndMaybeNormalize({
      siblings,
      mode: 'after',
      siblingId: null,
    })

    let id!: ID
    await db.transaction('rw', db.folders, async () => {
      if (fullRewritePositions && fullRewritePositions.length > 0) {
        await db.folders.bulkUpdate(
          fullRewritePositions.map((r) => ({ key: r.id, changes: { position: r.position } })),
        )
      }
      id = (await db.folders.add({ ...data, createdAt: now, updatedAt: now, position: insertPosition })) as ID
    })

    if (get().currentProjectId === data.projectId) {
      await get().loadFolders(data.projectId)
    }
    return id
  },

  deleteFolders: async (ids, { removeFiles = true } = {}) => {
    if (ids.length === 0) return { deletedFolders: 0, deletedFiles: 0 }
    const allFolders = get().folders
    // 递归收集所有子孙 folder id（按用户给出的 ids 向下扩展，含自身）
    const folderIdSet = new Set<number>(ids.map((i) => i as number))
    let queue = [...folderIdSet]
    while (queue.length > 0) {
      const children = allFolders.filter((f) => f.parentId != null && queue.includes(f.parentId as number))
      if (children.length === 0) break
      const newlyAdded: number[] = []
      children.forEach((c) => {
        const k = c.id as number
        if (!folderIdSet.has(k)) {
          folderIdSet.add(k)
          newlyAdded.push(k)
        }
      })
      queue = newlyAdded
    }
    const folderIds = [...folderIdSet]
    let deletedFiles = 0
    await db.transaction('rw', db.folders, db.files, db.segments, async () => {
      if (removeFiles) {
        const fileKeys = await db.files.where('folderId').anyOf(folderIds).primaryKeys()
        const fks = fileKeys as number[]
        if (fks.length > 0) {
          const segKeys = await db.segments.where('fileId').anyOf(fks).primaryKeys()
          if (segKeys.length > 0) await db.segments.bulkDelete(segKeys as number[])
          await db.files.bulkDelete(fks)
          deletedFiles = fks.length
        }
      } else {
        // 不删文件 → 移到根级 folderId=null
        const fileKeys = await db.files.where('folderId').anyOf(folderIds).primaryKeys()
        const fks = fileKeys as number[]
        if (fks.length > 0) {
          await db.files.bulkUpdate(fks.map((k) => ({ key: k, changes: { folderId: null } })))
        }
      }
      await db.folders.bulkDelete(folderIds)
    })
    const activeProjectId = get().currentProjectId
    if (activeProjectId != null) {
      await Promise.all([get().loadFolders(activeProjectId), get().loadFiles(activeProjectId)])
    }
    // 清理悬空状态：若激活文件在本次删除范围内（removeFiles=true 时），重置 activeFileId/segments/activeSegmentId
    if (removeFiles) {
      const currentActiveFileId = get().activeFileId
      if (currentActiveFileId != null) {
        const stillExists = get().files.some((f) => f.id === currentActiveFileId)
        if (!stillExists) {
          await get().selectFile(null)
        }
      }
    }
    return { deletedFolders: folderIds.length, deletedFiles }
  },
  deleteFiles: async (ids) => {
    if (ids.length === 0) return 0
    const nums = ids.map((i) => i as number)
    await db.transaction('rw', db.files, db.segments, async () => {
      const segKeys = await db.segments.where('fileId').anyOf(nums).primaryKeys()
      if (segKeys.length > 0) await db.segments.bulkDelete(segKeys as number[])
      await db.files.bulkDelete(nums)
    })
    const activeProjectId = get().currentProjectId
    // 删除后把选中集合中已不存在的 id 清理掉（避免"幽灵勾选"）
    const deletedSet = new Set(ids)
    const remaining = new Set<ID>()
    for (const id of get().selectedFileIds) if (!deletedSet.has(id)) remaining.add(id)
    set({ selectedFileIds: remaining })
    if (activeProjectId != null) {
      await get().loadFiles(activeProjectId)
    }
    // 清理悬空状态：若激活文件已被删除，重置 activeFileId/segments/activeSegmentId，避免组件读取失效数据导致无限循环
    const currentActiveFileId = get().activeFileId
    if (currentActiveFileId != null && deletedSet.has(currentActiveFileId)) {
      await get().selectFile(null)
    }
    return nums.length
  },

  setSelectedFileIds: (ids) => {
    const next = ids instanceof Set ? ids : new Set<ID>(ids)
    set({ selectedFileIds: next })
  },

  toggleFileSelected: (fileId, opts) => {
    set((s) => {
      const next = new Set(s.selectedFileIds)
      const forceState = opts?.forceState
      const shouldHave = forceState != null ? forceState : !next.has(fileId)
      if (shouldHave) next.add(fileId); else next.delete(fileId)
      return { selectedFileIds: next }
    })
  },

  setFolderDescendantsSelected: (_folderId, fileIds, selected) => {
    set((s) => {
      const next = new Set(s.selectedFileIds)
      for (const id of fileIds) {
        if (selected) next.add(id); else next.delete(id)
      }
      return { selectedFileIds: next }
    })
  },

  renameFolder: async (id, name) => {
    await db.folders.update(id as number, { name, updatedAt: Date.now() })
    const activeProjectId = get().currentProjectId
    if (activeProjectId != null) {
      await get().loadFolders(activeProjectId)
    }
  },

  moveFolder: async (id, opts) => {
    const activeProjectId = get().currentProjectId
    if (activeProjectId == null) return

    const allFolders = get().folders

    let insertBeforeFolderId: ID | undefined = opts.insertBeforeFolderId
    let insertAfterFolderId: ID | undefined = opts.insertAfterFolderId
    let targetParentId = opts.parentId

    // before/after 反推 parentId
    if (insertBeforeFolderId != null || insertAfterFolderId != null) {
      const refId = (insertBeforeFolderId ?? insertAfterFolderId) as ID
      const refRow = allFolders.find((f) => f.id === refId)
      if (refRow != null && targetParentId == null) {
        targetParentId = refRow.parentId ?? null
      }
    }

    // 防止把文件夹移动到自己的子孙下（造成环）
    if (targetParentId != null) {
      let cursor: ID | null = targetParentId
      const guard = new Set<ID>()
      while (cursor != null) {
        if (cursor === id) throw new Error('CIRCULAR_PARENT')
        if (guard.has(cursor)) break
        guard.add(cursor)
        const node = allFolders.find((f) => f.id === cursor)
        cursor = node?.parentId ?? null
      }
    }
    // 禁止拖自己
    if (insertBeforeFolderId === id || insertAfterFolderId === id) throw new Error('DRAG_TO_SELF')

    // 收集同父级兄弟（排除自己）
    const siblings = allFolders.filter(
      (f) => (f.parentId ?? null) === targetParentId && f.id !== id,
    )

    let siblingMode: 'before' | 'after' = 'after'
    let siblingId: ID | null = null
    if (insertBeforeFolderId != null) {
      siblingMode = 'before'
      siblingId = insertBeforeFolderId
    } else if (insertAfterFolderId != null) {
      siblingMode = 'after'
      siblingId = insertAfterFolderId
    } else {
      siblingMode = 'after'
      siblingId = null
    }
    const calc = calcInsertPositionAndMaybeNormalize({ siblings, mode: siblingMode, siblingId })

    const now = Date.now()
    await db.transaction('rw', db.folders, async () => {
      if (calc.fullRewritePositions && calc.fullRewritePositions.length > 0) {
        await db.folders.bulkUpdate(
          calc.fullRewritePositions.map((r) => ({
            key: r.id,
            changes: { position: r.position },
          })),
        )
      }
      await db.folders.update(id as number, {
        parentId: targetParentId,
        position: calc.insertPosition,
        updatedAt: now,
      })
    })

    await get().loadFolders(activeProjectId)
  },

  loadSegments: async (fileId) => {
    const rows = await db.segments.where({ fileId: fileId as number }).sortBy('index')
    set({ segments: rows })
  },

  updateSegment: async (id, patch) => {
    // 先同步更新内存状态，确保后续读取（如 effect 中的 getState()）能拿到最新值
    // 否则 async 的 db 写入会导致 transitionTo 中 selectSegment 先于 set() 执行，
    // 造成 effect 读到旧 status/target，误将已译段回退为未译
    const now = Date.now()
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === id ? { ...seg, ...patch, updatedAt: now } : seg,
      ),
    }))
    // 再异步写入 IndexedDB（失败时仅记日志，不影响内存状态）
    try {
      await db.segments.update(id as number, { ...patch, updatedAt: now })
    } catch (e) {
      console.error('[updateSegment] DB write failed:', e)
    }
    // 自动写入翻译记忆库：段 source/target 都非空时，写入 db.tmEntries（唯一索引自动去重）
    try {
      const s = get()
      const seg = s.segments.find((x) => x.id === id)
      if (!seg) return
      const src = (patch.source ?? seg.source ?? '').trim()
      const tgt = (patch.target ?? seg.target ?? '').trim()
      if (!src || !tgt) return
      const project = s.projects.find((p) => p.id === s.currentProjectId)
      const file = s.files.find((f) => f.id === seg.fileId)
      const sl = project?.sourceLang ?? 'en'
      const tl = project?.targetLang ?? 'zh-CN'
      // 先查复合唯一索引是否存在
      const existing = await db.tmEntries
        .where('[source+target+sourceLang+targetLang]')
        .equals([src, tgt, sl, tl])
        .first()
      if (existing) {
        // 存在则刷新 updatedAt / meta / projectId 等
        await db.tmEntries.update(existing.id as number, {
          updatedAt: now,
          meta: file?.name ? { sourceFile: file.name } : existing.meta,
          projectId: existing.projectId ?? s.currentProjectId ?? undefined,
          usageCount: (existing.usageCount ?? 0) + 1,
          lastUsedAt: now,
        })
      } else {
        // 不存在则新增
        await db.tmEntries.add({
          source: src,
          target: tgt,
          sourceLang: sl,
          targetLang: tl,
          projectId: s.currentProjectId ?? undefined,
          meta: file?.name ? { sourceFile: file.name } : undefined,
          createdAt: (seg as any).createdAt ?? now,
          updatedAt: now,
          usageCount: 1,
          lastUsedAt: now,
        })
      }
    } catch {
      // 单个段写入失败不影响主流程
    }
  },

  mergeSegmentWithNext: async (id) => {
    const s = get()
    const seg = s.segments.find((x) => x.id === id)
    if (!seg) return
    const fileSegs = s.segments
      .filter((x) => x.fileId === seg.fileId)
      .sort((a, b) => a.index - b.index)
    const curIdx = fileSegs.findIndex((x) => x.id === id)
    if (curIdx === -1 || curIdx >= fileSegs.length - 1) return
    const nextSeg = fileSegs[curIdx + 1]
    const now = Date.now()
    // 合并原文/译文（换行分隔保留结构）
    const mergedSource = [seg.source, nextSeg.source].filter(Boolean).join('\n')
    const mergedTarget = [seg.target, nextSeg.target].filter(Boolean).join('\n')
    // DB 操作（try-catch，兼容 mock 数据未入库的情况）
    try {
      await db.segments.delete(nextSeg.id as number)
      await db.segments.update(id as number, {
        source: mergedSource, target: mergedTarget, updatedAt: now,
      })
    } catch { /* mock 数据可能不在 DB */ }
    // 直接更新 store（不依赖 loadSegments，兼容 mock 数据）
    const remaining = fileSegs.filter((x) => x.id !== nextSeg.id)
    // 重排 index
    const reindexed = remaining.map((x, i) => ({ ...x, index: i }))
    try {
      for (const r of reindexed) {
        if (r.id !== id) {
          await db.segments.update(r.id as number, { index: r.index })
        }
      }
    } catch { /* ignore */ }
    // 合并后的段
    const mergedSeg = reindexed.find((x) => x.id === id)!
    mergedSeg.source = mergedSource
    mergedSeg.target = mergedTarget
    mergedSeg.updatedAt = now
    // 更新 store：替换同文件的所有段
    set((st) => ({
      segments: [
        ...st.segments.filter((x) => x.fileId !== seg.fileId),
        ...reindexed,
      ],
    }))
    // 自动写入翻译记忆
    try {
      const src = mergedSource.trim()
      const tgt = mergedTarget.trim()
      if (src && tgt) {
        const project = s.projects.find((p) => p.id === s.currentProjectId)
        const sl = project?.sourceLang ?? 'en'
        const tl = project?.targetLang ?? 'zh-CN'
        const existing = await db.tmEntries
          .where('[source+target+sourceLang+targetLang]')
          .equals([src, tgt, sl, tl])
          .first()
        if (existing) {
          await db.tmEntries.update(existing.id as number, {
            updatedAt: now, usageCount: (existing.usageCount ?? 0) + 1, lastUsedAt: now,
          })
        } else {
          await db.tmEntries.add({
            source: src, target: tgt, sourceLang: sl, targetLang: tl,
            projectId: s.currentProjectId ?? undefined,
            createdAt: now, updatedAt: now, usageCount: 1, lastUsedAt: now,
          })
        }
      }
    } catch { /* ignore */ }
  },

  splitSegment: async (id, splitPos) => {
    const s = get()
    const seg = s.segments.find((x) => x.id === id)
    if (!seg) return
    const src1 = seg.source.slice(0, splitPos)
    const src2 = seg.source.slice(splitPos)
    if (!src1.trim() || !src2.trim()) return
    const now = Date.now()
    // 新段的 id（用负数避免与 DB 自增冲突，mock 数据 id 也是负数）
    const newId = -(Date.now())
    // DB 操作（try-catch，兼容 mock 数据未入库的情况）
    try {
      await db.segments.update(id as number, {
        source: src1, updatedAt: now,
      })
      await db.segments.add({
        fileId: seg.fileId,
        index: seg.index + 0.5,
        source: src2,
        target: '',
        status: 'draft',
        notes: seg.notes,
        createdAt: now,
        updatedAt: now,
      } as Segment)
    } catch { /* mock 数据可能不在 DB */ }
    // 直接更新 store（不依赖 loadSegments）
    const updatedSeg: Segment = { ...seg, source: src1, updatedAt: now }
    const newSeg: Segment = {
      ...seg,
      id: newId,
      index: seg.index + 0.5,
      source: src2,
      target: '',
      status: 'draft',
      notes: seg.notes,
      createdAt: now,
      updatedAt: now,
    }
    // 构建同文件的新段列表并重排 index
    const otherFileSegs = s.segments.filter((x) => x.fileId !== seg.fileId)
    const fileSegs = [...s.segments.filter((x) => x.fileId === seg.fileId && x.id !== id), updatedSeg, newSeg]
      .sort((a, b) => a.index - b.index)
    const reindexed = fileSegs.map((x, i) => ({ ...x, index: i }))
    try {
      for (const r of reindexed) {
        if (r.id !== id && r.id !== newId) {
          await db.segments.update(r.id as number, { index: r.index })
        }
      }
    } catch { /* ignore */ }
    // 更新 store：保留其他文件的段，替换当前文件的段
    set((st) => ({
      segments: [...otherFileSegs, ...reindexed],
    }))
  },

  selectSegment: (segmentId) => set({ activeSegmentId: segmentId }),
}))
