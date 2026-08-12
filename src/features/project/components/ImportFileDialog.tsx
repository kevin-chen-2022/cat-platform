import { useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
  Box,
  LinearProgress,
  Alert,
  IconButton,
  Chip,
  Stack,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import CheckIcon from '@mui/icons-material/Check'
import type { ReactElement } from 'react'
import type { ParseGranularity } from '@/types'
import { useProjectStore } from '@app/store'

interface ImportResult {
  name: string
  ok: boolean
  message: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportFileDialog({ open, onClose }: Props): ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [granularity, setGranularity] = useState<ParseGranularity>('paragraph')
  const [batchResults, setBatchResults] = useState<ImportResult[]>([])
  const [batchRunning, setBatchRunning] = useState(false)

  const importFile = useProjectStore((s) => s.importFile)
  const importProgress = useProjectStore((s) => s.importProgress)
  const notify = useProjectStore as any

  const isWorking = batchRunning || importProgress.stage === 'parsing' || importProgress.stage === 'saving'

  const reset = () => {
    setSelectedFiles([])
    setBatchResults([])
    setBatchRunning(false)
    useProjectStore.setState({ importProgress: { stage: 'idle', message: '' } })
  }

  const handleClose = () => {
    if (isWorking) return
    reset()
    onClose()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const arr = Array.from(files)
      setSelectedFiles(arr)
      setBatchResults([])
      // 选择新文件时重置导入状态，让"开始导入"按钮恢复可用
      useProjectStore.setState({ importProgress: { stage: 'idle', message: '' } })
    }
    // 清空 input 的 value，避免选择同名文件时不触发 change 事件
    e.target.value = ''
  }

  const handleImport = async () => {
    if (selectedFiles.length === 0) return
    setBatchRunning(true)
    setBatchResults([])
    const results: ImportResult[] = []
    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i]
      try {
        useProjectStore.setState({
          importProgress: {
            stage: 'parsing',
            message: `（${i + 1}/${selectedFiles.length}）正在解析：${f.name}`,
            page: 0,
            totalPages: 1,
          },
        })
        await importFile(f, granularity)
        const stage = useProjectStore.getState().importProgress.stage
        if (stage === 'error') {
          results.push({ name: f.name, ok: false, message: useProjectStore.getState().importProgress.message })
        } else {
          results.push({ name: f.name, ok: true, message: '导入成功' })
        }
      } catch (err) {
        results.push({ name: f.name, ok: false, message: (err as Error).message || '未知错误' })
      }
    }
    setBatchResults(results)
    setBatchRunning(false)
    const success = results.filter((r) => r.ok).length
    const fail = results.length - success
    if (results.length > 1) {
      notify(
        fail === 0 ? 'success' : fail === success ? 'warning' : fail > success ? 'error' : 'warning',
        `批量导入完成：成功 ${success} 个，失败 ${fail} 个`,
      )
    }
  }

  const progressPct =
    importProgress.totalPages && importProgress.totalPages > 0
      ? Math.round(((importProgress.page ?? 0) / importProgress.totalPages) * 100)
      : importProgress.stage === 'saving'
      ? 90
      : importProgress.stage === 'done'
      ? 100
      : 0

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadFileIcon color="primary" />
          <span>导入原文文件</span>
        </Box>
        <IconButton size="small" onClick={handleClose} disabled={isWorking}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.docx,.doc"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={isWorking}
            fullWidth
          >
            {selectedFiles.length > 0
              ? selectedFiles.length === 1
                ? `已选：${selectedFiles[0].name}`
                : `已选 ${selectedFiles.length} 个文件`
              : '选择文件 (PDF / DOCX / TXT / MD，支持多选)'}
          </Button>
          {selectedFiles.length > 0 && (
            <Box sx={{ mt: 1 }}>
              {selectedFiles.length === 1 ? (
                <Typography variant="caption" color="text.secondary">
                  大小：{(selectedFiles[0].size / 1024).toFixed(1)} KB · 类型：
                  {selectedFiles[0].name.split('.').pop()?.toUpperCase()}
                </Typography>
              ) : (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {selectedFiles.map((f, i) => (
                    <Chip key={i} size="small" variant="outlined" label={f.name} />
                  ))}
                </Stack>
              )}
            </Box>
          )}
        </Box>

        <FormControl fullWidth sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            解析粒度：
          </Typography>
          <RadioGroup row value={granularity} onChange={(_e, v) => setGranularity(v as ParseGranularity)}>
            <FormControlLabel value="paragraph" control={<Radio size="small" />} label="段落级" />
            <FormControlLabel value="sentence" control={<Radio size="small" />} label="句子级" />
            <FormControlLabel value="mixed" control={<Radio size="small" />} label="混合（长段切句）" />
          </RadioGroup>
        </FormControl>

        {batchResults.length > 0 && (
          <Stack spacing={0.5} sx={{ mt: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              批量导入结果
            </Typography>
            {batchResults.map((r, i) => (
              <Alert
                key={i}
                severity={r.ok ? 'success' : 'error'}
                icon={r.ok ? <CheckIcon fontSize="inherit" /> : <ErrorIcon fontSize="inherit" />}
                sx={{ py: 0.5 }}
              >
                {r.name} — {r.message}
              </Alert>
            ))}
          </Stack>
        )}

        {(importProgress.stage !== 'idle' || batchRunning) && (
          <Box sx={{ mt: 2 }}>
            {importProgress.stage === 'parsing' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {importProgress.message}
                </Typography>
                <LinearProgress variant="determinate" value={progressPct} />
              </>
            )}
            {importProgress.stage === 'saving' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {importProgress.message}
                </Typography>
                <LinearProgress />
              </>
            )}
            {importProgress.stage === 'done' && selectedFiles.length <= 1 && (
              <Alert severity="success" icon={<CheckCircleIcon />} sx={{ py: 0.5 }}>
                {importProgress.message}
              </Alert>
            )}
            {importProgress.stage === 'error' && (
              <Alert severity="error" icon={<ErrorIcon />} sx={{ py: 0.5 }}>
                {importProgress.message}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isWorking}>
          {importProgress.stage === 'done' || batchResults.length > 0 ? '关闭' : '取消'}
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={
            selectedFiles.length === 0 ||
            isWorking ||
            batchResults.length > 0
          }
        >
          {selectedFiles.length > 1
            ? `批量导入 ${selectedFiles.length} 个文件`
            : '开始导入'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
