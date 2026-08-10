import type { ID } from '@/types'
import type { TargetSelection, TargetCursorInfo } from '@/app/store/editorContext'

/**
 * 通过 execCommand('insertText') 把文本写入译文 contenteditable，让浏览器原生撤销栈记录变更。
 * 返回 false 表示找不到 contenteditable 元素（译文未处于编辑态）。
 */
export function doInsertViaExecCommand(
  segId: ID,
  text: string,
  targetSel: TargetSelection | null,
  targetCur: TargetCursorInfo | null,
): boolean {
  // 优先按激活段 ID 精确查找 contenteditable；回退到全局（聚焦台等场景）
  let editable: HTMLElement | null = null
  if (segId != null) {
    editable = document.querySelector(`[data-seg-id="${segId}"][contenteditable="true"]`) as HTMLElement | null
  }
  if (!editable) {
    editable = document.querySelector('[contenteditable="true"]') as HTMLElement | null
  }
  if (!editable) return false
  editable.focus()

  // 辅助：按 offset 查找 DOM 中的文本节点和偏移
  const findNodeAtOffset = (offset: number): { node: Text | null; offset: number } => {
    const walker = document.createTreeWalker(editable!, NodeFilter.SHOW_TEXT, null)
    let accumulated = 0
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      const len = node.nodeValue?.length ?? 0
      if (accumulated + len >= offset) {
        return { node, offset: offset - accumulated }
      }
      accumulated += len
    }
    return { node: null, offset: 0 }
  }

  const sel = window.getSelection()
  if (!sel) return true // editable 已找到但无法获取 Selection，视为已处理

  // 模拟 Ctrl+V：选区优先替换，否则光标插入
  if (targetSel && targetSel.segmentId === segId && targetSel.start < targetSel.end) {
    const start = findNodeAtOffset(targetSel.start)
    const end = findNodeAtOffset(targetSel.end)
    const range = document.createRange()
    if (start.node && end.node) {
      range.setStart(start.node, Math.min(start.offset, start.node.nodeValue?.length ?? 0))
      range.setEnd(end.node, Math.min(end.offset, end.node.nodeValue?.length ?? 0))
    } else {
      range.selectNodeContents(editable)
      range.collapse(false)
    }
    sel.removeAllRanges()
    sel.addRange(range)
  } else if (targetCur && targetCur.segmentId === segId && targetCur.offset >= 0) {
    const found = findNodeAtOffset(targetCur.offset)
    const range = document.createRange()
    if (found.node) {
      range.setStart(found.node, Math.min(found.offset, found.node.nodeValue?.length ?? 0))
      range.collapse(true)
    } else {
      range.selectNodeContents(editable)
      range.collapse(false)
    }
    sel.removeAllRanges()
    sel.addRange(range)
  } else {
    const range = document.createRange()
    range.selectNodeContents(editable)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  document.execCommand('insertText', false, text)
  return true
}
