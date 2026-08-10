import { useState } from 'react'
import { Box, Paper, Tabs, Tab } from '@mui/material'
import TranslateIcon from '@mui/icons-material/Translate'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion'
import ScienceIcon from '@mui/icons-material/Science'
import FolderIcon from '@mui/icons-material/Folder'
import SettingsIcon from '@mui/icons-material/Settings'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import type { ReactElement } from 'react'
import {
  EditorPanel,
  TMPanel,
  TBPanel,
  MTPanel,
  ProjectPanel,
  SettingsPanel,
  DictPanel,
  AIQAPanel,
  AITranslatePanel,
} from './Panels'

type TabItem = {
  key: string
  label: string
  icon: ReactElement
  render: () => ReactElement
}

const TABS: TabItem[] = [
  { key: 'editor', label: '编辑器', icon: <TranslateIcon fontSize="small" />, render: () => <EditorPanel /> },
  { key: 'tm', label: 'TM', icon: <LibraryBooksIcon fontSize="small" />, render: () => <TMPanel /> },
  { key: 'tb', label: 'TB', icon: <BookmarkIcon fontSize="small" />, render: () => <TBPanel /> },
  { key: 'dict', label: '词典', icon: <MenuBookIcon fontSize="small" />, render: () => <DictPanel /> },
  { key: 'mt', label: 'MT', icon: <AutoAwesomeIcon fontSize="small" />, render: () => <MTPanel /> },
  { key: 'aitranslate', label: 'AI翻', icon: <ScienceIcon fontSize="small" />, render: () => <AITranslatePanel /> },
  { key: 'aiqa', label: 'AI', icon: <AutoAwesomeMotionIcon fontSize="small" />, render: () => <AIQAPanel /> },
  { key: 'project', label: '项目', icon: <FolderIcon fontSize="small" />, render: () => <ProjectPanel /> },
  { key: 'settings', label: '设置', icon: <SettingsIcon fontSize="small" />, render: () => <SettingsPanel /> },
]

export function MobileTabLayout(): ReactElement {
  const [tab, setTab] = useState<string>('editor')
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      }}
    >
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>{current.render()}</Box>
      <Paper square variant="outlined" sx={{ borderRadius: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          variant="fullWidth"
          sx={{ minHeight: 48 }}
        >
          {TABS.map((t) => (
            <Tab
              key={t.key}
              value={t.key}
              label={t.label}
              icon={t.icon}
              iconPosition="top"
              sx={{ minHeight: 56, fontSize: '0.7rem', py: 0.5 }}
            />
          ))}
        </Tabs>
      </Paper>
    </Box>
  )
}
