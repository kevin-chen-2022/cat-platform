import { useRef } from 'react'
import { useState, useCallback, useEffect } from 'react'
import { Paper, Stack, Typography, useTheme, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material'
import TranslateIcon from '@mui/icons-material/Translate'
import StorageIcon from '@mui/icons-material/Storage'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { ReactElement } from 'react'
import { useProjectStore, useUIStore } from '@app/store'

export function BottomStatusBar(): ReactElement {
  const theme = useTheme()
  const projects = useProjectStore((s) => s.projects)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const files = useProjectStore((s) => s.files)
  const segments = useProjectStore((s) => s.segments)
  const activeSegmentId = useProjectStore((s) => s.activeSegmentId)
  const selectSegment = useProjectStore((s) => s.selectSegment)
  const notify = useUIStore((s) => s.notify)

  const translated = segments.filter((s) => s.status !== 'untranslated').length
  const activeIdx = activeSegmentId != null
    ? segments.findIndex((s) => s.id === activeSegmentId)
    : -1
  const total = segments.length
  const percent = total > 0 ? Math.round((translated / total) * 100) : 0

  const [gotoOpen, setGotoOpen] = useState(false)
  const [gotoValue, setGotoValue] = useState('')
  const gotoInputRef = useRef<HTMLInputElement | null>(null)

  // 打开对话框：选中输入框内容，便于直接输入数字
  useEffect(() => {
    if (!gotoOpen) return
    const t = window.setTimeout(() => {
      const el = gotoInputRef.current
      if (!el) return
      el.focus()
      try { el.select() } catch { /* noop */ }
    }, 0)
    return () => window.clearTimeout(t)
  }, [gotoOpen])

  const openGotoDialog = useCallback(() => {
    if (total <= 0) {
      notify('warning', '当前没有可跳转的段落，请先导入文件或生成数据')
      return
    }
    setGotoValue(activeIdx >= 0 ? String(activeIdx + 1) : '1')
    setGotoOpen(true)
  }, [total, activeIdx, notify])

  const handleGoto = useCallback(() => {
    const n = parseInt(gotoValue.trim(), 10)
    if (!Number.isFinite(n) || n < 1 || n > total) {
      notify('error', `请输入 1 ~ ${total} 之间的段落序号`)
      return
    }
    const target = segments[n - 1]
    if (target && target.id != null) {
      selectSegment(target.id)
      notify('success', `已跳转至第 ${n} 段`)
      setGotoOpen(false)
    }
  }, [gotoValue, total, segments, selectSegment, notify])

  const btnSx = {
    color: 'text.secondary',
    p: 0,
    minWidth: 'auto',
    lineHeight: 1,
    '&:hover': { bgcolor: 'transparent', textDecoration: 'underline', color: 'text.primary' },
    '&.MuiButton-text': { textTransform: 'none' },
  }

  return (
    <Paper
      variant="outlined"
      square
      sx={{
        px: 2,
        py: 0.5,
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: 0,
        backgroundColor:
          theme.palette.mode === 'dark'
            ? 'rgba(255,255,255,0.03)'
            : 'rgba(0,0,0,0.02)',
      }}
    >
      <Stack direction="row" spacing={2.5} sx={{ minHeight: 26, alignItems: 'center' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <TranslateIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            {projects.length} 个项目
            {currentProjectId ? ` · ${files.length} 个文件 · ${total} 段` : ''}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <CheckCircleIcon fontSize="small" color="action" />
          {activeIdx >= 0 && total > 0 ? (
            <>
              <Button variant="text" size="small" onClick={openGotoDialog} sx={btnSx}>
                <Typography variant="caption" component="span" sx={{ color: 'inherit' }}>
                  位置 {activeIdx + 1}/{total}
                </Typography>
              </Button>
              <Typography variant="caption" color="text.disabled">·</Typography>
            </>
          ) : null}
          <Button variant="text" size="small" onClick={openGotoDialog} sx={btnSx}>
            <Typography variant="caption" component="span" sx={{ color: 'inherit' }}>
              已译 {translated}/{total}{total > 0 ? ` (${percent}%)` : ''}
            </Typography>
          </Button>
        </Stack>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <StorageIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            本地 IndexedDB · WebDAV 预留
          </Typography>
        </Stack>

        <div style={{ flex: 1 }} />

        <Typography variant="caption" color="text.secondary">
          v0.1.0 · PWA Ready
        </Typography>
      </Stack>

      <Dialog
        open={gotoOpen}
        onClose={() => setGotoOpen(false)}
        maxWidth="xs"
        fullWidth
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleGoto()
          }
        }}
      >
        <DialogTitle>跳转至段落</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            inputRef={(el) => { gotoInputRef.current = el }}
            label={`段落序号（1 ~ ${total}）`}
            fullWidth
            size="small"
            type="number"
            value={gotoValue}
            onChange={(e) => setGotoValue(e.target.value)}
            helperText={total > 0 ? `输入 1 到 ${total} 的整数，回车确认` : '暂无段落'}
            slotProps={{ htmlInput: { min: 1, max: total, step: 1 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGotoOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleGoto} disabled={total <= 0}>
            跳转
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
