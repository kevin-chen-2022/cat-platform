import React, { useMemo } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SxProps, Theme } from '@mui/material/styles'
import {
  Typography, Box, Link, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Divider,
} from '@mui/material'
import LaunchIcon from '@mui/icons-material/Launch'

/**
 * 检测一行是否是"AI 编号标题"（含不规范写法）并返回标准化结果。
 * AI 被 prompt 要求输出 `## 1. 原文释义`，但实际高频返回这些变体：
 *   - `# 1. 原文释义`          （写成一级标题，语法正确可直接识别）
 *   - `##1.原文释义`           （井号后无空格，点后无空格 → 不被识别为 heading）
 *   - `#1. 原文释义`           （井号后无空格）
 *   - `## 1.原文释义`          （点后无空格）
 *   - `＃ 1. 原文释义`         （全角井号）
 * 这些都会被 react-markdown 当成纯文本 paragraph。
 * 本函数统一标准化为规范格式：`{#数量} {序号}.{空格}{标题文字}`，
 * 并给出 heading 级别（#数量）供调用方判断。
 */
function tryNormalizeAiHeadingLine(raw: string): { level: number; normalized: string } | null {
  const line = raw.trimStart()
  // 匹配：开头 1-6 个 半角# / 全角＃，后面可能有空格，然后是"数字.文本"
  const m = line.match(/^([#＃]{1,6})(\s*)(\d+)\.(\s*)(.*)$/)
  if (!m) return null
  const rawHashes = m[1]
  const digit = m[3]
  const afterDotSpace = m[4] || ''
  const restText = m[5] || ''
  // 不允许"序号"后面跟空内容（如果只是 "## 1." 没有文字，可能是普通段落序号）
  if (!restText.trim()) return null
  // 全角井号转半角，计算真实 level
  const hashes = rawHashes.replace(/＃/g, '#')
  const level = hashes.length
  // 标准化："## 1. 原文释义"
  const normalized = `${hashes} ${digit}. ${restText.trimStart()}`
  // 吃掉原行开头的空白缩进（heading 不缩进）
  void afterDotSpace
  return { level, normalized }
}

/**
 * 【文本规范化预处理层】
 * 参考经验 167520：把 AI 可能返回的不规范 Markdown 在进入 ReactMarkdown 前统一修正，
 * 避免在各个渲染分支打补丁。采用"行级扫描 + 表格块隔离"的结构化处理，
 * 比零散正则更可控，避免误伤表格/代码块内部。
 */
function normalizeMarkdown(raw: string): string {
  if (!raw) return ''
  let s = raw.replace(/\r\n/g, '\n')

  // 全局 1：列表和标题的"符号后无空格"最小修复（行级再兜底一次）
  s = s.replace(/\n\s*-(\S)/g, '\n- $1')
  s = s.replace(/\n\s*\*(\S)/g, '\n* $1')
  s = s.replace(/\n\s*\+(\S)/g, '\n+ $1')
  s = s.replace(/\n\s*(\d+)\.(\S)/g, '\n$1. $2')
  s = s.replace(/^(#{1,6})(\S)/gm, '$1 $2')

  // 行级处理：按行扫描，识别"表格块"和"AI 编号标题"，分别做边界/标准化处理
  const lines = s.split('\n')
  const buf: string[] = []
  let inTable = false
  // 用一个简单的"代码块围栏"标记，避免把代码块内部的 ## 当 heading 处理
  let inFence = false
  let fenceChar = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // —— 代码块边界（围栏 ``` 或 ~~~） ——
    if (!inTable) {
      const fence = trimmed.match(/^(`{3,}|~{3,})/)
      if (fence) {
        if (!inFence) {
          inFence = true
          fenceChar = fence[1][0]
        } else if (fence[1][0] === fenceChar && trimmed.startsWith(fence[1][0])) {
          inFence = false
          fenceChar = ''
        }
      }
    }

    // —— 表格块边界（连续 |...| 行） ——
    const isTableLine = !inFence && /^\s*\|.*\|\s*$/.test(line)
    if (isTableLine && !inTable) {
      if (buf.length > 0 && buf[buf.length - 1].trim() !== '') buf.push('')
      inTable = true
    } else if (!isTableLine && inTable) {
      if (buf.length > 0 && buf[buf.length - 1].trim() !== '') buf.push('')
      inTable = false
    }

    if (inTable || inFence) {
      // 表格 / 代码块内部不做 heading 标准化
      buf.push(line)
      continue
    }

    // —— AI 编号标题标准化 ——
    const heading = tryNormalizeAiHeadingLine(line)
    if (heading) {
      // heading 前必须是空行（或 buffer 开头），否则补空行
      if (buf.length > 0 && buf[buf.length - 1].trim() !== '') buf.push('')
      buf.push(heading.normalized)
      continue
    }

    // —— 普通 heading（以 # 开头、不是编号标题的 ATX 标题） ——
    const plainHeading = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (plainHeading) {
      if (buf.length > 0 && buf[buf.length - 1].trim() !== '') buf.push('')
      // 去掉行首缩进，# 后保留空格
      const normalized = `${plainHeading[1]} ${plainHeading[2].trimStart()}`
      buf.push(normalized)
      continue
    }

    // —— 水平分隔线（--- /*** / ___）前补空行 ——
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      if (buf.length > 0 && buf[buf.length - 1].trim() !== '') buf.push('')
      buf.push(line)
      continue
    }

    buf.push(line)
  }

  s = buf.join('\n')

  // 最后：连续 3+ 空行压缩为 2 空行，首尾多余空行修剪
  s = s.replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '')

  return s
}

const _tableWrap: SxProps<Theme> = {
  mt: 1, mb: 1.5,
}

const _codeInline: SxProps<Theme> = {
  display: 'inline',
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: '0.85em',
  padding: '1px 5px',
  borderRadius: 3,
  bgcolor: 'action.hover',
  color: 'text.primary',
  whiteSpace: 'nowrap',
}

const _codeBlock: SxProps<Theme> = {
  display: 'block',
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: '0.8em',
  p: 1,
  mt: 0.75,
  mb: 1,
  borderRadius: 1,
  bgcolor: 'action.hover',
  color: 'text.primary',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowX: 'auto',
}

const _blockquote: SxProps<Theme> = {
  borderLeft: '3px solid',
  borderColor: 'divider',
  pl: 1.5,
  py: 0.25,
  my: 0.75,
  color: 'text.secondary',
  bgcolor: 'action.hover',
}

const _hr: SxProps<Theme> = { my: 2 }

export interface MarkdownRendererProps {
  children: string
  /** 段落字号，默认 body2。AI翻译场景可传入更小字号以对比多个模型结果 */
  variant?: 'body2' | 'caption' | 'subtitle2'
  /** 是否对外部链接加外链图标并新窗口打开，默认 true */
  externalLinkIcon?: boolean
}

/**
 * 基于 react-markdown + remark-gfm 的通用 Markdown 渲染器。
 * - 所有原生标签统一映射为 MUI 组件，视觉风格与项目一致
 * - 默认禁用 HTML（安全），仅渲染标准 Markdown + GFM 扩展（表格/任务列表/删除线）
 * - 内置文本规范化预处理，兼容 AI 返回的轻微格式异常
 */
export function MarkdownRenderer({
  children,
  variant = 'body2',
  externalLinkIcon = true,
}: MarkdownRendererProps): ReactNode {
  const content = useMemo(() => normalizeMarkdown(children ?? ''), [children])

  const textSx = useMemo<SxProps<Theme>>(() => ({
    lineHeight: variant === 'caption' ? 1.55 : 1.7,
    mb: variant === 'caption' ? 0.5 : 0.85,
    fontSize: variant === 'caption' ? '0.75rem' : undefined,
  }), [variant])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={['iframe', 'script', 'style']}
      unwrapDisallowed
      components={{
        // ====== 段落与标题 ======
        p: ({ children }) => (
          <Typography variant={variant} sx={textSx}>{children}</Typography>
        ),
        h1: ({ children }) => (
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 1.5, mb: 0.75 }}>{children}</Typography>
        ),
        h2: ({ children }) => (
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1.5, mb: 0.6 }}>{children}</Typography>
        ),
        h3: ({ children }) => (
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1.25, mb: 0.5 }}>{children}</Typography>
        ),
        h4: ({ children }) => (
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1, mb: 0.4 }}>{children}</Typography>
        ),
        h5: ({ children }) => (
          <Typography variant={variant} sx={{ fontWeight: 700, mt: 0.8, mb: 0.3 }}>{children}</Typography>
        ),
        h6: ({ children }) => (
          <Typography variant="caption" sx={{ fontWeight: 700, mt: 0.8, mb: 0.3, display: 'block' }}>{children}</Typography>
        ),

        // ====== 内联元素 ======
        strong: ({ children }) => (
          <Box component="strong" sx={{ fontWeight: 700 }}>{children}</Box>
        ),
        em: ({ children }) => (
          <Box component="em" sx={{ fontStyle: 'italic' }}>{children}</Box>
        ),
        del: ({ children }) => (
          <Box component="del" sx={{ textDecoration: 'line-through' }}>{children}</Box>
        ),
        code: ({ className, children, ...rest }) => {
          const isBlock = Boolean(className?.includes('language-'))
          const code = String(children ?? '').replace(/\n$/, '')
          return isBlock ? (
            <Box component="pre" sx={_codeBlock} {...rest}>{code}</Box>
          ) : (
            <Box component="code" sx={_codeInline} {...rest}>{code}</Box>
          )
        },
        a: ({ href, children }) => {
          const isExternal = Boolean(href && /^(https?:|mailto:|tel:)/i.test(href))
          return (
            <Link
              href={href ?? '#'}
              target={isExternal ? '_blank' : undefined}
              rel={isExternal ? 'noopener noreferrer' : undefined}
              underline="hover"
              sx={{ alignItems: 'inline-flex', gap: 0.25 }}
            >
              {children}
              {isExternal && externalLinkIcon && (
                <LaunchIcon sx={{ fontSize: 11, verticalAlign: '-2px', color: 'text.disabled' }} />
              )}
            </Link>
          )
        },

        // ====== 列表 ======
        ul: ({ children }) => (
          <Box component="ul" sx={{ pl: 2.2, mt: 0.25, mb: 0.75 }}>{children}</Box>
        ),
        ol: ({ children }) => (
          <Box component="ol" sx={{ pl: 2.2, mt: 0.25, mb: 0.75 }}>{children}</Box>
        ),
        li: ({ children, className }) => {
          // 任务列表：remark-gfm 会给 li 加 className="task-list-item"
          const isTask = className?.includes('task-list-item')
          return (
            <Box
              component="li"
              sx={{
                variant,
                lineHeight: variant === 'caption' ? 1.55 : 1.7,
                mb: 0.2,
                pl: isTask ? 0.25 : 0,
                '& > input[type="checkbox"]': { mr: 0.5, verticalAlign: '-2px' },
              }}
            >
              {children}
            </Box>
          )
        },

        // ====== 其他块级元素 ======
        blockquote: ({ children }) => (
          <Box sx={_blockquote}>{children}</Box>
        ),
        hr: () => <Divider sx={_hr} />,
        br: () => <br />,

        // ====== 表格（GFM） ======
        table: ({ children }) => (
          <TableContainer component={Paper} variant="outlined" sx={_tableWrap}>
            <Table size="small">{children}</Table>
          </TableContainer>
        ),
        thead: ({ children }) => <TableHead sx={{ bgcolor: 'action.hover' }}>{children}</TableHead>,
        tbody: ({ children }) => <TableBody>{children}</TableBody>,
        tr: ({ children }) => <TableRow hover>{children}</TableRow>,
        th: ({ children }) => (
          <TableCell sx={{
            fontWeight: 600, fontSize: '0.8rem', py: 0.75, px: 1,
            borderColor: 'divider', whiteSpace: 'nowrap',
          }}>
            {children}
          </TableCell>
        ),
        td: ({ children }) => (
          <TableCell sx={{
            fontSize: variant === 'caption' ? '0.75rem' : '0.8rem',
            py: 0.75, px: 1, borderColor: 'divider',
            verticalAlign: 'top',
          }}>
            {children}
          </TableCell>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default MarkdownRenderer
