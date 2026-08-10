import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, CircularProgress, Alert,
  IconButton, Tooltip, FormControlLabel, Checkbox, Stack, Chip,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import WarningRoundedIcon from '@mui/icons-material/ErrorOutlined'
import CloseIcon from '@mui/icons-material/Close'
import DescriptionIcon from '@mui/icons-material/Description'
import SegmentIcon from '@mui/icons-material/ViewHeadline'
import MemoryIcon from '@mui/icons-material/Memory'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import { useUIStore, useProjectStore } from '@app/store'
import { db } from '@data/db'
import { createSnapshot } from '@/services/io/backup-scheduler'
import type { ID, Project } from '@/types'

type Props = {
  open: boolean
  /** 待删除项目 id；为 null 时不渲染内容 */
  projectId: ID | null
  onClose: () => void
}

interface ProjectStats {
  fileCount: number
  segmentCount: number
  tmCount: number
  tbCount: number
}

export function DeleteProjectDialog({ open, projectId, onClose }: Props): ReactElement {
  const notify = useUIStore((s) => s.notify)
  const projects = useProjectStore((s) => s.projects)
  const deleteProject = useProjectStore((s) => s.deleteProject)

  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const project: Project | null = useMemo(
    () => (projectId != null ? projects.find((p) => p.id === projectId) ?? null : null),
    [projects, projectId],
  )

  // 打开/切换项目时：加载统计 + 重置确认状态
  useEffect(() => {
    if (!open || projectId == null) {
      setStats(null)
      setAcknowledged(false)
      return
    }
    let cancelled = false
    setLoadingStats(true)
    setAcknowledged(false)
    ;(async () => {
      try {
        const pid = projectId as number
        const fileRows = await db.files.where({ projectId: pid }).toArray()
        const fileIds = fileRows.map((f) => f.id as number)
        const segmentCount = fileIds.length > 0
          ? await db.segments.where('fileId').anyOf(fileIds).count()
          : 0
        const tmCount = await db.tmEntries.where('projectId').equals(pid).count()
        const tbCount = await db.tbEntries
          .filter((row) => row.projectId != null && String(row.projectId) === String(pid))
          .count()
        if (!cancelled) {
          setStats({
            fileCount: fileRows.length,
            segmentCount,
            tmCount,
            tbCount,
          })
        }
      } catch (e) {
        if (!cancelled) {
          notify('error', `统计项目数据失败：${(e as Error).message}`)
        }
      } finally {
        if (!cancelled) setLoadingStats(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, projectId, notify])

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const handleConfirm = async () => {
    if (!project?.id || !acknowledged || submitting) return
    setSubmitting(true)
    try {
      // 1. 强制创建删前快照（无论自动备份是否开启），保留恢复兜底
      let snapshotOk = false
      try {
        const snap = await createSnapshot(
          { currentProjectId: project.id, currentProjectName: project.name },
          { force: true },
        )
        snapshotOk = snap != null
      } catch (e) {
        // 快照失败不阻断删除，但要在反馈里提示
        console.error('[CAT] pre-delete snapshot failed:', e)
      }

      // 2. 执行级联删除（含项目级 TM/TB；recent 列表由 store 内部清理）
      await deleteProject(project.id)

      const snapHint = snapshotOk ? '· 已创建删前快照，可从「设置 → 数据备份」恢复' : '· 删前快照失败，建议检查备份配置'
      notify('success', `已删除项目「${project.name}」${snapHint}`)
      onClose()
    } catch (e) {
      notify('error', `删除失败：${(e as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open && projectId != null}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      sx={{ '& .MuiDialog-paper': { minWidth: 360 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.5, color: 'error.main' }}>
        <DeleteOutlineIcon color="error" fontSize="small" />
        删除项目
        <Box sx={{ flex: 1 }} />
        <Tooltip title="关闭">
          <IconButton size="small" onClick={handleClose} disabled={submitting}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {!project ? (
          <Alert severity="warning">未找到待删除的项目（可能已被移除）。</Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Alert
              severity="error"
              icon={<WarningRoundedIcon />}
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'error.main',
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(211,47,47,0.08)' : 'rgba(244,67,54,0.08)',
              }}
            >
              <Typography variant="subtitle2" color="error" sx={{ fontWeight: 700 }}>
                ⚠ 危险操作：将永久删除项目及其所有数据
              </Typography>
              <Typography variant="body2" color="error">
                删除前会自动创建一份快照（可从「设置 → 数据备份」恢复），但请谨慎操作。
              </Typography>
            </Alert>

            <Box>
              <Typography variant="caption" color="text.secondary">项目名称</Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {project.name}
              </Typography>
              {project.sourceLang && project.targetLang && (
                <Typography variant="caption" color="text.secondary">
                  {project.sourceLang} → {project.targetLang}
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                将一并删除的数据
              </Typography>
              {loadingStats ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={14} />
                  <Typography variant="body2" color="text.secondary">统计中…</Typography>
                </Box>
              ) : stats ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip size="small" icon={<DescriptionIcon />} label={`${stats.fileCount} 个文件`} color="error" variant="outlined" />
                  <Chip size="small" icon={<SegmentIcon />} label={`${stats.segmentCount} 个段落`} color="error" variant="outlined" />
                  <Chip size="small" icon={<MemoryIcon />} label={`${stats.tmCount} 条项目记忆`} color="error" variant="outlined" />
                  <Chip size="small" icon={<BookmarkIcon />} label={`${stats.tbCount} 条项目术语`} color="error" variant="outlined" />
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">无法获取统计信息</Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                全局共享的记忆库/术语库条目（不属于任何项目）将保留。
              </Typography>
            </Box>

            <FormControlLabel
              control={
                <Checkbox
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  color="error"
                  size="small"
                />
              }
              label={
                <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
                  我已知晓此操作不可逆，确认删除项目及其所有数据
                </Typography>
              }
              sx={{ alignItems: 'flex-start', mx: 0 }}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>取消</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={submitting || !project || !acknowledged}
          startIcon={submitting ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
        >
          {submitting ? '删除中…' : '确认删除'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
