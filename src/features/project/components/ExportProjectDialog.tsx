import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import type { ReactElement } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, CircularProgress, Radio, RadioGroup,
  FormControlLabel, FormLabel, TextField, Alert, Tooltip, IconButton,
} from '@mui/material'
import SaveAsIcon from '@mui/icons-material/SaveAs'
import CloseIcon from '@mui/icons-material/Close'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { useUIStore, useProjectStore } from '@app/store'
import {
  exportFilteredData, downloadJSON, type ExportRange,
  SETTINGS_KEYS, getSetting, setSetting,
} from '@/services/io'

type Props = {
  open: boolean
  /** silent=true：静默下载（"保存项目"菜单项，不弹 dialog），由父组件直接 render 触发 */
  mode?: 'dialog' | 'silent'
  onClose: () => void
}

const FILE_NAME_REGEX = /[\\/:*?"<>|]/g

function formatDateForFile(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export function ExportProjectDialog({ open, mode = 'dialog', onClose }: Props): ReactElement {
  const notify = useUIStore((s) => s.notify)
  const projects = useProjectStore((s) => s.projects)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)

  const [range, setRange] = useState<ExportRange>('current')
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [silentDoneAt, setSilentDoneAt] = useState<number | null>(null)
  const loadedDefaultsRef = useRef(false)

  const currentProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  )
  const hasCurrent = currentProject != null

  const reset = useCallback(async () => {
    const remembered: ExportRange = (await getSetting<ExportRange>(
      SETTINGS_KEYS.LAST_PROJECT_SAVE_RANGE,
      hasCurrent ? 'current' : 'all',
    )) as ExportRange
    const safeRange: ExportRange = remembered === 'current'
      ? hasCurrent ? 'current' : 'all'
      : remembered
    setRange(safeRange)
    const now = new Date()
    const base = currentProject?.name?.replace(FILE_NAME_REGEX, '_')?.trim() || 'cat-project'
    setFileName(`${base}.${formatDateForFile(now)}`)
  }, [hasCurrent, currentProject])

  // open 时：加载默认值 + 如果是 silent 模式立即执行一次下载
  useEffect(() => {
    if (!open) return
    if (!loadedDefaultsRef.current) {
      loadedDefaultsRef.current = true
      void reset()
    } else {
      void reset()
    }
    if (mode === 'silent') {
      setSilentDoneAt(Date.now())
    }
  }, [open, mode, reset])

  // silent 模式触发：下载后自动关闭
  useEffect(() => {
    if (!open || mode !== 'silent' || !silentDoneAt) return
    let cancelled = false
    ;(async () => {
      setSubmitting(true)
      try {
        const remembered: ExportRange = (await getSetting<ExportRange>(
          SETTINGS_KEYS.LAST_PROJECT_SAVE_RANGE,
          hasCurrent ? 'current' : 'all',
        )) as ExportRange
        const finalRange: ExportRange = remembered === 'current'
          ? hasCurrent ? 'current' : 'all'
          : remembered
        const bundle = await exportFilteredData({
          range: finalRange,
          currentProjectId,
          excludeSettings: true,
        })
        const now = new Date()
        const base = currentProject?.name?.replace(FILE_NAME_REGEX, '_')?.trim() || 'cat-project'
        const fname = `${base}.${formatDateForFile(now)}.cat-project.json`
        downloadJSON(bundle, fname)
        const summary =
          finalRange === 'current'
            ? `当前项目（${currentProject?.name ?? '-'}，${bundle.projects.length} 个项目 / ${bundle.files.length} 文件 / ${bundle.segments.length} 段）`
            : `全量（${bundle.projects.length} 项目 / ${bundle.files.length} 文件 / ${bundle.segments.length} 段）`
        notify('success', `已保存：${fname} · ${summary}`)
        setSetting(SETTINGS_KEYS.LAST_PROJECT_SAVE_RANGE, finalRange)
        // 顺便把"上次全量下载备份"写入（用于备份提醒的判断）
        if (finalRange === 'all') {
          setSetting(SETTINGS_KEYS.BACKUP_LAST_FULL_DOWNLOAD_AT, Date.now())
        }
      } catch (e) {
        notify('error', `保存失败：${(e as Error).message}`)
      } finally {
        if (!cancelled) {
          setSubmitting(false)
          setSilentDoneAt(null)
          onClose()
        }
      }
    })()
    return () => { cancelled = true }
  }, [silentDoneAt, mode, open, hasCurrent, currentProjectId, currentProject, notify, onClose])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const bundle = await exportFilteredData({
        range,
        currentProjectId,
        excludeSettings: true,
      })
      const safe = fileName.replace(FILE_NAME_REGEX, '_').trim() || 'cat-project'
      const fname = `${safe}.cat-project.json`
      downloadJSON(bundle, fname)
      const summary =
        range === 'current'
          ? `${currentProject?.name ?? '当前项目'}（${bundle.projects.length} 项目 / ${bundle.files.length} 文件 / ${bundle.segments.length} 段）`
          : `全量（${bundle.projects.length} 项目 / ${bundle.files.length} 文件 / ${bundle.segments.length} 段）`
      notify('success', `已另存为：${fname} · ${summary}`)
      setSetting(SETTINGS_KEYS.LAST_PROJECT_SAVE_RANGE, range)
      if (range === 'all') {
        setSetting(SETTINGS_KEYS.BACKUP_LAST_FULL_DOWNLOAD_AT, Date.now())
      }
    } catch (e) {
      notify('error', `另存为失败：${(e as Error).message}`)
    } finally {
      setSubmitting(false)
      onClose()
    }
  }

  if (mode === 'silent') {
    // silent 模式不渲染 UI（只用 useEffect 做动作）
    return <></>
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
        <SaveAsIcon color="primary" fontSize="small" />
        另存项目为
        <Box sx={{ flex: 1 }} />
        <Tooltip title="关闭">
          <IconButton size="small" onClick={onClose} disabled={submitting}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          {!hasCurrent && range === 'current' && (
            <Alert severity="warning">当前未选择项目，将自动改为「全量」范围导出。</Alert>
          )}
          <Box>
            <FormLabel component="legend" sx={{ fontSize: '0.85rem', mb: 0.5 }}>导出范围（不包含设置项；设置项请从设置卡片单独导出/导入）</FormLabel>
            <RadioGroup row value={range} onChange={(e) => setRange(e.target.value as ExportRange)}>
              <FormControlLabel
                value="current"
                disabled={!hasCurrent}
                control={<Radio size="small" />}
                label={hasCurrent ? `仅当前项目（${currentProject.name}）` : '仅当前项目（无激活项目）'}
              />
              <FormControlLabel value="all" control={<Radio size="small" />} label={`全量导出（${projects.length} 个项目，含所有文件/段/TM/TB）`} />
            </RadioGroup>
          </Box>
          <Box>
            <FormLabel
              component="label"
              htmlFor="export-project-filename"
              sx={{ fontSize: '0.85rem', mb: 0.5, display: 'block' }}
            >
              文件名
            </FormLabel>
            <TextField
              id="export-project-filename"
              size="small"
              fullWidth
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              helperText={'.cat-project.json 将自动追加；文件名中的非法字符 \\/:*?"<>| 会被自动替换为 _'}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>取消</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting || !fileName.trim()}
          startIcon={submitting ? <CircularProgress size={16} /> : <FileDownloadIcon fontSize="small" />}
        >
          {submitting ? '导出中…' : '另存为'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
