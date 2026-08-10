import { useCallback, useMemo, useState, useRef } from 'react'
import type { ChangeEvent } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
  Divider,
  Button,
  IconButton,
  Tooltip,
  Checkbox,
  Select,
  MenuItem,
  Menu,
  ListItemIcon,
  ListItemText,
  FormControl,
  InputLabel,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  alpha,
} from '@mui/material'
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FolderIcon from '@mui/icons-material/Folder'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import DescriptionIcon from '@mui/icons-material/Description'
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import MemoryIcon from '@mui/icons-material/Memory'
import type { ReactElement, DragEvent, MouseEvent } from 'react'
import { useProjectStore, useUIStore, useLayoutStore, useTermStore, useTMStore } from '@app/store'
import { sortByPositionThenName } from '@app/store/project'
import type { Folder, ID } from '@/types'
import { ImportFileDialog } from '@/features/project/components/ImportFileDialog'
import { CreateProjectDialog } from '@/features/project/components/CreateProjectDialog'

// Tree item id 前缀，区分 folder 和 file，避免 id 冲突
const FOLDER_PREFIX = 'folder-'
const FILE_PREFIX = 'file-'

function isFolderId(itemId: string): boolean {
  return itemId.startsWith(FOLDER_PREFIX)
}
function isFileId(itemId: string): boolean {
  return itemId.startsWith(FILE_PREFIX)
}
function parseFolderId(itemId: string): number {
  return Number(itemId.slice(FOLDER_PREFIX.length))
}
function parseFileId(itemId: string): number {
  return Number(itemId.slice(FILE_PREFIX.length))
}

type DropMode = 'before' | 'after' | 'inside'
interface DropIndicator {
  mode: DropMode
  /** 'folder-xxx' | 'file-xxx'；inside folder 时为 null */
  siblingItemId: string | null
}

/** 把一个条目的高度切成三段：上 35% before，中 30% inside（仅 folder），下 35% after */
function partitionDragVertical(clientY: number, box: DOMRect, isFolder: boolean): DropMode {
  const h = box.height
  const rel = clientY - box.top
  if (rel <= h * 0.35) return 'before'
  if (rel >= h * 0.65) return 'after'
  return isFolder ? 'inside' : 'after'
}

interface TreeNodeProps {
  folders: Folder[]
  files: { id?: ID; name: string; folderId?: ID | null; format?: string }[]
  parentId: ID | null
  activeFileId: ID | null
  expandedIds: string[]
  onSelectFile: (fileId: ID) => void
  onDropItem: (args: {
    draggedItemId: string
    mode: DropMode
    siblingItemId: string | null
    targetFolderId: ID | null
  }) => void
  renamingId: string | null
  setRenamingId: (id: string | null) => void
  renameName: string
  setRenameName: (s: string) => void
  onCommitRename: (itemId: string, newName: string) => void
  draggingItemId: string | null
  setDraggingItemId: (id: string | null) => void
  indicator: DropIndicator | null
  setIndicator: (ind: DropIndicator | null) => void
  hoverFolderId: ID | null
  setHoverFolderId: (id: ID | null) => void
  // 多选
  selectedFileIds: Set<ID>
  isFolderChecked: (folderId: ID) => boolean
  isFolderIndeterminate: (folderId: ID) => boolean
  onToggleFile: (fileId: ID) => void
  onToggleFolder: (folderId: ID) => void
}

function renderTreeNodes(p: TreeNodeProps): ReactElement[] {
  const {
    folders, files, parentId, activeFileId, expandedIds,
    onSelectFile, onDropItem,
    renamingId, setRenamingId, renameName, setRenameName, onCommitRename,
    draggingItemId, setDraggingItemId, indicator, setIndicator,
    hoverFolderId, setHoverFolderId,
    selectedFileIds, isFolderChecked, isFolderIndeterminate,
    onToggleFile, onToggleFolder,
  } = p

  const rowSx = {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 0.5,
    cursor: 'pointer' as const,
    py: 0.25,
    px: 0.25,
    borderRadius: 0.5,
    transition: 'background-color 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
    width: '100%',
    minWidth: 0,
  }
  const lineSxBase = {
    position: 'absolute' as const,
    left: -16, right: -8, height: 3, borderRadius: 1.5,
    zIndex: 20, pointerEvents: 'none' as const,
  }

  const nodes: ReactElement[] = []
  const childFolders = sortByPositionThenName(
    folders.filter((f) => (f.parentId ?? null) === parentId),
  )
  const childFiles = sortByPositionThenName(
    files.filter((f) => (f.folderId ?? null) === parentId),
  )

  // Folder
  childFolders.forEach((folder) => {
    const itemId = `${FOLDER_PREFIX}${folder.id}`
    const fid = folder.id as ID
    const hasChildren =
      folders.some((f) => (f.parentId ?? null) === fid) ||
      files.some((f) => (f.folderId ?? null) === fid)
    const isExpanded = expandedIds.includes(itemId)
    const isRenaming = renamingId === itemId
    const isDragging = draggingItemId === itemId
    const isIndicatorHere = indicator != null && indicator.siblingItemId === itemId
    const beforeBar = isIndicatorHere && indicator!.mode === 'before'
    const afterBar = isIndicatorHere && indicator!.mode === 'after'
    const isInsideTarget =
      indicator != null && indicator.mode === 'inside' &&
      indicator.siblingItemId === null && hoverFolderId === fid

    const folderChecked = isFolderChecked(fid)
    const folderIndeterminate = !folderChecked && isFolderIndeterminate(fid)

    nodes.push(
      <TreeItem key={itemId} itemId={itemId}
        label={
          <Box sx={{ position: 'relative', width: '100%' }} data-cat-tree-label="folder">
            {beforeBar && (
              <Box sx={(t) => ({
                ...lineSxBase, top: -2,
                bgcolor: t.palette.primary.main,
                boxShadow: `0 0 0 1px ${alpha(t.palette.primary.main, 0.35)}`,
              })} />
            )}
            <Box
              className={`cat-tree-label${isInsideTarget ? ' cat-tree-drag-over-inside' : ''}`}
              draggable={!isRenaming}
              onDragStart={(ev) => {
                if (isRenaming) return
                ev.stopPropagation()
                ev.dataTransfer.setData('text/cat-tree-item', itemId)
                ev.dataTransfer.effectAllowed = 'move'
                setDraggingItemId(itemId)
              }}
              onDragEnd={(e) => {
                e.stopPropagation(); setDraggingItemId(null); setIndicator(null); setHoverFolderId(null)
              }}
              onDragOver={(ev) => {
                ev.preventDefault(); ev.stopPropagation()
                if (draggingItemId == null || draggingItemId === itemId) {
                  ev.dataTransfer.dropEffect = 'none'; return
                }
                const box = ev.currentTarget.getBoundingClientRect()
                const mode = partitionDragVertical(ev.clientY, box, true)
                if (mode === 'inside') {
                  setIndicator({ mode: 'inside', siblingItemId: null })
                  setHoverFolderId(fid)
                } else {
                  setIndicator({ mode, siblingItemId: itemId })
                  setHoverFolderId(null)
                }
                ev.dataTransfer.dropEffect = 'move'
              }}
              onDragLeave={(e) => {
                e.stopPropagation()
                const related = e.relatedTarget as Node | null
                if (related == null || !e.currentTarget.contains(related)) {
                  if (indicator != null && (
                    (indicator.mode !== 'inside' && indicator.siblingItemId === itemId) ||
                    (indicator.mode === 'inside' && hoverFolderId === fid)
                  )) setIndicator(null)
                  if (hoverFolderId === fid) setHoverFolderId(null)
                }
              }}
              onDrop={(ev) => {
                ev.preventDefault(); ev.stopPropagation()
                const draggedId = ev.dataTransfer.getData('text/cat-tree-item')
                let mode: DropMode = 'inside'
                if (draggedId && draggedId !== itemId) {
                  mode = partitionDragVertical(ev.clientY, ev.currentTarget.getBoundingClientRect(), true)
                }
                setDraggingItemId(null); setIndicator(null); setHoverFolderId(null)
                if (draggedId && draggedId !== itemId) {
                  if (mode === 'inside') {
                    onDropItem({ draggedItemId: draggedId, mode, siblingItemId: null, targetFolderId: fid })
                  } else {
                    onDropItem({ draggedItemId: draggedId, mode, siblingItemId: itemId, targetFolderId: parentId })
                  }
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenameName(folder.name); setRenamingId(itemId)
                window.setTimeout(() => {
                  const el = document.querySelector<HTMLInputElement>(`.cat-tree-rename[data-item-id="${itemId}"]`)
                  el?.focus(); el?.select()
                }, 0)
              }}
              sx={{
                ...rowSx,
                opacity: isDragging ? 0.35 : 1,
                '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.08) },
              }}
            >
              <Checkbox
                size="small"
                checked={folderChecked}
                indeterminate={folderIndeterminate}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  onToggleFolder(fid)
                }}
                sx={{ p: 0.25 }}
              />
              {isInsideTarget || (hoverFolderId === fid && draggingItemId != null)
                ? <FolderOpenIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
                : hasChildren && isExpanded
                  ? <FolderOpenIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
                  : <FolderIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
              }
              {isRenaming ? (
                <TextField
                  size="small" hiddenLabel className="cat-tree-rename" data-item-id={itemId}
                  value={renameName} autoFocus
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onCommitRename(itemId, renameName) }
                    else if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => onCommitRename(itemId, renameName)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-input': { py: 0.25, fontSize: '0.875rem' } }}
                />
              ) : (
                <Typography variant="body2" component="span" noWrap sx={{ minWidth: 0 }}>{folder.name}</Typography>
              )}
            </Box>
            {afterBar && (
              <Box sx={(t) => ({
                ...lineSxBase, bottom: -2,
                bgcolor: t.palette.primary.main,
                boxShadow: `0 0 0 1px ${alpha(t.palette.primary.main, 0.35)}`,
              })} />
            )}
          </Box>
        }
      >
        {hasChildren ? renderTreeNodes({ ...p, parentId: fid }) : null}
      </TreeItem>,
    )
  })

  // File
  childFiles.forEach((file) => {
    const itemId = `${FILE_PREFIX}${file.id}`
    const fid = file.id as ID
    const isRenaming = renamingId === itemId
    const isDragging = draggingItemId === itemId
    const isIndicatorHere = indicator != null && indicator.siblingItemId === itemId
    const beforeBar = isIndicatorHere && indicator!.mode === 'before'
    const afterBar = isIndicatorHere && indicator!.mode === 'after'
    const checked = selectedFileIds.has(fid)

    nodes.push(
      <TreeItem key={itemId} itemId={itemId}
        label={
          <Box sx={{ position: 'relative', width: '100%' }} data-cat-tree-label="file">
            {beforeBar && (
              <Box sx={(t) => ({
                ...lineSxBase, top: -2,
                bgcolor: t.palette.primary.main,
                boxShadow: `0 0 0 1px ${alpha(t.palette.primary.main, 0.35)}`,
              })} />
            )}
            <Box
              draggable={!isRenaming}
              onDragStart={(ev) => {
                if (isRenaming) return
                ev.stopPropagation()
                ev.dataTransfer.setData('text/cat-tree-item', itemId)
                ev.dataTransfer.effectAllowed = 'move'
                setDraggingItemId(itemId)
              }}
              onDragEnd={(e) => { e.stopPropagation(); setDraggingItemId(null); setIndicator(null); setHoverFolderId(null) }}
              onDragOver={(ev) => {
                ev.preventDefault(); ev.stopPropagation()
                if (draggingItemId == null || draggingItemId === itemId) {
                  ev.dataTransfer.dropEffect = 'none'; return
                }
                const mode = partitionDragVertical(ev.clientY, ev.currentTarget.getBoundingClientRect(), false)
                setIndicator({ mode, siblingItemId: itemId })
                setHoverFolderId(null)
                ev.dataTransfer.dropEffect = 'move'
              }}
              onDragLeave={(e) => {
                e.stopPropagation()
                const related = e.relatedTarget as Node | null
                if ((related == null || !e.currentTarget.contains(related)) && isIndicatorHere) {
                  setIndicator(null)
                }
              }}
              onDrop={(ev) => {
                ev.preventDefault(); ev.stopPropagation()
                const draggedId = ev.dataTransfer.getData('text/cat-tree-item')
                setDraggingItemId(null); setIndicator(null); setHoverFolderId(null)
                if (draggedId && draggedId !== itemId) {
                  const mode = partitionDragVertical(ev.clientY, ev.currentTarget.getBoundingClientRect(), false)
                  onDropItem({ draggedItemId: draggedId, mode, siblingItemId: itemId, targetFolderId: parentId })
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenameName(file.name); setRenamingId(itemId)
                window.setTimeout(() => {
                  const el = document.querySelector<HTMLInputElement>(`.cat-tree-rename[data-item-id="${itemId}"]`)
                  el?.focus(); el?.select()
                }, 0)
              }}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                onSelectFile(fid)
              }}
              sx={{
                ...rowSx,
                opacity: isDragging ? 0.35 : 1,
                bgcolor: activeFileId === fid
                  ? (t) => alpha(t.palette.primary.main, 0.12)
                  : 'transparent',
                '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
              }}
            >
              <Checkbox
                size="small"
                checked={checked}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  onToggleFile(fid)
                }}
                sx={{ p: 0.25 }}
              />
              <DescriptionIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
              {isRenaming ? (
                <TextField
                  size="small" hiddenLabel className="cat-tree-rename" data-item-id={itemId}
                  value={renameName} autoFocus
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onCommitRename(itemId, renameName) }
                    else if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => onCommitRename(itemId, renameName)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  sx={{ flex: 1, minWidth: 0, '& .MuiInputBase-input': { py: 0.25, fontSize: '0.875rem' } }}
                />
              ) : (
                <Typography variant="body2" component="span" noWrap sx={{ minWidth: 0 }}>{file.name}</Typography>
              )}
            </Box>
            {afterBar && (
              <Box sx={(t) => ({
                ...lineSxBase, bottom: -2,
                bgcolor: t.palette.primary.main,
                boxShadow: `0 0 0 1px ${alpha(t.palette.primary.main, 0.35)}`,
              })} />
            )}
          </Box>
        }
      />,
    )
  })

  return nodes
}

export function ProjectPanel(): ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const files = useProjectStore((s) => s.files)
  const folders = useProjectStore((s) => s.folders)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const activeFileId = useProjectStore((s) => s.activeFileId)
  const segments = useProjectStore((s) => s.segments)
  const selectProject = useProjectStore((s) => s.selectProject)
  const selectFile = useProjectStore((s) => s.selectFile)
  const createProject = useProjectStore((s) => s.createProject)
  const createFolder = useProjectStore((s) => s.createFolder)
  const renameFolder = useProjectStore((s) => s.renameFolder)
  const addFile = useProjectStore((s) => s.addFile)
  const renameFile = useProjectStore((s) => s.renameFile)
  const moveFile = useProjectStore((s) => s.moveFile)
  const moveFolder = useProjectStore((s) => s.moveFolder)
  const deleteFolders = useProjectStore((s) => s.deleteFolders)
  const deleteFiles = useProjectStore((s) => s.deleteFiles)
  // 多选选中（文件/目录）：改由 store 集中管理，确保导出对话框等其它模块可读取
  const selectedFileIds = useProjectStore((s) => s.selectedFileIds)
  const setSelectedFileIds = useProjectStore((s) => s.setSelectedFileIds)
  const toggleFileSelected = useProjectStore((s) => s.toggleFileSelected)
  const setFolderDescendantsSelected = useProjectStore((s) => s.setFolderDescendantsSelected)
  const notify = useUIStore((s) => s.notify)
  const applyTranslateLayout = useLayoutStore((s) => s.applyTranslateLayout)
  const applyDictionaryLayout = useLayoutStore((s) => s.applyDictionaryLayout)
  const applyMemoryLayout = useLayoutStore((s) => s.applyMemoryLayout)

  const [importOpen, setImportOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [expanded, setExpanded] = useState<string[]>(['panel-files'])

  const handleL1 = useCallback(
    (panel: 'panel-files' | 'panel-tb' | 'panel-tm') =>
      async (_e: unknown, isExp: boolean) => {
        setExpanded(isExp ? [panel] : [])
        if (!isExp) return
        if (panel === 'panel-files') {
          await applyTranslateLayout()
        } else if (panel === 'panel-tb') {
          await applyDictionaryLayout()
        } else if (panel === 'panel-tm') {
          await applyMemoryLayout()
        }
      },
    [applyTranslateLayout, applyDictionaryLayout, applyMemoryLayout],
  )
  const [treeExpanded, setTreeExpanded] = useState<string[]>([])

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [hoverFolderId, setHoverFolderId] = useState<ID | null>(null)
  const [hoverRoot, setHoverRoot] = useState(false)
  const [indicator, setIndicator] = useState<DropIndicator | null>(null)

  /** 额外记录用户点过"勾选"的 folder（用于删除分类的识别） */
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<ID>>(new Set())

  // -------- 工具：收集目录后代 ids --------
  const collectDescendantFolderIds = useCallback(
    (rootId: ID): ID[] => {
      const out: ID[] = [rootId]
      let q: ID[] = [rootId]
      while (q.length > 0) {
        const cs = folders.filter((f) => (f.parentId ?? null) != null && q.includes(f.parentId as ID))
        if (cs.length === 0) break
        const newly: ID[] = []
        cs.forEach((c) => {
          const k = c.id as ID
          if (!out.includes(k)) { out.push(k); newly.push(k) }
        })
        q = newly
      }
      return out
    },
    [folders],
  )
  const collectDescendantFileIds = useCallback(
    (folderId: ID): ID[] => {
      const subIds = collectDescendantFolderIds(folderId)
      return files.filter((f) => {
        const p = (f.folderId ?? null) as ID | null
        return p != null && subIds.includes(p)
      }).map((f) => f.id as ID)
    },
    [files, collectDescendantFolderIds],
  )
  const descendantFilesOfFolder = useCallback(
    (folderId: ID): ID[] => collectDescendantFileIds(folderId),
    [collectDescendantFileIds],
  )

  // 三态派生：只由"选中的文件 ids"决定
  const isFolderChecked = useCallback(
    (folderId: ID) => descendantFilesOfFolder(folderId).some((id) => selectedFileIds.has(id)),
    [descendantFilesOfFolder, selectedFileIds],
  )
  const isFolderIndeterminate = useCallback(
    (folderId: ID) => {
      const ds = descendantFilesOfFolder(folderId)
      if (ds.length === 0) return false
      let sel = 0
      for (const id of ds) if (selectedFileIds.has(id)) sel++
      return sel > 0 && sel < ds.length
    },
    [descendantFilesOfFolder, selectedFileIds],
  )

  // -------- 多选：勾选文件/目录（改由 store 集中管理，供导出等其它模块读取） --------
  const toggleFile = useCallback((fileId: ID) => {
    toggleFileSelected(fileId)
  }, [toggleFileSelected])
  const toggleFolderDescendants = useCallback(
    (folderId: ID) => {
      const ds = descendantFilesOfFolder(folderId)
      const anySelected = ds.some((id) => selectedFileIds.has(id))
      // 先切换文件选中（由 store 统一写）
      setFolderDescendantsSelected(folderId, ds, !anySelected)
      setSelectedFolderIds((prev) => {
        const next = new Set(prev)
        if (anySelected) collectDescendantFolderIds(folderId).forEach((id) => next.delete(id))
        else collectDescendantFolderIds(folderId).forEach((id) => next.add(id))
        return next
      })
    },
    [descendantFilesOfFolder, selectedFileIds, collectDescendantFolderIds, setFolderDescendantsSelected],
  )

  // -------- 项目 / 分类 --------
  const handleCreateProject = () => {
    setCreateProjectOpen(true)
  }

  const handleCreateFolder = async () => {
    if (currentProjectId == null) {
      notify('warning', '请先选择项目后再新建分类')
      return
    }
    const initialName = '新建分类'
    const id = await createFolder({ projectId: currentProjectId, parentId: null, name: initialName })
    setRenameName(initialName)
    setRenamingId(`${FOLDER_PREFIX}${id}`)
    setTreeExpanded((prev) => Array.from(new Set([...prev, `${FOLDER_PREFIX}${id}`])))
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`.cat-tree-rename[data-item-id="${FOLDER_PREFIX}${id}"]`)
      el?.focus(); el?.select()
    }, 0)
  }

  // 重命名提交：空名/同名则取消
  const handleCommitRename = useCallback(
    async (itemId: string, newName: string) => {
      setRenamingId(null)
      const name = newName.trim()
      if (!name) return
      if (isFolderId(itemId)) {
        const id = parseFolderId(itemId)
        const f = folders.find((x) => x.id === id)
        if (f == null) return
        const parentId = (f.parentId ?? null) as ID | null
        const dup = folders.some(
          (x) => x.id !== id && (x.parentId ?? null) === parentId && x.name === name,
        )
        if (dup) { notify('warning', '同级已有同名分类'); return }
        await renameFolder(id, name)
      } else if (isFileId(itemId)) {
        const id = parseFileId(itemId)
        const f = files.find((x) => x.id === id)
        if (f == null) return
        const parentId = (f.folderId ?? null) as ID | null
        const dup = files.some(
          (x) => x.id !== id && (x.folderId ?? null) === parentId && x.name === name,
        )
        if (dup) { notify('warning', '同级已有同名文件'); return }
        await renameFile(id, name)
      }
    },
    [folders, files, renameFolder, renameFile, notify],
  )

  const isDescendantOrSelf = useCallback(
    (folderId: ID, targetFolderId: ID | null): boolean => {
      if (targetFolderId == null) return false
      if (folderId === targetFolderId) return true
      let cur = folders.find((f) => f.id === targetFolderId) || null
      while (cur != null) {
        if (cur.id === folderId) return true
        const p = cur.parentId
        if (p == null) return false
        cur = folders.find((f) => f.id === p) || null
      }
      return false
    },
    [folders],
  )

  const handleDropItem = useCallback(
    async (args: {
      draggedItemId: string
      mode: DropMode
      siblingItemId: string | null
      targetFolderId: ID | null
    }) => {
      const { draggedItemId, mode, siblingItemId, targetFolderId } = args
      try {
        if (isFolderId(draggedItemId)) {
          const folderId = parseFolderId(draggedItemId)
          let parentIdArg: ID | null = targetFolderId
          let insertBeforeFolderId: ID | undefined
          let insertAfterFolderId: ID | undefined
          if (mode === 'inside') {
            if (siblingItemId != null) return
            parentIdArg = targetFolderId
          } else {
            if (siblingItemId == null) return
            if (isFolderId(siblingItemId)) {
              if (mode === 'before') insertBeforeFolderId = parseFolderId(siblingItemId)
              else insertAfterFolderId = parseFolderId(siblingItemId)
            }
          }
          if (
            (insertBeforeFolderId != null && insertBeforeFolderId === folderId) ||
            (insertAfterFolderId != null && insertAfterFolderId === folderId) ||
            (mode === 'inside' && targetFolderId === folderId)
          ) {
            notify('warning', '不能把分类拖到它自己头上'); return
          }
          if (mode === 'inside' && isDescendantOrSelf(folderId, targetFolderId)) {
            notify('warning', '不能把分类拖进它的子分类，否则会形成循环父子关系'); return
          }
          if (mode !== 'inside' && parentIdArg === folderId) {
            notify('warning', '不能把分类拖到它自己头上'); return
          }
          await moveFolder(folderId, { parentId: parentIdArg, insertBeforeFolderId, insertAfterFolderId })
          return
        }
        if (isFileId(draggedItemId)) {
          const fileId = parseFileId(draggedItemId)
          const parentIdArg: ID | null = targetFolderId
          let insertBeforeFileId: ID | undefined
          let insertAfterFileId: ID | undefined
          if (mode !== 'inside') {
            if (siblingItemId == null) return
            if (isFileId(siblingItemId)) {
              if (mode === 'before') insertBeforeFileId = parseFileId(siblingItemId)
              else insertAfterFileId = parseFileId(siblingItemId)
            }
          }
          if (
            (insertBeforeFileId != null && insertBeforeFileId === fileId) ||
            (insertAfterFileId != null && insertAfterFileId === fileId)
          ) return
          await moveFile(fileId, { folderId: parentIdArg, insertBeforeFileId, insertAfterFileId })
          return
        }
      } catch (err) {
        const msg = (err as Error).message
        if (msg === 'CIRCULAR_PARENT') notify('warning', '不能把分类拖进它的子分类，否则会形成循环父子关系')
        else if (msg === 'DRAG_TO_SELF') notify('warning', '不能把分类拖到它自己头上')
        else notify('error', `移动失败：${(err as Error).message}`)
      }
    },
    [moveFolder, moveFile, notify, isDescendantOrSelf],
  )

  // 树根级容器的 dragOver / dragLeave / drop（拖到根级 = parent=null）
  // 空白区支持在最后一条根级条目 before/after 之间插入；无法精确定位单个根级 sibling（因为根 Box 包着所有条目），
  // 这里按"整棵树的 y 位置与首尾比较" → 开头则 before 第一个条目，末尾则 after 最后一个条目，中间就走"放入根级（inside 语义）"。
  const handleRootDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (draggingItemId == null) return
    e.preventDefault()
    // 只有当这次 event 真正落在"根 Box 的空白 padding 区"时才处理；
    // 如果鼠标实际落在子 label Box（data-cat-tree-label）上，子节点会 stopPropagation，这里不触发。
    // 做垂直分区：整棵树的 container 高度切 0-15% before 第一项，85-100% after 最后一项，中间 inside（放入根，未分类）
    const box = e.currentTarget.getBoundingClientRect()
    const rel = e.clientY - box.top
    let mode: DropMode
    const rootItemsCount = folders.filter((f) => (f.parentId ?? null) === null).length +
      files.filter((f) => (f.folderId ?? null) === null).length
    if (rootItemsCount === 0 || (rel > box.height * 0.15 && rel <= box.height * 0.85)) {
      mode = 'inside'
    } else if (rel <= box.height * 0.15) {
      mode = 'before'
    } else {
      mode = 'after'
    }
    setHoverRoot(true)
    setHoverFolderId(null)
    if (mode === 'inside') {
      setIndicator({ mode: 'inside', siblingItemId: null })
    } else {
      // 找根级 first/last sibling 的 itemId（优先 folder，再 file；因为 before/after 的视觉只画在条目上）
      const rootFolder = folders.filter((f) => (f.parentId ?? null) === null)
      const rootFile = files.filter((f) => (f.folderId ?? null) === null)
      const rootSorted = [
        ...rootFolder.map((f) => ({
          id: f.id as ID,
          prefix: FOLDER_PREFIX,
          position: f.position ?? Number.MAX_SAFE_INTEGER,
          name: f.name,
        })),
        ...rootFile.map((f) => ({
          id: f.id as ID,
          prefix: FILE_PREFIX,
          position: f.position ?? Number.MAX_SAFE_INTEGER,
          name: f.name,
        })),
      ].sort((a, b) => {
        const d = a.position - b.position
        if (d !== 0) return d
        return a.name.localeCompare(b.name, 'zh-CN')
      })
      if (rootSorted.length === 0) {
        setIndicator({ mode: 'inside', siblingItemId: null })
      } else {
        const target = mode === 'before' ? rootSorted[0] : rootSorted[rootSorted.length - 1]
        setIndicator({ mode, siblingItemId: `${target.prefix}${target.id}` })
      }
    }
    e.dataTransfer.dropEffect = 'move'
  }
  const handleRootDragLeave = (e: DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null
    if (related == null || !e.currentTarget.contains(related)) {
      setHoverRoot(false)
      if (indicator != null && indicator.siblingItemId === null) {
        setIndicator(null)
      }
    }
  }
  const handleRootDrop = (e: DragEvent<HTMLDivElement>) => {
    const draggedId = e.dataTransfer.getData('text/cat-tree-item')
    setHoverRoot(false)
    setDraggingItemId(null)
    setHoverFolderId(null)
    const snapshot = indicator
    setIndicator(null)
    if (!draggedId) return
    e.preventDefault()
    if (snapshot == null) {
      handleDropItem({
        draggedItemId: draggedId,
        mode: 'inside',
        siblingItemId: null,
        targetFolderId: null,
      })
    } else if (snapshot.mode === 'inside') {
      handleDropItem({
        draggedItemId: draggedId,
        mode: 'inside',
        siblingItemId: null,
        targetFolderId: null,
      })
    } else {
      handleDropItem({
        draggedItemId: draggedId,
        mode: snapshot.mode,
        siblingItemId: snapshot.siblingItemId,
        targetFolderId: null,
      })
    }
  }

  // SimpleTreeView 受控展开：点击 content 区域原生切换，通过回调同步 state
  const handleExpandedChange = (_: unknown, ids: unknown) => {
    setTreeExpanded(ids as string[])
  }

  // SimpleTreeView 选中项变化：点击文件时触发选文件
  const handleSelectedChange = (_: unknown, selectedId: string | null) => {
    if (selectedId && isFileId(selectedId)) {
      selectFile(parseFileId(selectedId))
    }
  }

  // -------- 选中集合派生：用于删除按钮启用 --------
  const fileIdsToDelete = useMemo(() => Array.from(selectedFileIds), [selectedFileIds])
  const folderIdsToDelete = useMemo(() => {
    // 删除 folder：直接收集所有 selectedFolderIds
    // 但是 folder 勾选状态来自"文件全选"，我们还要按"派生：folder 下所有文件都选中→算 folder 要删"
    const fromDerived = folders
      .filter((f) => {
        const ds = descendantFilesOfFolder(f.id as ID)
        if (ds.length === 0) return false
        return ds.every((id) => selectedFileIds.has(id))
      })
      .map((f) => f.id as ID)
    const merged = new Set<ID>([...Array.from(selectedFolderIds), ...fromDerived])
    // 去重子级（如果父级删，子级已经被级联包含）
    const all = Array.from(merged)
    const filtered = all.filter((id) => {
      const cur = folders.find((f) => f.id === id) || null
      if (cur == null) return true
      let p: ID | null = (cur.parentId ?? null) as ID | null
      while (p != null) {
        if (all.includes(p)) return false
        const pp = folders.find((f) => f.id === p) || null
        p = pp ? ((pp.parentId ?? null) as ID | null) : null
      }
      return true
    })
    return filtered
  }, [selectedFolderIds, descendantFilesOfFolder, folders, selectedFileIds])
  const hasSelection = fileIdsToDelete.length > 0 || folderIdsToDelete.length > 0

  // -------- 删除选中 --------
  const handleDeleteSelected = useCallback(async () => {
    if (!hasSelection) return
    const msg =
      folderIdsToDelete.length > 0
        ? `确认删除所选 ${folderIdsToDelete.length} 个分类${fileIdsToDelete.length > 0 ? `及 ${fileIdsToDelete.length} 个文件` : ''}？删除后不可恢复`
        : `确认删除所选 ${fileIdsToDelete.length} 个文件？`
    if (!window.confirm(msg)) return
    try {
      if (folderIdsToDelete.length > 0) await deleteFolders(folderIdsToDelete, {})
      if (fileIdsToDelete.length > 0) await deleteFiles(fileIdsToDelete)
      // 删除成功后再清空（deleteFiles 内部已做一次清理，这里兜底）
      setSelectedFileIds(new Set())
      setSelectedFolderIds(new Set())
      notify('success', '删除成功')
    } catch (err) {
      notify('error', `删除失败：${(err as Error).message}`)
    }
  }, [hasSelection, folderIdsToDelete, fileIdsToDelete, deleteFolders, deleteFiles, setSelectedFileIds, notify])

  // -------- 全选/取消全选（当前项目下所有文件） --------
  const toggleSelectAll = useCallback(() => {
    const allFileIds = files
      .filter((f) => currentProjectId != null && f.projectId === currentProjectId)
      .map((f) => f.id as ID)
    if (allFileIds.length === 0) return
    const allSelected = allFileIds.every((id) => selectedFileIds.has(id))
    if (allSelected) {
      setSelectedFileIds(new Set())
      setSelectedFolderIds(new Set())
    } else {
      setSelectedFileIds(new Set(allFileIds))
      setSelectedFolderIds(new Set(folders.filter((f) => currentProjectId != null && f.projectId === currentProjectId).map((f) => f.id as ID)))
    }
  }, [files, currentProjectId, selectedFileIds, folders])

  const treeNodes = useMemo(
    () =>
      renderTreeNodes({
        folders,
        files,
        parentId: null,
        activeFileId,
        expandedIds: treeExpanded,
        onSelectFile: selectFile,
        onDropItem: handleDropItem,
        renamingId,
        setRenamingId,
        renameName,
        setRenameName,
        onCommitRename: handleCommitRename,
        draggingItemId,
        setDraggingItemId,
        indicator,
        setIndicator,
        hoverFolderId,
        setHoverFolderId,
        // 多选
        selectedFileIds,
        isFolderChecked,
        isFolderIndeterminate,
        onToggleFile: toggleFile,
        onToggleFolder: toggleFolderDescendants,
      }),
    [
      folders,
      files,
      activeFileId,
      treeExpanded,
      selectFile,
      renamingId,
      renameName,
      draggingItemId,
      indicator,
      hoverFolderId,
      handleDropItem,
      handleCommitRename,
      selectedFileIds,
      isFolderChecked,
      isFolderIndeterminate,
      toggleFile,
      toggleFolderDescendants,
    ],
  )

  const handlePlaceholder = (label: string) => () => {
    notify('info', `${label}：功能待实现`)
  }

  // —— 术语库操作（与 ProjectDictionaryLibraryPanel 联动） ——
  const terms = useTermStore((s) => s.terms)
  const selectedIds = useTermStore((s) => s.selectedIds)
  const selectAll = useTermStore((s) => s.selectAll)
  const deleteTerms = useTermStore((s) => s.deleteTerms)
  const addTerm = useTermStore((s) => s.addTerm)
  // 添加术语对话框
  const [showAddTermDialog, setShowAddTermDialog] = useState(false)
  const [newTermSource, setNewTermSource] = useState('')
  const [newTermTarget, setNewTermTarget] = useState('')

  const handleAddTerm = () => {
    const s = newTermSource.trim()
    const t = newTermTarget.trim()
    if (!s || !t) {
      notify('warning', '原文和译文都不能为空')
      return
    }
    addTerm(s, t)
    notify('success', '已添加术语')
    setNewTermSource('')
    setNewTermTarget('')
    setShowAddTermDialog(false)
  }

  const handleSelectAllTerms = () => {
    const allIds = terms.map((t) => t.id)
    if (allIds.length === 0) {
      notify('info', '暂无术语')
      return
    }
    selectAll(allIds)
    notify('info', selectedIds.size === allIds.length ? '已取消全选' : '已全选')
  }

  const handleDeleteSelectedTerms = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      notify('info', '请先勾选要删除的术语')
      return
    }
    if (!window.confirm(`确认删除选中的 ${ids.length} 条术语？`)) return
    deleteTerms(ids)
    notify('success', `已删除 ${ids.length} 条术语`)
  }

  // —— 术语导入/导出 ——
  const tbImportInputRef = useRef<HTMLInputElement>(null)
  const [tbExportFormatAnchor, setTbExportFormatAnchor] = useState<HTMLElement | null>(null)
  const addTerms = useTermStore((s) => s.addTerms)

  const handleTbExport = useCallback((format: 'xlsx' | 'csv' | 'json' | 'txt') => {
    const selIds = Array.from(selectedIds)
    const list = selIds.length > 0
      ? terms.filter((t) => selIds.includes(t.id))
      : terms
    if (list.length === 0) {
      notify('warning', selIds.length > 0 ? '选中的术语为空，无法导出' : '词典库为空，无法导出')
      return
    }
    const stamp = new Date()
    const fname = `glossary_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}`
    if (format === 'xlsx') {
      // Excel 导出（xlsx 库），极简两列：原文 / 译文
      import('xlsx').then((XLSX) => {
        const aoa: any[][] = [['原文', '译文']]
        for (const t of list) aoa.push([t.source, t.target])
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        // 列宽自适应
        ws['!cols'] = [{ wch: 30 }, { wch: 40 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '术语表')
        XLSX.writeFile(wb, `${fname}.xlsx`)
        notify('success', `已导出 ${list.length} 条术语到 ${fname}.xlsx`)
      }).catch((e) => notify('error', `导出失败：${(e as Error).message}`))
      return
    }
    let content = ''
    let mime = 'text/plain;charset=utf-8'
    let ext = format
    if (format === 'csv') {
      const rows = ['source,target']
      for (const t of list) rows.push(`"${t.source.replace(/"/g, '""')}","${t.target.replace(/"/g, '""')}"`)
      content = '\uFEFF' + rows.join('\n')
      mime = 'text/csv;charset=utf-8'
    } else if (format === 'json') {
      content = JSON.stringify(list.map((t) => ({ source: t.source, target: t.target, createdAt: t.createdAt, updatedAt: t.updatedAt })), null, 2)
      mime = 'application/json;charset=utf-8'
    } else {
      content = list.map((t) => `${t.source}\t${t.target}`).join('\n')
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fname}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify('success', `已导出 ${list.length} 条术语到 ${fname}.${ext}`)
  }, [terms, selectedIds, notify])

  // 简易 CSV 行解析
  const splitCsvLineTB = (line: string): string[] => {
    const cells: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuote) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQuote = false }
        else cur += ch
      } else {
        if (ch === '"') inQuote = true
        else if (ch === ',') { cells.push(cur); cur = '' }
        else cur += ch
      }
    }
    cells.push(cur)
    return cells
  }

  const parsePairsFromText = (text: string, fname: string): Array<{ source: string; target: string }> => {
    const lower = fname.toLowerCase()
    const pairs: Array<{ source: string; target: string }> = []
    if (lower.endsWith('.json')) {
      const data = JSON.parse(text)
      if (!Array.isArray(data)) throw new Error('JSON 必须是数组')
      for (const item of data) {
        if (item && typeof item === 'object' && typeof item.source === 'string' && typeof item.target === 'string') {
          pairs.push({ source: item.source, target: item.target })
        }
      }
    } else if (lower.endsWith('.csv')) {
      const raw = text.replace(/^\uFEFF/, '')
      const lines = raw.split(/\r?\n/).filter((l) => l.trim())
      const firstCells = splitCsvLineTB(lines[0] ?? '')
      const isHeader = firstCells.length >= 2 && (firstCells[0].toLowerCase() === 'source' || firstCells[0] === '原文')
      for (let i = isHeader ? 1 : 0; i < lines.length; i++) {
        const cells = splitCsvLineTB(lines[i])
        if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) pairs.push({ source: cells[0].trim(), target: cells[1].trim() })
      }
    } else {
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      for (const line of lines) {
        let cells: string[]
        if (line.includes('\t')) cells = line.split('\t')
        else cells = line.split(/\s{2,}|—|→/)
        if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) {
          pairs.push({ source: cells[0].trim(), target: cells.slice(1).join(' ').trim() })
        }
      }
    }
    return pairs
  }

  const handleTbImportFile = useCallback((file: File) => {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          import('xlsx').then(async (XLSX) => {
            const wb = XLSX.read(reader.result, { type: 'binary' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            // 使用 header:1 读取二维数组，忽略空行
            const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
            if (aoa.length === 0) { notify('warning', 'Excel 中没有数据'); return }
            // 识别表头（第一行是否为 原文/译文 source/target）
            const first = aoa[0].map((c) => String(c ?? '').trim())
            const isHeader = first.length >= 2 && (
              first[0] === '原文' || first[0].toLowerCase() === 'source' || first[0] === '术语原文'
            )
            const pairs: Array<{ source: string; target: string }> = []
            for (let i = isHeader ? 1 : 0; i < aoa.length; i++) {
              const row = aoa[i].map((c) => String(c ?? '').trim())
              if (row.length >= 2 && row[0] && row[1]) {
                pairs.push({ source: row[0], target: row[1] })
              }
            }
            if (pairs.length === 0) { notify('warning', `Excel ${file.name} 中未解析到有效术语对`); return }
            const result = addTerms(pairs, 'skip')
            notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
          }).catch((e) => notify('error', `解析 Excel 失败：${(e as Error).message}`))
        } catch (err) { notify('error', `读取 ${file.name} 失败：${(err as Error).message}`) }
      }
      reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
      reader.readAsBinaryString(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        try {
          const pairs = parsePairsFromText(text, file.name)
          if (pairs.length === 0) { notify('warning', `文件 ${file.name} 中未解析到有效术语对`); return }
          const result = addTerms(pairs, 'skip')
          notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
        } catch (err) { notify('error', `解析失败：${(err as Error).message}`) }
      }
      reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
      reader.readAsText(file, 'utf-8')
    }
  }, [addTerms, notify])

  const onTbImportChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const f of Array.from(files)) handleTbImportFile(f)
    e.target.value = ''
  }, [handleTbImportFile])

  const tbButtons = [
    {
      key: 'tb-import',
      label: '导入词典',
      icon: <UploadFileIcon fontSize="small" />,
      onClick: () => tbImportInputRef.current?.click(),
    },
    {
      key: 'tb-export',
      label: '导出词典',
      icon: <FileDownloadIcon fontSize="small" />,
      onClick: (e: MouseEvent<HTMLElement>) => setTbExportFormatAnchor(e.currentTarget),
    },
    { key: 'tb-selectall', label: '全选条目', icon: <SelectAllIcon fontSize="small" />, onClick: handleSelectAllTerms },
    { key: 'tb-add', label: '添加词条', icon: <AddIcon fontSize="small" />, onClick: () => setShowAddTermDialog(true) },
    { key: 'tb-delete', label: '删除所选', icon: <DeleteOutlineIcon fontSize="small" />, onClick: handleDeleteSelectedTerms },
  ]

  // —— 翻译记忆库操作（与 ProjectMemoryLibraryPanel 联动） ——
  const tmEntries = useTMStore((s) => s.entries)
  const tmSelectedIds = useTMStore((s) => s.selectedIds)
  const tmSelectAll = useTMStore((s) => s.selectAll)
  const tmDeleteEntries = useTMStore((s) => s.deleteEntries)
  const tmAddEntry = useTMStore((s) => s.addEntry)
  const tmScope = useTMStore((s) => s.scope)
  // 当前项目语言对（添加条目时需要）
  const activeProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  )
  // 添加记忆对话框
  const [showAddTmDialog, setShowAddTmDialog] = useState(false)
  const [newTmSource, setNewTmSource] = useState('')
  const [newTmTarget, setNewTmTarget] = useState('')

  const handleAddTm = async () => {
    const s = newTmSource.trim()
    const t = newTmTarget.trim()
    if (!s || !t) {
      notify('warning', '原文和译文都不能为空')
      return
    }
    const added = await tmAddEntry({
      source: s,
      target: t,
      sourceLang: (activeProject?.sourceLang ?? 'en') as any,
      targetLang: (activeProject?.targetLang ?? 'zh-CN') as any,
      projectId: tmScope === 'project' ? (currentProjectId ?? undefined) : undefined,
    })
    if (added) {
      notify('success', '已添加记忆条目')
    } else {
      notify('warning', '该句对已存在（原文+译文+语言对重复）')
    }
    setNewTmSource('')
    setNewTmTarget('')
    setShowAddTmDialog(false)
  }

  const handleSelectAllTm = () => {
    const allIds = tmEntries.map((e) => e.id as number)
    if (allIds.length === 0) {
      notify('info', '暂无记忆条目')
      return
    }
    tmSelectAll(allIds)
    notify('info', tmSelectedIds.size === allIds.length ? '已取消全选' : '已全选')
  }

  const handleDeleteSelectedTm = async () => {
    const ids = Array.from(tmSelectedIds)
    if (ids.length === 0) {
      notify('info', '请先勾选要删除的记忆条目')
      return
    }
    if (!window.confirm(`确认删除选中的 ${ids.length} 条记忆？`)) return
    await tmDeleteEntries(ids)
    notify('success', `已删除 ${ids.length} 条记忆`)
  }

  // —— 记忆导入/导出/复制导入 ——
  const tmImportInputRef = useRef<HTMLInputElement>(null)
  const [tmExportAnchor, setTmExportAnchor] = useState<HTMLElement | null>(null)
  const tmAddEntries = useTMStore((s) => s.addEntries)

  const parsePairsFromPlainText = (text: string): Array<{ source: string; target: string }> => {
    const pairs: Array<{ source: string; target: string }> = []
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    for (const line of lines) {
      let cells: string[]
      if (line.includes('\t')) cells = line.split('\t')
      else if (line.includes('|')) cells = line.split('|')
      else cells = line.split(/\s{2,}|—|→/)
      if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) {
        pairs.push({ source: cells[0].trim(), target: cells.slice(1).join(' ').trim() })
      }
    }
    return pairs
  }

  const handleTbTmExport = useCallback((format: 'xlsx' | 'csv' | 'json' | 'txt') => {
    const selIds = Array.from(tmSelectedIds)
    const list = selIds.length > 0
      ? tmEntries.filter((e) => selIds.includes(e.id as number))
      : tmEntries
    if (list.length === 0) {
      notify('warning', selIds.length > 0 ? '选中的记忆为空，无法导出' : '记忆库为空，无法导出')
      return
    }
    const stamp = new Date()
    const fname = `memory_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}`
    if (format === 'xlsx') {
      import('xlsx').then((XLSX) => {
        const aoa: any[][] = [['原文', '译文']]
        for (const t of list) aoa.push([t.source, t.target])
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws['!cols'] = [{ wch: 50 }, { wch: 60 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '记忆表')
        XLSX.writeFile(wb, `${fname}.xlsx`)
        notify('success', `已导出 ${list.length} 条记忆到 ${fname}.xlsx`)
      }).catch((e) => notify('error', `导出失败：${(e as Error).message}`))
      return
    }
    let content = ''
    let mime = 'text/plain;charset=utf-8'
    let ext = format
    if (format === 'csv') {
      const rows = ['source,target']
      for (const t of list) rows.push(`"${t.source.replace(/"/g, '""')}","${t.target.replace(/"/g, '""')}"`)
      content = '\uFEFF' + rows.join('\n')
      mime = 'text/csv;charset=utf-8'
    } else if (format === 'json') {
      content = JSON.stringify(list.map((t) => ({ source: t.source, target: t.target, sourceLang: t.sourceLang, targetLang: t.targetLang, meta: t.meta, createdAt: t.createdAt, updatedAt: t.updatedAt })), null, 2)
      mime = 'application/json;charset=utf-8'
    } else {
      content = list.map((t) => `${t.source}\t${t.target}`).join('\n')
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fname}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify('success', `已导出 ${list.length} 条记忆到 ${fname}.${ext}`)
  }, [tmEntries, tmSelectedIds, notify])

  const handleTbTmImportFile = useCallback((file: File) => {
    const sl = (activeProject?.sourceLang ?? 'en') as any
    const tl = (activeProject?.targetLang ?? 'zh-CN') as any
    const projId = tmScope === 'project' ? (currentProjectId ?? undefined) : undefined
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          import('xlsx').then(async (XLSX) => {
            const wb = XLSX.read(reader.result, { type: 'binary' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
            if (aoa.length === 0) { notify('warning', 'Excel 中没有数据'); return }
            const first = aoa[0].map((c) => String(c ?? '').trim())
            const isHeader = first.length >= 2 && (
              first[0] === '原文' || first[0].toLowerCase() === 'source' || first[0] === '记忆原文'
            )
            const pairs: Array<{ source: string; target: string }> = []
            for (let i = isHeader ? 1 : 0; i < aoa.length; i++) {
              const row = aoa[i].map((c) => String(c ?? '').trim())
              if (row.length >= 2 && row[0] && row[1]) pairs.push({ source: row[0], target: row[1] })
            }
            if (pairs.length === 0) { notify('warning', `Excel ${file.name} 中未解析到有效记忆对`); return }
            const result = await tmAddEntries(pairs, { sourceLang: sl, targetLang: tl, projectId: projId }, 'skip')
            notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
          }).catch((e) => notify('error', `解析 Excel 失败：${(e as Error).message}`))
        } catch (err) { notify('error', `读取 ${file.name} 失败：${(err as Error).message}`) }
      }
      reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
      reader.readAsBinaryString(file)
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const text = String(reader.result ?? '')
      let pairs: Array<{ source: string; target: string }> = []
      try {
        pairs = parsePairsFromText(text, file.name)
      } catch (err) { notify('error', `解析失败：${(err as Error).message}`); return }
      if (pairs.length === 0) { notify('warning', `文件 ${file.name} 中未解析到有效记忆对`); return }
      const result = await tmAddEntries(pairs, { sourceLang: sl, targetLang: tl, projectId: projId }, 'skip')
      notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
    }
    reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
    reader.readAsText(file, 'utf-8')
  }, [tmAddEntries, activeProject, tmScope, currentProjectId, notify])

  const onTbTmImportChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const f of Array.from(files)) handleTbTmImportFile(f)
    e.target.value = ''
  }, [handleTbTmImportFile])

  // 复制导入：从剪贴板读取文本，按 Tab/双空格/箭头/竖线 分割为记忆对并导入
  const handleTmCopyImport = useCallback(async () => {
    const sl = (activeProject?.sourceLang ?? 'en') as any
    const tl = (activeProject?.targetLang ?? 'zh-CN') as any
    const projId = tmScope === 'project' ? (currentProjectId ?? undefined) : undefined
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        notify('error', '当前浏览器不支持剪贴板读取，请使用文件导入')
        return
      }
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) { notify('warning', '剪贴板为空'); return }
      const pairs = parsePairsFromPlainText(text)
      if (pairs.length === 0) { notify('warning', '剪贴板中未解析到有效记忆对（支持按 Tab/双空格/箭头/竖线 分行分隔）'); return }
      const result = await tmAddEntries(pairs, { sourceLang: sl, targetLang: tl, projectId: projId }, 'skip')
      notify('success', `复制导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
    } catch (err) {
      const msg = (err as Error).message?.toLowerCase() ?? ''
      if (msg.includes('permission') || msg.includes('denied') || msg.includes('not allowed')) {
        notify('error', '剪贴板读取权限被拒绝，请在浏览器设置中允许或改用文件导入')
      } else {
        notify('error', `剪贴板读取失败：${(err as Error).message}`)
      }
    }
  }, [tmAddEntries, activeProject, tmScope, currentProjectId, notify])

  const tmButtons = [
    { key: 'tm-import', label: '导入记忆', icon: <UploadFileIcon fontSize="small" />, onClick: () => tmImportInputRef.current?.click() },
    { key: 'tm-export', label: '导出记忆', icon: <FileDownloadIcon fontSize="small" />, onClick: (e: MouseEvent<HTMLElement>) => setTmExportAnchor(e.currentTarget) },
    { key: 'tm-copyimport', label: '复制导入', icon: <ContentPasteIcon fontSize="small" />, onClick: handleTmCopyImport },
    { key: 'tm-selectall', label: '全选条目', icon: <SelectAllIcon fontSize="small" />, onClick: handleSelectAllTm },
    { key: 'tm-add', label: '添加条目', icon: <AddIcon fontSize="small" />, onClick: () => setShowAddTmDialog(true) },
    { key: 'tm-delete', label: '删除所选', icon: <DeleteOutlineIcon fontSize="small" />, onClick: handleDeleteSelectedTm },
  ]

  return (
    <Box sx={{ p: 1, height: '100%', overflow: 'auto' }}>
      {/* 项目选择器 */}
      <Stack
        className="panel-header"
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', mb: 1 }}
      >
        <FormControl size="small" fullWidth>
          <InputLabel id="cat-project-select-label">项目</InputLabel>
          <Select
            labelId="cat-project-select-label"
            label="项目"
            value={currentProjectId != null ? String(currentProjectId) : ''}
            onChange={(e) => {
              const v = e.target.value
              selectProject(v ? Number(v) : null)
            }}
          >
            {projects.length === 0 ? (
              <MenuItem value="">
                <em>暂无项目</em>
              </MenuItem>
            ) : (
              projects.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.name} ({p.sourceLang} → {p.targetLang})
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
        <Tooltip title="新建项目">
          <IconButton size="small" color="primary" onClick={handleCreateProject}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Divider className="panel-header" sx={{ mb: 1 }} />

      <Accordion
        expanded={expanded.includes('panel-files')}
        onChange={handleL1('panel-files')}
        slotProps={{ transition: { unmountOnExit: true } }}
        sx={{
          boxShadow: 'none',
          '&:before': { display: 'none' },
          '& .MuiAccordionSummary-root': { minHeight: 40, px: 0.5 },
          '& .MuiAccordionDetails-root': { px: 0.5, py: 0.5 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flex: 1, pr: 0.5 }}>
            <FolderIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">项目文件</Typography>
            <Typography variant="caption" color="text.secondary">
              ({files.length})
            </Typography>
            <Box sx={{ flex: 1 }} />
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack direction="row" spacing={0.5} sx={{ mb: 1, px: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
            <Tooltip
              title={
                currentProjectId == null
                  ? '请先在上方选择项目'
                  : '创建新的分类（根级）'
              }
            >
              <span>
                <Button
                  size="small"
                  disabled={currentProjectId == null}
                  startIcon={<CreateNewFolderIcon fontSize="small" />}
                  onClick={handleCreateFolder}
                >
                  新建分类
                </Button>
              </span>
            </Tooltip>
            <Tooltip
              title={
                currentProjectId == null
                  ? '请先在上方选择项目'
                  : '从本地导入文件到项目'
              }
            >
              <span>
                <Button
                  size="small"
                  disabled={currentProjectId == null}
                  startIcon={<UploadFileIcon fontSize="small" />}
                  onClick={() => setImportOpen(true)}
                >
                  导入文件
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="勾选/取消勾选当前项目下的全部文件">
              <span>
                <Button
                  size="small"
                  disabled={currentProjectId == null}
                  startIcon={<SelectAllIcon fontSize="small" />}
                  onClick={toggleSelectAll}
                >
                  全选
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={hasSelection ? '删除已勾选的分类和文件' : '请先勾选分类或文件再删除'}>
              <span style={{ marginLeft: 'auto' }}>
                <Button
                  size="small"
                  color="error"
                  disabled={!hasSelection}
                  startIcon={<DeleteOutlineIcon fontSize="small" />}
                  onClick={handleDeleteSelected}
                >
                  删除
                  {fileIdsToDelete.length + folderIdsToDelete.length > 0
                    ? `（${fileIdsToDelete.length + folderIdsToDelete.length}）`
                    : ''}
                </Button>
              </span>
            </Tooltip>
          </Stack>

          {files.length === 0 && folders.length === 0 ? (
            <Stack
              direction="column"
              spacing={1}
              sx={{ py: 4, px: 0.5, alignItems: 'center' }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                {currentProjectId == null ? '请先在上方选择项目' : '暂无项目文件，点击上方"导入文件"添加'}
              </Typography>
            </Stack>
          ) : (
            <Box
              onDragOver={handleRootDragOver}
              onDragLeave={handleRootDragLeave}
              onDrop={handleRootDrop}
              sx={{
                minHeight: 40,
                p: 0.75,
                borderRadius: 1,
                transition: 'all 120ms ease',
                position: 'relative',
                outline:
                  hoverRoot && indicator?.mode === 'inside'
                    ? (t) => `2px dashed ${t.palette.primary.main}`
                    : '2px dashed transparent',
                bgcolor:
                  hoverRoot && indicator?.mode === 'inside'
                    ? (t) => alpha(t.palette.primary.main, 0.06)
                    : 'transparent',
                boxShadow:
                  hoverRoot && indicator?.mode === 'inside'
                    ? (t) => `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.12)}`
                    : undefined,
              }}
            >
              <SimpleTreeView
                className="cat-tree"
                expandedItems={treeExpanded}
                onExpandedItemsChange={handleExpandedChange}
                onSelectedItemsChange={handleSelectedChange}
                sx={{
                  '& .MuiTreeItem-root': { minHeight: 30 },
                  '& .MuiTreeItem-content': { borderRadius: 0.5, mb: 0.1, p: 0 },
                  '& .cat-tree-label': {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    flex: 1,
                    minWidth: 0,
                    pr: 0.5,
                  },
                  '& .cat-tree-drag-over-inside': {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                    borderRadius: 0.5,
                    boxShadow: (t) => `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.25)}`,
                  },
                }}
              >
                {treeNodes}
              </SimpleTreeView>
            </Box>
          )}

          {activeFileId != null && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', px: 0.5, mt: 1 }}
            >
              当前文件共 {segments.length} 段
            </Typography>
          )}
        </AccordionDetails>
      </Accordion>

      {/* 项目词典 */}
      <Accordion
        expanded={expanded.includes('panel-tb')}
        onChange={handleL1('panel-tb')}
        slotProps={{ transition: { unmountOnExit: true } }}
        sx={{
          boxShadow: 'none',
          '&:before': { display: 'none' },
          '& .MuiAccordionSummary-root': { minHeight: 40, px: 0.5 },
          '& .MuiAccordionDetails-root': { px: 0.5, py: 1 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <BookmarkIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">项目词典</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack direction="column" spacing={0.5}>
            {tbButtons.map((b) => (
              <Button
                key={b.key}
                size="small"
                fullWidth
                startIcon={b.icon}
                onClick={b.onClick}
              >
                {b.label}
              </Button>
            ))}
            {selectedIds.size > 0 && (
              <Typography variant="caption" color="primary" sx={{ textAlign: 'center', mt: 0.5 }}>
                已选 {selectedIds.size} / {terms.length} 条
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* 隐藏的术语导入文件选择器（支持 Excel 多格式） */}
      <input
        ref={tbImportInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.json,.txt,.tsv"
        multiple
        style={{ display: 'none' }}
        onChange={onTbImportChange}
      />
      {/* 术语导出格式选择菜单 */}
      <Menu
        open={!!tbExportFormatAnchor}
        anchorEl={tbExportFormatAnchor}
        onClose={() => setTbExportFormatAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <MenuItem onClick={() => { handleTbExport('xlsx'); setTbExportFormatAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 Excel" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTbExport('csv'); setTbExportFormatAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 CSV" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTbExport('json'); setTbExportFormatAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 JSON" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTbExport('txt'); setTbExportFormatAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 TXT" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
      </Menu>

      {/* 添加术语对话框 */}
      <Dialog open={showAddTermDialog} onClose={() => setShowAddTermDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>添加术语</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              fullWidth
              label="原文"
              value={newTermSource}
              onChange={(e) => setNewTermSource(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (document.getElementById('new-term-target') as HTMLInputElement)?.focus() }}
            />
            <TextField
              id="new-term-target"
              size="small"
              fullWidth
              label="译文"
              value={newTermTarget}
              onChange={(e) => setNewTermTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTerm() }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddTermDialog(false)}>取消</Button>
          <Button variant="contained" onClick={handleAddTerm}>添加</Button>
        </DialogActions>
      </Dialog>

      {/* 项目记忆 */}
      <Accordion
        expanded={expanded.includes('panel-tm')}
        onChange={handleL1('panel-tm')}
        slotProps={{ transition: { unmountOnExit: true } }}
        sx={{
          boxShadow: 'none',
          '&:before': { display: 'none' },
          '& .MuiAccordionSummary-root': { minHeight: 40, px: 0.5 },
          '& .MuiAccordionDetails-root': { px: 0.5, py: 1 },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <MemoryIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">项目记忆</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack direction="column" spacing={0.5}>
            {tmButtons.map((b) => (
              <Button
                key={b.key}
                size="small"
                fullWidth
                startIcon={b.icon}
                onClick={b.onClick}
              >
                {b.label}
              </Button>
            ))}
            {tmSelectedIds.size > 0 && (
              <Typography variant="caption" color="primary" sx={{ textAlign: 'center', mt: 0.5 }}>
                已选 {tmSelectedIds.size} / {tmEntries.length} 条
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* 添加记忆条目对话框 */}
      <Dialog open={showAddTmDialog} onClose={() => setShowAddTmDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加记忆条目</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              autoFocus
              size="small"
              fullWidth
              multiline
              maxRows={4}
              label="原文"
              value={newTmSource}
              onChange={(e) => setNewTmSource(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (document.getElementById('new-tm-target') as HTMLInputElement)?.focus() } }}
            />
            <TextField
              id="new-tm-target"
              size="small"
              fullWidth
              multiline
              maxRows={4}
              label="译文"
              value={newTmTarget}
              onChange={(e) => setNewTmTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTm() } }}
            />
            <Typography variant="caption" color="text.secondary">
              语言对：{activeProject?.sourceLang ?? 'en'} → {activeProject?.targetLang ?? 'zh-CN'}
              {tmScope === 'project' ? ' · 归属当前项目' : ' · 全局共享'}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddTmDialog(false)}>取消</Button>
          <Button variant="contained" onClick={handleAddTm}>添加</Button>
        </DialogActions>
      </Dialog>

      {/* 隐藏的记忆导入文件选择器（支持 Excel 多格式） */}
      <input
        ref={tmImportInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.json,.txt,.tsv"
        multiple
        style={{ display: 'none' }}
        onChange={onTbTmImportChange}
      />
      {/* 记忆导出格式选择菜单 */}
      <Menu
        open={!!tmExportAnchor}
        anchorEl={tmExportAnchor}
        onClose={() => setTmExportAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <MenuItem onClick={() => { handleTbTmExport('xlsx'); setTmExportAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 Excel" secondary={tmSelectedIds.size > 0 ? `仅选中 ${tmSelectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTbTmExport('csv'); setTmExportAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 CSV" secondary={tmSelectedIds.size > 0 ? `仅选中 ${tmSelectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTbTmExport('json'); setTmExportAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 JSON" secondary={tmSelectedIds.size > 0 ? `仅选中 ${tmSelectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTbTmExport('txt'); setTmExportAnchor(null) }}>
          <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 TXT" secondary={tmSelectedIds.size > 0 ? `仅选中 ${tmSelectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
      </Menu>

      <ImportFileDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <CreateProjectDialog open={createProjectOpen} onClose={() => setCreateProjectOpen(false)} />
    </Box>
  )
}
