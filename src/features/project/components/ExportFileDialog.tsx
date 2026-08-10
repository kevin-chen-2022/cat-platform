import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material'
import type { ReactElement } from 'react'
import { useProjectStore, useUIStore } from '@app/store'
import { db } from '@data/db'
import type { File as ProjectFile, Segment, ID } from '@/types'

type ExportScope = 'active' | 'all'
type ExportContent = 'bilingual' | 'target'
type ExportFormat = 'source' | 'txt' | 'md' | 'json'

interface Props {
  open: boolean
  onClose: () => void
}

/** 源文件格式 → 导出扩展名映射（二进制格式降级为 txt） */
function formatToExt(format: ProjectFile['format']): { ext: string; degraded: boolean } {
  switch (format) {
    case 'txt': return { ext: 'txt', degraded: false }
    case 'md':
    case 'markdown': return { ext: 'md', degraded: false }
    case 'json': return { ext: 'json', degraded: false }
    case 'csv': return { ext: 'csv', degraded: false }
    case 'xliff': return { ext: 'xlf', degraded: false }
    case 'docx':
    case 'pdf': return { ext: 'txt', degraded: true }
    default: return { ext: 'txt', degraded: false }
  }
}

/** 去掉文件名末尾的已知扩展名 */
function stripExt(name: string, format: ProjectFile['format']): string {
  const exts = ['.txt', '.md', '.markdown', '.json', '.csv', '.xlf', '.xliff', '.docx', '.pdf']
  let base = name
  for (const e of exts) {
    if (base.toLowerCase().endsWith(e)) { base = base.slice(0, -e.length); break }
  }
  // 源文件格式已知但扩展名不匹配时，按 format 兜底（避免重复后缀）
  void format
  return base || 'export'
}

/** 生成单文件导出内容 */
function buildContent(
  segs: Segment[],
  content: ExportContent,
  format: ExportFormat,
  file: ProjectFile,
): string {
  const all = segs
    .slice()
    .sort((a, b) => a.index - b.index)
  // 仅过滤「两段同时为空」的段，避免空文件；只要有 source 或 target 其中一段文字就保留（空原文+有译文的段也算有效）
  const valid = all.filter((s) => Boolean((s.source ?? '').trim() || (s.target ?? '').trim()))

  // 实际输出格式：source 时按文件 format 决定，其他直接用
  let outFmt: ExportFormat = format
  if (format === 'source') {
    const f = file.format
    if (f === 'md' || f === 'markdown') outFmt = 'md'
    else if (f === 'json') outFmt = 'json'
    else if (f === 'csv') outFmt = 'json' // csv 用 json 兜底（避免引入 csv 序列化依赖）
    else outFmt = 'txt' // txt/xliff/docx/pdf 统一走 txt
  }

  if (outFmt === 'json') {
    const data = content === 'target'
      ? valid.map((s) => ({ index: s.index, target: s.target ?? '' }))
      : valid.map((s) => ({ index: s.index, source: s.source ?? '', target: s.target ?? '', status: s.status }))
    return JSON.stringify(data, null, 2)
  }

  if (outFmt === 'md') {
    if (content === 'target') {
      return valid.map((s) => s.target ?? '').filter(Boolean).join('\n\n')
    }
    const rows = valid.map((s) => `| ${s.index + 1} | ${(s.source ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')} | ${(s.target ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')} |`).join('\n')
    return `# ${file.name}\n\n| # | 原文 | 译文 |\n|---|---|---|\n${rows}\n`
  }

  // txt（默认；docx、pdf、xliff 二进制也走此分支）
  if (content === 'target') {
    return valid.map((s) => s.target ?? '').filter(Boolean).join('\n\n')
  }
  return valid.map((s) => `原文：${s.source ?? ''}\n译文：${s.target ?? ''}`).join('\n\n')
}

/** 触发浏览器下载 */
function downloadBlob(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

const MIME: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  xlf: 'application/xml',
}

export function ExportFileDialog({ open, onClose }: Props): ReactElement | null {
  const files = useProjectStore((s) => s.files)
  const activeFileId = useProjectStore((s) => s.activeFileId)
  const segments = useProjectStore((s) => s.segments)
  const selectedFileIds = useProjectStore((s) => s.selectedFileIds)
  const currentProject = useProjectStore((s) => {
    const id = s.currentProjectId
    return id != null ? s.projects.find((p) => p.id === id) ?? null : null
  })
  const notify = useUIStore((s) => s.notify)

  const [scope, setScope] = useState<ExportScope>('active')
  const [content, setContent] = useState<ExportContent>('bilingual')
  const [format, setFormat] = useState<ExportFormat>('source')
  const [submitting, setSubmitting] = useState(false)

  const activeFile = files.find((f) => f.id === activeFileId) ?? null
  const hasActive = !!activeFile

  // "选中文件"语义优先级：
  //  1. 项目文件面板勾选复选框（selectedFileIds 非空，多选/单选都算）
  //  2. 否则：双语编辑器当前激活文件（activeFileId）
  //  3. 两者都空：scope=active 视为 0 个
  const pickCheckedOrActiveFiles = useCallback((): ProjectFile[] => {
    if (selectedFileIds.size > 0) {
      const byId = new Map(files.map((f) => [f.id as ID, f]))
      const list: ProjectFile[] = []
      for (const id of selectedFileIds) {
        const f = byId.get(id)
        if (f) list.push(f)
      }
      return list
    }
    return activeFile ? [activeFile] : []
  }, [selectedFileIds, files, activeFile])

  const checkedOrActive = pickCheckedOrActiveFiles()
  const hasChecked = selectedFileIds.size > 0
  const fileCount = scope === 'active'
    ? checkedOrActive.length
    : files.length

  // 打开对话框时自动选择合理默认：
  //  - 面板有勾选 → 单选范围默认选中面板勾选文件
  //  - 没勾选 → 退化到 activeFileId（编辑器激活文件）
  useEffect(() => {
    if (open) {
      setScope(hasChecked || hasActive ? 'active' : 'all')
      setContent('bilingual')
      setFormat('source')
      setSubmitting(false)
    }
  }, [open, hasChecked, hasActive])

  const handleExport = useCallback(async () => {
    if (fileCount <= 0) {
      notify('warning', '没有可导出的文件')
      return
    }
    setSubmitting(true)
    try {
      let targetFiles: ProjectFile[]
      if (scope === 'all') {
        targetFiles = files.slice()
      } else {
        targetFiles = pickCheckedOrActiveFiles()
      }
      if (targetFiles.length === 0) {
        notify('warning', '当前没有匹配到可导出的文件')
        return
      }
      // 一次性从 db 查出所有非激活文件的 segments，避免 for 循环里逐个 Dexie 查询（同时修正索引字段写法）
      const inactiveFileIds = targetFiles
        .filter((f) => f.id !== activeFileId)
        .map((f) => f.id as number)
      const inactiveRowMap = new Map<ID, Segment[]>()
      if (inactiveFileIds.length > 0) {
        // 注意：Dexie 索引字段名形式（`where('fileId')`），不是对象形式
        const rows = await db.segments.where('fileId').anyOf(inactiveFileIds).sortBy('index')
        for (const r of rows) {
          const arr = inactiveRowMap.get(r.fileId)
          if (arr) arr.push(r)
          else inactiveRowMap.set(r.fileId, [r])
        }
      }
      const activeSegsByFileId = (activeFileId != null)
        ? new Map<ID, Segment[]>([[activeFileId, segments.slice()]])
        : new Map<ID, Segment[]>()

      let exported = 0
      let emptySkipped = 0
      let degradedNote = false
      for (const file of targetFiles) {
        const fid = file.id as ID
        const segs: Segment[] = fid === activeFileId
          ? (activeSegsByFileId.get(fid) ?? [])
          : (inactiveRowMap.get(fid) ?? [])
        if (segs.length === 0) {
          emptySkipped++
          continue
        }

        // 决定扩展名
        let ext: string
        if (format === 'source') {
          const r = formatToExt(file.format)
          ext = r.ext
          if (r.degraded) degradedNote = true
        } else {
          ext = format
        }

        const text = buildContent(segs, content, format, file)
        const baseName = stripExt(file.name, file.format)
        const contentTag = content === 'bilingual' ? '双语' : '译文'
        const filename = `${baseName}.${contentTag}.${ext}`
        downloadBlob(text, filename, MIME[ext] ?? 'text/plain')
        exported++
        // 多文件时稍作延迟，避免浏览器拦截连续下载
        if (targetFiles.length > 1) await new Promise((r) => setTimeout(r, 250))
      }

      if (exported === 0) {
        notify('warning', emptySkipped > 0
          ? `所选的 ${emptySkipped} 个文件都没有译文/原文内容，跳过导出。请先导入文件或生成数据`
          : '所选文件均无内容可导出')
      } else {
        const scopeText =
          scope === 'all'
            ? `全部 ${targetFiles.length} 个文件`
            : hasChecked
              ? `面板勾选 ${targetFiles.length} 个文件`
              : `激活文件 ${targetFiles[0]?.name ?? ''}`
        notify('success',
          `已导出 ${exported} 个文件（${scopeText}）` +
          (emptySkipped > 0 ? `，跳过空文件 ${emptySkipped} 个` : '') +
          (degradedNote ? '，部分二进制格式（docx/pdf）已降级为 TXT' : ''))
      }
      onClose()
    } catch (err) {
      notify('error', `导出失败：${(err as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }, [fileCount, scope, files, pickCheckedOrActiveFiles, activeFileId, segments, hasChecked, format, content, notify, onClose])

  // 当前选择下会产生的扩展名预览（仅选中文件模式）
  const previewSample = checkedOrActive[0] ?? activeFile
  const previewExt = previewSample
    ? format === 'source' ? formatToExt(previewSample.format).ext : format
    : '—'

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>导出 / 保存</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          {!currentProject && (
            <Alert severity="warning">当前未选择项目，无法导出。</Alert>
          )}
          {currentProject && files.length === 0 && (
            <Alert severity="info">当前项目暂无文件，请先导入。</Alert>
          )}

          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ fontSize: '0.85rem', mb: 0.5 }}>
              导出范围
              {(hasChecked || hasActive) && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {hasChecked
                    ? `（已从"项目文件"面板勾选 ${selectedFileIds.size} 个文件）`
                    : '（未勾选任何文件，将使用当前激活文件）'}
                </Typography>
              )}
            </FormLabel>
            <RadioGroup row value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
              <FormControlLabel
                value="active"
                disabled={!hasChecked && !hasActive}
                control={<Radio size="small" />}
                label={hasChecked
                  ? `面板勾选（${checkedOrActive.length} 个）`
                  : hasActive
                    ? `激活文件（${activeFile?.name}）`
                    : '选中文件（无）'}
              />
              <FormControlLabel
                value="all"
                control={<Radio size="small" />}
                label={`全部文件（${files.length}）`}
              />
            </RadioGroup>
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ fontSize: '0.85rem', mb: 0.5 }}>导出内容</FormLabel>
            <RadioGroup row value={content} onChange={(e) => setContent(e.target.value as ExportContent)}>
              <FormControlLabel value="bilingual" control={<Radio size="small" />} label="双语对照（原文 + 译文）" />
              <FormControlLabel value="target" control={<Radio size="small" />} label="仅译文" />
            </RadioGroup>
          </FormControl>

          <FormControl fullWidth size="small">
            <FormLabel component="legend" sx={{ fontSize: '0.85rem', mb: 0.5 }}>导出格式</FormLabel>
            <Select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              <MenuItem value="source">源文件格式（按各文件原格式，二进制降级 TXT）</MenuItem>
              <MenuItem value="txt">TXT 纯文本</MenuItem>
              <MenuItem value="md">Markdown（双语为表格）</MenuItem>
              <MenuItem value="json">JSON（含段号/状态）</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" component="div">
              预览：
            </Typography>
            <Typography variant="caption" component="div">
              · 文件数：{fileCount}
            </Typography>
            <Typography variant="caption" component="div">
              · 扩展名：{scope === 'active' && activeFile ? previewExt : '各文件按其原格式（选"源文件格式"时）或统一格式'}
            </Typography>
            <Typography variant="caption" component="div">
              · 文件名：{'{原文件名}.' + (content === 'bilingual' ? '双语' : '译文') + '.{ext}'}
            </Typography>
            {content === 'bilingual' && format === 'md' && (
              <Typography variant="caption" component="div">
                · MD 双语格式：每段一行表格（# / 原文 / 译文）
              </Typography>
            )}
            {content === 'bilingual' && format === 'txt' && (
              <Typography variant="caption" component="div">
                · TXT 双语格式：每段「原文：…\n译文：…」，空行分隔
              </Typography>
            )}
          </Box>

          {scope === 'all' && fileCount > 1 && (
            <Alert severity="info" icon={false}>
              将依次下载 {fileCount} 个文件，请允许浏览器多重下载。
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>取消</Button>
        <Button
          onClick={handleExport}
          variant="contained"
          disabled={submitting || fileCount <= 0}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? '导出中…' : `导出 ${fileCount > 0 ? `(${fileCount})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
