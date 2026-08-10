import { useState, useRef, useCallback } from 'react'
import type { ReactElement } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, CircularProgress, Radio, RadioGroup,
  FormControlLabel, FormLabel, Alert, IconButton, Tooltip, Chip,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import WarningIcon from '@mui/icons-material/WarningAmber'
import WarningRoundedIcon from '@mui/icons-material/ErrorOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined'
import CloseIcon from '@mui/icons-material/Close'
import { useUIStore, useProjectStore } from '@app/store'
import { importAllData, readJSONFile, type CATExportBundle, type ImportStrategy, type ImportStats } from '@/services/io'

type Props = {
  open: boolean
  onClose: () => void
}

/** 红色警告 + 二次确认（wipe 策略用） */
function WipeConfirm(props: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!props.open) return null
  return (
    <Alert
      severity="error"
      icon={<WarningRoundedIcon />}
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'error.main',
        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(211,47,47,0.08)' : 'rgba(244,67,54,0.08)',
      }}
      action={
        <Box sx={{ display: 'flex', gap: 1, alignSelf: 'center' }}>
          <Button color="inherit" size="small" onClick={props.onCancel}>取消</Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={props.onConfirm}
            sx={{ fontWeight: 600 }}
          >
            确认清空并导入
          </Button>
        </Box>
      }
    >
      <Typography variant="subtitle2" color="error" sx={{ fontWeight: 700 }}>
        ⚠ 危险操作：导入前将清空所有项目、文件、段落、术语库、翻译记忆库。
      </Typography>
      <Typography variant="body2" color="error">
        此操作不可恢复。建议先到「项目菜单 → 另存项目为…」做一份全量备份。
      </Typography>
    </Alert>
  )
}

export function ImportProjectDialog({ open, onClose }: Props): ReactElement {
  const notify = useUIStore((s) => s.notify)
  const loadProjects = useProjectStore((s) => s.loadProjects)

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [strategy, setStrategy] = useState<ImportStrategy>('merge')
  const [submitting, setSubmitting] = useState(false)
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [wipeConfirmOpen, setWipeConfirmOpen] = useState(false)

  const reset = useCallback(() => {
    setFile(null)
    setStrategy('merge')
    setSubmitting(false)
    setStats(null)
    setWipeConfirmOpen(false)
  }, [])

  const handleClose = useCallback(() => {
    if (submitting) return
    reset()
    onClose()
  }, [submitting, onClose, reset])

  const handlePick = () => { fileRef.current?.click() }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      setFile(files[0])
      setStats(null)
    }
    // reset input value 以便下次重选同一文件
    e.target.value = ''
  }

  const formatStats = (s: ImportStats) => {
    if (s.projects.wiped) {
      return `重建 ${s.projects.added} 个项目 / ${s.folders} 个文件夹 / ${s.files} 个文件 / ${s.segments} 段；TM 新增 ${s.tmEntries.added}、重复跳过 ${s.tmEntries.skipped}；术语库 新增 ${s.tbEntries.added}、重复跳过 ${s.tbEntries.skipped}`
    }
    return `项目：新增 ${s.projects.added}，覆盖 ${s.projects.overwritten}；文件夹 ${s.folders}；文件 ${s.files}；段 ${s.segments}；TM 新增 ${s.tmEntries.added} / 跳过 ${s.tmEntries.skipped}；术语库 新增 ${s.tbEntries.added} / 跳过 ${s.tbEntries.skipped}`
  }

  const doImport = async (finalStrategy: ImportStrategy) => {
    if (!file) return
    setSubmitting(true)
    setStats(null)
    try {
      const bundle = await readJSONFile<CATExportBundle>(file)
      if (!bundle || bundle.version !== '1.0' || !Array.isArray(bundle.projects) || !Array.isArray(bundle.segments)) {
        throw new Error('文件不是有效的项目存档（缺少 version=1.0 / projects / segments）')
      }
      const st = await importAllData(bundle, finalStrategy)
      setStats(st)
      await loadProjects()
      notify('success', '项目导入完成')
    } catch (e) {
      notify('error', `导入失败：${(e as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!file) { notify('warning', '请先选择 .cat-project.json 文件'); return }
    if (strategy === 'wipe') {
      setWipeConfirmOpen(true)
      return
    }
    await doImport(strategy)
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      sx={{ '& .MuiDialog-paper': { minHeight: 360 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
        <UploadFileIcon color="primary" fontSize="small" />
        打开（导入）项目存档
        <Box sx={{ flex: 1 }} />
        <Tooltip title="关闭">
          <IconButton size="small" onClick={handleClose} disabled={submitting}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {stats && (
            <Alert severity="success" icon={<CheckCircleIcon />}>
              <Typography variant="subtitle2">导入完成</Typography>
              <Typography variant="body2" color="text.secondary">{formatStats(stats)}</Typography>
            </Alert>
          )}

          <Box
            sx={{
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              p: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              bgcolor: 'action.hover',
            }}
          >
            <UploadFileIcon color="action" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {file ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label="已选择" size="small" color="success" variant="outlined" />
                  <Typography variant="body2" noWrap title={file.name}>
                    {file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(file.size / 1024).toFixed(1)} KB
                  </Typography>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  尚未选择项目存档文件（.cat-project.json）
                </Typography>
              )}
            </Box>
            <Button size="small" variant="outlined" onClick={handlePick} disabled={submitting}>
              {file ? '重新选择' : '选择文件…'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".cat-project.json,.json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </Box>

          <Box>
            <FormLabel component="legend" sx={{ fontSize: '0.85rem', mb: 0.5 }}>
              导入策略
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                （默认合并：不破坏已有项目，按 ID 同步覆盖）
              </Typography>
            </FormLabel>
            <RadioGroup value={strategy} onChange={(e) => setStrategy(e.target.value as ImportStrategy)} sx={{ gap: 0.25 }}>
              <FormControlLabel
                value="merge"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>合并导入（推荐）</Typography>
                    <Typography variant="caption" color="text.secondary">按 ID upsert，同 ID 的数据以导入版本为准（覆盖），保留所有现有项目</Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="append"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>追加为新项目</Typography>
                    <Typography variant="caption" color="text.secondary">重写所有项目/文件/段的 ID，绝不会覆盖你现有的任何项目</Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="wipe"
                control={<Radio size="small" color="error" />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                      <WarningIcon fontSize="small" /> 清空后导入（危险）
                    </Typography>
                    <Typography variant="caption" color="text.secondary">先删除现有项目、文件、段、术语库、记忆库，再写入导入内容（设置项不触碰）</Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </Box>

          {strategy === 'wipe' && <WipeConfirm open={wipeConfirmOpen} onCancel={() => setWipeConfirmOpen(false)} onConfirm={() => doImport('wipe')} />}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          关闭
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !file}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? '导入中…' : stats ? '再次导入' : '开始导入'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
