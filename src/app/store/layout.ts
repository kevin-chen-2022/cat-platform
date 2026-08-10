import { create } from 'zustand'
import type { SavedLayout, ID, WorkbenchMode } from '@/types'
import { db } from '@data/db'
import type { DockLayout as DockLayoutRef } from 'rc-dock'

type DockRef = DockLayoutRef | null

let _dockRef: DockRef = null

export function setDockRef(ref: DockRef): void {
  _dockRef = ref
}

export function getDockRef(): DockRef {
  return _dockRef
}

/** 这 3 个 tab id 属于"单 tab 锁定布局"，不可拖动、不可关闭 */
export const LOCKED_TAB_IDS = new Set(['projectDictionary', 'projectMemory'])
/** 非翻译模式下，整个面板都禁止拖拽重排 */
export const TAB_IDS_IMMUTABLE_LAYOUT = LOCKED_TAB_IDS

interface LayoutState {
  visibleTabs: string[]
  userLayouts: SavedLayout[]
  initialized: boolean
  headersHidden: boolean
  tabBarVertical: boolean
  // 极简模式（禅模式）：隐藏所有 panel border、tab 栏、divider、panel-header/footer，只保留内容
  zenMode: boolean
  // 启用自动贴边隐藏的 tab id 列表（未钉住状态）
  autoHideTabs: string[]
  workbenchMode: WorkbenchMode

  setVisibleTabs: (ids: string[]) => void
  isTabVisible: (id: string) => boolean
  toggleTabVisible: (id: string) => void
  toggleHeadersHidden: () => void
  setHeadersHidden: (hidden: boolean) => void
  toggleTabBarVertical: () => void
  toggleZenMode: () => void
  setZenMode: (on: boolean) => void
  toggleAutoHide: (tabId: string) => void
  isAutoHide: (tabId: string) => boolean

  loadUserLayouts: () => Promise<void>
  saveLayoutAs: (name: string) => Promise<void>
  applyLayout: (layout: SavedLayout | 'default') => Promise<void>
  deleteLayout: (id: ID) => Promise<void>

  applyTranslateLayout: () => Promise<void>
  applyDictionaryLayout: () => Promise<void>
  applyMemoryLayout: () => Promise<void>

  saveLastLayout: () => Promise<void>
  loadLastLayout: () => Promise<boolean>
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  visibleTabs: [],
  userLayouts: [],
  initialized: false,
  headersHidden: false,
  tabBarVertical: false,
  zenMode: false,
  autoHideTabs: [],
  workbenchMode: 'translate',

  setVisibleTabs: (ids) => set({ visibleTabs: ids }),
  isTabVisible: (id) => get().visibleTabs.includes(id),
  toggleTabVisible: (id) => {
    const current = get().visibleTabs
    const next = current.includes(id) ? current.filter((t) => t !== id) : [...current, id]
    set({ visibleTabs: next })
  },
  toggleHeadersHidden: () => set((s) => ({ headersHidden: !s.headersHidden })),
  setHeadersHidden: (hidden) => set({ headersHidden: hidden }),
  toggleTabBarVertical: () => set((s) => ({ tabBarVertical: !s.tabBarVertical })),
  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
  setZenMode: (on) => set({ zenMode: on }),
  toggleAutoHide: (tabId) => {
    const current = get().autoHideTabs
    const next = current.includes(tabId) ? current.filter((t) => t !== tabId) : [...current, tabId]
    set({ autoHideTabs: next })
  },
  isAutoHide: (tabId) => get().autoHideTabs.includes(tabId),

  loadUserLayouts: async () => {
    const rows = await db.layouts.where('type').equals('user').reverse().sortBy('savedAt')
    set({ userLayouts: rows })
  },

  saveLayoutAs: async (name) => {
    const ref = getDockRef()
    if (!ref) return
    const dockLayout = ref.saveLayout()
    const { useProjectStore } = await import('./project')
    const projectId = useProjectStore.getState().currentProjectId
    const fileId = useProjectStore.getState().activeFileId
    const now = Date.now()
    await db.layouts.add({
      name,
      type: 'user',
      dockLayout,
      activeProjectId: projectId ?? undefined,
      activeFileId: fileId ?? undefined,
      savedAt: now,
    })
    await get().loadUserLayouts()
  },

  applyLayout: async (layout) => {
    const ref = getDockRef()
    if (!ref) return
    if (layout === 'default') {
      const { DEFAULT_DOCK_LAYOUT } = await import('@/app/layout/defaultLayout')
      ref.loadLayout({ dockbox: DEFAULT_DOCK_LAYOUT.dockbox })
    } else {
      ref.loadLayout(layout.dockLayout as any)
      if (layout.activeProjectId != null) {
        const { useProjectStore } = await import('./project')
        await useProjectStore.getState().selectProject(layout.activeProjectId)
        if (layout.activeFileId != null) {
          await useProjectStore.getState().selectFile(layout.activeFileId)
        }
      }
    }
    await new Promise((r) => setTimeout(r, 50))
    const visible = collectVisibleTabs(ref.getLayout())
    set({ visibleTabs: visible })
  },

  deleteLayout: async (id) => {
    await db.layouts.delete(id as number)
    await get().loadUserLayouts()
  },

  applyTranslateLayout: async () => {
    const ref = getDockRef()
    if (!ref) return
    set({ workbenchMode: 'translate' })
    // 优先使用"上次会话"保存的翻译布局；没有则回退到默认
    const last = await db.layouts.where('type').equals('last').last()
    if (last && last.dockLayout) {
      ref.loadLayout(last.dockLayout as any)
      if (last.activeProjectId != null) {
        const { useProjectStore } = await import('./project')
        await useProjectStore.getState().selectProject(last.activeProjectId)
        if (last.activeFileId != null) {
          await useProjectStore.getState().selectFile(last.activeFileId)
        }
      }
    } else {
      const { DEFAULT_DOCK_LAYOUT } = await import('@/app/layout/defaultLayout')
      ref.loadLayout({ dockbox: DEFAULT_DOCK_LAYOUT.dockbox } as any)
    }
    await new Promise((r) => setTimeout(r, 50))
    const visible = collectVisibleTabs(ref.getLayout())
    set({ visibleTabs: visible })
  },

  applyDictionaryLayout: async () => {
    const ref = getDockRef()
    if (!ref) return
    const { DICTIONARY_VISIBLE_TABS, IMMUTABLE_LEFT_PANEL_WIDTH } =
      await import('@/app/layout/defaultLayout')
    // Step 1: 切换前读取"项目文件"tab实际宽度 + 顶层 hbox 总宽度（DOM 真实像素）
    const metrics = readLeftPanelMetrics(ref)
    const leftWidth = metrics?.leftWidth ?? IMMUTABLE_LEFT_PANEL_WIDTH
    const totalWidth = metrics?.totalWidth ?? (leftWidth + 1000000)
    const rightWidth = Math.max(100, totalWidth - leftWidth - 4)

    set({ workbenchMode: 'dictionary' })

    // Step 2: 构建两列布局 —— 左右 size 都是真实像素（已平衡），最大化还原可直接恢复
    const layout = buildTwoColLayout(
      leftWidth,
      rightWidth,
      'project',
      '项目文件',
      'projectDictionary',
      '项目词典库',
    )
    ref.loadLayout(layout as any)

    // Step 3: DOM 同步（初始渲染兜底 + rAF 双保险）
    applyLeftWidthToDom(ref, leftWidth)
    await new Promise((r) => setTimeout(r, 50))
    requestAnimationFrame(() => applyLeftWidthToDom(getDockRef(), leftWidth))

    set({ visibleTabs: [...DICTIONARY_VISIBLE_TABS] })
  },

  applyMemoryLayout: async () => {
    const ref = getDockRef()
    if (!ref) return
    const { MEMORY_VISIBLE_TABS, IMMUTABLE_LEFT_PANEL_WIDTH } =
      await import('@/app/layout/defaultLayout')
    // Step 1: 切换前读取"项目文件"tab实际宽度 + 顶层 hbox 总宽度（DOM 真实像素）
    const metrics = readLeftPanelMetrics(ref)
    const leftWidth = metrics?.leftWidth ?? IMMUTABLE_LEFT_PANEL_WIDTH
    const totalWidth = metrics?.totalWidth ?? (leftWidth + 1000000)
    const rightWidth = Math.max(100, totalWidth - leftWidth - 4)

    set({ workbenchMode: 'memory' })

    // Step 2: 构建两列布局 —— 左右 size 都是真实像素（已平衡），最大化还原可直接恢复
    const layout = buildTwoColLayout(
      leftWidth,
      rightWidth,
      'project',
      '项目文件',
      'projectMemory',
      '项目记忆库',
    )
    ref.loadLayout(layout as any)

    // Step 3: DOM 同步（初始渲染兜底 + rAF 双保险）
    applyLeftWidthToDom(ref, leftWidth)
    await new Promise((r) => setTimeout(r, 50))
    requestAnimationFrame(() => applyLeftWidthToDom(getDockRef(), leftWidth))

    set({ visibleTabs: [...MEMORY_VISIBLE_TABS] })
  },

  saveLastLayout: async () => {
    // 词典/记忆模式是"临时单一 tab 布局"，不覆盖"上次会话"（翻译布局）
    if (get().workbenchMode !== 'translate') return
    const ref = getDockRef()
    if (!ref) return
    const dockLayout = ref.saveLayout()
    const { useProjectStore } = await import('./project')
    const projectId = useProjectStore.getState().currentProjectId
    const fileId = useProjectStore.getState().activeFileId
    const now = Date.now()
    await db.layouts.where('type').equals('last').delete()
    await db.layouts.add({
      name: '上次会话',
      type: 'last',
      dockLayout,
      activeProjectId: projectId ?? undefined,
      activeFileId: fileId ?? undefined,
      savedAt: now,
    })
  },

  loadLastLayout: async () => {
    const last = await db.layouts.where('type').equals('last').last()
    if (!last) return false
    await get().applyLayout(last)
    set({ initialized: true, workbenchMode: 'translate' })
    return true
  },
}))

export function collectVisibleTabs(layout: unknown): string[] {
  const ids: string[] = []
  const walk = (node: any) => {
    if (!node) return
    if (Array.isArray(node.tabs)) {
      for (const t of node.tabs) {
        if (t?.id) ids.push(t.id)
      }
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c)
    }
  }
  const l = layout as any
  if (l && typeof l === 'object') {
    // LayoutBase 结构：包含 dockbox / floatbox / maxbox / windowbox
    if (l.dockbox || l.floatbox || l.maxbox || l.windowbox) {
      walk(l.dockbox)
      walk(l.floatbox)
      walk(l.maxbox)
      walk(l.windowbox)
    } else {
      // 直接传入 box 或 panel 的情况
      walk(l)
    }
  }
  return ids
}

/**
 * 读取当前翻译布局中，顶层 dock-hbox 下：
 *   - 左侧项目文件面板的真实像素宽度
 *   - 整个 hbox 容器的真实像素宽度
 * 两个值都以 DOM 的 getBoundingClientRect 为准（避开 rc-dock 内部的 size/flex 换算）。
 * 如果 DOM 查不到（例如 ref 为空 / 初始未挂载），返回 null，调用方会 fallback 到默认值。
 */
export function readLeftPanelMetrics(
  ref: DockLayoutRef,
): { leftWidth: number; totalWidth: number } | null {
  const findHbox = (): HTMLElement | null => {
    try {
      const root: HTMLElement | null | undefined =
        (ref as any).getRootElement?.() ?? (ref as any)._ref
      if (root) {
        const a = root.querySelector<HTMLElement>(':scope > .dock-layout > .dock-hbox')
        if (a) return a
        const b = root.querySelector<HTMLElement>('.dock-hbox')
        if (b) return b
      }
    } catch {
      /* ignore */
    }
    return null
  }
  const hbox = findHbox()
  if (hbox) {
    const totalW = hbox.getBoundingClientRect().width
    const firstPanel = Array.from(hbox.children).find(
      (el) => el instanceof HTMLElement && el.classList.contains('dock-panel'),
    ) as HTMLElement | undefined
    if (firstPanel) {
      const lw = firstPanel.getBoundingClientRect().width
      if (typeof lw === 'number' && lw > 0 && typeof totalW === 'number' && totalW > 0) {
        return { leftWidth: Math.round(lw), totalWidth: Math.round(totalW) }
      }
    }
    const firstChild = Array.from(hbox.children).find(
      (el) => el instanceof HTMLElement && !el.classList.contains('dock-divider'),
    ) as HTMLElement | undefined
    if (firstChild) {
      const lw = firstChild.getBoundingClientRect().width
      if (typeof lw === 'number' && lw > 0 && typeof totalW === 'number' && totalW > 0) {
        return { leftWidth: Math.round(lw), totalWidth: Math.round(totalW) }
      }
    }
  }
  // fallback: 从 LayoutData 读 size 仅作左宽兜底
  try {
    const layout = ref.getLayout() as any
    const dockbox: any = layout?.dockbox
    if (!dockbox?.children || !Array.isArray(dockbox.children)) return null
    const leftBox = dockbox.children[0]
    if (!leftBox) return null
    const sz =
      (typeof leftBox.size === 'number' && leftBox.size > 0
        ? leftBox.size
        : Array.isArray(leftBox.children) &&
            typeof leftBox.children?.[0]?.size === 'number' &&
            leftBox.children[0].size > 0
          ? (leftBox.children[0].size as number)
          : NaN)
    if (!Number.isNaN(sz)) {
      return { leftWidth: Math.round(sz), totalWidth: Math.round(sz + 1000000) }
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * 读取左侧面板的真实像素宽度（给不需要总宽度的场景留一个简化的包装）。
 */
export function readLeftPanelWidth(ref: DockLayoutRef): number | null {
  return readLeftPanelMetrics(ref)?.leftWidth ?? null
}

/**
 * 构建两列布局（词典/记忆布局共用）：
 *  - 左右 children[i].size 均为进入时读取到的真实像素值（已平衡），最大化还原时
 *    rc-dock 只从 LayoutData 恢复，也能按比例精确还原宽度
 *  - 左侧 panel 通过 panelLock.widthFlex=0 锁定 widthFlex=0（fixLayoutData 不会擦除 panelLock 的值）：
 *      flex-grow = 0 × size = 0 → flex: 0 1 ${size}px → 不增长，保持原宽度
 *  - 右侧 panel 不设 panelLock.widthFlex：widthFlex=null → flex-grow=1×size → 主动占满剩余区域
 *  - 两个 panel 的 minWidth 给合理下限，允许 divider 拖拽缩窄
 */
function buildTwoColLayout(
  leftSize: number,
  rightSize: number,
  leftTabId: string,
  leftTabTitle: string,
  rightTabId: string,
  rightTabTitle: string,
): { dockbox: any } {
  const MIN_LEFT = 200
  const MIN_RIGHT = 100
  return {
    dockbox: {
      mode: 'horizontal',
      children: [
        {
          mode: 'vertical',
          size: leftSize,
          minWidth: MIN_LEFT,
          children: [
            {
              tabs: [{ id: leftTabId, title: leftTabTitle, closable: true, cached: true }],
              size: leftSize,
              minWidth: MIN_LEFT,
              panelLock: { minWidth: MIN_LEFT, minHeight: 100, widthFlex: 0 },
            },
          ],
        },
        {
          size: rightSize,
          minWidth: MIN_RIGHT,
          tabs: [{ id: rightTabId, title: rightTabTitle, closable: true, cached: true }],
          // 与左侧对称：保留空壳以便关闭后能复用 panel 重新显示
          // 不设 widthFlex，保持默认 grow=1 占满剩余空间的占满行为
          panelLock: { minWidth: MIN_RIGHT, minHeight: 100 },
        },
      ],
    },
  }
}

/**
 * 在渲染后的 DOM 上对 dock-hbox 的左右列写初始宽度（保证视觉上"保持原宽度"严格成立）。
 * 不写 maxWidth，允许后续通过 divider 拖拽继续调整。
 */
function applyLeftWidthToDom(ref: DockLayoutRef | null, leftWidthPx: number): void {
  if (!ref || !(leftWidthPx > 0)) return
  try {
    const root: HTMLElement | null | undefined = (ref as any).getRootElement?.() ?? (ref as any)._ref
    if (!root) return
    const hbox = root.querySelector<HTMLElement>(':scope > .dock-layout > .dock-hbox')
      ?? root.querySelector<HTMLElement>('.dock-hbox')
    if (!hbox) return
    const nonDivider = Array.from(hbox.children).filter(
      (el) => el instanceof HTMLElement && !el.classList.contains('dock-divider'),
    ) as HTMLElement[]
    const leftEl = nonDivider[0]
    const rightEl = nonDivider[1]
    if (leftEl) {
      leftEl.style.flex = `0 0 ${leftWidthPx}px`
      leftEl.style.width = `${leftWidthPx}px`
      leftEl.style.minWidth = `200px`
    }
    if (rightEl) {
      rightEl.style.flex = '1 1 auto'
      rightEl.style.minWidth = '0'
    }
  } catch {
    /* ignore */
  }
}
