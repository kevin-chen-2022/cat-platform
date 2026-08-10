import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Autocomplete,
  Box,
  Typography,
  MenuItem,
  Switch,
  FormControlLabel,
} from '@mui/material'
import type { ReactElement } from 'react'
import { useProjectStore, useUIStore } from '@app/store'

/** 常用语言列表（用于 Autocomplete，同时允许自由输入 BCP-47 代码） */
const COMMON_LANGS: Array<{ code: string; label: string }> = [
  { code: 'zh-CN', label: '中文（简体）' },
  { code: 'zh-TW', label: '中文（繁体）' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'it', label: '意大利语' },
  { code: 'ar', label: '阿拉伯语' },
  { code: 'th', label: '泰语' },
  { code: 'vi', label: '越南语' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function CreateProjectDialog({ open, onClose }: Props): ReactElement | null {
  const createProject = useProjectStore((s) => s.createProject)
  const selectProject = useProjectStore((s) => s.selectProject)
  const projects = useProjectStore((s) => s.projects)
  const notify = useUIStore((s) => s.notify)

  const [name, setName] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('zh-CN')
  const [description, setDescription] = useState('')
  const [autoSwitch, setAutoSwitch] = useState(true)
  const [nameError, setNameError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 打开时重置表单 & 预填项目名
  useEffect(() => {
    if (open) {
      setName(`项目 ${projects.length + 1}`)
      setSourceLang('en')
      setTargetLang('zh-CN')
      setDescription('')
      setAutoSwitch(true)
      setNameError('')
      setSubmitting(false)
    }
  }, [open, projects.length])

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('项目名称不能为空')
      return
    }
    const src = sourceLang.trim() || 'en'
    const tgt = targetLang.trim() || 'zh-CN'
    if (src === tgt) {
      notify('warning', '源语言和目标语言不能相同')
      return
    }
    setSubmitting(true)
    try {
      const id = await createProject({
        name: trimmed,
        sourceLang: src,
        targetLang: tgt,
        description: description.trim() || undefined,
      })
      if (autoSwitch) {
        await selectProject(id)
        notify('success', `已创建并切换到项目：${trimmed}`)
      } else {
        notify('success', `已创建项目：${trimmed}`)
      }
      onClose()
    } catch (err) {
      notify('error', `创建项目失败：${(err as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }, [name, sourceLang, targetLang, description, autoSwitch, createProject, selectProject, notify, onClose])

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>新建项目</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label="项目名称"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            error={!!nameError}
            helperText={nameError}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Autocomplete
              freeSolo
              options={COMMON_LANGS}
              getOptionLabel={(opt) => typeof opt === 'string' ? opt : `${opt.code} — ${opt.label}`}
              renderOption={(props, opt) => {
                const { key, ...rest } = props as any
                return (
                  <MenuItem key={opt.code} {...rest}>
                    <Typography variant="body2" component="span" sx={{ fontWeight: 600, minWidth: 64 }}>
                      {opt.code}
                    </Typography>
                    <Typography variant="body2" component="span" color="text.secondary">
                      {opt.label}
                    </Typography>
                  </MenuItem>
                )
              }}
              value={sourceLang}
              onInputChange={(_, v) => setSourceLang(v)}
              renderInput={(params) => (
                <TextField {...params} label="源语言" helperText="可输入或选择" size="small" />
              )}
              sx={{ flex: 1 }}
            />
            <Autocomplete
              freeSolo
              options={COMMON_LANGS}
              getOptionLabel={(opt) => typeof opt === 'string' ? opt : `${opt.code} — ${opt.label}`}
              renderOption={(props, opt) => {
                const { key, ...rest } = props as any
                return (
                  <MenuItem key={opt.code} {...rest}>
                    <Typography variant="body2" component="span" sx={{ fontWeight: 600, minWidth: 64 }}>
                      {opt.code}
                    </Typography>
                    <Typography variant="body2" component="span" color="text.secondary">
                      {opt.label}
                    </Typography>
                  </MenuItem>
                )
              }}
              value={targetLang}
              onInputChange={(_, v) => setTargetLang(v)}
              renderInput={(params) => (
                <TextField {...params} label="目标语言" helperText="可输入或选择" size="small" />
              )}
              sx={{ flex: 1 }}
            />
          </Box>
          <TextField
            fullWidth
            multiline
            maxRows={3}
            label="项目描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
          />
          <FormControlLabel
            control={<Switch size="small" checked={autoSwitch} onChange={(e) => setAutoSwitch(e.target.checked)} />}
            label="创建后自动切换到该项目"
            sx={{ alignSelf: 'flex-start' }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>取消</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting || !name.trim()}
        >
          {submitting ? '创建中…' : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
