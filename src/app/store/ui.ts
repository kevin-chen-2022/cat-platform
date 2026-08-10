import { create } from 'zustand'
import type { ThemeMode, LayoutMode } from '@/types'

interface UIState {
  theme: ThemeMode
  layoutMode: LayoutMode
  loading: boolean
  notifications: Array<{
    id: number
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
  }>

  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setLayoutMode: (mode: LayoutMode) => void
  setLoading: (loading: boolean) => void
  notify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  dismissNotification: (id: number) => void
}

let _notifyId = 1

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'light',
  layoutMode: 'desktop',
  loading: false,
  notifications: [],

  setTheme: (theme) => {
    set({ theme })
    try {
      localStorage.setItem('cat.theme', theme)
    } catch {
      /* ignore */
    }
  },
  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'light' ? 'dark' : 'light'
    get().setTheme(next)
  },
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setLoading: (loading) => set({ loading }),

  notify: (type, message) => {
    const id = _notifyId++
    set({ notifications: [...get().notifications, { id, type, message }] })
    setTimeout(() => get().dismissNotification(id), 4000)
  },
  dismissNotification: (id) =>
    set({ notifications: get().notifications.filter((n) => n.id !== id) }),
}))

const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('cat.theme') : null
if (storedTheme === 'light' || storedTheme === 'dark') {
  useUIStore.setState({ theme: storedTheme })
}
