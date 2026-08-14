import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Divider,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Checkbox,
  ListItemIcon as MuiListItemIcon,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Radio,
  RadioGroup,
  Alert,
  CircularProgress,
  Avatar,
} from '@mui/material'
import TranslateIcon from '@mui/icons-material/Translate'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import ProjectIcon from '@mui/icons-material/Folder'
import FileIcon from '@mui/icons-material/InsertDriveFile'
import ViewIcon from '@mui/icons-material/ViewQuilt'
import SettingsIcon from '@mui/icons-material/Settings'
import InfoIcon from '@mui/icons-material/Info'
import RestartIcon from '@mui/icons-material/RestartAlt'
import SaveLayoutIcon from '@mui/icons-material/SaveAs'
import RestoreLayoutIcon from '@mui/icons-material/Restore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import NewProjectIcon from '@mui/icons-material/PlaylistAdd'
import OpenProjectIcon from '@mui/icons-material/FileOpen'
import CloseProjectIcon from '@mui/icons-material/Close'
import SwitchProjectIcon from '@mui/icons-material/SwapHoriz'
import SaveProjectIcon from '@mui/icons-material/Save'
import SaveAsProjectIcon from '@mui/icons-material/PostAdd'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import HistoryIcon from '@mui/icons-material/History'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import ImportFileIcon from '@mui/icons-material/FileUpload'
import ExportBilingualIcon from '@mui/icons-material/DownloadDone'
import GlossaryIcon from '@mui/icons-material/Bookmark'
import MemoryIcon from '@mui/icons-material/Memory'
import MenuItemAddIcon from '@mui/icons-material/AddCircleOutlined'
import MenuItemDownloadIcon from '@mui/icons-material/VerticalAlignBottom'
import EditIcon from '@mui/icons-material/Edit'
import ExportSettingsIcon from '@mui/icons-material/SettingsBackupRestoreOutlined'
import ImportSettingsIcon from '@mui/icons-material/SystemUpdateAlt'
import GroupsIcon from '@mui/icons-material/Groups'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import PlayCircleIcon from '@mui/icons-material/PlayCircle'
import TuneIcon from '@mui/icons-material/Tune'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import SwapHorizIcon from '@mui/icons-material/SwapCalls'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import type { ReactElement } from 'react'
import { useUIStore, useProjectStore, useLayoutStore, useTermStore, useTMStore, useCollabStore } from '@app/store'
import { showTabInDock, hideTabInDock } from './DockLayout'
import { PANEL_REGISTRY } from './panelRegistry'
import { LOCKED_TAB_IDS } from '@app/store/layout'
import { DICTIONARY_VISIBLE_TABS, MEMORY_VISIBLE_TABS } from './defaultLayout'
import { CreateProjectDialog } from '@/features/project/components/CreateProjectDialog'
import { ExportFileDialog } from '@/features/project/components/ExportFileDialog'
import { ImportFileDialog } from '@/features/project/components/ImportFileDialog'
import { ImportProjectDialog } from '@/features/project/components/ImportProjectDialog'
import { ExportProjectDialog } from '@/features/project/components/ExportProjectDialog'
import { DeleteProjectDialog } from '@/features/project/components/DeleteProjectDialog'
import { AboutDialog } from './AboutDialog'
import { SettingsDialog } from './SettingsDialog'
import {
  type RecentProjectEntry, getRecentProjects, removeRecentProject,
  parsePairFile, exportPairFile, SETTINGS_KEYS, getSetting, setSetting,
  setSetting as writeSetting,
  type PairRow,
  downloadUserSettings, importUserSettings, readJSONFile,
  type CATUserSettingsBundle, type ImportUserSettingsStats,
} from '@/services/io'
import { startCollab, stopCollab } from '@/services/collab/goeasy'
import type { LanguageCode, ID } from '@/types'

/* =========================
 * 小工具：FormatMenu（词典/记忆的导入/导出格式菜单——复用项）
 * ========================= */
type ExportKind = 'term' | 'tm'
type ExportFormat = 'xlsx' | 'csv' | 'json' | 'txt'

interface FormatMenuProps {
  kind: ExportKind
  anchor: HTMLElement | null
  onClose: () => void
}

function TermTmExportFormatMenu({ kind, anchor, onClose }: FormatMenuProps): ReactElement {
  const notify = useUIStore((s) => s.notify)
  const terms = useTermStore((s) => s.terms)
  const termSelectedIds = useTermStore((s) => s.selectedIds)
  const tmEntries = useTMStore((s) => s.entries)
  const tmSelectedIds = useTMStore((s) => s.selectedIds)
  const tmAddEntries = useTMStore((s) => s.addEntries)
  // 语言对：优先从当前激活项目取；项目未激活则从 db.settings 默认值取（启动时异步填充，见 useProjectStore 初始化）
  const currentProject = useProjectStore((s) => s.projects.find((p) => p.id === s.currentProjectId))
  const projectDefaultSourceLang = useProjectStore((s) => s.defaultSourceLang)
  const projectDefaultTargetLang = useProjectStore((s) => s.defaultTargetLang)
  const tmSourceLang = currentProject?.sourceLang ?? projectDefaultSourceLang ?? 'en'
  const tmTargetLang = currentProject?.targetLang ?? projectDefaultTargetLang ?? 'zh-CN'
  const termAddTerms = useTermStore((s) => s.addTerms)

  const fileRef = useRef<HTMLInputElement>(null)
  const [importSubmitting, setImportSubmitting] = useState(false)

  const listCount = kind === 'term' ? terms.length : tmEntries.length
  const selCount = kind === 'term' ? termSelectedIds.size : tmSelectedIds.size

  const handlePick = () => fileRef.current?.click()

  const doImportFile = async (file: File) => {
    setImportSubmitting(true)
    try {
      const { pairs } = await parsePairFile(file)
      if (pairs.length === 0) {
        notify('warning', `文件 ${file.name} 未解析到有效对（需 原文/译文 两列）`)
        return
      }
      if (kind === 'term') {
        const r = termAddTerms(pairs, 'skip')
        notify('success', `术语库导入：新增 ${r.added}，跳过重复 ${r.skipped}（共解析 ${pairs.length}）`)
      } else {
        const meta = {
          sourceLang: (tmSourceLang ?? 'en') as LanguageCode,
          targetLang: (tmTargetLang ?? 'zh-CN') as LanguageCode,
        }
        const r = await tmAddEntries(pairs, meta, 'skip')
        notify('success', `记忆库导入：新增 ${r.added}，跳过重复 ${r.skipped}，更新 ${r.updated ?? 0}（共解析 ${pairs.length}）`)
      }
    } catch (e) {
      notify('error', `导入失败：${(e as Error).message}`)
    } finally {
      setImportSubmitting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    e.target.value = ''
    if (!files || files.length === 0) return
    for (let i = 0; i < files.length; i++) {
      void doImportFile(files[i])
    }
  }

  const handleExport = async (fmt: ExportFormat) => {
    try {
      let rows: PairRow[] = []
      if (kind === 'term') {
        const ids = Array.from(termSelectedIds)
        rows = (ids.length > 0 ? terms.filter((t) => ids.includes(t.id)) : terms).map((t) => ({
          source: t.source,
          target: t.target,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }))
      } else {
        const ids = Array.from(tmSelectedIds)
        rows = (ids.length > 0 ? tmEntries.filter((t) => ids.includes(t.id as number)) : tmEntries).map((t) => ({
          source: t.source,
          target: t.target,
          sourceLang: t.sourceLang,
          targetLang: t.targetLang,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          projectId: t.projectId,
          meta: t.meta as Record<string, unknown> | undefined,
        }))
      }
      if (rows.length === 0) {
        notify('warning', selCount > 0 ? '选中数据为空，无法导出' : (kind === 'term' ? '术语库为空' : '记忆库为空'))
        return
      }
      const meta = kind === 'term'
        ? { prefix: 'glossary', sheetName: '术语表', colWidths: [30, 40] as [number, number], includeExtendedFields: fmt === 'json' }
        : { prefix: 'memory', sheetName: '记忆表', colWidths: [50, 60] as [number, number], includeExtendedFields: fmt === 'json' }
      const { fileName } = await exportPairFile(rows, fmt, meta)
      notify('success', `已导出 ${rows.length} 条${kind === 'term' ? '术语' : '记忆'}到 ${fileName}`)
    } catch (e) {
      notify('error', `导出失败：${(e as Error).message}`)
    } finally {
      onClose()
    }
  }

  const labelName = kind === 'term' ? '术语' : '记忆'
  const sub1 = selCount > 0 ? `仅选中 ${selCount} 条` : `全部 ${listCount} 条`

  return (
    <>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={() => { onClose(); handlePick() }} disabled={importSubmitting}>
          <ListItemIcon><MenuItemAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary={`导入${labelName}（xlsx / csv / json / txt）`}
            secondary={`点击后选择本地文件，${labelName}对将被导入并自动去重`}
          />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleExport('xlsx')}>
          <ListItemIcon><MenuItemDownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 Excel" secondary={sub1} />
        </MenuItem>
        <MenuItem onClick={() => handleExport('csv')}>
          <ListItemIcon><MenuItemDownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 CSV" secondary={sub1} />
        </MenuItem>
        <MenuItem onClick={() => handleExport('json')}>
          <ListItemIcon><MenuItemDownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 JSON" secondary={sub1} />
        </MenuItem>
        <MenuItem onClick={() => handleExport('txt')}>
          <ListItemIcon><MenuItemDownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 TXT" secondary={sub1} />
        </MenuItem>
      </Menu>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.json,.txt,.tsv"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </>
  )
}

/* =========================
 * TopToolbar 主体
 * ========================= */
export function TopToolbar(): ReactElement {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const notify = useUIStore((s) => s.notify)

  const projects = useProjectStore((s) => s.projects)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const selectProject = useProjectStore((s) => s.selectProject)
  const renameProject = useProjectStore((s) => s.renameProject)

  const visibleTabs = useLayoutStore((s) => s.visibleTabs)
  const userLayouts = useLayoutStore((s) => s.userLayouts)
  const loadUserLayouts = useLayoutStore((s) => s.loadUserLayouts)
  const saveLayoutAs = useLayoutStore((s) => s.saveLayoutAs)
  const applyLayout = useLayoutStore((s) => s.applyLayout)
  const deleteLayout = useLayoutStore((s) => s.deleteLayout)
  const headersHidden = useLayoutStore((s) => s.headersHidden)
  const toggleHeadersHidden = useLayoutStore((s) => s.toggleHeadersHidden)
  const tabBarVertical = useLayoutStore((s) => s.tabBarVertical)
  const toggleTabBarVertical = useLayoutStore((s) => s.toggleTabBarVertical)
  const zenMode = useLayoutStore((s) => s.zenMode)
  const toggleZenMode = useLayoutStore((s) => s.toggleZenMode)
  const workbenchMode = useLayoutStore((s) => s.workbenchMode)

  // 协同翻译 store
  const collabConnectionStatus = useCollabStore((s) => s.connectionStatus)
  const collabCurrentChannel = useCollabStore((s) => s.currentChannel)
  const collabUsers = useCollabStore((s) => s.users)
  const collabMyUserId = useCollabStore((s) => s.myUserId)
  const collabSetEditingSegment = useCollabStore((s) => s.setEditingSegment)
  const collabConfig = useCollabStore((s) => s.config)

  // 退出工作状态：TopToolbar 控制应用级 welcome 模式（workbenchMode='idle'）
  const [idleMode, setIdleMode] = useState(false)

  // 菜单 anchors
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<null | HTMLElement>(null)
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null)
  const [projectSelAnchor, setProjectSelAnchor] = useState<null | HTMLElement>(null)
  const [recentSubAnchor, setRecentSubAnchor] = useState<null | HTMLElement>(null)
  const [viewAnchor, setViewAnchor] = useState<null | HTMLElement>(null)
  const [layoutAnchor, setLayoutAnchor] = useState<null | HTMLElement>(null)
  const [toolsAnchor, setToolsAnchor] = useState<null | HTMLElement>(null)
  const [collabAnchor, setCollabAnchor] = useState<null | HTMLElement>(null)
  const [collabPresenceAnchor, setCollabPresenceAnchor] = useState<null | HTMLElement>(null)

  const [saveLayoutOpen, setSaveLayoutOpen] = useState(false)
  const [layoutName, setLayoutName] = useState('')

  // 文件菜单下 词典/记忆 格式菜单 anchor（共用一个 FormatMenu 组件）
  const [termFormatAnchor, setTermFormatAnchor] = useState<null | HTMLElement>(null)
  const [tmFormatAnchor, setTmFormatAnchor] = useState<null | HTMLElement>(null)

  // 最近项目（异步加载）
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  const loadRecent = useCallback(async () => {
    try { setRecentProjects(await getRecentProjects()) } catch { setRecentProjects([]) }
  }, [])

  // Dialog 开关
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [importFileOpen, setImportFileOpen] = useState(false)
  const [importProjectOpen, setImportProjectOpen] = useState(false)
  const [exportProjectOpen, setExportProjectOpen] = useState(false)
  // silent 模式：复用 ExportProjectDialog 作为"保存项目（立即下载）"
  const [silentSaveKey, setSilentSaveKey] = useState(0)
  // 删除项目 Dialog：deleteProjectId 指定待删除项目（菜单入口删当前项目，下拉入口删指定项目）
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [deleteProjectId, setDeleteProjectId] = useState<ID | null>(null)
  // 重命名项目 Dialog：点击工具栏项目名 Chip 触发
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // 用户设置导入：文件选择器 + 预览/确认 Dialog
  const importUserSettingsFileRef = useRef<HTMLInputElement | null>(null)
  const [importUserSettingsOpen, setImportUserSettingsOpen] = useState(false)
  const [importUserSettingsBundle, setImportUserSettingsBundle] = useState<CATUserSettingsBundle | null>(null)
  const [importUserSettingsFileName, setImportUserSettingsFileName] = useState('')
  const [importUserSettingsSubmitting, setImportUserSettingsSubmitting] = useState(false)
  const [importUserSettingsResult, setImportUserSettingsResult] = useState<ImportUserSettingsStats | null>(null)

  // 关于弹窗
  const [aboutOpen, setAboutOpen] = useState(false)
  // 设置弹窗（全屏）
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<string | undefined>(undefined)
  // 打开设置弹窗，可指定初始展开的一级分类（如 'collab' / 'cloud' / 'basic'）
  const openSettings = (section?: string) => {
    setSettingsInitialSection(section)
    setSettingsOpen(true)
  }

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null

  useEffect(() => { void loadUserLayouts() }, [loadUserLayouts])
  // 每次 project 菜单打开时，重新拉 recentProjects
  useEffect(() => {
    if (projectMenuAnchor) void loadRecent()
  }, [projectMenuAnchor, loadRecent])

  // 来自设置卡片「立即使用并启动协同」按钮的事件：保证设置里改过的 manualChannel 先被 flush 后,再走和工具栏按钮完全一致的连接/断开逻辑
  const toggleCollabRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    const onStartRequested = () => { void toggleCollabRef.current() }
    window.addEventListener('cat:collab:start-requested', onStartRequested)
    return () => window.removeEventListener('cat:collab:start-requested', onStartRequested)
  }, [])

  const closeAllMenus = () => {
    // 先清除焦点，避免菜单 aria-hidden 时 descendant 仍持有 focus 的告警
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    setProjectMenuAnchor(null)
    setFileMenuAnchor(null)
    setProjectSelAnchor(null)
    setRecentSubAnchor(null)
    setViewAnchor(null)
    setLayoutAnchor(null)
    setToolsAnchor(null)
    setTermFormatAnchor(null)
    setTmFormatAnchor(null)
    setCollabAnchor(null)
    setCollabPresenceAnchor(null)
  }

  /* ===== 项目菜单 动作 ===== */
  const actNewProject = () => { closeAllMenus(); setCreateProjectOpen(true) }
  const actOpenProject = () => { closeAllMenus(); setImportProjectOpen(true) }
  const actCloseProject = async () => {
    closeAllMenus()
    if (!currentProjectId) { notify('info', '当前没有打开的项目'); return }
    if (!window.confirm('关闭当前项目？关闭后可从项目菜单或项目选择下拉重新打开。')) return
    await selectProject(null)
    setIdleMode(false)
  }
  /** 删除项目：不传 id 删当前项目；传入 id 删指定项目（下拉入口用）。
   *  实际删除由 DeleteProjectDialog 内部完成（含删前快照 + 二次确认） */
  const actDeleteProject = (id?: ID) => {
    closeAllMenus()
    const targetId = id ?? currentProjectId
    if (!targetId) { notify('info', '当前没有打开的项目'); return }
    setDeleteProjectId(targetId)
    setDeleteProjectOpen(true)
  }
  const actSaveProject = () => {
    closeAllMenus()
    if (projects.length === 0) { notify('warning', '当前没有项目可保存'); return }
    // 仅触发 silent 模式下载（不弹对话框）。SilentSaveBridge 监听 counter 变化执行。
    setSilentSaveKey((k) => k + 1)
  }
  const actSaveAsProject = () => {
    closeAllMenus()
    if (projects.length === 0) { notify('warning', '当前没有项目可另存为'); return }
    setExportProjectOpen(true)
  }
  const actExitWork = async () => {
    closeAllMenus()
    if (!window.confirm('确认退出工作？将关闭当前项目并回到欢迎页。项目数据仍保留在浏览器本地，随时可重新打开。')) return
    if (currentProjectId != null) await selectProject(null)
    setIdleMode(true)
  }

  /* ===== 用户设置 导入/导出 动作 ===== */
  const actExportUserSettings = async () => {
    closeAllMenus()
    try {
      await downloadUserSettings()
      notify('success', '用户设置已导出，请检查下载目录')
    } catch (e) {
      notify('error', `导出用户设置失败：${(e as Error).message}`)
    }
  }
  const actPickImportUserSettingsFile = () => {
    closeAllMenus()
    setImportUserSettingsBundle(null)
    setImportUserSettingsResult(null)
    importUserSettingsFileRef.current?.click()
  }
  const handleImportUserSettingsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportUserSettingsFileName(file.name)
    try {
      const bundle = await readJSONFile<CATUserSettingsBundle>(file)
      if (!bundle || bundle.version !== '1.0') throw new Error('版本或格式无效')
      setImportUserSettingsBundle(bundle)
      setImportUserSettingsOpen(true)
    } catch (err) {
      notify('error', `无法读取设置文件：${(err as Error).message}`)
    }
  }
  const handleConfirmImportUserSettings = async () => {
    if (!importUserSettingsBundle) return
    setImportUserSettingsSubmitting(true)
    try {
      const stats = await importUserSettings(importUserSettingsBundle)
      setImportUserSettingsResult(stats)
      notify('success', `用户设置导入完成，共 ${stats.localStorage.applied + stats.dbSettings.applied + stats.userLayouts.added + stats.userLayouts.overwritten} 项`)
    } catch (err) {
      notify('error', `导入用户设置失败：${(err as Error).message}`)
    } finally {
      setImportUserSettingsSubmitting(false)
    }
  }

  /* ===== 工具菜单 动作 ===== */
  const actRestartWorkbench = async () => {
    closeAllMenus()
    if (!window.confirm('确认重启工作台？未保存的数据可能丢失。')) return
    // 先主动同步保存当前布局到 IndexedDB，完成后再重载，
    // 避免仅依赖 beforeunload 触发的异步 saveLastLayout 在 reload 前未完成
    try {
      await Promise.race([
        useLayoutStore.getState().saveLastLayout(),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ])
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  /* ===== 协同翻译 动作 ===== */
  const [collabStarting, setCollabStarting] = useState(false)
  const isCollabConnected = collabConnectionStatus === 'connected' || collabConnectionStatus === 'connecting'
  const collabVisible = visibleTabs.includes('collab')
  const actToggleCollab = async () => {
    if (isCollabConnected) {
      closeAllMenus()
      if (!window.confirm('确认离开协同频道？将停止接收同步消息并关闭协同面板。')) return
      await stopCollab()
      if (collabVisible) hideTabInDock('collab')
      collabSetEditingSegment(null)
      notify('info', '已停止网络协同翻译')
    } else {
      closeAllMenus()
      if (!currentProjectId) { notify('warning', '请先打开一个项目后再启动协同'); return }
      if (!collabConfig.appkey.trim()) {
        notify('warning', '未配置 GoEasy AppKey，请先在「设置 → 网络协同翻译」中填写')
        openSettings('collab')
        return
      }
      // 启动前先让当前焦点元素失焦(通常是设置界面的频道名输入框),保证它的 onBlur 把未保存的频道名 flush 到 collabStore.config
      try {
        const active = document.activeElement as HTMLElement | null
        if (active && typeof active.blur === 'function') {
          active.blur()
        }
      } catch { /* ignore */ }
      // 等 blur 宏任务执行完毕(React setState + savePersist 都是同步,一个微任务 tick 就够)
      await new Promise<void>((r) => queueMicrotask(() => r()))
      setCollabStarting(true)
      try {
        const result = await startCollab({
          projectId: currentProjectId,
          projectName: currentProject?.name,
        })
        if (result.ok) {
          notify('success', `已加入协同频道：${result.channel}`)
          if (!collabVisible) showTabInDock('collab')
        } else {
          notify('error', `启动协同失败：${result.error ?? '未知原因'}`)
        }
      } catch (e) {
        notify('error', `启动协同异常：${(e as Error).message}`)
      } finally {
        setCollabStarting(false)
      }
    }
  }
  // 把最新版 actToggleCollab 暴露给 ref,供设置卡片通过 window 事件调用(保证走完全相同的校验/启动链路)
  toggleCollabRef.current = actToggleCollab
  const actCopyCollabChannel = () => {
    closeAllMenus()
    if (!collabCurrentChannel) return
    try {
      void navigator.clipboard?.writeText(collabCurrentChannel)
      notify('success', `频道名已复制：${collabCurrentChannel}`)
    } catch {
      notify('warning', '复制失败，请手动选择')
    }
  }

  /* ===== 文件菜单 动作 ===== */
  const actImportSource = () => {
    closeAllMenus()
    if (!currentProjectId) { notify('warning', '请先创建或打开一个项目'); return }
    setImportFileOpen(true)
  }
  const actExportTarget = () => {
    closeAllMenus()
    if (!currentProjectId) { notify('warning', '请先创建或打开一个项目'); return }
    setExportOpen(true)
  }
  const openTermFormat = (e: React.MouseEvent<HTMLElement>) => { setTermFormatAnchor(e.currentTarget) }
  const openTmFormat = (e: React.MouseEvent<HTMLElement>) => { setTmFormatAnchor(e.currentTarget) }

  /* ===== 视图菜单 布局 ===== */
  const handleToggleTab = (tabId: string) => {
    if (visibleTabs.includes(tabId)) hideTabInDock(tabId)
    else showTabInDock(tabId)
  }
  const handleSaveLayout = () => { setLayoutName(`布局 ${userLayouts.length + 1}`); setSaveLayoutOpen(true) }
  const handleConfirmSaveLayout = async () => {
    const name = layoutName.trim()
    if (!name) return
    setSaveLayoutOpen(false)
    await saveLayoutAs(name)
    notify('success', `布局「${name}」已保存`)
  }
  const handleApplyLayout = async (target: 'default' | typeof userLayouts[number]) => {
    setLayoutAnchor(null); setViewAnchor(null)
    try {
      await applyLayout(target === 'default' ? 'default' : target)
      notify('success', target === 'default' ? '已恢复默认布局' : `已加载布局「${target.name}」`)
    } catch (err) { notify('error', `加载布局失败：${(err as Error).message}`) }
  }
  const handleDeleteLayout = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`确认删除布局「${name}」？`)) return
    await deleteLayout(id)
    notify('info', `布局「${name}」已删除`)
  }

  const canProjectOps = projects.length > 0 || currentProjectId != null

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ zIndex: 1300 }}>
      <Toolbar variant="dense" sx={{ gap: 0.25, minHeight: '44px !important' }}>
        <TranslateIcon color="primary" sx={{ mr: 0.5 }} />
        <Typography variant="h6" noWrap sx={{ fontSize: '1rem', fontWeight: 700 }}>
          CAT 工作台
        </Typography>

        {currentProject && (
          <Tooltip title="点击修改项目名称">
            <Chip
              size="small"
              label={currentProject.name}
              color="primary"
              variant="outlined"
              clickable
              onClick={() => {
                setRenameValue(currentProject.name)
                setRenameOpen(true)
              }}
              deleteIcon={<EditIcon fontSize="small" />}
              onDelete={() => {
                setRenameValue(currentProject.name)
                setRenameOpen(true)
              }}
              sx={{ ml: 1, '& .MuiChip-deleteIcon': { color: 'primary.main' } }}
            />
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        {/* 一级菜单 1：项目（整体工程级） */}
        <Tooltip title="项目菜单：新建/打开/关闭/保存/另存/最近/退出">
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<ProjectIcon fontSize="small" />}
            onClick={(e) => { void loadProjects(); setProjectMenuAnchor(e.currentTarget) }}
            sx={{ textTransform: 'none', fontWeight: 600, minWidth: 72 }}
          >
            项目
          </Button>
        </Tooltip>
        <Menu anchorEl={projectMenuAnchor} open={Boolean(projectMenuAnchor)} onClose={() => setProjectMenuAnchor(null)}>
          <MenuItem onClick={actNewProject}>
            <ListItemIcon><NewProjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="新建项目…" secondary="从零创建一个翻译工程" />
          </MenuItem>
          <MenuItem onClick={actOpenProject}>
            <ListItemIcon><OpenProjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="打开项目…" secondary="从本地 .cat-project.json 打开或恢复项目存档" />
          </MenuItem>
          <MenuItem
            onClick={(e) => { void loadProjects(); setProjectSelAnchor(e.currentTarget) }}
            onMouseEnter={(e) => { void loadProjects(); setProjectSelAnchor(e.currentTarget) }}
            disabled={projects.length === 0}
          >
            <ListItemIcon><SwitchProjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="切换项目"
              secondary={projects.length > 0 ? `共 ${projects.length} 个项目` : '暂无项目'}
            />
          </MenuItem>
          <Menu
            anchorEl={projectSelAnchor}
            open={Boolean(projectSelAnchor)}
            onClose={() => setProjectSelAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { minWidth: 260 } } }}
          >
            {projects.length === 0 ? (
              <MenuItem disabled><ListItemText>暂无项目，请先创建</ListItemText></MenuItem>
            ) : (
              projects.map((p) => (
                <MenuItem
                  key={p.id}
                  selected={p.id === currentProjectId}
                  onClick={async () => {
                    setProjectSelAnchor(null)
                    setProjectMenuAnchor(null)
                    await selectProject(p.id!)
                    setIdleMode(false)
                  }}
                  sx={{ pr: 1 }}
                >
                  <ListItemText
                    primary={p.name}
                    secondary={
                      <Typography variant="caption" color="text.secondary" component="span">
                        {p.sourceLang} → {p.targetLang}
                      </Typography>
                    }
                  />
                  <Tooltip title="删除此项目">
                    <IconButton
                      size="small"
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation()
                        setProjectSelAnchor(null)
                        setProjectMenuAnchor(null)
                        actDeleteProject(p.id!)
                      }}
                      sx={{ ml: 1, color: 'text.disabled', '&:hover': { color: 'error.main', bgcolor: 'rgba(211,47,47,0.12)' } }}
                      aria-label="删除项目"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </MenuItem>
              ))
            )}
          </Menu>
          <MenuItem onClick={actCloseProject} disabled={!currentProjectId}>
            <ListItemIcon><CloseProjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="关闭项目" secondary={currentProject ? `关闭「${currentProject.name}」` : '当前未打开项目'} />
          </MenuItem>
          <MenuItem onClick={() => actDeleteProject()} disabled={!currentProjectId}>
            <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText
              primary={
                <Typography component="span" sx={{ color: 'error.main', fontWeight: 600 }}>删除项目…</Typography>
              }
              secondary={currentProject ? `永久删除「${currentProject.name}」及其所有数据` : '当前未打开项目'}
            />
          </MenuItem>
          <Divider />
          <MenuItem onClick={actSaveProject} disabled={!canProjectOps}>
            <ListItemIcon><SaveProjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="保存项目" secondary="立即下载一份带时间戳的存档（.cat-project.json）" />
          </MenuItem>
          <MenuItem onClick={actSaveAsProject} disabled={!canProjectOps}>
            <ListItemIcon><SaveAsProjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="另存项目为…" secondary="自定义文件名和导出范围（仅当前项目 / 全量）" />
          </MenuItem>
          <Divider />
          <MenuItem onClick={actExportUserSettings}>
            <ListItemIcon><ExportSettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="导出用户设置…"
              secondary="下载一份本地偏好存档（主题/字体/AI密钥/布局等）"
            />
          </MenuItem>
          <MenuItem onClick={actPickImportUserSettingsFile}>
            <ListItemIcon><ImportSettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="导入用户设置…"
              secondary="从 .cat-settings.json 恢复本地偏好，同名布局将被覆盖"
            />
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={(e) => { void loadRecent(); setRecentSubAnchor(e.currentTarget) }}
            onMouseEnter={(e) => { void loadRecent(); setRecentSubAnchor(e.currentTarget) }}
            disabled={recentProjects.length === 0 && projects.length === 0}
          >
            <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="最近项目" secondary={recentProjects.length > 0 ? `共 ${recentProjects.length} 个` : '暂无历史记录'} />
          </MenuItem>
          <Menu
            anchorEl={recentSubAnchor}
            open={Boolean(recentSubAnchor)}
            onClose={() => setRecentSubAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { minWidth: 260 } } }}
          >
            {recentProjects.length === 0 ? (
              <MenuItem disabled>
                <ListItemText secondary="暂无最近项目（打开一个项目后，会出现在这里）" />
              </MenuItem>
            ) : recentProjects.map((rp) => (
              <MenuItem
                key={String(rp.id)}
                onClick={async () => {
                  setRecentSubAnchor(null)
                  setProjectMenuAnchor(null)
                  await loadProjects()
                  const stillExists = get().projects.some((p) => String(p.id) === String(rp.id))
                  if (stillExists) {
                    await selectProject(rp.id)
                    setIdleMode(false)
                  } else {
                    await removeRecentProject(rp.id)
                    notify('warning', `项目「${rp.name}」已不存在，已从最近列表移除`)
                    void loadRecent()
                  }
                }}
                sx={{ pr: 1 }}
              >
                <ListItemText
                  primary={rp.name}
                  secondary={
                    <Box component="span">
                      {rp.sourceLang && rp.targetLang ? (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {rp.sourceLang} → {rp.targetLang}
                        </Typography>
                      ) : null}
                      <Typography component="span" variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                        {new Date(rp.openedAt).toLocaleString('zh-CN')}
                      </Typography>
                    </Box>
                  }
                />
              </MenuItem>
            ))}
          </Menu>
          <Divider />
          <MenuItem onClick={actExitWork}>
            <ListItemIcon><ExitToAppIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="退出工作" secondary="关闭当前项目并回到欢迎页（不会删除数据）" />
          </MenuItem>
        </Menu>

        {/* 一级菜单 2：文件（组成工程的单个翻译文件/资源） */}
        <Tooltip title="文件菜单：导入原文/导出译文/导入导出词典与记忆库">
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<FileIcon fontSize="small" />}
            onClick={(e) => setFileMenuAnchor(e.currentTarget)}
            sx={{ textTransform: 'none', fontWeight: 600, minWidth: 72 }}
          >
            文件
          </Button>
        </Tooltip>
        <Menu anchorEl={fileMenuAnchor} open={Boolean(fileMenuAnchor)} onClose={() => setFileMenuAnchor(null)}>
          <MenuItem onClick={actImportSource} disabled={!currentProjectId}>
            <ListItemIcon><ImportFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="导入原文…" secondary="txt / md / docx / pdf / xlsx / json / csv… 导入为当前项目的翻译文件" />
          </MenuItem>
          <MenuItem onClick={actExportTarget} disabled={!currentProjectId}>
            <ListItemIcon><ExportBilingualIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="导出译文/双语…" secondary="按选中文件或全部文件，导出双语对照或仅译文" />
          </MenuItem>
          <Divider />
          <MenuItem onClick={openTermFormat}>
            <ListItemIcon><GlossaryIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText primary="导入词典…" secondary="支持 Excel/CSV/JSON/TXT；极简两列（原文/译文）" />
          </MenuItem>
          <MenuItem onClick={(e) => { setTermFormatAnchor(e.currentTarget) }}>
            <ListItemIcon><GlossaryIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="导出词典…"
              secondary={
                useTermStore.getState().selectedIds.size > 0
                  ? `导出选中 ${useTermStore.getState().selectedIds.size} 条（无选中则全库）`
                  : '导出全部术语库（两列极简格式）'
              }
            />
          </MenuItem>
          <Divider />
          <MenuItem onClick={openTmFormat}>
            <ListItemIcon><MemoryIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText primary="导入记忆库…" secondary="支持 Excel/CSV/JSON/TXT；按语言对导入并自动去重" />
          </MenuItem>
          <MenuItem onClick={(e) => { setTmFormatAnchor(e.currentTarget) }}>
            <ListItemIcon><MemoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="导出记忆库…"
              secondary={
                useTMStore.getState().selectedIds.size > 0
                  ? `导出选中 ${useTMStore.getState().selectedIds.size} 条（无选中则当前列表）`
                  : '导出当前记忆列表'
              }
            />
          </MenuItem>
        </Menu>
        {/* 把 FormatMenu 挂在这里：同一组件同时提供"导入"+"四种导出" */}
        <TermTmExportFormatMenu kind="term" anchor={termFormatAnchor} onClose={() => setTermFormatAnchor(null)} />
        <TermTmExportFormatMenu kind="tm" anchor={tmFormatAnchor} onClose={() => setTmFormatAnchor(null)} />

        {/* 一级菜单 3：协同翻译（文件菜单后 · 核心专业功能） */}
        <Tooltip title={isCollabConnected ? `网络协同翻译：已连接 · ${collabUsers.length} 人在线` : '网络协同翻译：多人实时协作'}>
          <span style={{ display: 'inline-flex' }}>
            <Button
              size="small"
              variant="text"
              color="inherit"
              startIcon={<GroupsIcon fontSize="small" />}
              onClick={(e) => setCollabAnchor(e.currentTarget)}
              disabled={collabStarting}
              sx={{ textTransform: 'none', fontWeight: 600, minWidth: 84, position: 'relative' }}
            >
              协同
              {isCollabConnected && collabUsers.length > 0 && (
                <Chip
                  size="small"
                  label={collabUsers.length}
                  color="success"
                  sx={{
                    ml: 0.5,
                    height: 16,
                    '& .MuiChip-label': { px: 0.5, py: 0 },
                    fontSize: 'calc(var(--app-content-font-size) * 0.72)',
                  }}
                />
              )}
            </Button>
          </span>
        </Tooltip>
        <Menu anchorEl={collabAnchor} open={Boolean(collabAnchor)} onClose={() => setCollabAnchor(null)}>
          <MenuItem onClick={actToggleCollab} disabled={collabStarting}>
            <ListItemIcon>
              {isCollabConnected ? (
                <>
                  <StopCircleIcon fontSize="small" color="error" />
                </>
              ) : (
                <PlayCircleIcon fontSize="small" color="success" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={isCollabConnected
                ? `停止协同翻译 (已连接 ${collabUsers.length} 人)`
                : '启动网络协同翻译'
              }
              secondary={isCollabConnected
                ? `频道 ${collabCurrentChannel ?? '—'}`
                : (collabCurrentChannel ? `加入频道 ${collabCurrentChannel}` : (currentProject ? '加入当前项目频道' : '需先打开项目'))
              }
            />
            <FiberManualRecordIcon
              sx={{
                fontSize: 10,
                color:
                  collabConnectionStatus === 'connected' ? 'success.main'
                    : collabConnectionStatus === 'connecting' ? 'warning.main'
                      : collabConnectionStatus === 'failed' ? 'error.main'
                        : 'text.disabled',
                mr: 0.5,
              }}
              fontSize="inherit"
            />
          </MenuItem>
          <Divider />
          <MenuItem
            disabled={!isCollabConnected || collabUsers.length === 0}
            onClick={(e) => { setCollabPresenceAnchor(e.currentTarget) }}
            onMouseEnter={(e) => isCollabConnected && collabUsers.length > 0 && setCollabPresenceAnchor(e.currentTarget)}
          >
            <ListItemIcon><GroupsIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary={`在线译员 (${collabUsers.length})`} secondary="悬停查看列表" />
          </MenuItem>
          <Menu
            anchorEl={collabPresenceAnchor}
            open={Boolean(collabPresenceAnchor)}
            onClose={() => setCollabPresenceAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: {
                sx: {
                  minWidth: 220,
                  maxWidth: 300,
                  // 在线译员过多时滚动,50 名译员场景下不会撑满屏幕
                  maxHeight: 280,
                  overflow: 'auto',
                },
              },
            }}
          >
            {collabUsers.length === 0 && (
              <MenuItem disabled>
                <ListItemText secondary="暂无在线译员" />
              </MenuItem>
            )}
            {collabUsers.map((u) => {
              const isMe = u.userId === collabMyUserId
              return (
                <MenuItem key={u.userId} disabled dense>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Avatar
                      sx={{
                        width: 24,
                        height: 24,
                        fontSize: 'calc(var(--app-content-font-size) * 0.82)',
                        fontWeight: 700,
                      }}
                    >
                      {u.nickname ? u.nickname.trim().charAt(0).toUpperCase() : 'U'}
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: isMe ? 700 : 500 }}>
                          {u.nickname || '译员'}
                        </Typography>
                        {isMe && (
                          <Chip size="small" label="我" sx={{ height: 14, '& .MuiChip-label': { px: 0.5 } }} />
                        )}
                      </Box>
                    }
                    secondary={u.editingSegmentId != null ? `编辑段 #${String(u.editingSegmentId)}` : undefined}
                  />
                </MenuItem>
              )
            })}
          </Menu>
          <MenuItem onClick={actCopyCollabChannel} disabled={!collabCurrentChannel}>
            <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="复制频道名" secondary={collabCurrentChannel ?? '尚未加入频道'} />
          </MenuItem>
          <MenuItem disabled>
            <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="切换频道…" secondary="(预留)" />
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { setCollabAnchor(null); openSettings('collab') }}>
            <ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="网络协同配置信息"
              secondary="打开设置 → 网络协同翻译"
            />
          </MenuItem>
        </Menu>

        <Tooltip title="视图菜单：控制 Tab 显隐与布局">
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<ViewIcon fontSize="small" />}
            onClick={(e) => setViewAnchor(e.currentTarget)}
            sx={{ textTransform: 'none', fontWeight: 600, minWidth: 'auto' }}
          >
            视图
          </Button>
        </Tooltip>
        <Menu
          anchorEl={viewAnchor}
          open={Boolean(viewAnchor)}
          onClose={() => setViewAnchor(null)}
          slotProps={{ paper: { sx: { maxWidth: 300 } } }}
        >
          <MenuItem onClick={toggleZenMode} dense>
            <MuiListItemIcon sx={{ minWidth: 28 }}>
              <Checkbox
                checked={zenMode}
                size="small"
                sx={{ p: 0 }}
              />
            </MuiListItemIcon>
            <ListItemText primary="极简模式" secondary="隐藏边框与标题栏，仅保留内容" />
          </MenuItem>
          <MenuItem onClick={toggleHeadersHidden} dense>
            <MuiListItemIcon sx={{ minWidth: 28 }}>
              <Checkbox
                checked={headersHidden}
                size="small"
                sx={{ p: 0 }}
              />
            </MuiListItemIcon>
            <ListItemText primary="标题栏隐藏" />
          </MenuItem>
          <MenuItem onClick={toggleTabBarVertical} dense>
            <MuiListItemIcon sx={{ minWidth: 28 }}>
              <Checkbox checked={tabBarVertical} size="small" sx={{ p: 0 }} />
            </MuiListItemIcon>
            <ListItemText primary="标题栏竖排" />
          </MenuItem>
          <MenuItem onClick={handleSaveLayout}>
            <ListItemIcon><SaveLayoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>保存布局…</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={(e) => { setLayoutAnchor(e.currentTarget) }}
            onMouseEnter={(e) => setLayoutAnchor(e.currentTarget)}
          >
            <ListItemIcon><RestoreLayoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>已有布局</ListItemText>
          </MenuItem>
          <Menu
            anchorEl={layoutAnchor}
            open={Boolean(layoutAnchor)}
            onClose={() => setLayoutAnchor(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{ paper: { sx: { minWidth: 220 } } }}
          >
            <MenuItem onClick={() => handleApplyLayout('default')}>
              <ListItemIcon><RestoreLayoutIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="默认" secondary="恢复初始布局" />
            </MenuItem>
            {userLayouts.length > 0 && <Divider />}
            {userLayouts.map((l) => (
              <MenuItem key={l.id} onClick={() => handleApplyLayout(l)} sx={{ pr: 1 }}>
                <ListItemText
                  primary={l.name}
                  secondary={
                    <Typography variant="caption" color="text.secondary" component="span">
                      {new Date(l.savedAt).toLocaleString('zh-CN')}
                    </Typography>
                  }
                />
                <IconButton size="small" onClick={(e) => handleDeleteLayout(l.id as number, l.name, e)} sx={{ ml: 1 }}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </MenuItem>
            ))}
            {userLayouts.length === 0 && (
              <MenuItem disabled>
                <ListItemText secondary="暂无自定义布局" />
              </MenuItem>
            )}
          </Menu>
          <Divider />
          <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Tab 显隐</Typography>
          </Box>
          {PANEL_REGISTRY.filter((p) => {
            if (workbenchMode === 'translate') return !LOCKED_TAB_IDS.has(p.id)
            const allowIds: string[] = workbenchMode === 'dictionary' ? DICTIONARY_VISIBLE_TABS : MEMORY_VISIBLE_TABS
            return allowIds.includes(p.id)
          }).map((p) => {
            const visible = visibleTabs.includes(p.id)
            return (
              <MenuItem key={p.id} onClick={() => handleToggleTab(p.id)} dense>
                <MuiListItemIcon sx={{ minWidth: 28 }}>
                  <Checkbox checked={visible} size="small" sx={{ p: 0 }} />
                </MuiListItemIcon>
                <ListItemText primary={p.title} />
                <Box sx={{ ml: 1, color: 'text.secondary', display: 'flex' }}>{p.icon}</Box>
              </MenuItem>
            )
          })}
        </Menu>

        <Tooltip title="维护：云端同步 / 重启 / 设置 / 关于">
          <Button
            size="small"
            variant="text"
            color="inherit"
            startIcon={<SettingsIcon fontSize="small" />}
            onClick={(e) => setToolsAnchor(e.currentTarget)}
            sx={{ textTransform: 'none', fontWeight: 600, minWidth: 'auto' }}
          >
            维护
          </Button>
        </Tooltip>
        <Menu anchorEl={toolsAnchor} open={Boolean(toolsAnchor)} onClose={() => setToolsAnchor(null)}>
          <MenuItem onClick={() => { setToolsAnchor(null); openSettings('cloud') }}>
            <ListItemIcon><CloudSyncIcon fontSize="small" /></ListItemIcon>
            <ListItemText>云端同步（WebDAV）</ListItemText>
          </MenuItem>
          <MenuItem onClick={actRestartWorkbench}>
            <ListItemIcon><RestartIcon fontSize="small" /></ListItemIcon>
            <ListItemText>重启工作台</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setToolsAnchor(null); openSettings('basic') }}>
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>设置</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setToolsAnchor(null); setAboutOpen(true) }}>
            <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
            <ListItemText>关于</ListItemText>
          </MenuItem>
        </Menu>

        <Box sx={{ flex: 1 }} />

        <Tooltip title={theme === 'light' ? '切换深色主题' : '切换浅色主题'}>
          <IconButton size="small" onClick={toggleTheme} color="inherit">
            {theme === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* 保存布局 Dialog */}
      <Dialog open={saveLayoutOpen} onClose={() => setSaveLayoutOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>保存布局</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="布局名称"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmSaveLayout() }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveLayoutOpen(false)}>取消</Button>
          <Button onClick={handleConfirmSaveLayout} variant="contained" disabled={!layoutName.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 项目 / 文件 Dialogs */}
      <CreateProjectDialog open={createProjectOpen} onClose={() => setCreateProjectOpen(false)} />
      <ExportFileDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportFileDialog open={importFileOpen} onClose={() => setImportFileOpen(false)} />
      <ImportProjectDialog open={importProjectOpen} onClose={() => setImportProjectOpen(false)} />
      <ExportProjectDialog
        open={exportProjectOpen}
        mode="dialog"
        onClose={() => setExportProjectOpen(false)}
      />
      <DeleteProjectDialog
        open={deleteProjectOpen}
        projectId={deleteProjectId}
        onClose={() => { setDeleteProjectOpen(false); setDeleteProjectId(null) }}
      />
      {/* 重命名项目 Dialog：点击工具栏项目名 Chip 触发 */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
          <EditIcon color="primary" fontSize="small" />
          修改项目名称
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="请输入新的项目名称"
            sx={{ mt: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(async () => {
                  if (!currentProjectId || !renameValue.trim()) return
                  try {
                    await renameProject(currentProjectId, renameValue)
                    notify('success', '项目名称已更新')
                    setRenameOpen(false)
                  } catch (err) {
                    notify('error', `重命名失败：${(err as Error).message}`)
                  }
                })()
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={!renameValue.trim() || renameValue.trim() === currentProject?.name}
            onClick={async () => {
              if (!currentProjectId || !renameValue.trim()) return
              try {
                await renameProject(currentProjectId, renameValue)
                notify('success', '项目名称已更新')
                setRenameOpen(false)
              } catch (err) {
                notify('error', `重命名失败：${(err as Error).message}`)
              }
            }}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
      {/* 用户设置：导入文件选择器 */}
      <input
        ref={importUserSettingsFileRef}
        type="file"
        accept=".json,.cat-settings.json"
        style={{ display: 'none' }}
        onChange={handleImportUserSettingsFileChange}
      />
      {/* 用户设置：导入预览/确认 Dialog */}
      <Dialog
        open={importUserSettingsOpen}
        onClose={() => { if (!importUserSettingsSubmitting) { setImportUserSettingsOpen(false); setImportUserSettingsResult(null) } }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
          <ImportSettingsIcon color="warning" fontSize="small" />
          导入用户设置
        </DialogTitle>
        <DialogContent dividers>
          {!importUserSettingsBundle ? (
            <Typography variant="body2" color="text.secondary">正在读取文件…</Typography>
          ) : importUserSettingsResult ? (
            <>
              <Alert severity="success" sx={{ mb: 1.5 }}>
                导入完成，建议刷新页面以确保所有设置生效。
              </Alert>
              <Typography variant="body2" gutterBottom sx={{ mb: 0.5 }}>
                <strong>文件：</strong>{importUserSettingsFileName}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ mb: 0.5 }}>
                <strong>外观/偏好（localStorage）：</strong>成功 {importUserSettingsResult.localStorage.applied} 项，跳过 {importUserSettingsResult.localStorage.skipped} 项
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ mb: 0.5 }}>
                <strong>系统设置（db.settings）：</strong>成功 {importUserSettingsResult.dbSettings.applied} 项，跳过 {importUserSettingsResult.dbSettings.skipped} 项
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>自定义布局：</strong>新增 {importUserSettingsResult.userLayouts.added} 项，覆盖 {importUserSettingsResult.userLayouts.overwritten} 项，跳过 {importUserSettingsResult.userLayouts.skipped} 项
              </Typography>
            </>
          ) : (
            <>
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                导入将覆盖同名设置与同名布局，建议先「导出用户设置」备份当前配置。
              </Alert>
              <Typography variant="body2" gutterBottom sx={{ mb: 0.5 }}>
                <strong>文件：</strong>{importUserSettingsFileName}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ mb: 0.5 }}>
                <strong>导出时间：</strong>{new Date(importUserSettingsBundle.exportedAt).toLocaleString('zh-CN')}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ mb: 0.5 }}>
                <strong>外观/偏好（localStorage）：</strong>{Object.keys(importUserSettingsBundle.localStorage ?? {}).length} 项
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ mb: 0.5 }}>
                <strong>系统设置（db.settings）：</strong>{Object.keys(importUserSettingsBundle.dbSettings ?? {}).length} 项
              </Typography>
              <Typography variant="body2">
                <strong>自定义布局：</strong>{importUserSettingsBundle.userLayouts?.length ?? 0} 个
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          {importUserSettingsResult ? (
            <>
              <Button onClick={() => { setImportUserSettingsOpen(false); setImportUserSettingsResult(null) }}>
                关闭
              </Button>
              <Button
                variant="contained"
                onClick={() => { window.location.reload() }}
                startIcon={<ExportSettingsIcon />}
              >
                立即刷新页面
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => { setImportUserSettingsOpen(false) }}
                disabled={importUserSettingsSubmitting}
              >
                取消
              </Button>
              <Button
                variant="contained"
                color="warning"
                onClick={handleConfirmImportUserSettings}
                disabled={importUserSettingsSubmitting || !importUserSettingsBundle}
                startIcon={importUserSettingsSubmitting ? <CircularProgress size={16} /> : <ImportSettingsIcon />}
              >
                {importUserSettingsSubmitting ? '正在导入…' : '确认导入'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* 保存项目（静默下载，不弹窗）：每当 counter 变化触发一次下载 */}
      <SilentSaveBridge
        key={`silent-${silentSaveKey}`}
        counter={silentSaveKey}
      />
      {/* 关于弹窗 */}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {/* 设置弹窗（全屏） */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} initialSection={settingsInitialSection} />
    </AppBar>
  )
}

/* 内部 helper：给"保存项目"做真正的 silent 下载，不弹 UI。
 * 单独抽成一个小组件是因为 TopToolbar 里的 ExportProjectDialog 既做 dialog 模式也做 silent 容易冲突。
 * 当 counter 从 0 开始奇数次增加时，触发一次下载。 */
function SilentSaveBridge({ counter }: { counter: number }): ReactElement {
  const notify = useUIStore((s) => s.notify)
  const projects = useProjectStore((s) => s.projects)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const didRunRef = useRef(0)

  useEffect(() => {
    if (counter === 0) return
    if (didRunRef.current === counter) return
    didRunRef.current = counter
    ;(async () => {
      try {
        const {
          exportFilteredData, downloadJSON,
          SETTINGS_KEYS, getSetting, setSetting,
        } = await import('@/services/io')
        const hasCurrent = projects.some((p) => p.id === currentProjectId)
        const remembered = await getSetting<string>(
          SETTINGS_KEYS.LAST_PROJECT_SAVE_RANGE,
          hasCurrent ? 'current' : 'all',
        )
        const finalRange = remembered === 'current' && hasCurrent ? 'current' : 'all'
        const bundle = await exportFilteredData({
          range: finalRange as any,
          currentProjectId,
          excludeSettings: true,
        })
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
        const cur = projects.find((p) => p.id === currentProjectId)
        const base = (cur?.name ?? 'cat-project').replace(/[\\/:*?"<>|]/g, '_').trim() || 'cat-project'
        const fname = `${base}.${stamp}.cat-project.json`
        downloadJSON(bundle, fname)
        const summary =
          finalRange === 'current'
            ? `当前项目（${cur?.name ?? '-'}，${bundle.projects.length} 项目 / ${bundle.files.length} 文件 / ${bundle.segments.length} 段）`
            : `全量（${bundle.projects.length} 项目 / ${bundle.files.length} 文件 / ${bundle.segments.length} 段）`
        notify('success', `已保存：${fname} · ${summary}`)
        await setSetting(SETTINGS_KEYS.LAST_PROJECT_SAVE_RANGE, finalRange)
        if (finalRange === 'all') {
          await setSetting(SETTINGS_KEYS.BACKUP_LAST_FULL_DOWNLOAD_AT, Date.now())
        }
      } catch (e) {
        notify('error', `保存项目失败：${(e as Error).message}`)
      }
    })()
  }, [counter, projects, currentProjectId, notify])

  return <></>
}

/* 兜底：get() for recent menu —— 因为在 onclick 中需要读取最新的 projects，不能闭包 */
import { useProjectStore as _projectStore } from '@app/store'
function get() { return _projectStore.getState() }
