import { useState, useRef, useEffect, useCallback } from 'react'
import { Typography, Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import type { ReactNode } from 'react'

interface ExpandableTextProps {
  /** 文本内容（纯文本） */
  children: string
  /** 是否为富文本 HTML（如 TM 条目可能含格式标签），为 true 时通过 dangerouslySetInnerHTML 渲染 */
  html?: boolean
  /** 折叠时最大行数，默认 2 */
  maxLines?: number
  /** Typography variant，默认 'body2' */
  variant?: 'body2' | 'body1' | 'caption' | 'subtitle2'
  /** 额外颜色，默认 'text.secondary'（原文行用）或 'text.primary'（译文行用） */
  color?: string
  /** 额外 sx */
  sx?: SxProps<Theme>
}

/**
 * 可展开/收起的文本组件。
 * - 默认显示 maxLines 行（line-clamp），超出部分省略号截断
 * - 点击文本区域切换展开/收起
 * - 文本未超出行数时，不显示"展开"提示，点击也无反应
 */
export function ExpandableText({
  children,
  html = false,
  maxLines = 2,
  variant = 'body2',
  color = 'text.secondary',
  sx,
}: ExpandableTextProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const textRef = useRef<HTMLDivElement | null>(null)

  // 检测文本是否被 line-clamp 截断（scrollHeight > clientHeight）
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    // 仅在折叠状态下检测
    if (expanded) {
      setClamped(false)
      return
    }
    setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [children, expanded, maxLines])

  const handleClick = useCallback(() => {
    if (clamped || expanded) setExpanded((v) => !v)
  }, [clamped, expanded])

  const lineClampSx: SxProps<Theme> = expanded
    ? {}
    : {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical' as const,
        WebkitLineClamp: maxLines,
        overflow: 'hidden',
      }

  return (
    <Typography
      ref={textRef}
      variant={variant}
      color={color}
      component="div"
      onClick={handleClick}
      sx={{
        ...lineClampSx,
        cursor: (clamped || expanded) ? 'pointer' : 'text',
        userSelect: 'text',
        borderRadius: 0.25,
        px: 0.25,
        mx: -0.25,
        '&:hover': { bgcolor: 'action.hover' },
        '&::selection': { bgcolor: 'primary.main', color: 'primary.contrastText' },
        ...sx,
      } as SxProps<Theme>}
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: children }} />
      ) : (
        children
      )}
    </Typography>
  )
}
