import { useEffect, useState } from 'react'
import type { LayoutMode } from '@/types'
import { useUIStore } from '@app/store'

const MOBILE_WIDTH = 768
const TABLET_WIDTH = 1024

export function useResponsiveLayout(): LayoutMode {
  const setLayoutMode = useUIStore((s) => s.setLayoutMode)
  const initial = (): LayoutMode => {
    const w = typeof window === 'undefined' ? 1280 : window.innerWidth
    return w < MOBILE_WIDTH ? 'mobile' : w < TABLET_WIDTH ? 'tablet' : 'desktop'
  }
  const [mode, setMode] = useState<LayoutMode>(initial)

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      const next: LayoutMode = w < MOBILE_WIDTH ? 'mobile' : w < TABLET_WIDTH ? 'tablet' : 'desktop'
      setMode(next)
      setLayoutMode(next)
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [setLayoutMode])

  return mode
}
