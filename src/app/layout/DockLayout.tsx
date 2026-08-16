import { useRef, useEffect, useCallback, useMemo } from 'react'
import DockLayout from 'rc-dock'
import type { TabData, TabBase, LayoutData, LayoutBase, DockLayout as DockLayoutRef, PanelData, BoxData } from 'rc-dock'
import 'rc-dock/dist/rc-dock.css'
import type { ReactElement } from 'react'
import { useUIStore, useLayoutStore, setDockRef, collectVisibleTabs, getDockRef, dispatchReverseLinkage } from '@app/store'
import { getPanelDef } from './panelRegistry'
import { DEFAULT_DOCK_LAYOUT, DEFAULT_VISIBLE_TABS } from './defaultLayout'

function makeTabData(id: string): TabData {
  const def = getPanelDef(id)
  return {
    id,
    title: def?.title ?? id,
    closable: true,
    cached: true,
    content: () => def?.render() ?? null,
  } as TabData
}

function enrichLayout(node: any): any {
  if (!node) return node
  if (Array.isArray(node.tabs)) {
    node.tabs = node.tabs.map((t: any) => {
      if (t.content) return t
      const def = getPanelDef(t.id)
      if (!def) return t
      return {
        ...t,
        title: def.title,
        closable: true,
        cached: true,
        content: () => def.render(),
      }
    })
  }
  if (Array.isArray(node.children)) {
    node.children = node.children.map(enrichLayout)
  }
  return node
}

// 记录用户最近交互（点击/激活）的 Tab id，用于判断"当前活动面板"
// rc-dock 的 onLayoutChange 回调会传入 currentTabId
let _lastActiveTabId: string | null = null

export function setLastActiveTabId(id: string | null): void {
  _lastActiveTabId = id
}

export function getLastActiveTabId(): string | null {
  return _lastActiveTabId
}

export function showTabInDock(tabId: string): void {
  const ref = getDockRef()
  if (!ref) return
  // 若 Tab 已存在，直接激活
  const existing = ref.find(tabId) as TabData | undefined
  if (existing) {
    ref.updateTab(tabId, null, true)
    return
  }
  const def = getPanelDef(tabId)
  if (!def) return
  const tab = makeTabData(tabId)
  let targetPanel: PanelData | null = null
  // 优先：通过用户最近交互的 Tab id 找到其所在面板
  if (_lastActiveTabId) {
    const lastTab = ref.find(_lastActiveTabId) as TabData | undefined
    if (lastTab?.parent) {
      targetPanel = lastTab.parent
    }
  }
  // 回退1：找第一个非空 panel（优先并入已有 tab 的面板）
  if (!targetPanel) {
    targetPanel = ref.find(
      (item: any) => 'tabs' in item && Array.isArray(item.tabs) && item.tabs.length > 0,
    ) as PanelData | null
  }
  // 回退2：找第一个空 panel（复用 panelLock 保留的空壳）
  if (!targetPanel) {
    targetPanel = ref.find(
      (item: any) => 'tabs' in item && Array.isArray(item.tabs) && item.tabs.length === 0,
    ) as PanelData | null
  }
  if (targetPanel) {
    ref.dockMove(tab, targetPanel, 'middle')
    ref.updateTab(tabId, null, true)
    return
  }
  // 最后兜底：空壳也丢失时，找 dockbox 作为 target 创建新 panel
  // dockMove 传入 BoxData target 时会调用 converToPanel(source) 自动创建新 panel
  const dockbox = ref.find(
    (item: any) =>
      'children' in item &&
      Array.isArray((item as BoxData).children) &&
      'mode' in item &&
      typeof (item as BoxData).mode === 'string',
  ) as BoxData | null
  if (dockbox) {
    ref.dockMove(tab, dockbox, 'right')
    ref.updateTab(tabId, null, true)
  }
}

export function hideTabInDock(tabId: string): void {
  const ref = getDockRef()
  if (!ref) return
  const found = ref.find(tabId) as TabData | undefined
  if (!found) return
  ref.dockMove(found, null, 'remove')
}

export function getDockLayout(): LayoutBase | null {
  const ref = getDockRef()
  if (!ref) return null
  return ref.saveLayout()
}

export function loadDockLayout(saved: LayoutBase): void {
  const ref = getDockRef()
  if (!ref) return
  ref.loadLayout(saved)
}

export function applyDefaultLayout(): void {
  const ref = getDockRef()
  if (!ref) return
  const layout = enrichLayout(structuredClone(DEFAULT_DOCK_LAYOUT)) as LayoutData
  ref.setLayout(layout)
}

export function DockLayoutView(): ReactElement {
  const theme = useUIStore((s) => s.theme)
  const setVisibleTabs = useLayoutStore((s) => s.setVisibleTabs)
  const headersHidden = useLayoutStore((s) => s.headersHidden)
  const tabBarVertical = useLayoutStore((s) => s.tabBarVertical)
  const zenMode = useLayoutStore((s) => s.zenMode)
  const borderHidden = useLayoutStore((s) => s.borderHidden)
  const autoHideTabs = useLayoutStore((s) => s.autoHideTabs)
  const workbenchMode = useLayoutStore((s) => s.workbenchMode)
  const dockRef = useRef<DockLayoutRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const immutableLayout = workbenchMode !== 'translate'

  useEffect(() => {
    setDockRef(dockRef.current)
    setVisibleTabs([...DEFAULT_VISIBLE_TABS])
    return () => setDockRef(null)
  }, [setVisibleTabs])

  /**
   * 所有模式下都允许 tab 拖拽和面板调整。
   * 词典/记忆布局允许用户自由摆放，不再用事件捕获拦截 mousemove。
   */

  // applyVerticalRef 先声明，让点击事件 handler 能调用 apply 实时切换竖排面板
  const applyVerticalRef = useRef<(() => void) | null>(null)

  // 通过事件委托监听 Tab 点击，实时更新 _lastActiveTabId
  // .dock-tab-btn 元素 id 格式为 `rc-tabs-{n}-tab-{tabId}`，tabId 就是 tab.id
  // 注意：点击已 active 的 tab 不会触发 onLayoutChange，所以需要此监听来跟踪用户点击
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target) return
      // 点击关闭按钮时不更新
      if (target.classList?.contains('dock-tab-close-btn')) return
      // 从 .dock-tab-btn 的 id 提取 tabId（即 tab.id）
      const tabBtn = target.closest('.dock-tab-btn') as HTMLElement | null
      if (tabBtn?.id) {
        const match = tabBtn.id.match(/^rc-tabs-\d+-tab-(.+)$/)
        if (match && match[1]) {
          setLastActiveTabId(match[1])
          // 反向联动：用户点击激活 tab 时，读取编辑器当前状态按需更新卡片内容
          dispatchReverseLinkage(match[1])
          // 立即重新应用竖排样式，让竖排跟随用户点击的 Tab
          applyVerticalRef.current?.()
          return
        }
      }
    }
    el.addEventListener('click', handler, true)
    return () => el.removeEventListener('click', handler, true)
  }, [])

  // 当 tabBarVertical 开启时，给活动 Tab 所在面板添加竖排样式
  // 通过 rc-dock API (ref.find) 用 tab.id 定位 Tab 对象，获取其 parent panel 的 id
  // 再用 .dock-panel[data-dockid="..."] 精确匹配 DOM 元素（DockPanel render 时有 data-dockid 属性）
  useEffect(() => {
    const apply = () => {
      const el = containerRef.current
      if (!el) return
      // 先清除所有标记
      el.querySelectorAll('.cat-tabbar-vertical').forEach((n) => n.classList.remove('cat-tabbar-vertical'))
      if (!useLayoutStore.getState().tabBarVertical) return

      const ref = getDockRef()
      if (!ref) return

      const activeTabId = getLastActiveTabId()
      let panelId: string | null = null

      // 优先：用 _lastActiveTabId 通过 rc-dock API 找到 Tab 所属的 Panel
      if (activeTabId) {
        const tab = ref.find(activeTabId) as TabData | undefined
        if (tab && 'parent' in tab && tab.parent) {
          panelId = tab.parent.id ?? null
        }
      }

      // 回退：如果没有 _lastActiveTabId 或找不到对应 Tab，用 DOM 中的第一个 panel
      if (!panelId) {
        const firstPanelEl = el.querySelector('.dock-panel') as HTMLElement | null
        if (firstPanelEl) {
          panelId = firstPanelEl.getAttribute('data-dockid')
        }
      }

      if (panelId) {
        const panelEl = el.querySelector(`.dock-panel[data-dockid="${panelId}"]`) as HTMLElement | null
        if (panelEl) {
          panelEl.classList.add('cat-tabbar-vertical')
        }
      }
    }
    applyVerticalRef.current = apply
    if (tabBarVertical) {
      apply()
      const interval = setInterval(apply, 500)
      return () => clearInterval(interval)
    } else {
      apply()
    }
  }, [tabBarVertical])

  // 自动贴边隐藏（MVP：只针对"项目文件"tab，即 tab id = "project"）
  // 1. 通过 DOM 操作给 project tab 所在 panel 的标题栏注入图钉按钮（插入 .dock-extra-content）
  // 2. 根据 autoHideTabs 状态给该 panel 加 .cat-autohide 类
  // 3. CSS 控制：未钉住时 panel 收缩为边条
  // 4. JS mouseenter/mouseleave 控制展开/收起，鼠标离开 panel 延迟 500ms 后收起
  const applyAutoHideRef = useRef<(() => void) | null>(null)
  const autoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 记录 panel 进入 auto-hide 之前的原始尺寸，展开时恢复
  const originalSizeRef = useRef<{ width: number; height: number }>({ width: 300, height: 400 })
  useEffect(() => {
    const apply = () => {
      const el = containerRef.current
      if (!el) return
      const ref = getDockRef()
      if (!ref) return

      // 清扫：钉住按钮只应出现在含 project tab 的 panel 上
      // 遍历所有 panel，移除不在 project panel 上的 .cat-pin-btn，防止最大化/还原后 DOM 复用时按钮乱窜
      el.querySelectorAll('.dock-panel').forEach((p) => {
        const panel = p as HTMLElement
        const pinBtn = panel.querySelector('.cat-pin-btn')
        if (!pinBtn) return
        // 判断：该 panel 的 tab 栏中是否有 project tab
        const hasProject = !!panel.querySelector('.dock-tab-btn[id$="-tab-project"]')
        if (!hasProject) {
          pinBtn.remove()
        }
      })

      // 找到 project tab 所属的 panel
      const tab = ref.find('project') as TabData | undefined
      if (!tab || !('parent' in tab) || !tab.parent) return
      const panelId = tab.parent.id
      const panelEl = el.querySelector(`.dock-panel[data-dockid="${panelId}"]`) as HTMLElement | null
      if (!panelEl) return
      // DOM 层二次校验：确认该 panel 中实际渲染了 project tab（最大化/还原时数据层/DOM 层可能短暂不同步）
      // rc-tabs 的 tab btn DOM id 格式为 rc-tabs-{n}-tab-{tabId}，用尾匹配选择器精准定位
      if (!panelEl.querySelector('.dock-tab-btn[id$="-tab-project"]')) return

      // 注入图钉按钮到 .dock-extra-content 容器（与最大化按钮并排，不重叠）
      const extraContent = panelEl.querySelector('.dock-extra-content') as HTMLElement | null
      if (extraContent) {
        let btn = extraContent.querySelector('.cat-pin-btn') as HTMLElement | null
        if (!btn) {
          btn = document.createElement('button')
          btn.className = 'cat-pin-btn'
          btn.title = '钉住 / 自动隐藏'
          btn.setAttribute('aria-label', '钉住 / 自动隐藏')
          // MUI PushPin 图标 SVG（24x24 viewBox）
          // 钉住状态：Outlined 描边版（fill=none stroke=currentColor）
          // 未钉住状态：Filled 填充版（fill=currentColor）+ 旋转 45 度
          btn.innerHTML = '<svg class="cat-pin-icon-pinned" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4zm3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1"/></svg><svg class="cat-pin-icon-unpinned" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:none"><path fill-rule="evenodd" d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3"/></svg>'
          btn.addEventListener('click', (e) => {
            e.stopPropagation()
            e.preventDefault()
            // 切换 auto-hide 时移除展开状态
            panelEl.classList.remove('cat-autohide-expanded')
            // 即将进入 auto-hide 时，记录当前 panel 的原始尺寸，用于展开时恢复
            const willAutoHide = !useLayoutStore.getState().isAutoHide('project')
            if (willAutoHide) {
              const rect = panelEl.getBoundingClientRect()
              if (rect.width > 50) originalSizeRef.current.width = rect.width
              if (rect.height > 50) originalSizeRef.current.height = rect.height
            }
            useLayoutStore.getState().toggleAutoHide('project')
          })
          // 插入到 .dock-extra-content 的最前面（最大化按钮之前）
          extraContent.insertBefore(btn, extraContent.firstChild)
        }
      }

      // 应用 auto-hide 类
      const isAutoHide = useLayoutStore.getState().isAutoHide('project')
      panelEl.classList.toggle('cat-autohide', isAutoHide)
      const pinBtn = panelEl.querySelector('.cat-pin-btn')
      pinBtn?.classList.toggle('cat-unpinned', isAutoHide)
      // 切换图标显示：钉住用 Outlined 描边，未钉住用 Filled 填充
      const iconPinned = pinBtn?.querySelector('.cat-pin-icon-pinned') as HTMLElement | null
      const iconUnpinned = pinBtn?.querySelector('.cat-pin-icon-unpinned') as HTMLElement | null
      if (iconPinned && iconUnpinned) {
        iconPinned.style.display = isAutoHide ? 'none' : 'block'
        iconUnpinned.style.display = isAutoHide ? 'block' : 'none'
      }

      // 非 auto-hide 时持续更新原始尺寸（用户可拖拽调整 panel 大小）
      if (!isAutoHide) {
        const rect = panelEl.getBoundingClientRect()
        if (rect.width > 50) originalSizeRef.current.width = rect.width
        if (rect.height > 50) originalSizeRef.current.height = rect.height
      }
      // 展开时使用原始尺寸（通过 CSS 变量传递）
      panelEl.style.setProperty('--cat-autohide-w', `${originalSizeRef.current.width}px`)
      panelEl.style.setProperty('--cat-autohide-h', `${originalSizeRef.current.height}px`)

      // auto-hide 模式下绑定 mouseenter/mouseleave 实现延迟收起
      if (isAutoHide && !panelEl.dataset.catAutoHideBound) {
        panelEl.dataset.catAutoHideBound = '1'
        panelEl.addEventListener('mouseenter', () => {
          // 鼠标进入 panel，取消待执行的收起，立即展开
          if (autoHideTimeoutRef.current) {
            clearTimeout(autoHideTimeoutRef.current)
            autoHideTimeoutRef.current = null
          }
          panelEl.classList.add('cat-autohide-expanded')
        })
        panelEl.addEventListener('mouseleave', () => {
          // 鼠标离开 panel，延迟 500ms 后收起
          if (autoHideTimeoutRef.current) {
            clearTimeout(autoHideTimeoutRef.current)
          }
          autoHideTimeoutRef.current = setTimeout(() => {
            panelEl.classList.remove('cat-autohide-expanded')
            autoHideTimeoutRef.current = null
          }, 500)
        })
      }
    }
    applyAutoHideRef.current = apply
    apply()
    const interval = setInterval(apply, 500)
    return () => {
      clearInterval(interval)
      if (autoHideTimeoutRef.current) {
        clearTimeout(autoHideTimeoutRef.current)
        autoHideTimeoutRef.current = null
      }
    }
  }, [autoHideTabs])

  const handleLayoutChange = useCallback(
    (newLayout: LayoutBase, currentTabId?: string) => {
      const visible = collectVisibleTabs(newLayout)
      setVisibleTabs(visible)
      if (currentTabId) {
        setLastActiveTabId(currentTabId)
        // 反向联动：布局变化导致 tab 激活时（如拖拽切换），读取编辑器当前状态按需更新卡片
        dispatchReverseLinkage(currentTabId)
      }
      // 拖拽/布局变化后重新应用竖排和 auto-hide 样式（rc-dock 会重新渲染 DOM 导致类丢失）
      setTimeout(() => {
        applyVerticalRef.current?.()
        applyAutoHideRef.current?.()
      }, 50)
    },
    [setVisibleTabs],
  )

  const loadTab = useCallback((tabBase: TabBase): TabData => {
    const id = tabBase.id as string
    const def = getPanelDef(id)
    // 词典/记忆布局不隐藏关闭按钮：完全按传入 closable 值渲染
    const closable = tabBase.closable !== false
    if (!def) {
      return {
        ...tabBase,
        title: tabBase.id ?? 'Unknown',
        closable,
        cached: true,
        content: <div />,
      } as TabData
    }
    return {
      ...tabBase,
      title: def.title,
      closable,
      cached: true,
      content: () => def.render(),
    } as TabData
  }, [])

  // 翻译模式：允许 tab 全部拖拽；词典/记忆模式：tab 可以自由拖拽、拆分、浮动、最大化
  const groups = useMemo(() => undefined, [])

  const defaultLayout = enrichLayout(structuredClone(DEFAULT_DOCK_LAYOUT)) as LayoutData

  return (
    <div
      ref={containerRef}
      data-theme={theme}
      className={[
        headersHidden ? 'cat-headers-hidden' : undefined,
        borderHidden ? 'cat-border-hidden' : undefined,
        zenMode ? 'cat-zen-mode' : undefined,
        immutableLayout ? 'cat-layout-immutable' : undefined,
      ].filter(Boolean).join(' ') || undefined}
      style={{ width: '100%', height: '100%' }}
    >
      <DockLayout
        ref={dockRef}
        defaultLayout={defaultLayout}
        onLayoutChange={handleLayoutChange}
        loadTab={loadTab}
        groups={groups}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
