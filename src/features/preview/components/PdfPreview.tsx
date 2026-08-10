import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Box, Stack, Alert, CircularProgress, Typography, Tooltip, Chip, IconButton } from '@mui/material'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
// 使用 legacy 构建：包含 Promise.withResolvers / 私有字段 等新语法的 polyfill + 转译，
// 避免老 Chromium 运行时报 "getOrInsertComputed is not a function" / "withResolvers is not a function"。
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { ReactElement } from 'react'
import type { File as ProjectFile, Segment, ID } from '@/types'
import { db } from '@/data/db'

interface PdfPreviewProps {
  file: ProjectFile
  segments: Segment[]
  activeSegmentId: ID | null
  onSelectSegment: (id: ID | null) => void
}

// === PDF.js Worker 配置 ===
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker

/** 激活 PDF 页面的 CSS class */
const ACTIVE_PAGE_CLASS = 'cat-pdf-active-page'

/** 句子级高亮覆盖层 div 的 class */
const HIGHLIGHT_MARK_CLASS = 'cat-pdf-highlight-mark'

/**
 * 归一化文本，与 pdf.ts 导入时的归一化保持一致：
 *   .replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
 */
function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

/* ============================================================
 *  textItem 数据结构（与 pdf.ts 完全一致）
 * ============================================================ */

/** PDF.js getTextContent 返回的 textItem（与 pdf.ts 导入时完全一致的数据源） */
interface TextItemData {
  str: string
  transform: [number, number, number, number, number, number]  // [a,b,c,d,e,f]，e=x, f=y
  width: number
  height: number
  hasEOL: boolean
}

/** 单个 textItem 在页面中的位置和归一化偏移 */
interface ItemInfo {
  str: string                  // 原始 str（与 pdf.js 一致）
  normStr: string              // 归一化后的 str
  normStart: number            // 在页面归一化全文中的起始偏移
  normEnd: number
  // 相对于 pageContainer 的像素位置（已按 layoutScale 缩放）
  left: number
  top: number
  width: number
  height: number
}

/** 每页的映射信息 */
interface PageInfo {
  pageContainer: HTMLElement
  normText: string
  items: ItemInfo[]
  segs: PageSegLocation[]
}

/** segment 在页面中的位置：对应 items 数组的索引范围 */
interface PageSegLocation {
  segId: ID
  startItemIdx: number
  endItemIdx: number  // 不含
  normStart: number
  normEnd: number
}

interface SegmentMapResult {
  segToPageLoc: Map<ID, { page: PageInfo; loc: PageSegLocation }>
  pageInfos: PageInfo[]  // 所有页（含无匹配），用于反向查找
  matched: number
}

/* ============================================================
 *  构建映射：用 getTextContent 的原始 textItem 做匹配
 * ============================================================ */

/**
 * 构建 segment ↔ textItem 索引范围的映射。
 *
 * 匹配策略：
 *  1. 精确匹配：pageNormText === segNorm
 *  2. 包含匹配：pageNormText 包含 segNorm（处理句子级粒度：一段被拆为多句）
 *  3. 模糊匹配：去掉所有空格后包含匹配（应对空格差异）
 */
function buildSegmentMap(
  pageInfos: PageInfo[],
  segments: Segment[],
): SegmentMapResult {
  const segToPageLoc = new Map<ID, { page: PageInfo; loc: PageSegLocation }>()
  const normSegs = segments
    .map((s) => ({ id: s.id as ID, norm: normalizeText(s.source ?? '') }))
    .filter((s) => s.norm.length > 0)

  const assigned = new Set<ID>()

  for (const page of pageInfos) {
    if (page.items.length === 0 || page.normText.length === 0) continue

    const assignSeg = (
      segId: ID,
      segNorm: string,
      searchFrom: number = 0,
    ): boolean => {
      const idx = page.normText.indexOf(segNorm, searchFrom)
      if (idx < 0) return false

      // 找到 normStart <= idx 且 normEnd > idx 的第一个 item（起始 item）
      let startItemIdx = -1
      let endItemIdx = -1
      for (let i = 0; i < page.items.length; i++) {
        if (page.items[i].normStart <= idx && page.items[i].normEnd > idx) {
          startItemIdx = i
          break
        }
      }
      if (startItemIdx === -1) {
        // segment 起始位置可能在 item 之间的空格处，取第一个 normStart >= idx 的 item
        for (let i = 0; i < page.items.length; i++) {
          if (page.items[i].normStart >= idx) {
            startItemIdx = i
            break
          }
        }
      }
      if (startItemIdx === -1) return false

      const segEnd = idx + segNorm.length
      // 找到最后一个 normStart < segEnd 的 item（结束 item，不含）
      for (let i = page.items.length - 1; i >= startItemIdx; i--) {
        if (page.items[i].normStart < segEnd) {
          endItemIdx = i + 1
          break
        }
      }
      if (endItemIdx === -1) endItemIdx = startItemIdx + 1

      const loc: PageSegLocation = {
        segId,
        startItemIdx,
        endItemIdx,
        normStart: idx,
        normEnd: segEnd,
      }
      page.segs.push(loc)
      segToPageLoc.set(segId, { page, loc })
      return true
    }

    // 1. 精确匹配
    for (const seg of normSegs) {
      if (assigned.has(seg.id)) continue
      if (page.normText === seg.norm) {
        if (assignSeg(seg.id, seg.norm)) {
          assigned.add(seg.id)
        }
      }
    }

    // 2. 包含匹配（同页多句推进 searchFrom）
    let searchFrom = 0
    for (const seg of normSegs) {
      if (assigned.has(seg.id)) continue
      const idx = page.normText.indexOf(seg.norm, searchFrom)
      if (idx >= 0) {
        if (assignSeg(seg.id, seg.norm, searchFrom)) {
          assigned.add(seg.id)
          searchFrom = idx + seg.norm.length
        }
      }
    }

    // 3. 模糊匹配：去掉所有空格后包含匹配（应对 PDF 换行/空格差异）
    const pageNoSpace = page.normText.replace(/\s/g, '')
    for (const seg of normSegs) {
      if (assigned.has(seg.id)) continue
      const segNoSpace = seg.norm.replace(/\s/g, '')
      if (segNoSpace.length < 6) continue  // 太短容易误匹配
      const idxNoSpace = pageNoSpace.indexOf(segNoSpace)
      if (idxNoSpace >= 0) {
        // 把无空格偏移映射回有空格偏移
        // 构建 noSpace → withSpace 的字符映射
        let spaceCountBefore = 0
        let withSpaceIdx = 0
        for (let i = 0; i < page.normText.length && withSpaceIdx < idxNoSpace; i++) {
          if (/\s/.test(page.normText[i])) {
            spaceCountBefore++
          } else {
            withSpaceIdx++
          }
        }
        const startIdx = spaceCountBefore + idxNoSpace
        // 用 startIdx 做 searchFrom 调用 assignSeg，但传入原始 segNorm
        // 如果原始 segNorm 也能在 startIdx 附近匹配上，就用 assignSeg
        // 否则直接用无空格匹配的结果构建 loc
        const realIdx = page.normText.indexOf(seg.norm, Math.max(0, startIdx - 2))
        if (realIdx >= 0 && Math.abs(realIdx - startIdx) <= 2) {
          if (assignSeg(seg.id, seg.norm, Math.max(0, startIdx - 2))) {
            assigned.add(seg.id)
          }
        } else {
          // 无空格匹配成功，但有空格版本匹配失败——手动构建 loc
          // 重新计算无空格偏移到有空格偏移的映射
          let wsIdx = 0
          let nsIdx = 0
          let wsStart = -1
          let wsEnd = -1
          for (let i = 0; i < page.normText.length; i++) {
            if (/\s/.test(page.normText[i])) continue
            if (nsIdx === idxNoSpace) wsStart = i
            if (nsIdx === idxNoSpace + segNoSpace.length - 1) {
              wsEnd = i + 1
              break
            }
            nsIdx++
          }
          if (wsStart >= 0 && wsEnd >= 0) {
            // 找到 wsStart 和 wsEnd 对应的 item 索引范围
            let sIdx = -1
            let eIdx = -1
            for (let i = 0; i < page.items.length; i++) {
              if (sIdx === -1 && page.items[i].normEnd > wsStart) sIdx = i
              if (page.items[i].normStart < wsEnd) eIdx = i + 1
            }
            if (sIdx >= 0 && eIdx >= 0) {
              const loc: PageSegLocation = {
                segId: seg.id,
                startItemIdx: sIdx,
                endItemIdx: eIdx,
                normStart: wsStart,
                normEnd: wsEnd,
              }
              page.segs.push(loc)
              segToPageLoc.set(seg.id, { page, loc })
              assigned.add(seg.id)
            }
          }
        }
      }
    }
  }

  return { segToPageLoc, pageInfos, matched: segToPageLoc.size }
}

/* ============================================================
 *  高亮工具
 * ============================================================ */

function clearAllHighlights(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(`.${ACTIVE_PAGE_CLASS}`).forEach((el) => {
    el.classList.remove(ACTIVE_PAGE_CLASS)
  })
  container.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_MARK_CLASS}`).forEach((el) => {
    el.remove()
  })
}

/**
 * 为 segment 对应的 textItem 范围创建高亮覆盖层 div。
 * 每个 item 创建一个独立的 div，用 BoundingRect 精确定位。
 *
 * 注意：这里用 textLayer 中对应位置的 span 的 BoundingRect 来定位，
 * 而非用 textItem 的 transform 估算值（transform 估算有偏差）。
 * 通过 item.normStart/normEnd 与 textLayer span 的 textContent 匹配找到对应 span。
 */
function highlightSegment(page: PageInfo, loc: PageSegLocation): HTMLElement | null {
  page.pageContainer.classList.add(ACTIVE_PAGE_CLASS)
  let firstMark: HTMLElement | null = null
  for (let i = loc.startItemIdx; i < loc.endItemIdx && i < page.items.length; i++) {
    const item = page.items[i]
    const mark = document.createElement('div')
    mark.className = HIGHLIGHT_MARK_CLASS
    mark.style.cssText = [
      'position: absolute',
      `left: ${item.left}px`,
      `top: ${item.top}px`,
      `width: ${item.width}px`,
      `height: ${item.height}px`,
      'background-color: rgba(25, 118, 210, 0.28)',
      'border-radius: 2px',
      'pointer-events: none',
      'z-index: 2',
    ].join(';')
    page.pageContainer.appendChild(mark)
    if (!firstMark) firstMark = mark
  }
  return firstMark
}

/* ============================================================
 *  组件
 * ============================================================ */

export function PdfPreview({
  file,
  segments,
  activeSegmentId,
  onSelectSegment,
}: PdfPreviewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const segToPageLocRef = useRef<Map<ID, { page: PageInfo; loc: PageSegLocation }>>(new Map())
  const pageInfosRef = useRef<PageInfo[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  const pageWidthRef = useRef<number>(800)
  const pagesWrapperRef = useRef<HTMLDivElement | null>(null)
  const renderTokenRef = useRef(0)
  const [zoom, setZoom] = useState(1.0) // 缩放比例：0.5 ~ 2.0

  // 渲染 PDF
  const renderPdf = useCallback(async () => {
    if (!containerRef.current || !file.id) return
    // 防止竞态：每次渲染用唯一 token，过期渲染的结果会被丢弃
    const myToken = ++renderTokenRef.current
    const isCancelled = () => renderTokenRef.current !== myToken
    setStatus('loading')
    setErrorMsg('')
    setPageCount(0)
    try {
      const row = await db.files.get(file.id as number)
      const blob = row?.rawBlob
      if (!blob) {
        throw new Error('该文件未保留原始二进制数据，无法渲染原格式。请重新导入该 pdf 文件。')
      }
      if (pagesWrapperRef.current) {
        pagesWrapperRef.current.innerHTML = ''
      }
      const arr = await blob.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arr }).promise
      setPageCount(pdf.numPages)

      const wrapperWidth = pagesWrapperRef.current
        ? pagesWrapperRef.current.getBoundingClientRect().width - 16
        : 800
      pageWidthRef.current = Math.max(320, wrapperWidth * zoom)

      const DPR = Math.min(window.devicePixelRatio || 1, 2)
      const pageInfos: PageInfo[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (!pagesWrapperRef.current || isCancelled()) break
        const page = await pdf.getPage(pageNum)
        const viewport0 = page.getViewport({ scale: 1 })
        const layoutScale = pageWidthRef.current / viewport0.width
        const viewport = page.getViewport({ scale: layoutScale })

        const pageEl = document.createElement('div')
        pageEl.className = 'cat-pdf-page'
        pageEl.dataset.pageNum = String(pageNum)
        // PDF 页面原始高度（PDF 坐标系），用于 textItem y 坐标转换
        const pdfPageHeight = viewport0.height
        pageEl.dataset.pdfHeight = String(pdfPageHeight)
        pageEl.style.cssText = [
          'position: relative',
          'margin: 16px auto',
          'background: #fff',
          'box-shadow: 0 2px 8px rgba(0,0,0,0.12)',
          `width: ${Math.floor(viewport.width)}px`,
          `height: ${Math.floor(viewport.height)}px`,
          'overflow: hidden',
        ].join(';')

        const canvas = document.createElement('canvas')
        canvas.className = 'cat-pdf-canvas'
        const ctx = canvas.getContext('2d')!
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        canvas.width = Math.floor(viewport.width * DPR)
        canvas.height = Math.floor(viewport.height * DPR)

        const textLayerDiv = document.createElement('div')
        textLayerDiv.className = 'textLayer'
        textLayerDiv.style.cssText = [
          'position: absolute',
          'top: 0; left: 0',
          'width: 100%; height: 100%',
          'pointer-events: auto',
          'color: transparent',
          'z-index: 1',
        ].join(';')

        pageEl.appendChild(canvas)
        pageEl.appendChild(textLayerDiv)
        pagesWrapperRef.current.appendChild(pageEl)

        // 1. 渲染 Canvas 图像层
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: [DPR, 0, 0, DPR, 0, 0],
        }).promise

        // 2. 获取 textContent（与 pdf.ts 导入时完全一致的数据源）
        const textContent = await page.getTextContent()
        const textItems = (textContent.items as unknown as TextItemData[]).filter(
          (it) => 'str' in it,
        )

        // 3. 渲染文本层（用于点击交互和文本选择）
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        })
        await textLayer.render()

        // 4. 构建 PageInfo：用 textItem 数据直接计算位置
        // viewport0.rawDims 包含 { pageWidth, pageHeight, pageX, pageY }，
        // PDF.js TextLayer 用这些值构建 transform：[1,0,0,-1, -pageX, pageY+pageHeight]
        const pageInfo = buildPageItemsWithSpanRects(
          pageEl,
          textItems,
          layoutScale,
          viewport0.rawDims as { pageWidth: number; pageHeight: number; pageX: number; pageY: number },
        )
        pageInfos.push(pageInfo)
      }

      // 保存 pageInfos 到 ref，供后续 buildSegmentMap 和反向查找使用
      if (isCancelled()) return
      pageInfosRef.current = pageInfos
      setStatus('ready')
    } catch (err) {
      console.error('[PdfPreview] render failed:', err)
      setErrorMsg((err as Error).message)
      setStatus('error')
    }
  }, [file.id, zoom])

  useEffect(() => {
    void renderPdf()
  }, [renderPdf])

  const sourcesKey = useMemo(
    () => segments.map((s) => `${s.id}#${s.source ?? ''}`).join('\u0000'),
    [segments],
  )

  // 构建 segment ↔ textItem 位置映射
  useEffect(() => {
    if (status !== 'ready') return
    const pageInfos = pageInfosRef.current

    // 重置 pageInfos 的 segs
    for (const p of pageInfos) p.segs = []

    const result = buildSegmentMap(pageInfos, segments)
    segToPageLocRef.current = result.segToPageLoc
    setMatchCount(result.matched)
  }, [status, sourcesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 激活段变化 → 高亮 + 滚动
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return
    const container = containerRef.current

    clearAllHighlights(container)

    if (activeSegmentId == null) return

    const entry = segToPageLocRef.current.get(activeSegmentId)
    if (!entry) return

    const firstMark = highlightSegment(entry.page, entry.loc)
    // 滚动到高亮位置（而非整个页面顶部），用 nearest 避免不必要的滚动
    if (firstMark) {
      firstMark.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } else {
      entry.page.pageContainer.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeSegmentId, status, matchCount])

  // 点击预览 → 反向定位段落
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (status !== 'ready') return
      const target = e.target as HTMLElement
      const pageContainer = target.closest<HTMLElement>('.cat-pdf-page')
      if (!pageContainer) return

      const pageInfo = pageInfosRef.current.find((p) => p.pageContainer === pageContainer)
      if (!pageInfo || pageInfo.segs.length === 0) return

      if (pageInfo.segs.length === 1) {
        onSelectSegment(pageInfo.segs[0].segId)
        return
      }

      // 多句页面：用点击的 span 映射到 textItem
      // PDF textLayer 的 span 是透明的，用户看到的是 canvas 图像，但点击事件会命中 span
      const clickedSpan = target.closest<HTMLElement>('span')
      let clickedItemIdx = -1

      if (clickedSpan && clickedSpan.parentElement?.classList.contains('textLayer')) {
        // 用 span 的 BoundingRect 找到位置最接近的 item
        const pageRect = pageContainer.getBoundingClientRect()
        const spanRect = clickedSpan.getBoundingClientRect()
        const spanLeft = spanRect.left - pageRect.left
        const spanTop = spanRect.top - pageRect.top
        let minItemDist = Infinity
        for (let i = 0; i < pageInfo.items.length; i++) {
          const item = pageInfo.items[i]
          const dist = Math.hypot(item.left - spanLeft, item.top - spanTop)
          if (dist < minItemDist) {
            minItemDist = dist
            clickedItemIdx = i
          }
        }
      }

      if (clickedItemIdx >= 0) {
        for (const seg of pageInfo.segs) {
          if (clickedItemIdx >= seg.startItemIdx && clickedItemIdx < seg.endItemIdx) {
            onSelectSegment(seg.segId)
            return
          }
        }
      }

      // 兜底：用点击坐标找最近的 item
      const pageRect = pageContainer.getBoundingClientRect()
      const clickX = e.clientX - pageRect.left
      const clickY = e.clientY - pageRect.top

      let nearestItemIdx = -1
      let minDist = Infinity
      for (let i = 0; i < pageInfo.items.length; i++) {
        const item = pageInfo.items[i]
        const cx = item.left + item.width / 2
        const cy = item.top + item.height / 2
        const dist = Math.hypot(clickX - cx, clickY - cy)
        if (dist < minDist) {
          minDist = dist
          nearestItemIdx = i
        }
      }

      if (nearestItemIdx >= 0) {
        let nearest: PageSegLocation | null = null
        let minSegDist = Infinity
        for (const seg of pageInfo.segs) {
          const dist = nearestItemIdx < seg.startItemIdx
            ? seg.startItemIdx - nearestItemIdx
            : nearestItemIdx - seg.endItemIdx + 1
          if (dist < minSegDist) {
            minSegDist = dist
            nearest = seg
          }
        }
        if (nearest) {
          onSelectSegment(nearest.segId)
          return
        }
      }

      onSelectSegment(pageInfo.segs[0].segId)
    },
    [status, onSelectSegment],
  )

  const stats = useMemo(() => {
    const total = segments.length
    const translated = segments.filter(
      (s) => s.status !== 'untranslated' && s.target.trim(),
    ).length
    return { total, translated }
  }, [segments])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
          原格式预览 · {pageCount} 页 · 共 {stats.total} 段 · 已译 {stats.translated} 段
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {status === 'ready' && (
            <Tooltip title={`段落与 PDF 文本匹配率：${matchCount}/${stats.total}`}>
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

      <Box
        ref={containerRef}
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
              正在渲染 PDF...
            </Typography>
          </Box>
        )}
        {status === 'error' && (
          <Alert severity="warning" sx={{ m: 2 }}>
            {errorMsg}
          </Alert>
        )}
        <Box
          ref={pagesWrapperRef}
          onClick={handleClick}
          sx={{
            '& .textLayer > *': {
              cursor: 'pointer',
            },
          }}
        />
      </Box>
    </Box>
  )
}

/* ============================================================
 *  辅助函数：用 textItem transform 直接计算像素位置
 * ============================================================ */

/**
 * 构建 PageInfo，用 textItem 的 transform 数据直接计算像素位置。
 *
 * 位置计算与 PDF.js v4 TextLayer 的 #appendText 公式完全一致：
 *   1. TextLayer 内部 transform = [1, 0, 0, -1, -pageX, pageY + pageHeight]  （y 翻转 + 偏移）
 *   2. tx = Util.transform(transform, geom.transform) 对每个 textItem 应用矩阵
 *      tx[4] = geom.transform[4] - pageX          （文字基线 x，PDF 单位）
 *      tx[5] = -geom.transform[5] + pageY + pageHeight  （翻转后的 y，PDF 单位）
 *   3. left = tx[4], top = tx[5] - fontAscent     （减去字体上升度，与 span 顶部对齐）
 *   4. span 定位用百分比：left% = 100*left/pageWidth, top% = 100*top/pageHeight
 *   5. 对应像素 = 百分比 * 容器尺寸 = left * layoutScale, top * layoutScale
 *
 * 文本拼接与 pdf.ts 完全一致：
 *   - 先按 y 坐标聚类成行（clusterLines 逻辑）
 *   - 同行 textItem 直接拼接 str（不加空格）
 *   - 跨行 textItem 之间加空格
 *   - 最后整体归一化 replace(/\s+/g, ' ').trim()
 */
function buildPageItemsWithSpanRects(
  pageContainer: HTMLElement,
  textItems: TextItemData[],
  layoutScale: number,
  rawDims: { pageWidth: number; pageHeight: number; pageX: number; pageY: number },
): PageInfo {
  const { pageWidth, pageHeight, pageX, pageY } = rawDims
  // 1. 过滤非空 textItem
  const validItemData = textItems.filter((it) => it.str && it.str.trim().length > 0)
  if (validItemData.length === 0) {
    return { pageContainer, normText: '', items: [], segs: [] }
  }

  // 2. 按 PDF 坐标系排序：y 降序（从上到下），同 y 按 x 升序
  //    与 pdf.ts clusterLines 排序一致
  const sorted = [...validItemData].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5]
    if (Math.abs(yDiff) > 3) return yDiff
    return a.transform[4] - b.transform[4]
  })

  // 3. 按行聚类（与 pdf.ts clusterLines 一致：同 y 容差 3 归为同一行）
  const lines: Array<{ items: TextItemData[]; y: number }> = []
  for (const it of sorted) {
    const y = it.transform[5]
    const existing = lines.find((l) => Math.abs(l.y - y) <= 3)
    if (existing) {
      existing.items.push(it)
    } else {
      lines.push({ items: [it], y })
    }
  }

  // 4. 拼接 rawText：同行直接拼接 str，跨行加空格
  //    与 pdf.ts clusterLines（同行 += str）+ clusterParagraphs（跨行加空格）一致
  const items: ItemInfo[] = []
  const rawParts: string[] = []
  const itemRawRanges: Array<{ start: number; end: number }> = []
  let rawOffset = 0
  let prevLineIdx = -1

  for (let li = 0; li < lines.length; li++) {
    for (const it of lines[li].items) {
      const rawStr = it.str.replace(/\u00a0/g, ' ')
      if (rawStr.trim().length === 0) continue

      // 同行不加空格，跨行加空格
      const isNewLine = li !== prevLineIdx
      const sep = rawOffset > 0 && isNewLine ? ' ' : ''
      const start = rawOffset + sep.length
      rawParts.push(sep + rawStr)
      rawOffset += sep.length + rawStr.length
      const end = rawOffset
      itemRawRanges.push({ start, end })

      // 位置计算：与 PDF.js TextLayer 的 #appendText 公式完全一致
      // TextLayer 内部 transform: [1, 0, 0, -1, -pageX, pageY + pageHeight]
      // 作用于 textItem.transform [a,b,c,d,e,f] 后：
      //   tx[4] = e - pageX          (文字基线 x，PDF 单位)
      //   tx[5] = -f + pageY + pageHeight   (翻转后的 y，PDF 单位)
      // left = tx[4], top = tx[5] - fontAscent
      // 像素值 = PDF单位 * layoutScale
      const fontHeight = it.height || Math.abs(it.transform[3]) || 10
      const fontAscent = fontHeight * 0.8 // 近似值，与 PDF.js #getAscent 一致
      const tx4 = it.transform[4] - pageX
      const tx5 = -it.transform[5] + pageY + pageHeight
      const left = tx4 * layoutScale
      const top = (tx5 - fontAscent) * layoutScale
      const width = it.width * layoutScale
      const height = fontHeight * layoutScale

      items.push({
        str: it.str,
        normStr: rawStr,
        normStart: start, // 临时用原始偏移，后面用映射修正
        normEnd: end,
        left,
        top,
        width,
        height,
      })
      prevLineIdx = li
    }
  }

  // 5. 归一化 rawText（与 pdf.ts toSegments 一致：replace(/\s+/g, ' ').trim()）
  const rawText = rawParts.join('')
  const normText = rawText.replace(/\s+/g, ' ').trim()

  // 6. 建立原始偏移 → 归一化偏移的映射
  const rawToNorm: number[] = new Array(rawText.length).fill(-1)
  let normIdx = 0
  let lastWasSpace = true // 开头的空格要跳过（对应 trim）
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i]
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        rawToNorm[i] = normIdx
        normIdx++
        lastWasSpace = true
      }
    } else {
      rawToNorm[i] = normIdx
      normIdx++
      lastWasSpace = false
    }
  }

  // 7. 重新计算 items 的 normStart/normEnd
  for (let i = 0; i < items.length; i++) {
    const range = itemRawRanges[i]
    let newStart = -1
    let newEnd = -1
    for (let j = range.start; j < range.end; j++) {
      const ni = rawToNorm[j]
      if (ni >= 0) {
        if (newStart === -1) newStart = ni
        newEnd = ni + 1
      }
    }
    if (newStart >= 0 && newEnd >= 0) {
      items[i].normStart = newStart
      items[i].normEnd = newEnd
    } else {
      items[i].normStart = -1
      items[i].normEnd = -1
    }
  }

  // 8. 过滤归一化后消失的 items（全空格项）
  const validItems = items.filter((it) => it.normStart >= 0)

  return { pageContainer, normText, items: validItems, segs: [] }
}
