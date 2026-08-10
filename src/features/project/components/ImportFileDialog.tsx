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
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import type { ReactElement } from 'react'
import type { ParseGranularity } from '@/types'
import { useProjectStore } from '@app/store'

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportFileDialog({ open, onClose }: Props): ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [granularity, setGranularity] = useState<ParseGranularity>('paragraph')

  const importFile = useProjectStore((s) => s.importFile)
  const importProgress = useProjectStore((s) => s.importProgress)
  const notify = useProjectStore as any

  const isWorking = importProgress.stage === 'parsing' || importProgress.stage === 'saving'

  const reset = () => {
    setSelectedFile(null)
    useProjectStore.setState({ importProgress: { stage: 'idle', message: '' } })
  }

  const handleClose = () => {
    if (isWorking) return
    reset()
    onClose()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setSelectedFile(f)
      // 选择新文件时重置导入状态，让"开始导入"按钮恢复可用
      useProjectStore.setState({ importProgress: { stage: 'idle', message: '' } })
    }
    // 清空 input 的 value，避免选择同名文件时不触发 change 事件
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!selectedFile) return
    await importFile(selectedFile, granularity)
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
            {selectedFile ? `已选：${selectedFile.name}` : '选择文件 (PDF / DOCX / TXT / MD)'}
          </Button>
          {selectedFile && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              大小：{(selectedFile.size / 1024).toFixed(1)} KB · 类型：{selectedFile.name.split('.').pop()?.toUpperCase()}
            </Typography>
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

        {importProgress.stage !== 'idle' && (
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
            {importProgress.stage === 'done' && (
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
          {importProgress.stage === 'done' ? '关闭' : '取消'}
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={!selectedFile || isWorking || importProgress.stage === 'done'}
        >
          开始导入
        </Button>
      </DialogActions>
    </Dialog>
  )
}
