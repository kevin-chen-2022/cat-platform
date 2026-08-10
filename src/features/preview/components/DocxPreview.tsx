import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Box, Stack, Alert, CircularProgress, Typography, Tooltip, Chip, IconButton } from '@mui/material'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { renderAsync } from 'docx-preview'
import type { ReactElement } from 'react'
import type { File as ProjectFile, Segment, ID } from '@/types'
import { db } from '@/data/db'

interface DocxPreviewProps {
  file: ProjectFile
  segments: Segment[]
  activeSegmentId: ID | null
  onSelectSegment: (id: ID | null) => void
}

/** 容器内可匹配的块级元素选择器（docx-preview 渲染产物中的段落/标题/列表/单元格） */
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre'

/** 激活段落块的 CSS class（淡色背景，标识当前段落位置） */
const ACTIVE_BLOCK_CLASS = 'cat-docx-active-block'

/** 句子级高亮的降级 span class（CSS.highlights 不可用时使用） */
const SENTENCE_MARK_CLASS = 'cat-docx-sentence-mark'

/** CSS Custom Highlight API 的注册名 */
const HIGHLIGHT_NAME = 'cat-docx-sentence'

/** 检测 CSS Custom Highlight API 是否可用 */
const supportsHighlightAPI = typeof CSS !== 'undefined' && 'highlights' in CSS

/**
 * 归一化文本，与 mammoth 导入时的归一化保持一致：
 *   .replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
 */
function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

/* ============================================================
 *  文本节点映射工具：将归一化文本偏移 ↔ DOM 文本节点偏移互转
 * ============================================================ */

interface TextNodeInfo {
  node: Text
  start: number // 在原始拼接文本中的起始偏移
  end: number
}

/** 遍历块级元素内所有文本节点，拼接原始文本并记录每个节点的偏移范围 */
function buildTextNodeMap(block: HTMLElement): { rawText: string; textNodes: TextNodeInfo[] } {
  const textNodes: TextNodeInfo[] = []
  let rawText = ''
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.nodeValue ?? ''
    if (text.length === 0) continue
    textNodes.push({ node, start: rawText.length, end: rawText.length + text.length })
    rawText += text
  }
  return { rawText, textNodes }
}

/**
 * 构建归一化文本 → 原始文本的字符索引映射。
 * normToRaw[normIndex] = rawIndex，即归一化文本第 i 个字符对应原始文本的哪个字符。
 *
 * 归一化规则（与 mammoth 导入一致）：
 *   1. \u00a0 → ' '（1:1）
 *   2. 连续空白 → 单个空格（N:1）
 *   3. trim 首尾空白
 */
function buildNormMap(rawText: string): { normText: string; normToRaw: number[] } {
  const normToRaw: number[] = []
  const chars: string[] = []
  let i = 0
  const len = rawText.length

  // 跳过前导空白（trim）
  while (i < len && /\s/.test(rawText[i])) i++

  while (i < len) {
    if (rawText[i] === '\u00a0') {
      normToRaw.push(i)
      chars.push(' ')
      i++
    } else if (/\s/.test(rawText[i])) {
      // 空白折叠为单个空格
      normToRaw.push(i)
      chars.push(' ')
      while (i < len && /\s/.test(rawText[i])) i++
    } else {
      normToRaw.push(i)
      chars.push(rawText[i])
      i++
    }
  }

  // 去尾部空白（trim）
  while (chars.length > 0 && chars[chars.length - 1] === ' ') {
    chars.pop()
    normToRaw.pop()
  }

  return { normText: chars.join(''), normToRaw }
}

/** 在文本节点数组中查找原始偏移对应的 DOM 位置 */
function rawToDomPosition(
  rawIndex: number,
  textNodes: TextNodeInfo[],
): { node: Text; offset: number } | null {
  for (const tn of textNodes) {
    if (rawIndex >= tn.start && rawIndex < tn.end) {
      return { node: tn.node, offset: rawIndex - tn.start }
    }
  }
  // 边界：rawIndex 恰好在最后一个节点末尾
  const last = textNodes[textNodes.length - 1]
  if (last && rawIndex === last.end) {
    return { node: last.node, offset: last.node.nodeValue?.length ?? 0 }
  }
  return null
}

/* ============================================================
 *  段落映射数据结构
 * ============================================================ */

/** 单个 segment 在 DOM 块中的位置信息 */
interface SegLocation {
  segId: ID
  block: HTMLElement
  normStart: number // 在 block 归一化文本中的起始偏移
  normEnd: number // 结束偏移（不含）
  normToRaw: number[]
  textNodes: TextNodeInfo[]
}

/** 块级元素信息（用于反向查找） */
interface BlockInfo {
  block: HTMLElement
  normText: string
  normToRaw: number[]
  textNodes: TextNodeInfo[]
  segs: SegLocation[] // 该块内所有 segment 的位置信息
}

interface SegmentMapResult {
  segToLoc: Map<ID, SegLocation>
  blockInfos: Map<HTMLElement, BlockInfo>
  matched: number
}

/**
 * 在已渲染的 DOM 中构建 segment ↔ 块级元素的映射。
 *
 * 匹配策略（按优先级）：
 *  1. 精确匹配：归一化后 blockText === segSource
 *  2. 包含匹配：blockText 包含 segSource（处理句子级粒度：一段被拆为多句）
 *  3. 反向包含：segSource 包含 blockText
 *
 * 对于包含匹配的块，进一步定位句子在块内的字符偏移，
 * 供 CSS Custom Highlight API 创建精确的 Range。
 */
function buildSegmentMap(
  container: HTMLElement,
  segments: Segment[],
): SegmentMapResult {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
  const segToLoc = new Map<ID, SegLocation>()
  const blockInfos = new Map<HTMLElement, BlockInfo>()

  // 预处理 segments
  const normSegs = segments
    .map((s) => ({ id: s.id as ID, norm: normalizeText(s.source ?? '') }))
    .filter((s) => s.norm.length > 0)

  // 预处理 blocks：构建文本节点映射和归一化映射
  const normBlocks = blocks
    .map((b) => {
      const { rawText, textNodes } = buildTextNodeMap(b)
      const { normText, normToRaw } = buildNormMap(rawText)
      return { el: b, normText, normToRaw, textNodes }
    })
    .filter((b) => b.normText.length > 0)

  // 已分配到 block 的 segment 集合（避免重复分配）
  const assigned = new Set<ID>()

  /**
   * 在 block 的归一化文本中查找 segment 的字符偏移，
   * 创建 SegLocation 并写入映射。
   * searchFrom 用于同一段落内多句顺序匹配。
   */
  const assignSeg = (
    segId: ID,
    segNorm: string,
    block: typeof normBlocks[number],
    searchFrom: number = 0,
  ): boolean => {
    const idx = block.normText.indexOf(segNorm, searchFrom)
    if (idx < 0) return false
    const loc: SegLocation = {
      segId,
      block: block.el,
      normStart: idx,
      normEnd: idx + segNorm.length,
      normToRaw: block.normToRaw,
      textNodes: block.textNodes,
    }
    segToLoc.set(segId, loc)

    // 更新 blockInfo
    let info = blockInfos.get(block.el)
    if (!info) {
      info = {
        block: block.el,
        normText: block.normText,
        normToRaw: block.normToRaw,
        textNodes: block.textNodes,
        segs: [],
      }
      blockInfos.set(block.el, info)
    }
    info.segs.push(loc)
    return true
  }

  // 1. 精确匹配
  for (const seg of normSegs) {
    if (assigned.has(seg.id)) continue
    for (const blk of normBlocks) {
      if (blk.normText === seg.norm) {
        if (assignSeg(seg.id, seg.norm, blk)) {
          assigned.add(seg.id)
          break
        }
      }
    }
  }

  // 2. 包含匹配（块文本包含 segment source）
  //    同一块内多句：按 segment 顺序依次推进 searchFrom
  for (const blk of normBlocks) {
    if (blk.normText.length === 0) continue
    let searchFrom = 0
    for (const seg of normSegs) {
      if (assigned.has(seg.id)) continue
      // 尝试在当前块中找到该 segment
      const idx = blk.normText.indexOf(seg.norm, searchFrom)
      if (idx >= 0) {
        if (assignSeg(seg.id, seg.norm, blk, searchFrom)) {
          assigned.add(seg.id)
          searchFrom = idx + seg.norm.length
        }
      }
    }
  }

  // 3. 反向包含（segment source 包含块文本，取最长匹配）
  for (const seg of normSegs) {
    if (assigned.has(seg.id)) continue
    let bestMatch: typeof normBlocks[number] | null = null
    let bestLen = 0
    for (const blk of normBlocks) {
      if (seg.norm.includes(blk.normText) && blk.normText.length > bestLen) {
        bestMatch = blk
        bestLen = blk.normText.length
      }
    }
    if (bestMatch) {
      if (assignSeg(seg.id, seg.norm, bestMatch)) {
        assigned.add(seg.id)
      }
    }
  }

  return { segToLoc, blockInfos, matched: segToLoc.size }
}

/* ============================================================
 *  高亮工具
 * ============================================================ */

/** 清除所有块级高亮标记 */
function clearBlockHighlights(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(`.${ACTIVE_BLOCK_CLASS}`).forEach((el) => {
    el.classList.remove(ACTIVE_BLOCK_CLASS)
  })
}

/** 清除降级方案的 span 包裹（恢复原始文本节点） */
function clearSentenceSpans(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(`.${SENTENCE_MARK_CLASS}`).forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    // 将 span 内的内容移回父节点，然后删除 span
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el)
    }
    parent.removeChild(el)
    // 合并相邻文本节点
    parent.normalize()
  })
}

/** 清除 CSS Custom Highlight API 注册的高亮 */
function clearHighlightAPI(): void {
  if (supportsHighlightAPI) {
    CSS.highlights.delete(HIGHLIGHT_NAME)
  }
}

/**
 * 用 CSS Custom Highlight API 高亮句子级别的文本范围。
 * 不修改 DOM 结构，通过 Range + Highlight 注册实现。
 */
function highlightSentenceRange(loc: SegLocation): void {
  if (!supportsHighlightAPI) return
  const startDom = rawToDomPosition(loc.normToRaw[loc.normStart], loc.textNodes)
  // 结束位置：归一化偏移 normEnd-1 对应的原始字符 +1
  const endRaw = loc.normToRaw[Math.min(loc.normEnd - 1, loc.normToRaw.length - 1)] + 1
  const endDom = rawToDomPosition(endRaw, loc.textNodes)
  if (!startDom || !endDom) return

  try {
    const range = new Range()
    range.setStart(startDom.node, startDom.offset)
    range.setEnd(endDom.node, endDom.offset)
    const highlight = new Highlight(range)
    CSS.highlights.set(HIGHLIGHT_NAME, highlight)
  } catch {
    // Range 跨节点时可能出错，静默失败
  }
}

/**
 * 降级方案：用 <span> 包裹句子文本实现高亮。
 * 修改 DOM 结构，仅在 CSS.highlights 不可用时使用。
 */
function highlightSentenceSpan(loc: SegLocation): void {
  if (supportsHighlightAPI) return // 有 Highlight API 时不需要
  const startDom = rawToDomPosition(loc.normToRaw[loc.normStart], loc.textNodes)
  const endRaw = loc.normToRaw[Math.min(loc.normEnd - 1, loc.normToRaw.length - 1)] + 1
  const endDom = rawToDomPosition(endRaw, loc.textNodes)
  if (!startDom || !endDom) return

  try {
    const range = new Range()
    range.setStart(startDom.node, startDom.offset)
    range.setEnd(endDom.node, endDom.offset)
    // extractContents 将 Range 内容移到 DocumentFragment，再用 span 包裹
    const fragment = range.extractContents()
    const span = document.createElement('span')
    span.className = SENTENCE_MARK_CLASS
    span.appendChild(fragment)
    range.insertNode(span)
  } catch {
    // 跨节点时 extractContents 可能出错，静默失败
  }
}

/* ============================================================
 *  组件
 * ============================================================ */

export function DocxPreview({
  file,
  segments,
  activeSegmentId,
  onSelectSegment,
}: DocxPreviewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const segToLocRef = useRef<Map<ID, SegLocation>>(new Map())
  const blockInfosRef = useRef<Map<HTMLElement, BlockInfo>>(new Map())
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [zoom, setZoom] = useState(1.0) // 缩放比例：0.5 ~ 2.0（CSS transform，不重新渲染）

  // 渲染 docx 到容器（仅依赖 file.id）
  const renderDocx = useCallback(async () => {
    if (!containerRef.current || !file.id) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const row = await db.files.get(file.id as number)
      const blob = row?.rawBlob
      if (!blob) {
        throw new Error('该文件未保留原始二进制数据，无法渲染原格式。请重新导入该 docx 文件。')
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
      await renderAsync(blob, containerRef.current!, undefined, {
        className: 'docx-preview-render',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        experimental: false,
        useBase64URL: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
      })
      setStatus('ready')
    } catch (err) {
      console.error('[DocxPreview] renderAsync failed:', err)
      setErrorMsg((err as Error).message)
      setStatus('error')
    }
  }, [file.id])

  useEffect(() => {
    void renderDocx()
  }, [renderDocx])

  // segments source 指纹：只有 source 内容真正变化时才重建映射
  const sourcesKey = useMemo(
    () => segments.map((s) => `${s.id}#${s.source ?? ''}`).join('\u0000'),
    [segments],
  )

  // 渲染完成后或 source 变化时，构建 segment ↔ DOM 映射
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return
    const result = buildSegmentMap(containerRef.current, segments)
    segToLocRef.current = result.segToLoc
    blockInfosRef.current = result.blockInfos
    setMatchCount(result.matched)
  }, [status, sourcesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 激活段变化 → 句子级高亮 + 段落滚动定位
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return
    const container = containerRef.current

    // 清除旧高亮
    clearHighlightAPI()
    clearSentenceSpans(container)
    clearBlockHighlights(container)

    if (activeSegmentId == null) return

    const loc = segToLocRef.current.get(activeSegmentId)
    if (!loc) return

    // 1. 段落级淡色背景（标识当前段落位置）
    loc.block.classList.add(ACTIVE_BLOCK_CLASS)
    // 2. 句子级精确高亮
    if (supportsHighlightAPI) {
      highlightSentenceRange(loc)
    } else {
      highlightSentenceSpan(loc)
    }
    // 3. 滚动到可视区域
    loc.block.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeSegmentId, status, matchCount])

  // 点击预览 → 反向定位段落（句子级精度）
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (status !== 'ready') return
      const target = e.target as HTMLElement
      const block = target.closest<HTMLElement>(BLOCK_SELECTOR)
      if (!block) return

      const info = blockInfosRef.current.get(block)
      if (!info || info.segs.length === 0) return

      // 如果该块只有一个 segment，直接选中
      if (info.segs.length === 1) {
        onSelectSegment(info.segs[0].segId)
        return
      }

      // 多句块：根据点击位置确定具体句子
      // 用 caretRangeFromPoint 获取点击处的文本偏移
      const caretRange = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (caretRange) {
        const clickedNode = caretRange.startContainer
        const clickedOffset = caretRange.startOffset
        // 在 textNodes 中查找点击位置对应的原始偏移
        let rawIndex = -1
        if (clickedNode.nodeType === Node.TEXT_NODE) {
          const textNode = clickedNode as Text
          for (const tn of info.textNodes) {
            if (tn.node === textNode) {
              rawIndex = tn.start + clickedOffset
              break
            }
          }
        }
        // 将原始偏移转为归一化偏移，查找包含该位置的 segment
        if (rawIndex >= 0) {
          // 查找最后一个 <= rawIndex 的归一化索引
          let normPos = -1
          for (let i = info.normToRaw.length - 1; i >= 0; i--) {
            if (info.normToRaw[i] <= rawIndex) {
              normPos = i
              break
            }
          }
          if (normPos === -1 && info.normToRaw.length > 0) normPos = 0

          if (normPos >= 0) {
            // 查找包含此位置的 segment
            for (const seg of info.segs) {
              if (normPos >= seg.normStart && normPos < seg.normEnd) {
                onSelectSegment(seg.segId)
                return
              }
            }
            // 点击位置不在任何 segment 范围内（如句间空白），选最近的
            let nearest: SegLocation | null = null
            let minDist = Infinity
            for (const seg of info.segs) {
              const dist = normPos < seg.normStart ? seg.normStart - normPos : normPos - seg.normEnd
              if (dist < minDist) {
                minDist = dist
                nearest = seg
              }
            }
            if (nearest) {
              onSelectSegment(nearest.segId)
              return
            }
          }
        }
      }

      // 兜底：选中第一个 segment
      onSelectSegment(info.segs[0].segId)
    },
    [status, onSelectSegment],
  )

  // 段落统计
  const stats = useMemo(() => {
    const total = segments.length
    const translated = segments.filter(
      (s) => s.status !== 'untranslated' && s.target.trim(),
    ).length
    return { total, translated }
  }, [segments])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部状态条 */}
      <Box
        className="panel-header"
        sx={{
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          原格式预览 · 共 {stats.total} 段 · 已译 {stats.translated} 段
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {status === 'ready' && (
            <Tooltip title={`段落与原格式 DOM 匹配率：${matchCount}/${stats.total}`}>
              <Chip
                label={`匹配 ${matchCount}/${stats.total}`}
                size="small"
                color={
                  matchCount === stats.total
                    ? 'success'
                    : matchCount > stats.total * 0.8
                      ? 'primary'
                      : 'warning'
                }
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            </Tooltip>
          )}
          <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
            <Tooltip title="缩小">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}
                  disabled={zoom <= 0.5}
                  sx={{ p: 0.25 }}
                >
                  <ZoomOutIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={zoom === 1 ? '当前 100%' : '恢复 100%'}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ cursor: 'pointer', minWidth: 36, textAlign: 'center', userSelect: 'none' }}
                onClick={() => setZoom(1.0)}
              >
                {Math.round(zoom * 100)}%
              </Typography>
            </Tooltip>
            <Tooltip title="放大">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setZoom((z) => Math.min(2.0, +(z + 0.1).toFixed(1)))}
                  disabled={zoom >= 2.0}
                  sx={{ p: 0.25 }}
                >
                  <ZoomInIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            {zoom !== 1.0 && (
              <Tooltip title="恢复 100%">
                <IconButton size="small" onClick={() => setZoom(1.0)} sx={{ p: 0.25 }}>
                  <RestartAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Tooltip title="点击预览中的句子可跳转到对应翻译段">
            <Typography variant="caption" color="text.disabled" sx={{ cursor: 'help' }}>
              点击句子跳转
            </Typography>
          </Tooltip>
        </Stack>
      </Box>

      {/* 渲染区域 */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          bgcolor: 'background.default',
        }}
      >
        {status === 'loading' && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">
              正在渲染原格式...
            </Typography>
          </Box>
        )}
        {status === 'error' && (
          <Alert severity="warning" sx={{ m: 2 }}>
            {errorMsg}
          </Alert>
        )}
        <Box
          ref={containerRef}
          onClick={handleClick}
          sx={{
            // CSS transform 缩放：不重新渲染 docx，高亮和反向联动都不受影响
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            // 缩放后用 margin 补偿高度，避免底部留白或滚动条错位
            // 放大时容器视觉高度增加，需要负 margin 让外层滚动区正确收起
            marginBottom: zoom !== 1 ? `calc((1 - ${zoom}) * -100%)` : 0,
            '& .docx-preview-render': {
              bgcolor: '#fff',
              margin: '0 auto',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              '& .docx-wrapper': {
                background: 'transparent',
                padding: '16px 0',
              },
            },
            // 块级元素 hover 提示可点击
            '& p, & h1, & h2, & h3, & h4, & h5, & h6, & li, & td, & th, & blockquote, & pre':
              {
                cursor: 'pointer',
                borderRadius: '2px',
                transition: 'background-color 0.15s ease',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.04)',
                },
              },
          }}
        />
      </Box>
    </Box>
  )
}
