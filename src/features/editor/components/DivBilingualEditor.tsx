import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import type { ReactElement, KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Box, Typography, IconButton, Tooltip, Stack,
  TextField, Checkbox, FormControlLabel, ToggleButton, ToggleButtonGroup, InputAdornment,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Popover, Badge, Chip,
} from '@mui/material'
import { useProjectStore, useUIStore, useEditorContextStore, useTermStore, useLayoutStore, useDictionaryStore, useMachineTranslationStore, useAiQAStore, useLinkageFragmentSearchStore, dispatchSegmentActivated, dispatchSourceSelected, callAiChat } from '@app/store'
import type { Term, AiProviderKey, AiProviderCfg } from '@app/store'
import type { Segment, SegmentStatus, ID } from '@/types'
import { db } from '@data/db'
import { EditableDiv } from './EditableDiv'
import { showTabInDock } from '@/app/layout/DockLayout'
import { doInsertViaExecCommand } from '@/shared/utils/insertText'
import { buildTermHint } from '@/shared/utils/termMatch'
import { needsTranslation, htmlToPlainText } from '@/shared/utils/segmentFilter'
import { searchMemory } from '@/services/tm/engine'
import type { TMEntry, LanguageCode } from '@/types'
// Icons
import ViewStreamIcon from '@mui/icons-material/ViewStream'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import ClearIcon from '@mui/icons-material/Clear'
import EditIcon from '@mui/icons-material/Edit'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import TranslateIcon from '@mui/icons-material/Translate'
import FindInPageIcon from '@mui/icons-material/FindInPage'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
import SuperscriptIcon from '@mui/icons-material/Superscript'
import LabelIcon from '@mui/icons-material/Label'
import StickyNote2Icon from '@mui/icons-material/StickyNote2'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import MergeTypeIcon from '@mui/icons-material/MergeType'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import CheckIcon from '@mui/icons-material/Check'
import FilterListIcon from '@mui/icons-material/FilterList'
import LooksOneIcon from '@mui/icons-material/LooksOne'
import LooksTwoIcon from '@mui/icons-material/LooksTwo'
import Looks3Icon from '@mui/icons-material/Looks3'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'

// —— 常量 ——

const STATUS_CONFIG: Record<SegmentStatus, { symbol: string; color: string; label: string }> = {
  untranslated: { symbol: '○', color: '#9e9e9e', label: '未译' },
  draft: { symbol: '◐', color: '#29b6f6', label: '草稿' },
  translated: { symbol: '●', color: '#1976d2', label: '已译' },
  reviewing: { symbol: '?', color: '#ff9800', label: '审校中' },
  approved: { symbol: '✓', color: '#4caf50', label: '通过' },
  rejected: { symbol: '✗', color: '#f44336', label: '驳回' },
}
const STATUS_ORDER: SegmentStatus[] = [
  'untranslated', 'draft', 'translated', 'reviewing', 'approved', 'rejected',
]

type LayoutMode = 'table' | 'stack'

// 行内按钮条统一的紧凑样式（比列头按钮更小，贴合行紧凑布局）
const inlineBtnSx = { p: 0.15, minWidth: 0, minHeight: 0, bgcolor: 'transparent', '&:hover': { bgcolor: 'action.hover' } }
const inlineIconSx = { fontSize: 13 }

// 文本变色预设色板（含黑色用于恢复正常色）
const TEXT_COLORS = [
  '#f44336', // 红
  '#ff9800', // 橙
  '#e91e63', // 粉
  '#9c27b0', // 紫
  '#1976d2', // 蓝
  '#4caf50', // 绿
  '#795548', // 棕
  '#000000', // 黑（恢复正常）
]

/** 检测文本是否包含 execCommand 产生的富文本 HTML 标签（b/sup/sub/span 等） */
function hasRichTextHtml(text: string | null | undefined): boolean {
  if (!text) return false
  return /<\/?(b|sup|sub|span|strong|i|u)\b[^>]*>/i.test(text)
}

// —— 选中文本/光标位置追踪工具 ——

/** 获取 contenteditable 或普通文本元素中选区的偏移量和文本 */
function getSelectionInfo(el: HTMLElement): { text: string; start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  // 确保选区在目标元素内
  if (!el.contains(range.commonAncestorContainer)) return null
  const selectedText = sel.toString()
  if (!selectedText) return null
  // 通过创建一个从元素起点到选区起点的 range 来计算偏移
  const preRange = document.createRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(range.startContainer, range.startOffset)
  const start = preRange.toString().length
  return { text: selectedText, start, end: start + selectedText.length }
}

/**
 * 有层级标注时：基于 DOM Range + 容器 data-start/data-end 属性，
 * 将当前选区内偏移解析为"完整纯文本坐标系"（即与 marks 的 start/end 同坐标系）。
 * 解决隐藏间隙被 SVG 占位替换后，普通 textContent 偏移量失真的问题。
 */
function getSelectionWithMarks(el: HTMLElement): { text: string; start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return null
  const selectedText = sel.toString()
  if (!selectedText) return null

  /** 计算一个端点（range start 或 end）在完整纯文本坐标系中的偏移 */
  function resolvePoint(node: Node, offsetInNode: number): number {
    // 找到带 data-start/data-end 的最近父容器 span（含 span/Box-component span）
    let container: Node | null = node
    while (container && container !== el) {
      if (container.nodeType === Node.ELEMENT_NODE) {
        const elm = container as HTMLElement
        const ds = elm.getAttribute('data-start')
        const de = elm.getAttribute('data-end')
        if (ds != null && de != null) {
          const cStart = parseInt(ds, 10)
          const cEnd = parseInt(de, 10)
          // 在该容器内：node 是元素 → offset 是 childIndex（此时是 0 或 children.length，直接返回 cStart/cEnd）
          // node 是文本节点 → offset 是字符偏移，加到 cStart 上
          if (node.nodeType === Node.TEXT_NODE) {
            // 先算该文本节点在容器 textContent 中的累积起始偏移
            let cumOffset = 0
            // 遍历容器内所有文本子节点，找到 node 所在位置
            const walker = document.createTreeWalker(elm, NodeFilter.SHOW_TEXT)
            let n: Node | null = walker.nextNode()
            while (n) {
              if (n === node) {
                const maxInContainer = cEnd - cStart
                return Math.min(cEnd, cStart + cumOffset + Math.min(offsetInNode, maxInContainer - cumOffset))
              }
              cumOffset += (n.textContent || '').length
              n = walker.nextNode()
            }
            // 未找到文本（理论不发生）：兜底返回 cStart
            return cStart
          } else {
            // 子节点索引型偏移：offset=0 → cStart, offset > 0 → cEnd
            return offsetInNode === 0 ? cStart : cEnd
          }
        }
      }
      container = container.parentNode
    }
    // 没找到标注容器，退化：用 getSelectionInfo 的老逻辑（整段 offset）
    const preRange = document.createRange()
    preRange.selectNodeContents(el)
    preRange.setEnd(node, offsetInNode)
    return preRange.toString().length
  }

  const start = resolvePoint(range.startContainer, range.startOffset)
  const end = resolvePoint(range.endContainer, range.endOffset)
  return { text: selectedText, start, end }
}

/** 获取光标在元素文本中的偏移量 */
function getCursorOffset(el: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return null
  const preRange = document.createRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString().length
}

// —— 选中文本/光标追踪 hook ——
// 返回事件处理器，绑定到原文内容区和译文编辑区
// 实时更新 useEditorContextStore，供其他功能块订阅
function useSelectionTracking(segId: ID) {
  const setSourceSelection = useEditorContextStore((s) => s.setSourceSelection)
  const setTargetSelection = useEditorContextStore((s) => s.setTargetSelection)
  const setTargetCursor = useEditorContextStore((s) => s.setTargetCursor)

  // 原文内容区 mouseup：检测选中文本
  const onSourceMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const info = getSelectionInfo(el)
    if (info) {
      setSourceSelection({ text: info.text, segmentId: segId, start: info.start, end: info.end })
      // 翻译联动：选中原文时，发送选中文本+整段原文上下文给当前 active 的功能卡片
      const seg = useProjectStore.getState().segments.find((s) => s.id === segId)
      dispatchSourceSelected(info.text, segId, htmlToPlainText(seg?.source ?? ''))
    } else {
      setSourceSelection(null)
    }
  }, [segId, setSourceSelection])

  // 译文编辑区 mouseup：检测选中文本和光标位置
  const onTargetMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const info = getSelectionInfo(el)
    if (info) {
      setTargetSelection({ text: info.text, segmentId: segId, start: info.start, end: info.end })
    } else {
      setTargetSelection(null)
    }
    const offset = getCursorOffset(el)
    if (offset != null) {
      setTargetCursor({ segmentId: segId, offset })
    }
  }, [segId, setTargetSelection, setTargetCursor])

  // 译文编辑区 keyup：检测选中文本和光标位置
  const onTargetKeyUp = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const info = getSelectionInfo(el)
    if (info) {
      setTargetSelection({ text: info.text, segmentId: segId, start: info.start, end: info.end })
    } else {
      setTargetSelection(null)
    }
    const offset = getCursorOffset(el)
    if (offset != null) {
      setTargetCursor({ segmentId: segId, offset })
    }
  }, [segId, setTargetSelection, setTargetCursor])

  return { onSourceMouseUp, onTargetMouseUp, onTargetKeyUp }
}

// —— 列宽拖拽 hook ——

function useColumnResize() {
  // status/notes 用 px；source/target 用 fr 比例（Table 模式自适应容器宽度）
  const [widths, setWidths] = useState({
    status: 32,
    source: 1,
    target: 1,
    notes: 64,
  })

  type ResizeCol = keyof typeof widths | 'notesLeftEdge'

  const startResize = useCallback(
    (e: React.MouseEvent, col: ResizeCol) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      // notesLeftEdge = 竖线在 notes 列左边界（原文/译文与备注之间的分隔线），拖动方向反向
      const isLeftEdge = col === 'notesLeftEdge'
      const actualCol: keyof typeof widths = isLeftEdge ? 'notes' : (col as keyof typeof widths)
      const startW = widths[actualCol]
      const gridEl = (e.currentTarget as HTMLElement).closest('[style*="grid-template"]')
      const containerWidth = gridEl?.clientWidth || 800
      const isFr = actualCol === 'source' || actualCol === 'target'
      const onMove = (ev: MouseEvent) => {
        const rawDelta = ev.clientX - startX
        // notesLeftEdge：向右拖 -> 左侧列变宽 -> notes 变窄，所以取反向
        const deltaX = isLeftEdge ? -rawDelta : rawDelta
        if (isFr) {
          const delta = (deltaX / containerWidth) * 2
          const w = Math.max(0.1, startW + delta)
          setWidths((prev) => ({ ...prev, [actualCol]: w }))
        } else {
          const w = Math.max(40, startW + deltaX)
          setWidths((prev) => ({ ...prev, [actualCol]: w }))
        }
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [widths],
  )

  return { widths, startResize }
}

// —— 术语高亮 ——
// 将原文按术语出现位置拆分：术语片段带 term 引用，普通片段为纯文本
// 长术语优先匹配，避免短术语覆盖长术语；词边界 + 大小写不敏感；避免重叠

type TextChunk = { text: string; term?: Term }

function highlightTerms(text: string, terms: Term[]): TextChunk[] {
  if (!text || terms.length === 0) return [{ text }]

  // 长术语优先，避免 "machine" 覆盖 "machine learning"
  const sortedTerms = [...terms].filter((t) => t.source).sort((a, b) => b.source.length - a.source.length)

  type Match = { start: number; end: number; term: Term }
  const matches: Match[] = []
  const occupied = new Array(text.length).fill(false)

  for (const term of sortedTerms) {
    // 转义正则特殊字符
    const escaped = term.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 词边界匹配，大小写不敏感
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      // 检查是否与已匹配区域重叠
      let overlap = false
      for (let i = start; i < end; i++) {
        if (occupied[i]) { overlap = true; break }
      }
      if (!overlap) {
        matches.push({ start, end, term })
        for (let i = start; i < end; i++) occupied[i] = true
      }
    }
  }

  if (matches.length === 0) return [{ text }]

  matches.sort((a, b) => a.start - b.start)

  const result: TextChunk[] = []
  let cursor = 0
  for (const mt of matches) {
    if (mt.start > cursor) result.push({ text: text.slice(cursor, mt.start) })
    result.push({ text: text.slice(mt.start, mt.end), term: mt.term })
    cursor = mt.end
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor) })

  return result
}

// 原文渲染：术语高亮（主题色 + 点状下划线），hover 显示术语译文（可点击插入到译文光标处）
function SourceTextWithTerms({
  text,
  terms,
  enable,
  onInsertTarget,
}: {
  text: string
  terms: Term[]
  enable: boolean
  onInsertTarget?: (target: string) => void
}) {
  const isDark = useUIStore((s) => s.theme) === 'dark'
  if (!enable || terms.length === 0) return <>{text}</>
  const chunks = highlightTerms(text, terms)
  return (
    <>
      {chunks.map((chunk, i) =>
        chunk.term ? (
          <Tooltip
            key={i}
            enterDelay={200}
            leaveDelay={400}
            title={
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  cursor: onInsertTarget ? 'pointer' : 'default',
                  borderRadius: 0.5,
                  '&:hover': onInsertTarget ? { bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' } : {},
                }}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                onClick={() => {
                  if (chunk.term && onInsertTarget) onInsertTarget(chunk.term.target)
                }}
              >
                <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                  {chunk.term.target}
                </Typography>
              </Box>
            }
          >
            <Box
              component="span"
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
              sx={{
                color: 'primary.main',
                cursor: onInsertTarget ? 'help' : 'default',
                borderBottom: '1px dotted',
                borderColor: 'primary.main',
              }}
            >
              {chunk.text}
            </Box>
          </Tooltip>
        ) : (
          <span key={i}>{chunk.text}</span>
        ),
      )}
    </>
  )
}

// —— 聚焦编辑台：原文层级标注（临时分析辅助，不持久化） ——

type SourceMark = { id: string; start: number; end: number; level: 1 | 2 | 3 }

const MARK_LEVEL_STYLE: Record<1 | 2 | 3, { bgcolor: string; label: string }> = {
  1: { bgcolor: '#f44336', label: '一级' },  // 红
  2: { bgcolor: '#1976d2', label: '二级' },  // 蓝
  3: { bgcolor: '#4caf50', label: '三级' },  // 绿
}

/** 计算间隙 ID：左标注 → 右标注（首尾用 ⇱/⇲ 标记） */
function gapIdBetween(leftId: string | null, rightId: string | null): string {
  return `${leftId ?? '⇱'}→${rightId ?? '⇲'}`
}

/**
 * 计算标注场景下的"可见文本"：标注片段始终保留，间隙文本根据 hiddenGaps 跳过。
 * 用于有标注时 AI 翻译/解释的原文提取（隐藏的文本不送入 AI）。
 */
function computeVisibleText(text: string, marks: SourceMark[], hiddenGaps: Set<string>): string {
  if (marks.length === 0) return text
  const sorted = [...marks].sort((a, b) => a.start - b.start)
  const parts: string[] = []
  let cursor = 0
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]
    const prevId = i > 0 ? sorted[i - 1].id : null
    const gapId = gapIdBetween(prevId, m.id)
    if (m.start > cursor && !hiddenGaps.has(gapId)) {
      parts.push(text.slice(cursor, m.start))
    }
    parts.push(text.slice(m.start, m.end))
    cursor = m.end
  }
  const lastPrevId = sorted[sorted.length - 1].id
  const lastGapId = gapIdBetween(lastPrevId, null)
  if (cursor < text.length && !hiddenGaps.has(lastGapId)) {
    parts.push(text.slice(cursor))
  }
  return parts.join('')
}

/**
 * 渲染带层级标注的原文：标注片段以红/蓝/绿底白字显示，非标注间隙可被隐藏。
 * - 点击标注：首次选中（黄色外框），再次点击 toggle 其左右间隙的显隐
 * - 点击隐藏间隙的占位图标：恢复显示
 */
function SourceTextWithMarks({
  text,
  marks,
  hiddenGaps,
  selectedMarkId,
  onMarkClick,
  onGapClick,
}: {
  text: string
  marks: SourceMark[]
  hiddenGaps: Set<string>
  selectedMarkId: string | null
  onMarkClick: (markId: string) => void
  onGapClick: (gapId: string) => void
}) {
  const sorted = [...marks].sort((a, b) => a.start - b.start)
  const chunks: { type: 'gap' | 'mark'; text: string; gapId?: string; mark?: SourceMark; start: number; end: number }[] = []
  let cursor = 0
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]
    const prevId = i > 0 ? sorted[i - 1].id : null
    const gapId = gapIdBetween(prevId, m.id)
    if (m.start > cursor) {
      chunks.push({ type: 'gap', text: text.slice(cursor, m.start), gapId, start: cursor, end: m.start })
    }
    chunks.push({ type: 'mark', text: text.slice(m.start, m.end), mark: m, start: m.start, end: m.end })
    cursor = m.end
  }
  const lastPrevId = sorted.length > 0 ? sorted[sorted.length - 1].id : null
  if (cursor < text.length) {
    chunks.push({ type: 'gap', text: text.slice(cursor), gapId: gapIdBetween(lastPrevId, null), start: cursor, end: text.length })
  }

  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.type === 'mark' && chunk.mark) {
          const m = chunk.mark
          const isSelected = m.id === selectedMarkId
          const style = MARK_LEVEL_STYLE[m.level]
          return (
            <Box
              key={m.id}
              component="span"
              data-start={chunk.start}
              data-end={chunk.end}
              onClick={(e) => { e.stopPropagation(); onMarkClick(m.id) }}
              sx={{
                bgcolor: style.bgcolor,
                color: 'common.white',
                px: 0.4,
                borderRadius: 0.5,
                cursor: 'pointer',
                boxShadow: isSelected ? '0 0 0 2px #ffeb3b' : 'none',
              }}
            >
              {chunk.text}
            </Box>
          )
        }
        // 间隙
        const isHidden = chunk.gapId != null && hiddenGaps.has(chunk.gapId)
        if (isHidden) {
          return (
            <Tooltip key={`gap-${i}`} title={`隐藏 ${chunk.text.length} 字，点击显示`} enterDelay={300}>
              <Box
                component="span"
                data-start={chunk.start}
                data-end={chunk.end}
                onClick={(e) => { e.stopPropagation(); chunk.gapId && onGapClick(chunk.gapId) }}
                sx={{ display: 'inline-flex', verticalAlign: 'middle', cursor: 'pointer', mx: 0.25, color: 'text.disabled' }}
              >
                <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
                  <rect x="0" y="2" width="18" height="6" rx="3" fill="currentColor" opacity="0.2" stroke="currentColor" strokeOpacity="0.45" strokeDasharray="2 1.5" />
                </svg>
              </Box>
            </Tooltip>
          )
        }
        return (
          <span key={`gap-${i}`} data-start={chunk.start} data-end={chunk.end}>
            {chunk.text}
          </span>
        )
      })}
    </>
  )
}

// —— 行内按钮条 ——

function InlineSourceButtons({ onAction }: {
  onAction: (action: string) => void
}) {
  return (
    <Stack direction="row" spacing={0.05} sx={{ alignItems: 'center' }}>
      <Tooltip title="修改原文"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('editSource') }}><EditIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="定位原文"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('locateSource') }}><GpsFixedIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="词典查询"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('dictionary') }}><TranslateIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="机器翻译"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('machineTranslate') }}><AutoAwesomeIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="片段搜索"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('searchSegment') }}><FindInPageIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="AI解释"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('aiExplain') }}><LightbulbIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="定义术语"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('defineTerm') }}><BookmarkAddIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="合并下一段（Ctrl+Shift+M）"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('mergeNext') }}><MergeTypeIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="在选区起点拆分（Ctrl+Shift+S）"><IconButton size="small" sx={inlineBtnSx} onClick={(e) => { e.stopPropagation(); onAction('split') }}><CallSplitIcon sx={inlineIconSx} /></IconButton></Tooltip>
    </Stack>
  )
}

function InlineTargetButtons({ onAction }: {
  onAction: (action: string) => void
}) {
  // onMouseDown preventDefault 阻止按钮抢占焦点，确保 execCommand 作用于 contenteditable
  const btnProps = {
    size: 'small' as const,
    sx: inlineBtnSx,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  }
  // 颜色选择器 Popover 锚点
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null)
  const isDark = useUIStore((s) => s.theme) === 'dark'
  return (
    <Stack direction="row" spacing={0.05} sx={{ alignItems: 'center' }}>
      <Tooltip title="复制原文到译文"><IconButton {...btnProps} onClick={(e) => { e.stopPropagation(); onAction('copySource') }}><ContentCopyIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="清空译文"><IconButton {...btnProps} onClick={(e) => { e.stopPropagation(); onAction('clearTarget') }}><ClearIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="撤销"><IconButton {...btnProps} onClick={(e) => { e.stopPropagation(); onAction('undo') }}><UndoIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="重做"><IconButton {...btnProps} onClick={(e) => { e.stopPropagation(); onAction('redo') }}><RedoIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="字体加粗"><IconButton {...btnProps} onClick={(e) => { e.stopPropagation(); onAction('bold') }}><FormatBoldIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Tooltip title="文本变色">
        <IconButton {...btnProps} onClick={(e) => { e.stopPropagation(); setColorAnchor(e.currentTarget) }}>
          <FormatColorTextIcon sx={inlineIconSx} />
        </IconButton>
      </Tooltip>
      <Tooltip title="上标"><IconButton {...btnProps} onClick={(e) => { e.stopPropagation(); onAction('superscript') }}><SuperscriptIcon sx={inlineIconSx} /></IconButton></Tooltip>
      <Popover
        open={!!colorAnchor}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        disableAutoFocus
        disableEnforceFocus
      >
        <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          {TEXT_COLORS.map((c) => (
            <Box
              key={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onAction(`color:${c}`); setColorAnchor(null) }}
              sx={{
                width: 20, height: 20, borderRadius: 0.5, cursor: 'pointer',
                bgcolor: c, border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
                '&:hover': { transform: 'scale(1.15)', boxShadow: 1 },
              }}
            />
          ))}
        </Box>
      </Popover>
    </Stack>
  )
}

// —— 拖拽手柄 ——

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <Box
      onMouseDown={onMouseDown}
      sx={{
        position: 'absolute',
        right: -1,
        top: 0,
        bottom: 0,
        width: 4,
        cursor: 'col-resize',
        zIndex: 10,
        '&:hover': { bgcolor: 'primary.main', opacity: 0.4 },
      }}
    />
  )
}

// —— 按钮动作（作用于单个 segment）——

/**
 * execCommand 修改 contenteditable 后，手动派发 input 事件，
 * 确保 EditableDiv 的 onInput → onChange 被触发，同步 editingValueRef。
 * （execCommand 通常会同步触发 input 事件，此处为安全兜底）
 */
function syncContentEditableInput() {
  const active = document.activeElement as HTMLElement | null
  if (active?.isContentEditable) {
    active.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

type ActionFn = (seg: Segment, action: string) => void

function useSegmentActions(): { runAction: (seg: Segment, action: string) => void } {
  const runAction: ActionFn = useCallback(async (seg: Segment, action: string) => {
    const state = useProjectStore.getState()
    switch (action) {
      case 'copySource':
        state.updateSegment(seg.id!, { target: seg.source, status: 'draft' })
        break
      case 'clearTarget':
        state.updateSegment(seg.id!, { target: '', status: 'draft' })
        break
      case 'undo':
        // 撤销 contenteditable 编辑（浏览器原生撤销栈）
        document.execCommand('undo')
        break
      case 'redo':
        document.execCommand('redo')
        break
      case 'bold':
        // 对译文选中文本加粗（依赖 contenteditable 焦点，按钮 onMouseDown 已 preventDefault）
        document.execCommand('bold')
        syncContentEditableInput()
        break
      case 'superscript':
        // 对译文选中文本设为上标
        document.execCommand('superscript')
        syncContentEditableInput()
        break
      case 'defineTerm': {
        const editorState = useEditorContextStore.getState()
        const sourceSel = editorState.sourceSelection
        if (!sourceSel || !sourceSel.text.trim()) {
          useUIStore.getState().notify('warning', '请先在原文中选中要定义为术语的文本')
          return
        }
        if (!useLayoutStore.getState().isTabVisible('tb')) {
          useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「术语显示」')
          return
        }
        // Tab 可见则激活（切换到）术语显示 Tab
        showTabInDock('tb')
        break
      }
      case 'dictionary': {
        const editorState = useEditorContextStore.getState()
        const sourceSel = editorState.sourceSelection
        // 查询词优先取原文选中文本；无选中时回退到整段原文（纯文本，去除富文本标签）
        const word = sourceSel?.text.trim() || htmlToPlainText(seg.source).trim()
        if (!word) {
          useUIStore.getState().notify('warning', '请先在原文中选中要查询的词')
          return
        }
        if (!useLayoutStore.getState().isTabVisible('dict')) {
          useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「词典查询」')
          return
        }
        // 写入查询词并激活词典查询 Tab
        useDictionaryStore.getState().setQueryWord(word)
        showTabInDock('dict')
        break
      }
      case 'machineTranslate': {
        const editorState = useEditorContextStore.getState()
        const sourceSel = editorState.sourceSelection
        // 待翻译文本优先取原文选中文本；无选中时使用整段原文（纯文本，去除富文本标签）
        const text = sourceSel?.text.trim() || htmlToPlainText(seg.source).trim()
        if (!text) {
          useUIStore.getState().notify('warning', '当前段原文为空，无可翻译内容')
          return
        }
        if (!useLayoutStore.getState().isTabVisible('mt')) {
          useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「机器翻译」')
          return
        }
        // 写入待翻译文本并激活机器翻译 Tab
        useMachineTranslationStore.getState().setQueryText(text)
        showTabInDock('mt')
        break
      }
      case 'aiExplain': {
        const editorState = useEditorContextStore.getState()
        const sourceSel = editorState.sourceSelection
        const selectionText = sourceSel?.text.trim()
        const enabledCount = Object.values(useAiQAStore.getState().providers).filter((p) => p.enabled).length
        if (enabledCount === 0) {
          useUIStore.getState().notify('warning', '请先在「设置 → AI问答 → API 调用」中配置并启用至少一个 AI 提供商')
        }
        if (selectionText) {
          // 有选中文本 → AI 解释选中文本（返回 AI问答 tab）
          if (!useLayoutStore.getState().isTabVisible('aiqa')) {
            useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「AI问答」')
            return
          }
          useAiQAStore.getState().setQuery(selectionText, htmlToPlainText(seg.source))
          showTabInDock('aiqa')
        } else {
          // 无选中文本 → AI 翻译整段原文（返回 AI翻译 tab）
          const srcWhole = htmlToPlainText(seg.source).trim()
          if (!srcWhole) {
            useUIStore.getState().notify('warning', '当前段原文为空')
            return
          }
          if (!useLayoutStore.getState().isTabVisible('aitranslate')) {
            useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「AI翻译」')
            return
          }
          const projState = useProjectStore.getState()
          const cur = projState.projects.find((p) => p.id === projState.currentProjectId)
          const patch: { text: string; src?: string; tgt?: string } = { text: srcWhole }
          if (cur) { patch.src = cur.sourceLang; patch.tgt = cur.targetLang }
          useAiQAStore.getState().setTranslate(patch)
          showTabInDock('aitranslate')
        }
        break
      }
      case 'mergeNext': {
        const state = useProjectStore.getState()
        const fileSegs = state.segments
          .filter((x) => x.fileId === seg.fileId)
          .sort((a, b) => a.index - b.index)
        const curIdx = fileSegs.findIndex((x) => x.id === seg.id)
        if (curIdx === -1 || curIdx >= fileSegs.length - 1) {
          useUIStore.getState().notify('warning', '已是最后一段，无法与下一段合并')
          return
        }
        await state.mergeSegmentWithNext(seg.id!)
        useUIStore.getState().notify('success', '已合并下一段')
        break
      }
      case 'split': {
        const editorState = useEditorContextStore.getState()
        const sourceSel = editorState.sourceSelection
        if (!sourceSel || sourceSel.segmentId !== seg.id) {
          useUIStore.getState().notify('warning', '请先在原文中选中拆分位置（选区起点为拆分点）')
          return
        }
        const splitPos = sourceSel.start
        if (splitPos <= 0 || splitPos >= seg.source.length) {
          useUIStore.getState().notify('warning', '拆分位置无效，请在原文中间位置选中文本')
          return
        }
        await useProjectStore.getState().splitSegment(seg.id!, splitPos)
        useUIStore.getState().notify('success', '已拆分为两段')
        break
      }
      case 'locateSource': {
        if (!useLayoutStore.getState().isTabVisible('preview')) {
          useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「全文预览」')
          return
        }
        // 预览面板订阅 activeSegmentId，激活后自动高亮对应段落
        const state = useProjectStore.getState()
        if (state.activeSegmentId !== seg.id) {
          state.selectSegment(seg.id!)
          // 触发 linkage，确保预览面板滚动
          dispatchSegmentActivated(seg.id!, htmlToPlainText(seg.source ?? ''))
        }
        showTabInDock('preview')
        break
      }
      case 'searchSegment': {
        const editorState = useEditorContextStore.getState()
        const sourceSel = editorState.sourceSelection
        const keyword = sourceSel?.text?.trim()
        if (!keyword) {
          useUIStore.getState().notify('warning', '请先在原文中选中要搜索的片段文本')
          return
        }
        if (!useLayoutStore.getState().isTabVisible('fragmentSearch')) {
          useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「片段搜索」')
          return
        }
        // 写入关键词并激活片段搜索 Tab
        useLinkageFragmentSearchStore.getState().setKeyword(keyword)
        showTabInDock('fragmentSearch')
        break
      }
      default:
        if (action.startsWith('color:')) {
          // 对译文选中文本变色，action 格式 "color:#rrggbb"
          const color = action.substring(6)
          document.execCommand('foreColor', false, color)
          syncContentEditableInput()
        } else {
          console.debug(`[inline action] ${action} on segment ${seg.id}`)
        }
        break
    }
  }, [])
  return { runAction }
}

// —— 编辑器搜索条 ——
// 标题栏下展开的查找/替换条：支持关键词/正则、范围（当前文件/整个项目）、字段（原文/译文/备注）

type SearchField = 'source' | 'target' | 'notes'
type SearchScope = 'file' | 'project'

interface SearchMatch {
  segment: Segment
  field: SearchField
  fileName?: string | null
}

interface EditorSearchBarProps {
  segments: Segment[]
  activeFileId: ID | null
  currentProjectId: ID | null
  selectSegment: (id: ID | null) => void
  selectFile: (fileId: ID | null) => Promise<void>
  updateSegment: (id: ID, patch: Partial<Segment>) => Promise<void>
  onClose: () => void
  /** 状态筛选（空 Set = 不过滤）；搜索替换仅作用于允许的状态段 */
  statusFilter: Set<SegmentStatus>
}

function EditorSearchBar(props: EditorSearchBarProps) {
  const { segments, activeFileId, currentProjectId, selectSegment, selectFile, updateSegment, onClose, statusFilter } = props
  const [keyword, setKeyword] = useState('')
  // 高级模式：三个字段独立关键词，AND 关系
  const [advanced, setAdvanced] = useState(false)
  const [srcKeyword, setSrcKeyword] = useState('')
  const [tgtKeyword, setTgtKeyword] = useState('')
  const [notesKeyword, setNotesKeyword] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [scope, setScope] = useState<SearchScope>('file')
  const [fields, setFields] = useState({ source: true, target: true, notes: false })
  const [useRegex, setUseRegex] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [regexError, setRegexError] = useState<string | null>(null)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectMatches, setProjectMatches] = useState<SearchMatch[]>([])
  const keywordInputRef = useRef<HTMLInputElement>(null)

  // 自动聚焦
  useEffect(() => {
    keywordInputRef.current?.focus()
  }, [])

  // 切换模式时清空所有输入，避免语义混淆
  const toggleAdvanced = useCallback(() => {
    setAdvanced((v) => !v)
    setKeyword('')
    setSrcKeyword('')
    setTgtKeyword('')
    setNotesKeyword('')
    setReplaceText('')
    setCurrentIdx(0)
  }, [])

  // 构建匹配正则（简单模式用主关键词，高级模式用三个独立关键词分别构建）
  const buildRegex = useCallback((kw: string): RegExp | null => {
    const trimmed = kw.trim()
    if (!trimmed) return null
    try {
      return useRegex
        ? new RegExp(trimmed, 'gi')
        : new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    } catch {
      return null
    }
  }, [useRegex])

  // 简单模式主关键词正则
  const regex = useMemo(() => buildRegex(keyword), [buildRegex, keyword])

  // 高级模式三个字段正则
  const srcRegex = useMemo(() => buildRegex(srcKeyword), [buildRegex, srcKeyword])
  const tgtRegex = useMemo(() => buildRegex(tgtKeyword), [buildRegex, tgtKeyword])
  const notesRegex = useMemo(() => buildRegex(notesKeyword), [buildRegex, notesKeyword])

  // 高级模式是否有任意关键词填写
  const hasAdvancedInput = srcKeyword.trim() || tgtKeyword.trim() || notesKeyword.trim()

  // 同步正则错误状态（检查所有活跃正则）
  useEffect(() => {
    const kws = advanced
      ? [srcKeyword, tgtKeyword, notesKeyword].filter((k) => k.trim())
      : [keyword]
    if (kws.length === 0) { setRegexError(null); return }
    try {
      for (const kw of kws) {
        if (useRegex) new RegExp(kw.trim(), 'gi')
      }
      setRegexError(null)
    } catch (e) {
      setRegexError((e as Error).message)
    }
  }, [keyword, srcKeyword, tgtKeyword, notesKeyword, useRegex, advanced])

  // 高级模式：判断段是否满足 AND 条件（所有非空字段都命中）
  const matchAdvanced = useCallback((seg: Segment): boolean => {
    if (srcRegex) { srcRegex.lastIndex = 0; if (!srcRegex.test(seg.source ?? '')) return false }
    if (tgtRegex) { tgtRegex.lastIndex = 0; if (!tgtRegex.test(seg.target ?? '')) return false }
    if (notesRegex) { notesRegex.lastIndex = 0; if (!notesRegex.test(seg.notes ?? '')) return false }
    return true
  }, [srcRegex, tgtRegex, notesRegex])

  // 当前文件匹配（同步）
  const fileMatches = useMemo<SearchMatch[]>(() => {
    if (scope !== 'file') return []
    // 状态筛选：空 Set 不过滤，否则仅匹配允许的状态
    const visibleSegs = statusFilter.size === 0 ? segments : segments.filter((s) => statusFilter.has(s.status))
    if (advanced) {
      if (!hasAdvancedInput) return []
      const result: SearchMatch[] = []
      for (const seg of visibleSegs) {
        if (matchAdvanced(seg)) result.push({ segment: seg, field: 'target' })
      }
      return result
    }
    if (!regex) return []
    const result: SearchMatch[] = []
    for (const seg of visibleSegs) {
      if (fields.source) { regex.lastIndex = 0; if (regex.test(seg.source ?? '')) result.push({ segment: seg, field: 'source' }) }
      if (fields.target) { regex.lastIndex = 0; if (regex.test(seg.target ?? '')) result.push({ segment: seg, field: 'target' }) }
      if (fields.notes) { regex.lastIndex = 0; if (regex.test(seg.notes ?? '')) result.push({ segment: seg, field: 'notes' }) }
    }
    return result
  }, [scope, advanced, hasAdvancedInput, matchAdvanced, regex, segments, fields, statusFilter])

  // 整个项目匹配（异步）
  useEffect(() => {
    if (scope !== 'project') { setProjectMatches([]); return }
    if (currentProjectId == null) { setProjectMatches([]); return }
    // 检查是否有有效输入（显式分支以便 TS 收窄类型）
    if (advanced) {
      if (!hasAdvancedInput) { setProjectMatches([]); return }
    } else {
      if (!regex) { setProjectMatches([]); return }
    }
    let cancelled = false
    setProjectLoading(true)
    // 闭包内捕获 regex 本地引用，便于 TS 类型收窄
    const activeRegex = advanced ? null : regex
    ;(async () => {
      try {
        const projectFiles = await db.files.where({ projectId: currentProjectId as number }).toArray()
        if (projectFiles.length === 0) { if (!cancelled) { setProjectMatches([]); setProjectLoading(false) }; return }
        const fileIdToName = new Map(projectFiles.map((f) => [f.id as number, f.name]))
        const fileIds = projectFiles.map((f) => f.id as number)
        const rows = await db.segments.where('fileId').anyOf(fileIds).sortBy('index')
        // 状态筛选：空 Set 不过滤，否则仅保留允许的状态
        const visibleRows = statusFilter.size === 0 ? rows : rows.filter((s) => statusFilter.has(s.status))
        const hits: SearchMatch[] = []
        for (const seg of visibleRows) {
          const fileName = fileIdToName.get(seg.fileId as number) ?? '（未知文件）'
          if (advanced) {
            if (matchAdvanced(seg)) hits.push({ segment: seg, field: 'target', fileName })
          } else if (activeRegex) {
            if (fields.source) { activeRegex.lastIndex = 0; if (activeRegex.test(seg.source ?? '')) hits.push({ segment: seg, field: 'source', fileName }) }
            if (fields.target) { activeRegex.lastIndex = 0; if (activeRegex.test(seg.target ?? '')) hits.push({ segment: seg, field: 'target', fileName }) }
            if (fields.notes) { activeRegex.lastIndex = 0; if (activeRegex.test(seg.notes ?? '')) hits.push({ segment: seg, field: 'notes', fileName }) }
          }
        }
        if (!cancelled) { setProjectMatches(hits); setProjectLoading(false) }
      } catch (err) {
        console.error('[editorSearch:project]', err)
        if (!cancelled) { setProjectMatches([]); setProjectLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [scope, advanced, hasAdvancedInput, regex, currentProjectId, fields, matchAdvanced, statusFilter])

  const allMatches = scope === 'file' ? fileMatches : projectMatches

  // 命中数变化时重置索引
  useEffect(() => {
    setCurrentIdx(0)
  }, [allMatches.length, scope, keyword, srcKeyword, tgtKeyword, notesKeyword, advanced])

  // 跳转到指定命中
  const jumpTo = useCallback(async (idx: number) => {
    if (allMatches.length === 0) return
    const safeIdx = ((idx % allMatches.length) + allMatches.length) % allMatches.length
    const match = allMatches[safeIdx]
    if (scope === 'project' && match.segment.fileId !== activeFileId) {
      await selectFile(match.segment.fileId ?? null)
    }
    selectSegment(match.segment.id ?? null)
    setCurrentIdx(safeIdx)
  }, [allMatches, scope, activeFileId, selectFile, selectSegment])

  const goPrev = useCallback(() => jumpTo(currentIdx - 1), [jumpTo, currentIdx])
  const goNext = useCallback(() => jumpTo(currentIdx + 1), [jumpTo, currentIdx])

  // 构建替换用的正则（非全局，仅替换首个匹配；但全替换时用全局）
  // 简单模式用主关键词；高级模式用译文关键词（若无译文关键词则不可替换）
  const buildReplaceRegex = useCallback((global: boolean): RegExp | null => {
    const kw = (advanced ? tgtKeyword : keyword).trim()
    if (!kw) return null
    try {
      const flags = global ? 'gi' : 'i'
      return useRegex ? new RegExp(kw, flags) : new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
    } catch {
      return null
    }
  }, [keyword, tgtKeyword, useRegex, advanced])

  // 替换当前命中（简单模式：target/notes；高级模式：仅 target，用 tgtKeyword）
  const replaceCurrent = useCallback(async () => {
    if (allMatches.length === 0) return
    const match = allMatches[currentIdx]
    if (!match) return
    // 高级模式：替换对象固定为译文，使用 tgtKeyword
    if (advanced) {
      if (!tgtKeyword.trim()) {
        useUIStore.getState().notify('warning', '高级模式需填写译文关键词才能替换')
        return
      }
      const segId = match.segment.id
      if (segId == null) return
      const latest = scope === 'file'
        ? useProjectStore.getState().segments.find((s) => s.id === segId) ?? match.segment
        : await db.segments.get(segId as number) ?? match.segment
      const r = buildReplaceRegex(false)
      if (!r) return
      const replaced = (latest.target ?? '').replace(r, replaceText)
      if (replaced === latest.target) { goNext(); return }
      await updateSegment(segId, { target: replaced, status: 'draft' })
      goNext()
      return
    }
    // 简单模式
    if (match.field === 'source') {
      useUIStore.getState().notify('warning', '原文不可替换，请跳到译文或备注命中')
      return
    }
    const segId = match.segment.id
    if (segId == null) return
    const latest = scope === 'file'
      ? useProjectStore.getState().segments.find((s) => s.id === segId) ?? match.segment
      : await db.segments.get(segId as number) ?? match.segment
    const original = (match.field === 'target' ? latest.target : latest.notes) ?? ''
    const r = buildReplaceRegex(false)
    if (!r) return
    const replaced = original.replace(r, replaceText)
    if (replaced === original) { goNext(); return }
    const patch: Partial<Segment> = match.field === 'target'
      ? { target: replaced, status: 'draft' }
      : { notes: replaced }
    await updateSegment(segId, patch)
    goNext()
  }, [allMatches, currentIdx, scope, advanced, tgtKeyword, buildReplaceRegex, replaceText, updateSegment, goNext])

  // 全部替换（简单模式：target/notes；高级模式：仅 target）
  const replaceAll = useCallback(async () => {
    if (allMatches.length === 0) return
    if (advanced && !tgtKeyword.trim()) {
      useUIStore.getState().notify('warning', '高级模式需填写译文关键词才能替换')
      return
    }
    const r = buildReplaceRegex(true)
    if (!r) return
    // 按 segId 聚合，每段只更新一次
    const bySeg = new Map<ID, Partial<Segment>>()
    for (const m of allMatches) {
      if (advanced) {
        const segId = m.segment.id!
        const latest = scope === 'file'
          ? useProjectStore.getState().segments.find((s) => s.id === segId) ?? m.segment
          : m.segment
        bySeg.set(segId, { target: (latest.target ?? '').replace(r, replaceText), status: 'draft' })
      } else {
        if (m.field === 'source') continue
        const segId = m.segment.id!
        const latest = scope === 'file'
          ? useProjectStore.getState().segments.find((s) => s.id === segId) ?? m.segment
          : m.segment
        const patch = bySeg.get(segId) ?? {}
        if (m.field === 'target') {
          patch.target = (latest.target ?? '').replace(r, replaceText)
          patch.status = 'draft'
        } else {
          patch.notes = (latest.notes ?? '').replace(r, replaceText)
        }
        bySeg.set(segId, patch)
      }
    }
    let count = 0
    for (const [segId, patch] of bySeg) {
      if (Object.keys(patch).length > 0) {
        await updateSegment(segId, patch)
        count++
      }
    }
    useUIStore.getState().notify('success', `已替换 ${count} 个段落`)
  }, [allMatches, scope, buildReplaceRegex, replaceText, updateSegment])

  const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) goPrev(); else goNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const matchCount = allMatches.length
  const hasError = regexError != null
  const labelSx = { '& .MuiFormControlLabel-label': { fontSize: 12 } } as const
  const inputSx = { paddingTop: 6, paddingBottom: 6 } as const

  return (
    <Box sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
      {/* 第一行：查找输入 + 控制按钮 */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Tooltip title={showReplace ? '收起替换' : '展开替换'}>
          <IconButton size="small" onClick={() => setShowReplace((v) => !v)}>
            {showReplace ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        {advanced ? (
          // 高级模式：三个独立输入框，AND 关系
          <Stack direction="row" spacing={0.5} sx={{ flex: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="原文关键词"
              value={srcKeyword}
              onChange={(e) => setSrcKeyword(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              sx={{ flex: 1, minWidth: 80 }}
              slotProps={{ htmlInput: { style: inputSx } }}
            />
            <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600 }}>且</Typography>
            <TextField
              size="small"
              placeholder="译文关键词"
              value={tgtKeyword}
              onChange={(e) => setTgtKeyword(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              sx={{ flex: 1, minWidth: 80 }}
              slotProps={{ htmlInput: { style: inputSx } }}
            />
            <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600 }}>且</Typography>
            <TextField
              size="small"
              placeholder="备注关键词"
              value={notesKeyword}
              onChange={(e) => setNotesKeyword(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              sx={{ flex: 1, minWidth: 80 }}
              slotProps={{ htmlInput: { style: inputSx } }}
            />
          </Stack>
        ) : (
          // 简单模式：主输入框 + 字段勾选
          <>
            <TextField
              size="small"
              inputRef={keywordInputRef}
              placeholder={hasError ? '正则错误' : '查找（支持正则）'}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeywordKeyDown}
              error={hasError}
              sx={{ flex: 1, minWidth: 120 }}
              slotProps={{ htmlInput: { style: inputSx } }}
            />
            <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
              <FormControlLabel control={<Checkbox checked={fields.source} onChange={(_e, v) => setFields((f) => ({ ...f, source: v }))} size="small" sx={{ p: 0.25 }} />} label="原文" sx={{ mr: 0, ...labelSx }} />
              <FormControlLabel control={<Checkbox checked={fields.target} onChange={(_e, v) => setFields((f) => ({ ...f, target: v }))} size="small" sx={{ p: 0.25 }} />} label="译文" sx={{ mr: 0, ...labelSx }} />
              <FormControlLabel control={<Checkbox checked={fields.notes} onChange={(_e, v) => setFields((f) => ({ ...f, notes: v }))} size="small" sx={{ p: 0.25 }} />} label="备注" sx={{ mr: 0, ...labelSx }} />
            </Stack>
          </>
        )}
        <Tooltip title="使用正则表达式">
          <ToggleButton
            size="small"
            value="regex"
            selected={useRegex}
            onChange={() => setUseRegex((v) => !v)}
            sx={{ px: 0.75, py: 0.25, fontSize: '0.7rem', minWidth: 32, color: useRegex ? 'primary.main' : 'text.disabled', borderColor: useRegex ? 'primary.main' : 'divider' }}
          >
            .*
          </ToggleButton>
        </Tooltip>
        <ToggleButtonGroup
          value={scope}
          exclusive
          size="small"
          onChange={(_e, v) => v && setScope(v as SearchScope)}
        >
          <ToggleButton value="file" sx={{ px: 1, py: 0.25, fontSize: '0.7rem' }}>当前文件</ToggleButton>
          <ToggleButton value="project" sx={{ px: 1, py: 0.25, fontSize: '0.7rem' }}>整个项目</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title={advanced ? '切换为简单模式（单关键词+字段多选）' : '切换为高级模式（三字段独立关键词，AND 关系）'}>
          <ToggleButton
            size="small"
            value="advanced"
            selected={advanced}
            onChange={toggleAdvanced}
            sx={{ px: 0.75, py: 0.25, fontSize: '0.7rem', minWidth: 32, color: advanced ? 'primary.main' : 'text.disabled', borderColor: advanced ? 'primary.main' : 'divider' }}
          >
            高级
          </ToggleButton>
        </Tooltip>
        <Typography variant="caption" sx={{ color: matchCount > 0 ? 'text.secondary' : 'text.disabled', minWidth: 56, textAlign: 'center' }}>
          {projectLoading ? '搜索中…' : matchCount > 0 ? `${currentIdx + 1}/${matchCount}` : '0/0'}
        </Typography>
        <Tooltip title="上一处 (Shift+Enter)">
          <span>
            <IconButton size="small" onClick={goPrev} disabled={matchCount === 0}>
              <NavigateBeforeIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="下一处 (Enter)">
          <span>
            <IconButton size="small" onClick={goNext} disabled={matchCount === 0}>
              <NavigateNextIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="关闭 (Esc)">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {advanced && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
          高级模式：填写字段间为 AND 关系（所有非空字段都需命中），替换仅作用于译文关键词
        </Typography>
      )}
      {showReplace && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
          <TextField
            size="small"
            placeholder={advanced ? '替换为（作用于译文关键词）' : '替换为'}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
            sx={{ flex: 1, minWidth: 120 }}
            slotProps={{ htmlInput: { style: inputSx } }}
          />
          <Tooltip title={advanced ? '替换当前命中段的译文' : '替换当前命中（原文不可替换）'}>
            <span>
              <IconButton size="small" onClick={replaceCurrent} disabled={matchCount === 0}>
                <FindReplaceIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={advanced ? '全部替换译文' : '全部替换（仅译文/备注）'}>
            <span>
              <IconButton size="small" onClick={replaceAll} disabled={matchCount === 0}>
                <DoneAllIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }}>
            {advanced ? '高级模式：替换译文关键词，状态置为草稿' : '原文不可替换；替换译文时状态自动置为草稿'}
          </Typography>
        </Stack>
      )}
      {hasError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.25 }}>
          正则错误：{regexError}
        </Typography>
      )}
    </Box>
  )
}

// —— 主组件 ——

export function DivBilingualEditor(): ReactElement {
  // Store
  const segments = useProjectStore((s) => s.segments)
  const activeSegmentId = useProjectStore((s) => s.activeSegmentId)
  const selectSegment = useProjectStore((s) => s.selectSegment)
  const updateSegment = useProjectStore((s) => s.updateSegment)
  const selectFile = useProjectStore((s) => s.selectFile)
  const activeFileId = useProjectStore((s) => s.activeFileId)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const theme = useUIStore((s) => s.theme)
  const setEditorActiveSegment = useEditorContextStore((s) => s.setActiveSegment)
  const clearEditorSelection = useEditorContextStore((s) => s.clearSelection)
  const terms = useTermStore((s) => s.terms)

  // Local state
  const [layout, setLayout] = useState<LayoutMode>('stack')
  const [hiddenStatus, setHiddenStatus] = useState(false)
  const [hiddenNotes, setHiddenNotes] = useState(false)
  const [showFocusPanel, setShowFocusPanel] = useState(false)
  const [focusEditing, setFocusEditing] = useState(false)
  const [sourceEditingId, setSourceEditingId] = useState<ID | null>(null)
  const [showSearchBar, setShowSearchBar] = useState(false)
  // 状态筛选器（空 Set = 不过滤，显示所有）
  const [statusFilter, setStatusFilter] = useState<Set<SegmentStatus>>(new Set())
  const [showStatusFilter, setShowStatusFilter] = useState<HTMLButtonElement | null>(null)
  // 自动翻译状态
  const [autoTranslating, setAutoTranslating] = useState(false)
  const [autoProgress, setAutoProgress] = useState({ done: 0, total: 0 })
  const [showAutoTranslateDialog, setShowAutoTranslateDialog] = useState(false)
  const [autoTranslateCount, setAutoTranslateCount] = useState('50')
  const autoCancelRef = useRef(false)
  // TM 自动填充状态
  const [tmAutoFilling, setTmAutoFilling] = useState(false)
  const [showTmAutoFillDialog, setShowTmAutoFillDialog] = useState(false)
  const [tmAutoFillThreshold, setTmAutoFillThreshold] = useState('100')
  // 剪贴板翻译
  const [showClipboardDialog, setShowClipboardDialog] = useState(false)
  const [clipboardManualText, setClipboardManualText] = useState('')
  const { widths, startResize } = useColumnResize()
  const targetCursor = useEditorContextStore((s) => s.targetCursor)
  const targetSelection = useEditorContextStore((s) => s.targetSelection)

  // 状态筛选：空 Set 表示不过滤，显示所有段
  const filteredSegments = useMemo(() => {
    if (statusFilter.size === 0) return segments
    return segments.filter((s) => statusFilter.has(s.status))
  }, [segments, statusFilter])

  // —— 术语译文粘贴到译文编辑器（模拟 Ctrl+V：选区优先替换，否则光标插入） ——
  // 始终编辑态：contenteditable 始终挂载，直接插入；仅在段未渲染（离屏）等异常情况兜底提示
  const onInsertTermTarget = useCallback((targetText: string) => {
    const segId = useProjectStore.getState().activeSegmentId
    if (segId == null) return
    const ok = doInsertViaExecCommand(segId, targetText, targetSelection, targetCursor)
    if (!ok) {
      useUIStore.getState().notify('info', '当前段未在可视区域，请先滚动到该段再插入术语')
    }
  }, [targetCursor, targetSelection])

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null)
  const editingValueRef = useRef<string>('')
  const focusEditingValueRef = useRef<string>('')
  const sourceEditingValueRef = useRef<string>('')
  const activeSegmentIdRef = useRef<ID | null>(activeSegmentId)
  activeSegmentIdRef.current = activeSegmentId
  const focusEditingRef = useRef(focusEditing)
  focusEditingRef.current = focusEditing
  /** 是否在段切换后自动将光标聚焦到译文编辑区（键盘触发 true，鼠标触发 false） */
  const autoFocusTargetRef = useRef(false)
  /** 缓存上一次的激活段 ID，用于退出时检测空草稿回退 */
  const prevActiveIdRef = useRef<ID | null>(null)

  // —— 包装 runAction：拦截 editSource，进入原文编辑态 ——
  const { runAction: baseRunAction } = useSegmentActions()
  const runAction = useCallback((seg: Segment, action: string) => {
    if (action === 'editSource') {
      sourceEditingValueRef.current = seg.source
      setSourceEditingId(seg.id!)
      return
    }
    baseRunAction(seg, action)
  }, [baseRunAction])

  // —— 译文始终处于编辑态（contenteditable 始终挂载），无需 requestEnterEditMode 订阅 ——

  // Virtual scrolling — estimateSize 考虑到按钮条展开后行高更大（只 active 那一行会变高）
  // 实际高度由 measureElement 通过 ResizeObserver 测量，这里只是默认估计
  const virtualizer = useVirtualizer({
    count: filteredSegments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (layout === 'stack' ? 90 : 60),
    overscan: 5,
    getItemKey: (index) => filteredSegments[index]?.id ?? index,
  })

  // 活动段变化时滚动到该段
  useEffect(() => {
    if (activeSegmentId == null || filteredSegments.length === 0) return
    const idx = filteredSegments.findIndex((s) => s.id === activeSegmentId)
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
    }
  }, [activeSegmentId, segments, virtualizer])

  // 聚焦指定段的译文 contenteditable 编辑区，并将光标置于文本末尾
  // 考虑虚拟滚动可能尚未挂载 DOM，采用重试机制（最多 6 次 × 50ms = 300ms）
  const focusTargetEditable = useCallback((segId: ID, attempt = 0) => {
    if (segId == null) return
    const el = document.querySelector<HTMLElement>(
      `[data-seg-id="${String(segId)}"][contenteditable="true"]`,
    )
    if (el) {
      el.focus()
      // 光标移动到文本末尾
      try {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      } catch { /* 富文本节点结构异常时忽略，只聚焦即可 */ }
    } else if (attempt < 6) {
      setTimeout(() => focusTargetEditable(segId, attempt + 1), 50)
    }
  }, [])

  // 同步激活段到编辑器上下文 store（供其他功能块订阅）
  // 仅在 activeSegmentId 变化时触发，不依赖 segments（避免标注状态等字段变化时重复触发联动）
  useEffect(() => {
    // 退出激活段时：如果旧段为草稿且译文为空，自动回退为未译
    if (prevActiveIdRef.current != null && prevActiveIdRef.current !== activeSegmentId) {
      const prevSeg = useProjectStore.getState().segments.find((s) => s.id === prevActiveIdRef.current)
      if (prevSeg && prevSeg.status === 'draft' && !(prevSeg.target ?? '').trim()) {
        useProjectStore.getState().updateSegment(prevSeg.id!, { status: 'untranslated' })
      }
    }
    prevActiveIdRef.current = activeSegmentId

    setEditorActiveSegment(activeSegmentId ?? null)
    clearEditorSelection()
    // 翻译联动：激活段变化时，发送原文给当前 active 的功能卡片（防抖 400ms）
    if (activeSegmentId != null) {
      const seg = useProjectStore.getState().segments.find((s) => s.id === activeSegmentId)
      if (seg) {
        dispatchSegmentActivated(activeSegmentId, htmlToPlainText(seg.source ?? ''))
      }
      // 键盘/按钮驱动的段切换 → 自动聚焦译文编辑区
      if (autoFocusTargetRef.current) {
        autoFocusTargetRef.current = false
        // 等 scrollToIndex 和虚拟滚动渲染完毕再聚焦
        setTimeout(() => focusTargetEditable(activeSegmentId!), 60)
      }
    } else {
      autoFocusTargetRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentId])

  // CSS 变量：列宽（隐藏时设为 0px）
  const cssVars = useMemo(() => {
    const statusW = hiddenStatus ? '0px' : `${widths.status}px`
    const notesW = hiddenNotes ? '0px' : `${widths.notes}px`
    if (layout === 'stack') {
      return {
        '--col-status': statusW,
        '--col-notes': notesW,
      } as React.CSSProperties
    }
    return {
      '--col-status': statusW,
      '--col-source': `${widths.source}fr`,
      '--col-target': `${widths.target}fr`,
      '--col-notes': notesW,
    } as React.CSSProperties
  }, [layout, widths, hiddenStatus, hiddenNotes])

  // —— 顶部快捷导航：下一段 / 下一个未译段 ——
  const goNextSegment = useCallback(() => {
    if (filteredSegments.length === 0) return
    const seg = activeSegmentId != null ? filteredSegments.find((s) => s.id === activeSegmentId) : null
    const idx = seg ? filteredSegments.findIndex((s) => s.id === seg.id) : -1
    const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, filteredSegments.length - 1)
    autoFocusTargetRef.current = true
    selectSegment(filteredSegments[nextIdx].id!)
  }, [filteredSegments, activeSegmentId, selectSegment])

  const goNextUntranslated = useCallback(() => {
    if (filteredSegments.length === 0) {
      useUIStore.getState().notify('info', '没有需要翻译的段落')
      return
    }
    const seg = activeSegmentId != null ? filteredSegments.find((s) => s.id === activeSegmentId) : null
    const fromIdx = seg ? filteredSegments.findIndex((s) => s.id === seg.id) : -1
    const searchOrder = [
      ...filteredSegments.slice(fromIdx + 1),
      ...filteredSegments.slice(0, Math.max(0, fromIdx + 1)),
    ]
    const found = searchOrder.find((s) => needsTranslation(s))
    if (found) {
      autoFocusTargetRef.current = true
      selectSegment(found.id!)
    } else {
      useUIStore.getState().notify('info', '没有需要翻译的段落')
    }
  }, [filteredSegments, activeSegmentId, selectSegment])

  // 全局快捷键：Ctrl+F 搜索；Ctrl+Shift+M/S 合并/拆分；Ctrl+Shift+Enter 下个未译段
  // 注：useEffect 必须放在 goNextUntranslated 之后，避免"使用前未声明"
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowSearchBar((v) => !v)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        const active = document.activeElement as HTMLElement | null
        if (!active || !active.closest('[contenteditable="true"], input, textarea')) {
          e.preventDefault()
          goNextUntranslated()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        const ps = useProjectStore.getState()
        const seg = ps.activeSegmentId != null ? ps.segments.find((s) => s.id === ps.activeSegmentId) : null
        if (!seg) return
        const k = e.key.toLowerCase()
        if (k === 'm') {
          e.preventDefault()
          runAction(seg, 'mergeNext')
        } else if (k === 's') {
          e.preventDefault()
          runAction(seg, 'split')
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [runAction, goNextUntranslated])

  // —— 操作 ——

  // 聚焦编辑台提交（在切换段/进入行内编辑前自动调用）
  const handleFocusCommit = useCallback(() => {
    const segId = activeSegmentIdRef.current
    if (segId != null) {
      const seg = useProjectStore.getState().segments.find((s) => s.id === segId)
      if (seg && seg.id != null && focusEditingValueRef.current !== seg.target) {
        updateSegment(seg.id, { target: focusEditingValueRef.current, status: 'draft' })
      }
    }
    setFocusEditing(false)
  }, [updateSegment])

  const handleRowClick = useCallback((segId: ID) => {
    if (focusEditingRef.current) {
      handleFocusCommit()
    }
    if (segId !== activeSegmentIdRef.current) {
      selectSegment(segId)
    }
  }, [selectSegment, handleFocusCommit])

  // 译文区点击：始终编辑态下与行点击一致（激活段），保留 prop 以兼容行组件签名
  const handleTargetClick = useCallback((segId: ID) => {
    handleRowClick(segId)
  }, [handleRowClick])

  const handleStatusClick = useCallback((seg: Segment) => {
    const idx = STATUS_ORDER.indexOf(seg.status)
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
    if (seg.id != null) {
      updateSegment(seg.id, { status: next })
    }
  }, [updateSegment])

  // 始终编辑态：commit 仅负责把 ref 里的草稿写入 store，不再切换编辑态
  // status 可自定义（如 Ctrl+Enter 传 'translated'），默认 'draft'
  const handleCommit = useCallback((seg: Segment, value: string, status: SegmentStatus = 'draft') => {
    if (seg.id == null) return
    const patch: Partial<Segment> = {}
    if (value !== seg.target) patch.target = value
    if (status !== seg.status) patch.status = status
    if (Object.keys(patch).length > 0) updateSegment(seg.id, patch)
  }, [updateSegment])

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent, seg: Segment) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Enter：保存草稿 + 下一段
        e.preventDefault()
        handleCommit(seg, editingValueRef.current)
        const idx = filteredSegments.findIndex((s) => s.id === seg.id)
        if (idx >= 0 && idx < filteredSegments.length - 1) {
          autoFocusTargetRef.current = true
          const nextSeg = filteredSegments[idx + 1]
          selectSegment(nextSeg.id!)
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'Enter') {
        // Ctrl+Enter：标记已译 + 下一段
        e.preventDefault()
        const value = editingValueRef.current
        handleCommit(seg, value, value.trim() ? 'translated' : 'draft')
        const idx = filteredSegments.findIndex((s) => s.id === seg.id)
        if (idx >= 0 && idx < filteredSegments.length - 1) {
          autoFocusTargetRef.current = true
          const nextSeg = filteredSegments[idx + 1]
          selectSegment(nextSeg.id!)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        // Ctrl+Shift+Enter：标记已译 + 下一个未译段
        e.preventDefault()
        const value = editingValueRef.current
        handleCommit(seg, value, value.trim() ? 'translated' : 'draft')
        autoFocusTargetRef.current = true
        goNextUntranslated()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        selectSegment(null)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        const idx = filteredSegments.findIndex((s) => s.id === seg.id)
        const direction = e.shiftKey ? -1 : 1
        const nextIdx = idx + direction
        if (nextIdx >= 0 && nextIdx < filteredSegments.length) {
          handleCommit(seg, editingValueRef.current)
          autoFocusTargetRef.current = true
          const nextSeg = filteredSegments[nextIdx]
          selectSegment(nextSeg.id!)
        }
      }
    },
    [filteredSegments, selectSegment, handleCommit, goNextUntranslated],
  )

  // —— 原文编辑：确认/取消 ——
  const handleSourceCommit = useCallback((seg: Segment) => {
    const val = sourceEditingValueRef.current
    if (seg.id != null && val !== seg.source) {
      updateSegment(seg.id, { source: val })
    }
    setSourceEditingId(null)
  }, [updateSegment])

  const handleSourceCancel = useCallback(() => {
    setSourceEditingId(null)
  }, [])

  // —— 聚焦编辑台操作 ——
  const handleFocusStartEdit = useCallback(() => {
    const seg = useProjectStore.getState().segments.find((s) => s.id === activeSegmentIdRef.current)
    focusEditingValueRef.current = seg?.target ?? ''
    setFocusEditing(true)
  }, [])

  const handleFocusNavigate = useCallback((direction: 1 | -1) => {
    if (activeSegmentIdRef.current == null) return
    const idx = filteredSegments.findIndex((s) => s.id === activeSegmentIdRef.current)
    const nextIdx = idx + direction
    if (nextIdx >= 0 && nextIdx < filteredSegments.length) {
      autoFocusTargetRef.current = true
      selectSegment(filteredSegments[nextIdx].id!)
    }
  }, [filteredSegments, selectSegment])

  // —— 剪贴板翻译：从剪贴板导入 / 导出到剪贴板 ——
  const doImportClipboardText = useCallback(async (text: string) => {
    const result = await useProjectStore.getState().importClipboardText(text)
    if (!result) {
      useUIStore.getState().notify('error', '导入失败：未打开项目或内容为空')
      return
    }
    useUIStore.getState().notify(
      'success',
      `${result.isExisting ? '已追加到' : '已创建'}「剪贴板翻译」，新增 ${result.newSegmentCount} 段`,
    )
  }, [])

  const handleImportFromClipboard = useCallback(async () => {
    if (!currentProjectId) {
      useUIStore.getState().notify('warning', '请先打开或创建项目')
      return
    }
    let text: string | null = null
    try {
      text = await navigator.clipboard.readText()
    } catch {
      // 浏览器拒绝读取剪贴板 → 弹出手动粘贴对话框
      setClipboardManualText('')
      setShowClipboardDialog(true)
      return
    }
    if (!text || !text.trim()) {
      useUIStore.getState().notify('warning', '剪贴板内容为空')
      return
    }
    await doImportClipboardText(text)
  }, [currentProjectId, doImportClipboardText])

  // 注册 Ctrl+Alt+V（macOS 下 Cmd+Alt+V）快捷键：从剪贴板导入
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        handleImportFromClipboard()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleImportFromClipboard])

  const handleExportToClipboard = useCallback(async () => {
    if (!segments || segments.length === 0) {
      useUIStore.getState().notify('warning', '当前文件无段落')
      return
    }
    const translated = segments.filter(
      (s) => s.status !== 'untranslated' && s.target && s.target.trim(),
    )
    if (translated.length === 0) {
      useUIStore.getState().notify('warning', '该文件暂无已译内容')
      return
    }
    const text = translated.map((s) => s.target).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      useUIStore.getState().notify('success', `已导出 ${translated.length} 段译文到剪贴板`)
    } catch {
      // 兜底：textarea + execCommand
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        useUIStore.getState().notify('success', `已导出 ${translated.length} 段译文到剪贴板`)
      } catch {
        useUIStore.getState().notify('error', '无法写入剪贴板')
      }
      document.body.removeChild(textarea)
    }
  }, [segments])

  // —— 自动翻译：批量调用 AI 翻译未译段落（5 句并发） ——
  const handleAutoTranslate = useCallback(async (count: number) => {
    if (autoTranslating) {
      // 正在翻译中，点击则取消
      autoCancelRef.current = true
      return
    }
    // 1. 检查 AI provider 配置
    const aiState = useAiQAStore.getState()
    const activeProviders = (Object.entries(aiState.providers) as [AiProviderKey, AiProviderCfg][])
      .filter(([, cfg]) => cfg.enabled && cfg.apiKey.trim())
    // 术语套用配置（与 AITranslatePanel 共用同一开关）
    const applyTerms = aiState.applyTermsInTranslate
    const terms = useTermStore.getState().terms
    if (activeProviders.length === 0) {
      useUIStore.getState().notify('warning', '请先在「设置 → AI问答 → API 调用」中配置并启用至少一个 AI 提供商')
      return
    }
    // 2. 收集需要翻译的段落（未译状态 或 译文为空）
    const allSegments = useProjectStore.getState().segments
    const untranslated = allSegments.filter((s) => needsTranslation(s))
    if (untranslated.length === 0) {
      useUIStore.getState().notify('info', '当前文件没有需要翻译的段落')
      return
    }
    // 取前 count 句（不足则取全部）
    const toTranslate = untranslated.slice(0, Math.max(1, count))
    // 3. 获取语言对
    const projState = useProjectStore.getState()
    const cur = projState.projects.find((p) => p.id === projState.currentProjectId)
    const src = cur?.sourceLang ?? ''
    const tgt = cur?.targetLang ?? ''
    // 构造 system prompt（用户可编辑，从 store 读取）
    const systemParts: string[] = [useAiQAStore.getState().translateSystemPrompt]
    if (src.trim()) systemParts.push(`源语言标签：${src.trim()}`)
    if (tgt.trim()) systemParts.push(`目标语言标签：${tgt.trim()}`)
    const systemPrompt = systemParts.join('\n')
    // 4. 5 句并发池
    autoCancelRef.current = false
    setAutoTranslating(true)
    setAutoProgress({ done: 0, total: toTranslate.length })
    const updateSegment = useProjectStore.getState().updateSegment
    const CONCURRENCY = 5
    let done = 0
    let success = 0
    let failed = 0
    let idx = 0
    const worker = async () => {
      while (idx < toTranslate.length && !autoCancelRef.current) {
        const seg = toTranslate[idx++]
        if (!seg.id || !seg.source?.trim()) { done++; setAutoProgress({ done, total: toTranslate.length }); continue }
        try {
          // 轮询使用多个 provider（均匀分布负载）
          const [providerKey, providerCfg] = activeProviders[(done) % activeProviders.length]
          const trimmedSource = htmlToPlainText(seg.source).trim()
          // 术语套用：开关开启时，匹配原文术语并追加到 user prompt
          const termHint = applyTerms ? buildTermHint(trimmedSource, terms) : ''
          const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmedSource + termHint },
          ]
          const { content: result } = await callAiChat(providerKey, providerCfg, messages)
          if (result.trim()) {
            await updateSegment(seg.id, { target: result.trim(), status: 'draft' })
            success++
          } else {
            failed++
          }
        } catch {
          failed++
        }
        done++
        setAutoProgress({ done, total: toTranslate.length })
      }
    }
    // 启动 CONCURRENCY 个 worker
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    setAutoTranslating(false)
    const cancelledNote = autoCancelRef.current ? '（已取消）' : ''
    useUIStore.getState().notify(
      success > 0 ? 'success' : 'warning',
      `自动翻译完成${cancelledNote}：成功 ${success} 句${failed > 0 ? `，失败 ${failed} 句` : ''}`,
    )
  }, [autoTranslating])

  // —— TM 自动填充：遍历未译段，查翻译记忆库，匹配度 ≥ 阈值则填充译文 ——

  const handleTmAutoFill = useCallback(async (threshold: number) => {
    if (tmAutoFilling) return
    const projState = useProjectStore.getState()
    const projectId = projState.currentProjectId
    if (projectId == null) {
      useUIStore.getState().notify('warning', '请先打开或创建项目')
      return
    }
    const allSegments = projState.segments
    const untranslated = allSegments.filter((s) => needsTranslation(s))
    if (untranslated.length === 0) {
      useUIStore.getState().notify('info', '当前文件没有需要翻译的段落')
      return
    }
    // 加载 TM 条目（优先当前项目，无则全局同语言对）
    const cur = projState.projects.find((p) => p.id === projectId)
    const src = cur?.sourceLang as LanguageCode | undefined
    const tgt = cur?.targetLang as LanguageCode | undefined
    let entries: TMEntry[] = []
    try {
      entries = await db.tmEntries.where('projectId').equals(projectId as number).toArray()
      if (entries.length === 0 && src) {
        entries = await db.tmEntries.where('sourceLang').equals(src).toArray()
      }
    } catch { /* ignore */ }
    // 回退：用当前文件已译段落构造伪 TMEntry
    if (entries.length === 0) {
      const now = Date.now()
      entries = allSegments
        .filter((s) => s.target?.trim() && s.source?.trim())
        .map((s) => ({
          source: s.source,
          target: s.target,
          sourceLang: (src ?? 'en') as LanguageCode,
          targetLang: (tgt ?? 'zh-CN') as LanguageCode,
          projectId: projectId ?? undefined,
          createdAt: now,
          updatedAt: now,
        } as TMEntry))
    }
    if (entries.length === 0) {
      useUIStore.getState().notify('info', '翻译记忆库为空，无可填充内容')
      return
    }
    setTmAutoFilling(true)
    let filled = 0
    let skipped = 0
    const updateSegment = projState.updateSegment
    for (const seg of untranslated) {
      if (!seg.id || !seg.source?.trim()) { skipped++; continue }
      const matches = searchMemory(entries, htmlToPlainText(seg.source), {
        sourceLang: src,
        targetLang: tgt,
        threshold,
        limit: 1,
      })
      if (matches.length > 0 && matches[0].entry.target.trim()) {
        await updateSegment(seg.id, { target: matches[0].entry.target.trim(), status: 'draft' })
        filled++
      } else {
        skipped++
      }
    }
    setTmAutoFilling(false)
    useUIStore.getState().notify(
      filled > 0 ? 'success' : 'info',
      `TM 自动填充完成：填充 ${filled} 段，跳过 ${skipped} 段（阈值 ${threshold}%）`,
    )
  }, [tmAutoFilling])

  // —— 渲染 ——

  const isDark = theme === 'dark'
  const headerBg = isDark ? '#1e2d3d' : '#f5f7fa'
  const rowBg = isDark ? '#162130' : '#ffffff'
  const oddRowBg = isDark ? '#192334' : '#fafbfc'
  const selectedBg = isDark ? 'rgba(144,202,249,0.12)' : 'rgba(25,118,210,0.08)'
  const hoverBg = isDark ? 'rgba(144,202,249,0.08)' : 'rgba(25,118,210,0.04)'
  const textColor = isDark ? '#e0e0e0' : 'rgba(0,0,0,0.87)'
  const secondaryColor = isDark ? '#b0bec5' : 'rgba(0,0,0,0.6)'

  // 列头模板：隐藏时仍保留图标所需最小宽度（32px），确保图标可点击恢复
  // 行内容则通过 CSS 变量（0px）+ display:none 完全隐藏
  const statusHeaderW = hiddenStatus ? '32px' : 'var(--col-status)'
  const notesHeaderW = hiddenNotes ? '32px' : 'var(--col-notes)'
  const headerGridTemplate = layout === 'stack'
    ? `${statusHeaderW} 1fr ${notesHeaderW}`
    : `${statusHeaderW} var(--col-source) var(--col-target) ${notesHeaderW}`

  // 空状态
  if (segments.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Tooltip title="切换布局">
            <IconButton size="small" disabled>
              {layout === 'stack' ? <ViewStreamIcon fontSize="small" /> : <ViewColumnIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            请先选择文件
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="剪贴板翻译：从剪贴板导入原文（Ctrl+Alt+V）">
            <IconButton
              size="small"
              onClick={handleImportFromClipboard}
              sx={{ color: 'text.disabled' }}
            >
              <ContentPasteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            无翻译内容
          </Typography>
        </Box>

        {/* 剪贴板手动粘贴兜底对话框 */}
        <Dialog
          open={showClipboardDialog}
          onClose={() => { setShowClipboardDialog(false); setClipboardManualText('') }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>从剪贴板导入</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              浏览器无法直接读取剪贴板，请在此处手动粘贴（Ctrl+V）要翻译的内容：
            </Typography>
            <TextField
              multiline
              rows={8}
              fullWidth
              value={clipboardManualText}
              onChange={(e) => setClipboardManualText(e.target.value)}
              placeholder="在此粘贴要翻译的内容..."
              autoFocus
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setShowClipboardDialog(false); setClipboardManualText('') }}>取消</Button>
            <Button
              variant="contained"
              disabled={!clipboardManualText.trim()}
              onClick={async () => {
                const text = clipboardManualText
                setShowClipboardDialog(false)
                setClipboardManualText('')
                await doImportClipboardText(text)
              }}
            >
              导入
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        color: textColor,
        bgcolor: rowBg,
      }}
      style={cssVars}
    >
      {/* 顶部工具栏 */}
      <Box sx={{
        p: 0.5, display: 'flex', gap: 0.5, alignItems: 'center',
        borderBottom: 1, borderColor: 'divider', flexShrink: 0,
      }}>
        <Tooltip title={layout === 'stack' ? '切换为左右对照' : '切换为上下对照'}>
          <IconButton size="small" onClick={() => {
            setLayout((prev) => (prev === 'stack' ? 'table' : 'stack'))
          }}>
            {layout === 'stack' ? <ViewColumnIcon fontSize="small" /> : <ViewStreamIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={showFocusPanel ? '关闭聚焦编辑台' : '开启聚焦编辑台（底部固定编辑区）'}>
          <IconButton size="small" onClick={() => {
            // 切换前提交当前聚焦编辑台内容（行内始终编辑态，无需单独提交）
            if (focusEditingRef.current) handleFocusCommit()
            setShowFocusPanel((v) => !v)
            setFocusEditing(false)
          }} sx={{ color: showFocusPanel ? 'primary.main' : 'text.disabled' }}>
            <CenterFocusStrongIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
          {statusFilter.size === 0
            ? `共 ${segments.length} 段 · 已译 ${segments.filter((s) => s.status !== 'untranslated').length} 段`
            : `筛选 ${filteredSegments.length}/${segments.length} 段 · 已译 ${filteredSegments.filter((s) => s.status !== 'untranslated').length} 段`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {autoTranslating && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <CircularProgress size={14} />
            <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 48 }}>
              {autoProgress.done}/{autoProgress.total}
            </Typography>
          </Stack>
        )}
        {/* 快捷导航文本按钮（浅灰、可点击） */}
        <Tooltip title="下一段（也可在编辑态按 Enter）">
          <Typography
            component="span"
            variant="caption"
            onClick={(e) => { e.stopPropagation(); goNextSegment() }}
            sx={{
              color: 'text.disabled',
              cursor: 'pointer',
              userSelect: 'none',
              mx: 0.75,
              '&:hover': { color: 'text.secondary', textDecoration: 'underline' },
            }}
          >
            Enter 下一段
          </Typography>
        </Tooltip>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>·</Typography>
        <Tooltip title="跳至下个未译段（Ctrl/Cmd + Shift + Enter）">
          <Typography
            component="span"
            variant="caption"
            onClick={(e) => { e.stopPropagation(); goNextUntranslated() }}
            sx={{
              color: 'text.disabled',
              cursor: 'pointer',
              userSelect: 'none',
              mx: 0.75,
              '&:hover': { color: 'text.secondary', textDecoration: 'underline' },
            }}
          >
            Ctrl+Shift+↵ 下个未译段
          </Typography>
        </Tooltip>
        <Tooltip title="剪贴板翻译：从剪贴板导入原文（Ctrl+Alt+V）">
          <IconButton size="small" onClick={handleImportFromClipboard} sx={{ color: 'text.disabled' }}>
            <ContentPasteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="导出当前文件已译内容到剪贴板">
          <IconButton size="small" onClick={handleExportToClipboard} sx={{ color: 'text.disabled' }}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={tmAutoFilling ? 'TM 自动填充中…' : 'TM 自动填充未译段（Shift+点击设置阈值）'}>
          <IconButton
            size="small"
            disabled={tmAutoFilling}
            onClick={(e) => {
              if (e.shiftKey) {
                setShowTmAutoFillDialog(true)
              } else {
                handleTmAutoFill(100)
              }
            }}
            sx={{ color: 'primary.main' }}
          >
            {tmAutoFilling ? <CircularProgress size={16} /> : <PlaylistAddCheckIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={autoTranslating ? '点击取消自动翻译' : '自动翻译未译段落（Shift+点击自定义数量）'}>
          <IconButton
            size="small"
            onClick={(e) => {
              if (autoTranslating) {
                handleAutoTranslate(0)
              } else if (e.shiftKey) {
                setShowAutoTranslateDialog(true)
              } else {
                handleAutoTranslate(50)
              }
            }}
            sx={{ color: autoTranslating ? 'error.main' : 'primary.main' }}
          >
            <AutoAwesomeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={statusFilter.size === 0 ? '状态筛选（当前：全部）' : `状态筛选（${statusFilter.size}项）`}>
          <IconButton
            size="small"
            onClick={(e) => setShowStatusFilter(e.currentTarget)}
            sx={{ color: statusFilter.size > 0 ? 'primary.main' : 'text.disabled' }}
          >
            <Badge badgeContent={statusFilter.size > 0 ? statusFilter.size : undefined} color="primary" sx={{ '& .MuiBadge-badge': { fontSize: 9, height: 14, minWidth: 14 } }}>
              <FilterListIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
        <Tooltip title="查找/替换 (Ctrl+F)">
          <IconButton size="small" onClick={() => setShowSearchBar((v) => !v)} sx={{ color: showSearchBar ? 'primary.main' : 'text.disabled' }}>
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 状态筛选器弹窗：多选段状态，筛选段列表 + 搜索替换范围 */}
      <Popover
        open={showStatusFilter != null}
        anchorEl={showStatusFilter}
        onClose={() => setShowStatusFilter(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 260 } } }}
      >
        <Stack direction="row" sx={{ mb: 1, justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>状态筛选</Typography>
          <Button
            size="small"
            color="inherit"
            disabled={statusFilter.size === 0}
            onClick={() => setStatusFilter(new Set())}
            sx={{ minWidth: 'auto', fontSize: 11, textTransform: 'none' }}
          >
            清除
          </Button>
        </Stack>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {STATUS_ORDER.map((st) => {
            const cfg = STATUS_CONFIG[st]
            const selected = statusFilter.has(st)
            const count = segments.filter((s) => s.status === st).length
            return (
              <Chip
                key={st}
                size="small"
                label={`${cfg.label} (${count})`}
                onClick={() => {
                  setStatusFilter((prev) => {
                    const next = new Set(prev)
                    if (next.has(st)) next.delete(st)
                    else next.add(st)
                    return next
                  })
                }}
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                sx={{
                  borderColor: selected ? undefined : cfg.color,
                  color: selected ? undefined : cfg.color,
                  fontSize: 11,
                }}
              />
            )
          })}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {statusFilter.size === 0
            ? '未筛选：显示所有段，搜索替换作用于全部段'
            : `已筛选 ${filteredSegments.length}/${segments.length} 段，搜索替换仅作用于所选状态`}
        </Typography>
      </Popover>

      {/* 自动翻译数量配置对话框（Shift+点击触发） */}
      <Dialog open={showAutoTranslateDialog} onClose={() => setShowAutoTranslateDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>自动翻译设置</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            将调用已启用的 AI 提供商，翻译当前文件中未译段落（5 句并发）。已译段落不会被覆盖。
          </Typography>
          <TextField
            autoFocus
            size="small"
            fullWidth
            type="number"
            label="翻译句数"
            value={autoTranslateCount}
            onChange={(e) => setAutoTranslateCount(e.target.value)}
            slotProps={{ htmlInput: { min: 1, max: 1000 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAutoTranslateDialog(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              const n = parseInt(autoTranslateCount, 10)
              setShowAutoTranslateDialog(false)
              if (n > 0) handleAutoTranslate(n)
            }}
          >
            开始翻译
          </Button>
        </DialogActions>
      </Dialog>

      {/* TM 自动填充阈值设置对话框（Shift+点击触发） */}
      <Dialog open={showTmAutoFillDialog} onClose={() => setShowTmAutoFillDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>TM 自动填充设置</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            从翻译记忆库中查找匹配度达到阈值的未译段落，自动填入对应译文。已译段落不会被覆盖。
          </Typography>
          <TextField
            autoFocus
            size="small"
            fullWidth
            type="number"
            label="匹配阈值（%）"
            value={tmAutoFillThreshold}
            onChange={(e) => setTmAutoFillThreshold(e.target.value)}
            slotProps={{ htmlInput: { min: 1, max: 100 } }}
            helperText="100% = 完全匹配；降低阈值可填充模糊匹配段（准确度降低）"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTmAutoFillDialog(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => {
              const t = parseInt(tmAutoFillThreshold, 10)
              setShowTmAutoFillDialog(false)
              if (t >= 1 && t <= 100) handleTmAutoFill(t)
            }}
          >
            开始填充
          </Button>
        </DialogActions>
      </Dialog>

      {/* 剪贴板手动粘贴兜底对话框 */}
      <Dialog
        open={showClipboardDialog}
        onClose={() => { setShowClipboardDialog(false); setClipboardManualText('') }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>从剪贴板导入</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            浏览器无法直接读取剪贴板，请在此处手动粘贴（Ctrl+V）要翻译的内容：
          </Typography>
          <TextField
            multiline
            rows={8}
            fullWidth
            value={clipboardManualText}
            onChange={(e) => setClipboardManualText(e.target.value)}
            placeholder="在此粘贴要翻译的内容..."
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowClipboardDialog(false); setClipboardManualText('') }}>取消</Button>
          <Button
            variant="contained"
            disabled={!clipboardManualText.trim()}
            onClick={async () => {
              const text = clipboardManualText
              setShowClipboardDialog(false)
              setClipboardManualText('')
              await doImportClipboardText(text)
            }}
          >
            导入
          </Button>
        </DialogActions>
      </Dialog>

      {/* 搜索条（Ctrl+F 展开） */}
      {showSearchBar && (
        <EditorSearchBar
          segments={segments}
          activeFileId={activeFileId}
          currentProjectId={currentProjectId}
          selectSegment={selectSegment}
          selectFile={selectFile}
          updateSegment={updateSegment}
          onClose={() => setShowSearchBar(false)}
          statusFilter={statusFilter}
        />
      )}

      {/* 列头（不再显示操作按钮，仅保留列名 + 调整列宽手柄） */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: headerGridTemplate,
          borderBottom: 2,
          borderColor: 'divider',
          bgcolor: headerBg,
          flexShrink: 0,
          minHeight: 32,
          position: 'relative',
        }}
      >
        {layout === 'stack' ? (
          <>
            <Box sx={{ px: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <Tooltip title={hiddenStatus ? '显示标注列' : '隐藏标注列'}>
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHiddenStatus((v) => !v) }} sx={{ p: 0.25 }}>
                  <LabelIcon sx={{ fontSize: 16, color: hiddenStatus ? 'text.disabled' : 'primary.main' }} />
                </IconButton>
              </Tooltip>
              {!hiddenStatus && <ResizeHandle onMouseDown={(e) => startResize(e, 'status')} />}
            </Box>
            <Box sx={{ px: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>原文 / 译文</Typography>
              {/* 原文/译文列右边缘：译文与备注之间的拖拽条（反向调 notes 宽度）*/}
              <ResizeHandle onMouseDown={(e) => startResize(e, 'notesLeftEdge')} />
            </Box>
            <Box sx={{ px: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <Tooltip title={hiddenNotes ? '显示备注列' : '隐藏备注列'}>
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHiddenNotes((v) => !v) }} sx={{ p: 0.25 }}>
                  <StickyNote2Icon sx={{ fontSize: 16, color: hiddenNotes ? 'text.disabled' : 'primary.main' }} />
                </IconButton>
              </Tooltip>
              {!hiddenNotes && <ResizeHandle onMouseDown={(e) => startResize(e, 'notes')} />}
            </Box>
          </>
        ) : (
          <>
            <Box sx={{ px: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <Tooltip title={hiddenStatus ? '显示标注列' : '隐藏标注列'}>
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHiddenStatus((v) => !v) }} sx={{ p: 0.25 }}>
                  <LabelIcon sx={{ fontSize: 16, color: hiddenStatus ? 'text.disabled' : 'primary.main' }} />
                </IconButton>
              </Tooltip>
              {!hiddenStatus && <ResizeHandle onMouseDown={(e) => startResize(e, 'status')} />}
            </Box>
            <Box sx={{ px: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>原文</Typography>
              <ResizeHandle onMouseDown={(e) => startResize(e, 'source')} />
            </Box>
            <Box sx={{ px: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>译文</Typography>
              <ResizeHandle onMouseDown={(e) => startResize(e, 'target')} />
            </Box>
            <Box sx={{ px: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              <Tooltip title={hiddenNotes ? '显示备注列' : '隐藏备注列'}>
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHiddenNotes((v) => !v) }} sx={{ p: 0.25 }}>
                  <StickyNote2Icon sx={{ fontSize: 16, color: hiddenNotes ? 'text.disabled' : 'primary.main' }} />
                </IconButton>
              </Tooltip>
              {!hiddenNotes && <ResizeHandle onMouseDown={(e) => startResize(e, 'notes')} />}
            </Box>
          </>
        )}
      </Box>

      {/* 虚拟滚动区 */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((vItem) => {
            const seg = segments[vItem.index]
            if (!seg) return null
            const isActive = seg.id === activeSegmentId
            const isOdd = vItem.index % 2 === 1

            return (
              <Box
                key={seg.id ?? vItem.index}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vItem.start}px)`,
                  bgcolor: isActive ? selectedBg : isOdd ? oddRowBg : rowBg,
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: isActive ? selectedBg : hoverBg },
                }}
              >
                {layout === 'stack' ? (
                  <StackModeRow
                    seg={seg}
                    isActive={isActive}
                    disableEdit={showFocusPanel}
                    showFocusPanel={showFocusPanel}
                    isSourceEditing={seg.id === sourceEditingId}
                    textColor={textColor}
                    secondaryColor={secondaryColor}
                    isDark={isDark}
                    selectedBg={selectedBg}
                    editingValueRef={editingValueRef}
                    sourceEditingValueRef={sourceEditingValueRef}
                    runAction={runAction}
                    onRowClick={() => handleRowClick(seg.id!)}
                    onTargetClick={() => handleTargetClick(seg.id!)}
                    onStatusClick={() => handleStatusClick(seg)}
                    onCommit={(val) => handleCommit(seg, val)}
                    onKeyDown={(e) => handleKeyDown(e, seg)}
                    onSourceCommit={() => handleSourceCommit(seg)}
                    onSourceCancel={handleSourceCancel}
                    hiddenStatus={hiddenStatus}
                    hiddenNotes={hiddenNotes}
                    terms={terms}
                    onInsertTermTarget={onInsertTermTarget}
                  />
                ) : (
                  <TableModeRow
                    seg={seg}
                    isActive={isActive}
                    disableEdit={showFocusPanel}
                    showFocusPanel={showFocusPanel}
                    isSourceEditing={seg.id === sourceEditingId}
                    textColor={textColor}
                    secondaryColor={secondaryColor}
                    isDark={isDark}
                    selectedBg={selectedBg}
                    editingValueRef={editingValueRef}
                    sourceEditingValueRef={sourceEditingValueRef}
                    runAction={runAction}
                    onRowClick={() => handleRowClick(seg.id!)}
                    onTargetClick={() => handleTargetClick(seg.id!)}
                    onStatusClick={() => handleStatusClick(seg)}
                    onCommit={(val) => handleCommit(seg, val)}
                    onKeyDown={(e) => handleKeyDown(e, seg)}
                    onSourceCommit={() => handleSourceCommit(seg)}
                    onSourceCancel={handleSourceCancel}
                    hiddenStatus={hiddenStatus}
                    hiddenNotes={hiddenNotes}
                    terms={terms}
                    onInsertTermTarget={onInsertTermTarget}
                  />
                )}
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* 底部聚焦编辑台（可选） */}
      {showFocusPanel && (
        <FocusEditPanel
          seg={activeSegmentId != null ? segments.find((s) => s.id === activeSegmentId) ?? null : null}
          editingValueRef={focusEditingValueRef}
          onCommit={handleFocusCommit}
          onStatusClick={() => {
            const seg = segments.find((s) => s.id === activeSegmentId)
            if (seg) handleStatusClick(seg)
          }}
          onNavigate={handleFocusNavigate}
          runAction={runAction}
          hiddenStatus={hiddenStatus}
          hiddenNotes={hiddenNotes}
          textColor={textColor}
          secondaryColor={secondaryColor}
          isDark={isDark}
          selectedBg={selectedBg}
          terms={terms}
          onInsertTermTarget={onInsertTermTarget}
        />
      )}
    </Box>
  )
}

// —— Stack 模式行 ——
// 结构（中间单元列）：
//   ┌───────────────────────────────────┐
//   │ [原文按钮条]   仅 isActive 显示   │  ← 新增
//   │ 原文内容                          │
//   ├───────────────────────────────────┤
//   │ [译文按钮条]   仅 isActive 显示   │  ← 新增
//   │ 译文内容                          │
//   └───────────────────────────────────┘

interface SharedRowProps {
  seg: Segment
  isActive: boolean
  disableEdit: boolean
  showFocusPanel: boolean
  isSourceEditing: boolean
  textColor: string
  secondaryColor: string
  isDark: boolean
  selectedBg: string
  editingValueRef: MutableRefObject<string>
  sourceEditingValueRef: MutableRefObject<string>
  runAction: (seg: Segment, action: string) => void
  onRowClick: () => void
  onTargetClick: () => void
  onStatusClick: () => void
  onCommit: (val: string) => void
  onKeyDown: (e: ReactKeyboardEvent) => void
  onSourceCommit: () => void
  onSourceCancel: () => void
  hiddenStatus: boolean
  hiddenNotes: boolean
  terms: Term[]
  onInsertTermTarget: (target: string) => void
}

// —— 底部聚焦编辑台 ——
// 固定在表格下方，显示当前激活段的原文/译文/按钮，位置不随表格滚动移动

interface FocusEditPanelProps {
  seg: Segment | null
  editingValueRef: MutableRefObject<string>
  onCommit: () => void
  onStatusClick: () => void
  onNavigate: (direction: 1 | -1) => void
  runAction: (seg: Segment, action: string) => void
  hiddenStatus: boolean
  hiddenNotes: boolean
  textColor: string
  secondaryColor: string
  isDark: boolean
  selectedBg: string
  terms: Term[]
  onInsertTermTarget: (target: string) => void
}

function FocusEditPanel(props: FocusEditPanelProps) {
  const { seg, editingValueRef, onCommit, onStatusClick, onNavigate, runAction,
    hiddenStatus, hiddenNotes, textColor, secondaryColor, isDark, selectedBg, terms, onInsertTermTarget } = props

  const panelBg = isDark ? '#1a2a3a' : '#f8f9fb'

  const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommit()
      onNavigate(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (seg) editingValueRef.current = seg.target ?? ''
      onCommit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      onCommit()
      onNavigate(e.shiftKey ? -1 : 1)
    }
  }, [onCommit, onNavigate, seg, editingValueRef])

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement as HTMLElement
      const inEditable = active?.closest('[contenteditable="true"]')
      if (!inEditable) {
        onCommit()
      }
    }, 0)
  }, [onCommit])

  const onTargetAction = useCallback((action: string) => { if (seg) runAction(seg, action) }, [seg, runAction])

  // 选中文本/光标位置追踪（seg 为 null 时用 -1 占位，不会产生有意义的数据）
  const { onSourceMouseUp, onTargetMouseUp, onTargetKeyUp } = useSelectionTracking(seg?.id ?? -1)

  // —— 原文层级标注（临时分析辅助，切换段时自动清空） ——
  const focusSourceBoxRef = useRef<HTMLElement | null>(null)
  const [marks, setMarks] = useState<SourceMark[]>([])
  const [hiddenGaps, setHiddenGaps] = useState<Set<string>>(new Set())
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // 切换段时清空所有标注状态
  useEffect(() => {
    setMarks([])
    setHiddenGaps(new Set())
    setSelectedMarkId(null)
    setShowClearConfirm(false)
  }, [seg?.id])

  // 原文纯文本（标注基于纯文本偏移量，与选区追踪一致）
  const plainSource = useMemo(() => htmlToPlainText(seg?.source ?? ''), [seg?.source])
  const hasMarks = marks.length > 0

  // 添加标注：基于当前原文选区，创建后清除系统选区（视觉选中≠系统选区）
  // 已存在 marks 时，从 DOM 解析真实偏移（避免隐藏间隙占位导致的 textContent 偏移失真）
  const handleAddMark = useCallback((level: 1 | 2 | 3) => {
    let sel: { text: string; start: number; end: number } | null
    if (marks.length > 0 && focusSourceBoxRef.current) {
      // 已有标注 → 用 DOM Range + data-* 属性解析为完整纯文本坐标系偏移
      sel = getSelectionWithMarks(focusSourceBoxRef.current)
    } else {
      // 无标注（首次添加）→ 沿用 store 中的选区追踪结果
      const s = useEditorContextStore.getState().sourceSelection
      sel = s ? { text: s.text, start: s.start, end: s.end } : null
    }
    if (!sel || !sel.text.trim()) return
    // 拒绝与已有标注重叠
    const overlaps = marks.some(m => !(sel!.end <= m.start || sel!.start >= m.end))
    if (overlaps) return
    const id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setMarks(prev => [...prev, { id, start: sel!.start, end: sel!.end, level }])
    setSelectedMarkId(id)
    // 清除浏览器系统选区 + store 中的选区状态，让后续 AI解释 走"无选区→AI翻译"分支
    window.getSelection()?.removeAllRanges()
    useEditorContextStore.getState().setSourceSelection(null)
  }, [marks])

  // 点击标注：首次选中（视觉高亮），再次点击 toggle 其左右间隙
  // 注意：点击标注只设置视觉选中状态，不影响系统选区（视觉选中≠系统选区）
  const handleMarkClick = useCallback((markId: string) => {
    if (selectedMarkId !== markId) {
      setSelectedMarkId(markId)
      // 清除系统选区，确保 AI解释 走"无选区→AI翻译"分支
      window.getSelection()?.removeAllRanges()
      useEditorContextStore.getState().setSourceSelection(null)
      return
    }
    // 已选中 → toggle 左右间隙
    const sorted = [...marks].sort((a, b) => a.start - b.start)
    const idx = sorted.findIndex(m => m.id === markId)
    if (idx < 0) return
    const prevId = idx > 0 ? sorted[idx - 1].id : null
    const nextId = idx < sorted.length - 1 ? sorted[idx + 1].id : null
    const leftGap = gapIdBetween(prevId, markId)
    const rightGap = gapIdBetween(markId, nextId)
    const leftHidden = hiddenGaps.has(leftGap)
    const rightHidden = hiddenGaps.has(rightGap)
    setHiddenGaps(prev => {
      const next = new Set(prev)
      if (leftHidden && rightHidden) {
        next.delete(leftGap)
        next.delete(rightGap)
      } else {
        next.add(leftGap)
        next.add(rightGap)
      }
      return next
    })
  }, [selectedMarkId, marks, hiddenGaps])

  // 点击隐藏间隙占位 → 恢复显示
  const handleGapClick = useCallback((gapId: string) => {
    setHiddenGaps(prev => {
      const next = new Set(prev)
      next.delete(gapId)
      return next
    })
  }, [])

  // 折叠/展开全部间隙
  const allGapsHidden = useMemo(() => {
    if (marks.length === 0) return false
    const sorted = [...marks].sort((a, b) => a.start - b.start)
    const ids: string[] = []
    for (let i = 0; i <= sorted.length; i++) {
      const prev = i > 0 ? sorted[i - 1].id : null
      const next = i < sorted.length ? sorted[i].id : null
      ids.push(gapIdBetween(prev, next))
    }
    return ids.every(id => hiddenGaps.has(id))
  }, [marks, hiddenGaps])

  const handleCollapseAll = useCallback(() => {
    if (allGapsHidden) {
      // 全部已隐藏 → 展开全部
      setHiddenGaps(new Set())
    } else {
      // 隐藏全部间隙
      const sorted = [...marks].sort((a, b) => a.start - b.start)
      const ids = new Set<string>()
      for (let i = 0; i <= sorted.length; i++) {
        const prev = i > 0 ? sorted[i - 1].id : null
        const next = i < sorted.length ? sorted[i].id : null
        ids.add(gapIdBetween(prev, next))
      }
      setHiddenGaps(ids)
    }
  }, [allGapsHidden, marks])

  // 删除选中标注
  const handleDeleteSelected = useCallback(() => {
    if (!selectedMarkId) return
    setMarks(prev => prev.filter(m => m.id !== selectedMarkId))
    setSelectedMarkId(null)
  }, [selectedMarkId])

  // 清空全部标注
  const handleClearAll = useCallback(() => {
    setMarks([])
    setHiddenGaps(new Set())
    setSelectedMarkId(null)
    setShowClearConfirm(false)
  }, [])

  // 原文按钮动作（有标注时拦截 aiExplain：无系统选区则送可见文本到 AI翻译）
  const onSourceAction = useCallback((action: string) => {
    if (!seg) return
    if (action === 'aiExplain' && hasMarks) {
      const sourceSel = useEditorContextStore.getState().sourceSelection
      const selectionText = sourceSel?.text.trim()
      if (selectionText) {
        // 有真实文本选区 → 走原逻辑（AI问答释义）
        runAction(seg, action)
      } else {
        // 无真实选区 → 送可见文本到 AI翻译
        const visibleText = computeVisibleText(plainSource, marks, hiddenGaps).trim()
        if (!visibleText) {
          useUIStore.getState().notify('warning', '可见文本为空')
          return
        }
        if (!useLayoutStore.getState().isTabVisible('aitranslate')) {
          useUIStore.getState().notify('warning', '请先在「视图」选项中勾选「AI翻译」')
          return
        }
        const projState = useProjectStore.getState()
        const cur = projState.projects.find((p) => p.id === projState.currentProjectId)
        const patch: { text: string; src?: string; tgt?: string } = { text: visibleText }
        if (cur) { patch.src = cur.sourceLang; patch.tgt = cur.targetLang }
        useAiQAStore.getState().setTranslate(patch)
        showTabInDock('aitranslate')
      }
    } else {
      runAction(seg, action)
    }
  }, [seg, runAction, hasMarks, plainSource, marks, hiddenGaps])

  // 空状态：未选中任何段
  if (!seg) {
    return (
      <Box sx={{ flexShrink: 0, borderTop: 2, borderColor: 'divider', bgcolor: panelBg, py: 3, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.disabled' }}>
          点击上方表格中的任意行，在此处查看原文并输入译文
        </Typography>
      </Box>
    )
  }

  const statusCfg = STATUS_CONFIG[seg.status]
  const focusStatusW = hiddenStatus ? '0px' : 'var(--col-status)'
  const focusNotesW = hiddenNotes ? '0px' : 'var(--col-notes)'

  return (
    <Box sx={{ flexShrink: 0, borderTop: 2, borderColor: 'primary.main', bgcolor: panelBg }}>
      {/* 标题栏 */}
      <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>★ 聚焦编辑台</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          段 #{seg.id} · {statusCfg.label}
        </Typography>
        {/* 原文层级标注按钮组（临时分析辅助，切换段自动清空） */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 0.25, pl: 0.5, borderLeft: 1, borderColor: 'divider' }}>
          <Tooltip title="一级标注（红底白字）：选中原文后点击">
            <IconButton size="small" onClick={() => handleAddMark(1)} sx={{ p: 0.25, color: '#f44336' }}><LooksOneIcon sx={{ fontSize: 16 }} /></IconButton>
          </Tooltip>
          <Tooltip title="二级标注（蓝底白字）：选中原文后点击">
            <IconButton size="small" onClick={() => handleAddMark(2)} sx={{ p: 0.25, color: '#1976d2' }}><LooksTwoIcon sx={{ fontSize: 16 }} /></IconButton>
          </Tooltip>
          <Tooltip title="三级标注（绿底白字）：选中原文后点击">
            <IconButton size="small" onClick={() => handleAddMark(3)} sx={{ p: 0.25, color: '#4caf50' }}><Looks3Icon sx={{ fontSize: 16 }} /></IconButton>
          </Tooltip>
          <Tooltip title={allGapsHidden ? '展开全部非标注文本' : '折叠全部非标注文本'}>
            <span>
              <IconButton size="small" onClick={handleCollapseAll} disabled={!hasMarks} sx={{ p: 0.25, color: 'text.disabled' }}>
                {allGapsHidden ? <UnfoldMoreIcon sx={{ fontSize: 16 }} /> : <UnfoldLessIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="删除选中标注">
            <span>
              <IconButton size="small" onClick={handleDeleteSelected} disabled={!selectedMarkId} sx={{ p: 0.25, color: 'error.main' }}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
            </span>
          </Tooltip>
          <Tooltip title="清空全部标注">
            <span>
              <IconButton size="small" onClick={() => setShowClearConfirm(true)} disabled={!hasMarks} sx={{ p: 0.25, color: 'error.main' }}><DeleteSweepIcon sx={{ fontSize: 16 }} /></IconButton>
            </span>
          </Tooltip>
        </Box>
        {/* 导航文本按钮（浅灰样式，可点击） */}
        <Tooltip title="跳转至上一段（Shift+Enter / Shift+Tab）">
          <Typography
            component="span"
            variant="caption"
            onClick={(e) => { e.stopPropagation(); onCommit(); onNavigate(-1) }}
            sx={{
              color: 'text.disabled',
              cursor: 'pointer',
              userSelect: 'none',
              '&:hover': { color: 'text.secondary' },
            }}
          >
            Shift+Enter 上一段
          </Typography>
        </Tooltip>
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>·</Typography>
        <Tooltip title="跳转至下一段（Enter / Tab）">
          <Typography
            component="span"
            variant="caption"
            onClick={(e) => { e.stopPropagation(); onCommit(); onNavigate(1) }}
            sx={{
              color: 'text.disabled',
              cursor: 'pointer',
              userSelect: 'none',
              '&:hover': { color: 'text.secondary' },
            }}
          >
            Enter 下一段
          </Typography>
        </Tooltip>
      </Box>

      {/* 内容区：标注 | 原文+译文 | 备注 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: `${focusStatusW} 1fr ${focusNotesW}` }}>
        {/* 标注：跨 4 行 */}
        <Box
          onClick={(e) => { e.stopPropagation(); onStatusClick() }}
          sx={{
            gridColumn: 1,
            gridRow: '1 / span 4',
            display: hiddenStatus ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight: hiddenStatus ? 0 : 1,
            borderColor: 'divider',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Tooltip title={statusCfg.label}>
            <Box sx={{ fontSize: 22, color: statusCfg.color, lineHeight: 1 }}>{statusCfg.symbol}</Box>
          </Tooltip>
        </Box>

        {/* 原文按钮条 */}
        <Box sx={{ gridColumn: 2, gridRow: 1, px: 1, pt: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <InlineSourceButtons onAction={onSourceAction} />
        </Box>

        {/* 原文内容（聚焦编辑台：始终高亮术语） */}
        <Box
          ref={(e) => { focusSourceBoxRef.current = e as HTMLElement | null }}
          onMouseUp={onSourceMouseUp}
          sx={{
            gridColumn: 2, gridRow: 2,
            px: 1, pb: 0.5,
            borderBottom: 1, borderColor: 'divider',
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
            color: secondaryColor,
            fontSize: 'var(--app-content-font-size)', lineHeight: 1.6,
            userSelect: 'text',
            maxHeight: 120, overflow: 'auto',
          }}
        >
          {hasMarks ? (
            <SourceTextWithMarks
              text={plainSource}
              marks={marks}
              hiddenGaps={hiddenGaps}
              selectedMarkId={selectedMarkId}
              onMarkClick={handleMarkClick}
              onGapClick={handleGapClick}
            />
          ) : (
            <SourceTextWithTerms
              text={plainSource}
              terms={terms}
              enable={true}
              onInsertTarget={onInsertTermTarget}
            />
          )}
        </Box>

        {/* 译文按钮条 */}
        <Box sx={{ gridColumn: 2, gridRow: 3, px: 1, pt: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <InlineTargetButtons onAction={onTargetAction} />
        </Box>

        {/* 译文内容（始终编辑态） */}
        <Box
          onMouseUp={onTargetMouseUp}
          onKeyUp={onTargetKeyUp}
          onFocus={() => { editingValueRef.current = seg?.target ?? '' }}
          onBlur={handleBlur}
          sx={{
            gridColumn: 2, gridRow: 4,
            px: 1, pb: 0.5,
            cursor: 'text',
            bgcolor: selectedBg,
            minHeight: 40,
          }}
        >
          <EditableDiv
            value={seg.target ?? ''}
            onChange={(v) => { editingValueRef.current = v }}
            placeholder="输入译文..."
            minHeight={32}
            onKeyDown={handleKeyDown}
            disableTabInsert
            dataSegId={seg.id}
            richText
          />
        </Box>

        {/* 备注：跨 4 行 */}
        <Box sx={{
          gridColumn: 3,
          gridRow: '1 / span 4',
          px: 1, py: 0.5,
          borderLeft: hiddenNotes ? 0 : 1,
          borderColor: 'divider',
          wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          color: secondaryColor,
          fontSize: '0.75rem', lineHeight: 1.5,
          display: hiddenNotes ? 'none' : 'flex',
          alignItems: 'flex-start',
          overflow: 'auto',
          maxHeight: 200,
        }}>
          {seg.notes || ''}
        </Box>
      </Box>

      {/* 清空全部标注确认弹窗 */}
      <Dialog open={showClearConfirm} onClose={() => setShowClearConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>清空全部标注</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            确定要清空当前段的全部层级标注吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowClearConfirm(false)} color="inherit">取消</Button>
          <Button onClick={handleClearAll} color="error" variant="contained">清空</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function StackModeRow(props: SharedRowProps) {
  const { seg, isActive, disableEdit, showFocusPanel, isSourceEditing, textColor, secondaryColor, isDark, selectedBg, editingValueRef, sourceEditingValueRef, runAction,
    onRowClick, onTargetClick, onStatusClick, onCommit, onKeyDown, onSourceCommit, onSourceCancel, hiddenStatus, hiddenNotes, terms, onInsertTermTarget } = props
  const statusCfg = STATUS_CONFIG[seg.status]

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement as HTMLElement
      const inEditable = active?.closest('[contenteditable="true"]')
      if (!inEditable) {
        onCommit(editingValueRef.current)
      }
    }, 0)
  }, [onCommit, editingValueRef])

  const onSourceAction = useCallback((action: string) => runAction(seg, action), [seg, runAction])
  const onTargetAction = useCallback((action: string) => runAction(seg, action), [seg, runAction])

  // 选中文本/光标位置追踪
  const { onSourceMouseUp, onTargetMouseUp, onTargetKeyUp } = useSelectionTracking(seg.id!)

  return (
    <Box
      onClick={onRowClick}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'var(--col-status) 1fr var(--col-notes)',
        cursor: 'pointer',
      }}
    >
      {/* 标注：跨中间整列高度 */}
      <Box
        onClick={(e) => { e.stopPropagation(); onStatusClick() }}
        sx={{
          gridColumn: 1,
          gridRow: '1 / span 4',
          display: hiddenStatus ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: hiddenStatus ? 0 : 1,
          borderColor: 'divider',
          cursor: 'pointer',
          overflow: 'hidden',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Tooltip title={statusCfg.label}>
          <Box sx={{ fontSize: 18, color: statusCfg.color, lineHeight: 1 }}>{statusCfg.symbol}</Box>
        </Tooltip>
      </Box>

      {/* row 1: 原文按钮条（isActive 才显示） */}
      <Box
        sx={{
          gridColumn: 2,
          gridRow: 1,
          px: 1,
          pt: 0.5,
          pb: 0.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          overflow: 'hidden',
          transition: 'all 120ms ease-out',
          ...(isActive ? {} : { pt: 0, pb: 0, maxHeight: 0, opacity: 0 }),
        }}
      >
        {isActive && !disableEdit && <InlineSourceButtons onAction={onSourceAction} />}
      </Box>

      {/* row 2: 原文内容（编辑态：EditableDiv + 确认/取消；浏览态：术语高亮文本） */}
      <Box
        onMouseUp={!isSourceEditing ? onSourceMouseUp : undefined}
        sx={{
          gridColumn: 2,
          gridRow: 2,
          px: 1,
          pb: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          color: secondaryColor,
          fontSize: 'var(--app-content-font-size)',
          lineHeight: 1.5,
          userSelect: 'text',
          cursor: 'text',
          bgcolor: isSourceEditing ? (isDark ? 'rgba(255,152,0,0.10)' : 'rgba(255,152,0,0.06)') : 'transparent',
        }}
      >
        {isSourceEditing ? (
          <Box>
            <EditableDiv
              value={seg.source}
              onChange={(v) => { sourceEditingValueRef.current = v }}
              placeholder="修改原文..."
              minHeight={24}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSourceCommit() }
                else if (e.key === 'Escape') { e.preventDefault(); onSourceCancel() }
              }}
              dataSegId={seg.id}
            />
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, justifyContent: 'flex-end' }}>
              <Tooltip title="确认（Enter）">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); onSourceCommit() }} sx={{ color: 'success.main' }}>
                  <CheckIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="取消（Esc）">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); onSourceCancel() }} sx={{ color: 'text.disabled' }}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ) : (
          <SourceTextWithTerms
            text={seg.source}
            terms={terms}
            enable={!showFocusPanel && isActive}
            onInsertTarget={onInsertTermTarget}
          />
        )}
      </Box>

      {/* row 3: 译文按钮条（isActive 才显示） */}
      <Box
        sx={{
          gridColumn: 2,
          gridRow: 3,
          px: 1,
          pt: 0.5,
          pb: 0.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          overflow: 'hidden',
          transition: 'all 120ms ease-out',
          ...(isActive ? {} : { pt: 0, pb: 0, maxHeight: 0, opacity: 0 }),
        }}
      >
        {isActive && !disableEdit && <InlineTargetButtons onAction={onTargetAction} />}
      </Box>

      {/* row 4: 译文内容（始终编辑态；聚焦编辑台开启时退化为只读） */}
      <Box
        onClick={(e) => { if (!disableEdit) { e.stopPropagation(); onTargetClick() } }}
        onMouseUp={!disableEdit ? onTargetMouseUp : undefined}
        onKeyUp={!disableEdit ? onTargetKeyUp : undefined}
        onFocus={() => { if (!disableEdit) editingValueRef.current = seg.target ?? '' }}
        onBlur={!disableEdit ? handleBlur : undefined}
        sx={{
          gridColumn: 2,
          gridRow: 4,
          px: 1,
          pb: 0.5,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          fontSize: 'var(--app-content-font-size)',
          lineHeight: 1.5,
          cursor: disableEdit ? 'default' : 'text',
          bgcolor: isActive ? selectedBg : 'transparent',
          minHeight: 28,
        }}
      >
        {!disableEdit ? (
          <EditableDiv
            value={seg.target ?? ''}
            onChange={(v) => { editingValueRef.current = v }}
            placeholder="输入译文..."
            minHeight={24}
            onKeyDown={onKeyDown}
            disableTabInsert
            dataSegId={seg.id}
            richText
          />
        ) : (
          <Box
            sx={{
              color: seg.target ? textColor : 'text.disabled',
              fontStyle: seg.target ? 'normal' : 'italic',
            }}
          >
            {hasRichTextHtml(seg.target) ? (
              <span dangerouslySetInnerHTML={{ __html: seg.target }} />
            ) : (
              seg.target || '（待翻译）'
            )}
          </Box>
        )}
      </Box>

      {/* 备注：跨 4 行 */}
      <Box
        sx={{
          gridColumn: 3,
          gridRow: '1 / span 4',
          px: 1,
          py: 0.5,
          borderLeft: hiddenNotes ? 0 : 1,
          borderColor: 'divider',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          color: secondaryColor,
          fontSize: '0.75rem',
          lineHeight: 1.5,
          display: hiddenNotes ? 'none' : 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {seg.notes || ''}
      </Box>
    </Box>
  )
}

// —— Table 模式行 ——
// 每列由「按钮条 + 内容」组成：
//   原文列          译文列
//   ┌────────────┐  ┌────────────┐
//   │ [原文按钮] │  │ [译文按钮] │ ← isActive 展开
//   ├────────────┤  ├────────────┤
//   │ 原文内容   │  │ 译文内容   │
//   └────────────┘  └────────────┘

function TableModeRow(props: SharedRowProps) {
  const { seg, isActive, disableEdit, showFocusPanel, isSourceEditing, textColor, secondaryColor, isDark, selectedBg, editingValueRef, sourceEditingValueRef, runAction,
    onRowClick, onTargetClick, onStatusClick, onCommit, onKeyDown, onSourceCommit, onSourceCancel, hiddenStatus, hiddenNotes, terms, onInsertTermTarget } = props
  const statusCfg = STATUS_CONFIG[seg.status]

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement as HTMLElement
      const inEditable = active?.closest('[contenteditable="true"]')
      if (!inEditable) {
        onCommit(editingValueRef.current)
      }
    }, 0)
  }, [onCommit, editingValueRef])

  const onSourceAction = useCallback((action: string) => runAction(seg, action), [seg, runAction])
  const onTargetAction = useCallback((action: string) => runAction(seg, action), [seg, runAction])

  // 选中文本/光标位置追踪
  const { onSourceMouseUp, onTargetMouseUp, onTargetKeyUp } = useSelectionTracking(seg.id!)

  return (
    <Box
      onClick={onRowClick}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'var(--col-status) var(--col-source) var(--col-target) var(--col-notes)',
        cursor: 'pointer',
      }}
    >
      {/* 标注：跨 2 行 */}
      <Box
        onClick={(e) => { e.stopPropagation(); onStatusClick() }}
        sx={{
          gridColumn: 1,
          gridRow: '1 / span 2',
          display: hiddenStatus ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: hiddenStatus ? 0 : 1,
          borderColor: 'divider',
          cursor: 'pointer',
          overflow: 'hidden',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Tooltip title={statusCfg.label}>
          <Box sx={{ fontSize: 18, color: statusCfg.color, lineHeight: 1 }}>{statusCfg.symbol}</Box>
        </Tooltip>
      </Box>

      {/* row 1: 原文按钮条 */}
      <Box
        sx={{
          gridColumn: 2,
          gridRow: 1,
          px: 1,
          pt: 0.5,
          pb: 0.25,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          overflow: 'hidden',
          transition: 'all 120ms ease-out',
          ...(isActive ? {} : { pt: 0, pb: 0, maxHeight: 0, opacity: 0 }),
        }}
      >
        {isActive && !disableEdit && <InlineSourceButtons onAction={onSourceAction} />}
      </Box>

      {/* row 2: 原文内容（编辑态：EditableDiv + 确认/取消；浏览态：术语高亮文本） */}
      <Box
        onMouseUp={!isSourceEditing ? onSourceMouseUp : undefined}
        sx={{
          gridColumn: 2,
          gridRow: 2,
          px: 1,
          pb: 0.5,
          borderRight: 1,
          borderColor: 'divider',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          color: secondaryColor,
          fontSize: 'var(--app-content-font-size)',
          lineHeight: 1.5,
          userSelect: 'text',
          cursor: 'text',
          bgcolor: isSourceEditing ? (isDark ? 'rgba(255,152,0,0.10)' : 'rgba(255,152,0,0.06)') : 'transparent',
        }}
      >
        {isSourceEditing ? (
          <Box>
            <EditableDiv
              value={seg.source}
              onChange={(v) => { sourceEditingValueRef.current = v }}
              placeholder="修改原文..."
              minHeight={24}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSourceCommit() }
                else if (e.key === 'Escape') { e.preventDefault(); onSourceCancel() }
              }}
              dataSegId={seg.id}
            />
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, justifyContent: 'flex-end' }}>
              <Tooltip title="确认（Enter）">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); onSourceCommit() }} sx={{ color: 'success.main' }}>
                  <CheckIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="取消（Esc）">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); onSourceCancel() }} sx={{ color: 'text.disabled' }}>
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ) : (
          <SourceTextWithTerms
            text={seg.source}
            terms={terms}
            enable={!showFocusPanel && isActive}
            onInsertTarget={onInsertTermTarget}
          />
        )}
      </Box>

      {/* row 1: 译文按钮条 */}
      <Box
        sx={{
          gridColumn: 3,
          gridRow: 1,
          px: 1,
          pt: 0.5,
          pb: 0.25,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          overflow: 'hidden',
          transition: 'all 120ms ease-out',
          ...(isActive ? {} : { pt: 0, pb: 0, maxHeight: 0, opacity: 0 }),
        }}
      >
        {isActive && !disableEdit && <InlineTargetButtons onAction={onTargetAction} />}
      </Box>

      {/* row 2: 译文内容（始终编辑态；聚焦编辑台开启时退化为只读） */}
      <Box
        onClick={(e) => { if (!disableEdit) { e.stopPropagation(); onTargetClick() } }}
        onMouseUp={!disableEdit ? onTargetMouseUp : undefined}
        onKeyUp={!disableEdit ? onTargetKeyUp : undefined}
        onFocus={() => { if (!disableEdit) editingValueRef.current = seg.target ?? '' }}
        onBlur={!disableEdit ? handleBlur : undefined}
        sx={{
          gridColumn: 3,
          gridRow: 2,
          px: 1,
          pb: 0.5,
          borderRight: 1,
          borderColor: 'divider',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          fontSize: 'var(--app-content-font-size)',
          lineHeight: 1.5,
          cursor: disableEdit ? 'default' : 'text',
          bgcolor: isActive ? selectedBg : 'transparent',
          minHeight: 28,
        }}
      >
        {!disableEdit ? (
          <EditableDiv
            value={seg.target ?? ''}
            onChange={(v) => { editingValueRef.current = v }}
            placeholder="输入译文..."
            minHeight={24}
            onKeyDown={onKeyDown}
            disableTabInsert
            dataSegId={seg.id}
            richText
          />
        ) : (
          <Box
            sx={{
              color: seg.target ? textColor : 'text.disabled',
              fontStyle: seg.target ? 'normal' : 'italic',
              width: '100%',
            }}
          >
            {hasRichTextHtml(seg.target) ? (
              <span dangerouslySetInnerHTML={{ __html: seg.target }} />
            ) : (
              seg.target || '（待翻译）'
            )}
          </Box>
        )}
      </Box>

      {/* 备注：跨 2 行 */}
      <Box
        sx={{
          gridColumn: 4,
          gridRow: '1 / span 2',
          px: 1,
          py: 0.5,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          color: secondaryColor,
          fontSize: '0.75rem',
          lineHeight: 1.5,
          display: hiddenNotes ? 'none' : 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {seg.notes || ''}
      </Box>
    </Box>
  )
}
