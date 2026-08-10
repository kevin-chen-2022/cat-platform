import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Box, Typography, Stack, Button, Paper } from '@mui/material'
import TranslateIcon from '@mui/icons-material/Translate'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import FileOpenIcon from '@mui/icons-material/FileOpen'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'

type Props = {
  onNewProject: () => void
  onOpenProject: () => void
}

export function WelcomePlaceholder({ onNewProject, onOpenProject }: Props): ReactElement {
  const year = useMemo(() => new Date().getFullYear(), [])
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 480,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 720,
          width: '100%',
          borderRadius: 3,
          p: 4,
          border: '1px solid',
          borderColor: 'divider',
          background: (t) => t.palette.mode === 'dark'
            ? 'linear-gradient(180deg, rgba(66,165,245,0.06), transparent 70%)'
            : 'linear-gradient(180deg, rgba(25,118,210,0.05), transparent 70%)',
        }}
      >
        <Stack spacing={2.5} sx={{ alignItems: 'flex-start' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                p: 1.2,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'inline-flex',
              }}
            >
              <TranslateIcon fontSize="large" />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
                CAT 工作台
              </Typography>
              <Typography variant="body2" color="text.secondary">
                本地化翻译工程 · 项目级词典 + 翻译记忆 + 双语对照编辑
              </Typography>
            </Box>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
            工作区已退出。可从上方「项目」菜单重新打开，或通过下方快捷入口继续：
          </Typography>

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<PlaylistAddIcon />}
              onClick={onNewProject}
            >
              新建项目…
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<FileOpenIcon />}
              onClick={onOpenProject}
            >
              打开项目存档…
            </Button>
          </Stack>

          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              常见操作入口（均在顶部菜单栏）
            </Typography>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
              {[
                ['项目 ▼ / 最近项目', '从历史记录快速打开'],
                ['项目 ▼ / 另存为', '导出项目存档（可分享 / 备份）'],
                ['文件 ▼ / 导入原文', '导入 txt/md/docx/pdf/xlsx…'],
              ].map(([title, sub]) => (
                <Box
                  key={title}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    px: 1.5,
                    py: 1,
                    minWidth: 220,
                  }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <LibraryBooksIcon fontSize="small" color="action" />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{sub}</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>

          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.disabled">
            © {year} CAT 工作台 v0.1 · 项目数据保存在浏览器本地（IndexedDB），建议定期「另存为」做离线备份。
          </Typography>
        </Stack>
      </Paper>
    </Box>
  )
}
