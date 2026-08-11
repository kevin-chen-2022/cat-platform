import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Box,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  Alert,
  Tooltip,
} from '@mui/material'
import PreviewIcon from '@mui/icons-material/Preview'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import CodeIcon from '@mui/icons-material/Code'
import ArticleIcon from '@mui/icons-material/Article'
import SubjectIcon from '@mui/icons-material/Subject'
import type { ReactElement } from 'react'
import { useProjectStore } from '@app/store'
import type { ID } from '@/types'
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer'
import { DocxPreview } from './DocxPreview'
import { PdfPreview } from './PdfPreview'

type ViewMode = 'source' | 'mixed'
type ViewType = 'text' | 'native'

/** 检测文本是否包含富文本 HTML 标签（b/sup/sub/span 等，来自译文编辑器的格式化） */
function hasRichTextHtml(text: string | null | undefined): boolean {
  if (!text) return false
  return /<\/?(b|sup|sub|span|strong|i|u)\b[^>]*>/i.test(text)
}

export function PreviewPanel(): ReactElement {
  const segments = useProjectStore((s) => s.segments)
  const activeFileId = useProjectStore((s) => s.activeFileId)
  const files = useProjectStore((s) => s.files)
  const activeSegmentId = useProjectStore((s) => s.activeSegmentId)
  const selectSegment = useProjectStore((s) => s.selectSegment)
  const activeFile = files.find((f) => f.id === activeFileId)
  const [mode, setMode] = useState<ViewMode>('source')

  // 预览类型：text = 纯文本段落预览（现有功能）；native = 原格式预览（docx-preview 渲染）
  const [viewType, setViewType] = useState<ViewType>('text')

  // 是否为 docx 文件（原格式预览仅支持 docx，后续 PDF 走 PDF.js）
  const isDocxFile = activeFile?.format === 'docx'
  // 是否为 PDF 文件（原格式预览用 PDF.js）
  const isPdfFile = activeFile?.format === 'pdf'
  // 是否支持原格式预览
  const supportsNative = isDocxFile || isPdfFile

  // 按文件格式判断是否默认启用 Markdown 富文本渲染（仅 .md / .markdown 导入的文件）
  const isMdFile = activeFile?.format === 'md' || activeFile?.format === 'markdown'
  const [useMarkdown, setUseMarkdown] = useState(isMdFile)
  // 切换文件时根据格式重置渲染模式
  useEffect(() => {
    setUseMarkdown(activeFile?.format === 'md' || activeFile?.format === 'markdown')
    // 非 docx / pdf 文件自动切回纯文本预览
    if (!supportsNative) {
      setViewType('text')
    }
  }, [activeFileId, activeFile?.format, supportsNative])

  // 段落 DOM 引用映射，用于自动滚动
  const segmentRefs = useRef<Map<ID, HTMLElement>>(new Map())

  const translatedCount = useMemo(
    () => segments.filter((s) => s.status !== 'untranslated' && s.target.trim()).length,
    [segments],
  )

  // 正向联动：激活段变化时，滚动到对应段落（block: 'center' 居中显示）
  // 仅在纯文本预览模式下生效；原格式预览由 DocxPreview 内部处理定位
  useEffect(() => {
    if (viewType !== 'text') return
    if (activeSegmentId == null) return
    const el = segmentRefs.current.get(activeSegmentId)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeSegmentId, viewType])

  // 段落渲染数据：每段 { id, text }，text 取决于当前模式
  const renderedSegments = useMemo(() => {
    return segments.map((s) => ({
      id: s.id as ID,
      text: mode === 'source'
        ? (s.source ?? '')
        // 混合模式：target 有非空内容就用 target，不依赖 status（避免 status 未维护时误判）
        : ((s.target?.trim() ? s.target : s.source) ?? ''),
    }))
  }, [segments, mode])

  // 原格式预览模式：直接渲染 DocxPreview / PdfPreview（它们有自己的工具栏和渲染区）
  if (viewType === 'native' && supportsNative && activeFile) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box className="panel-header" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <PreviewIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2">全文预览</Typography>
              <Chip label={activeFile.name} size="small" variant="outlined" sx={{ maxWidth: 200 }} />
            </Stack>
            <ToggleButtonGroup
              value={viewType}
              exclusive
              size="small"
              onChange={(_e, v) => v && setViewType(v)}
            >
              <ToggleButton value="native" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                <ArticleIcon fontSize="small" sx={{ mr: 0.5 }} />
                原格式
              </ToggleButton>
              <ToggleButton value="text" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                <SubjectIcon fontSize="small" sx={{ mr: 0.5 }} />
                纯文本
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {isDocxFile ? (
            <DocxPreview
              file={activeFile}
              segments={segments}
              activeSegmentId={activeSegmentId}
              onSelectSegment={selectSegment}
            />
          ) : isPdfFile ? (
            <PdfPreview
              file={activeFile}
              segments={segments}
              activeSegmentId={activeSegmentId}
              onSelectSegment={selectSegment}
            />
          ) : null}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box className="panel-header" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <PreviewIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2">全文预览</Typography>
            {activeFile && (
              <Chip label={activeFile.name} size="small" variant="outlined" sx={{ maxWidth: 200 }} />
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {/* docx / pdf 文件：原格式 / 纯文本 切换 */}
            {supportsNative && (
              <ToggleButtonGroup
                value={viewType}
                exclusive
                size="small"
                onChange={(_e, v) => v && setViewType(v)}
                sx={{ mr: 0.5 }}
              >
                <ToggleButton value="native" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                  <ArticleIcon fontSize="small" sx={{ mr: 0.5 }} />
                  原格式
                </ToggleButton>
                <ToggleButton value="text" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                  <SubjectIcon fontSize="small" sx={{ mr: 0.5 }} />
                  纯文本
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            {/* 纯文本模式下的 原文/混合 切换 */}
            <ToggleButtonGroup
              value={mode}
              exclusive
              size="small"
              onChange={(_e, v) => v && setMode(v)}
            >
              <ToggleButton value="source" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                <VisibilityIcon fontSize="small" sx={{ mr: 0.5 }} />
                原文
              </ToggleButton>
              <ToggleButton value="mixed" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
                <CompareArrowsIcon fontSize="small" sx={{ mr: 0.5 }} />
                混合预览
              </ToggleButton>
            </ToggleButtonGroup>
            <Tooltip title={useMarkdown ? '当前 Markdown 富文本渲染，点击切回纯文本' : '纯文本渲染，点击启用 Markdown 富文本'}>
              <ToggleButton
                value="md"
                selected={useMarkdown}
                size="small"
                onChange={() => setUseMarkdown((v) => !v)}
                sx={{ px: 0.75, py: 0.25, fontSize: '0.75rem' }}
              >
                {useMarkdown ? <TextFieldsIcon fontSize="small" /> : <CodeIcon fontSize="small" />}
              </ToggleButton>
            </Tooltip>
          </Stack>
        </Stack>
        {segments.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              共 {segments.length} 段 · 已译 {translatedCount} 段
            </Typography>
            {translatedCount > 0 && (
              <Chip
                label={`${Math.round((translatedCount / segments.length) * 100)}%`}
                size="small"
                color="primary"
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            )}
          </Stack>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {!activeFileId ? (
          <Alert severity="info">请先在「项目文件」面板选择一个文件</Alert>
        ) : segments.length === 0 ? (
          <Alert severity="warning">该文件暂无片段</Alert>
        ) : (
          <Box
            sx={{
              lineHeight: 1.8,
              fontSize: 'var(--app-content-font-size)',
              fontFamily: mode === 'mixed'
                ? 'inherit'
                : 'inherit',
            }}
          >
            {renderedSegments.map((seg, idx) => {
              const isActive = seg.id === activeSegmentId
              return (
                <Box
                  key={seg.id}
                  ref={(el: HTMLElement | null) => {
                    if (el) {
                      segmentRefs.current.set(seg.id, el)
                    } else {
                      segmentRefs.current.delete(seg.id)
                    }
                  }}
                  data-segment-id={seg.id}
                  onClick={() => selectSegment(seg.id ?? null)}
                  sx={{
                    // 段落间距：用 margin 替代之前的 \n\n
                    mb: idx < renderedSegments.length - 1 ? 2 : 0,
                    p: 0.5,
                    borderRadius: 0.5,
                    cursor: 'pointer',
                    // 高亮激活段
                    bgcolor: isActive ? 'action.selected' : 'transparent',
                    // 左侧边框高亮，更醒目
                    borderLeft: isActive ? '3px solid' : '3px solid transparent',
                    borderColor: isActive ? 'primary.main' : 'transparent',
                    '&:hover': {
                      bgcolor: isActive ? 'action.selected' : 'action.hover',
                    },
                    // MD 富文本渲染时由内部组件控制换行；纯文本时保留 pre-wrap
                    whiteSpace: useMarkdown ? 'normal' : 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {seg.text ? (
                    useMarkdown && !hasRichTextHtml(seg.text) ? (
                      <MarkdownRenderer variant="body2">{seg.text}</MarkdownRenderer>
                    ) : hasRichTextHtml(seg.text) ? (
                      <span dangerouslySetInnerHTML={{ __html: seg.text }} />
                    ) : (
                      seg.text
                    )
                  ) : (
                    <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                      （空段落）
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
      </Box>

      <Box className="panel-footer" sx={{ p: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="caption" color="text.secondary">
          {mode === 'source'
            ? '仅显示原文，便于校对完整性'
            : '已翻译段落用译文显示，未译段落保留原文，便于查看整体效果'}
          {useMarkdown && ' · Markdown 富文本渲染中'}
        </Typography>
      </Box>
    </Box>
  )
}
