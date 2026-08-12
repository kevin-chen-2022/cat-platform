import { useRef, useEffect, useCallback } from 'react'
import type { ReactElement, KeyboardEvent } from 'react'
import { Box } from '@mui/material'
import type { ID } from '@/types'

interface EditableDivProps {
  /** 当前值（纯文本或 HTML） */
  value: string
  /** 值变化回调，参数为 div 的 innerText（纯文本模式）或 innerHTML（富文本模式） */
  onChange: (value: string) => void
  /** 占位提示文本 */
  placeholder?: string
  /** 最小高度 */
  minHeight?: number
  /** 字号 */
  fontSize?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 额外 sx */
  sx?: Record<string, unknown>
  /** 停止冒泡的键盘事件（如回车换行） */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  /** 禁用 Tab 插入制表符的默认行为（由父组件通过 onKeyDown 自行处理 Tab 导航） */
  disableTabInsert?: boolean
  /** 所属段 ID，渲染为 data-seg-id，供外部精确定位 */
  dataSegId?: ID
  /** 是否启用富文本模式（使用 innerHTML 同步内容，支持加粗/上标/颜色等格式） */
  richText?: boolean
  /** 标识编辑器角色，配合 data-seg-id 做 DOM 定位（target=译文区 source=原文区） */
  dataRole?: 'target' | 'source'
}

/**
 * 受控的 contenteditable div。
 *
 * 关键设计：
 * 1. IME 合成期（compositionstart/compositionend）不触发 onChange，避免中文输入中途打断
 * 2. 仅在 value 与 DOM 内容不一致时才更新 DOM，避免光标跳到行首
 * 3. 输入时通过 onInput 读取 innerText（纯文本）或 innerHTML（富文本）回调父组件
 * 4. 富文本模式使用 lastHtmlRef 跟踪上次写入的 HTML，避免浏览器规范化导致的不必要更新
 */
export function EditableDiv({
  value,
  onChange,
  placeholder = '',
  minHeight = 24,
  fontSize = 'var(--app-content-font-size)',
  disabled = false,
  sx,
  onKeyDown,
  disableTabInsert = false,
  dataSegId,
  richText = false,
  dataRole,
}: EditableDivProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  // 富文本模式下记录上次写入 DOM 的 HTML，避免浏览器规范化差异导致光标跳动
  const lastHtmlRef = useRef<string>('')

  // 仅在外部 value 与当前 DOM 内容不一致时同步（如切换活动段、copySource 等）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (richText) {
      // 富文本模式：仅当外部 value 与上次写入的 HTML 不同时才更新 DOM
      if (value !== lastHtmlRef.current) {
        el.innerHTML = value
        lastHtmlRef.current = value
      }
    } else {
      if (el.innerText !== value) {
        el.innerText = value
      }
    }
  }, [value, richText])

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return
    const el = ref.current
    if (!el) return
    if (richText) {
      const html = el.innerHTML
      lastHtmlRef.current = html
      onChange(html)
    } else {
      onChange(el.innerText)
    }
  }, [onChange, richText])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false
    // 合成结束后立即同步一次
    const el = ref.current
    if (!el) return
    if (richText) {
      const html = el.innerHTML
      lastHtmlRef.current = html
      onChange(html)
    } else {
      onChange(el.innerText)
    }
  }, [onChange, richText])

  // Tab 键不切焦点，插入制表符（除非 disableTabInsert 由父组件处理 Tab 导航）
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Tab' && !disableTabInsert) {
        e.preventDefault()
        document.execCommand('insertText', false, '\t')
      }
      onKeyDown?.(e)
    },
    [onKeyDown, disableTabInsert],
  )

  // 阻止粘贴富文本，只保留纯文本
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])

  // 空内容时显示 placeholder（用 CSS 伪元素实现）
  // 富文本模式下需额外检查 <br> 等浏览器插入的空内容
  const showPlaceholder = richText
    ? !value || value === '<br>' || value === '<div><br></div>'
    : !value

  return (
    <Box
      ref={ref}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onInput={handleInput}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      data-seg-id={dataSegId != null ? String(dataSegId) : undefined}
      data-role={dataRole}
      data-placeholder={showPlaceholder ? placeholder : undefined}
      sx={{
        minHeight,
        width: '100%',
        outline: 'none',
        fontSize,
        lineHeight: 1.5,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        cursor: 'text',
        '&:empty::before': showPlaceholder
          ? {
              content: 'attr(data-placeholder)',
              color: 'text.disabled',
              fontStyle: 'italic',
              pointerEvents: 'none',
            }
          : undefined,
        ...sx,
      }}
    />
  )
}
