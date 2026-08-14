import type { ReactElement } from 'react'
import TranslateIcon from '@mui/icons-material/Translate'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import AssessmentIcon from '@mui/icons-material/Assessment'
import FolderIcon from '@mui/icons-material/Folder'
import PreviewIcon from '@mui/icons-material/Preview'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion'
import ScienceIcon from '@mui/icons-material/Science'
import MemoryIcon from '@mui/icons-material/Memory'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import HubIcon from '@mui/icons-material/Hub'
import {
  EditorPanel,
  TMPanel,
  TBPanel,
  MTPanel,
  QAPanel,
  ProjectPanel,
  DictPanel,
  AIQAPanel,
  AITranslatePanel,
  ProjectDictionaryLibraryPanel,
  ProjectMemoryLibraryPanel,
  FragmentSearchPanel,
} from './Panels'
import { PreviewPanel } from '@/features/preview/components/PreviewPanel'
import { CollabPanel } from '@/features/collab/components/CollabPanel'

export interface PanelDef {
  id: string
  title: string
  icon: ReactElement
  render: () => ReactElement
}

export const PANEL_REGISTRY: PanelDef[] = [
  { id: 'editor', title: '双语编辑器', icon: <TranslateIcon fontSize="small" />, render: () => <EditorPanel /> },
  { id: 'project', title: '项目文件', icon: <FolderIcon fontSize="small" />, render: () => <ProjectPanel /> },
  { id: 'tm', title: '翻译记忆', icon: <LibraryBooksIcon fontSize="small" />, render: () => <TMPanel /> },
  { id: 'tb', title: '术语显示', icon: <BookmarkIcon fontSize="small" />, render: () => <TBPanel /> },
  { id: 'dict', title: '词典查询', icon: <MenuBookIcon fontSize="small" />, render: () => <DictPanel /> },
  { id: 'mt', title: '机器翻译', icon: <AutoAwesomeIcon fontSize="small" />, render: () => <MTPanel /> },
  { id: 'aitranslate', title: 'AI翻译', icon: <ScienceIcon fontSize="small" />, render: () => <AITranslatePanel /> },
  { id: 'aiqa', title: 'AI问答', icon: <AutoAwesomeMotionIcon fontSize="small" />, render: () => <AIQAPanel /> },
  { id: 'qa', title: 'QA 质检', icon: <AssessmentIcon fontSize="small" />, render: () => <QAPanel /> },
  { id: 'preview', title: '全文预览', icon: <PreviewIcon fontSize="small" />, render: () => <PreviewPanel /> },
  { id: 'projectDictionary', title: '项目词典库', icon: <BookmarkIcon fontSize="small" />, render: () => <ProjectDictionaryLibraryPanel /> },
  { id: 'projectMemory', title: '项目记忆库', icon: <MemoryIcon fontSize="small" />, render: () => <ProjectMemoryLibraryPanel /> },
  { id: 'fragmentSearch', title: '片段搜索', icon: <ManageSearchIcon fontSize="small" />, render: () => <FragmentSearchPanel /> },
  { id: 'collab', title: '协同翻译', icon: <HubIcon fontSize="small" />, render: () => <CollabPanel /> },
]

export const PANEL_MAP: Record<string, PanelDef> = Object.fromEntries(
  PANEL_REGISTRY.map((p) => [p.id, p]),
)

export function getPanelDef(id: string): PanelDef | undefined {
  return PANEL_MAP[id]
}
