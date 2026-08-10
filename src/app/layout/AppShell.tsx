import { Box, CssBaseline, ThemeProvider, Snackbar, Alert } from '@mui/material'
import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { createTheme } from '@app/theme'
import { useUIStore, useProjectStore, useLayoutStore, useUiAppearanceStore, applyAppearanceToRoot } from '@app/store'
import { seedInitialData } from '@data/db'
import { useResponsiveLayout } from '@shared/hooks/useResponsiveLayout'
import { TopToolbar } from './TopToolbar'
import { BottomStatusBar } from './BottomStatusBar'
import { DockLayoutView } from './DockLayout'
import { MobileTabLayout } from './MobileTabLayout'
import { BackupScheduler } from '@/services/io/backup-scheduler'

export function AppShell(): ReactElement {
  const themeMode = useUIStore((s) => s.theme)
  const notifications = useUIStore((s) => s.notifications)
  const dismissNotification = useUIStore((s) => s.dismissNotification)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadLastLayout = useLayoutStore((s) => s.loadLastLayout)
  const saveLastLayout = useLayoutStore((s) => s.saveLastLayout)
  const headersHidden = useLayoutStore((s) => s.headersHidden)
  const layout = useResponsiveLayout()

  const theme = createTheme(themeMode)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    ;(async () => {
      try {
        await seedInitialData()
        await loadProjects()
        await new Promise((r) => setTimeout(r, 200))
        await loadLastLayout()
        // 启动自动快照调度器（fflate 压缩 + 滚动保留 + 后台/关页兜底）
        await BackupScheduler.install()
      } catch (err) {
        console.error('[CAT] init failed:', err)
      }
    })()
  }, [loadProjects, loadLastLayout])

  useEffect(() => {
    const handler = () => {
      saveLastLayout()
    }
    window.addEventListener('beforeunload', handler)
    window.addEventListener('pagehide', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      window.removeEventListener('pagehide', handler)
    }
  }, [saveLastLayout])

  // 外观设置（字体 + 基准字号）：初始化写入 CSS 变量，变更时重新写入根节点
  const fontFamilyId = useUiAppearanceStore((s) => s.fontFamilyId)
  const fontSize = useUiAppearanceStore((s) => s.fontSize)
  useEffect(() => {
    applyAppearanceToRoot()
  }, [fontFamilyId, fontSize])
  // 首屏写入一次（避免 hydration 前闪烁）
  useEffect(() => {
    applyAppearanceToRoot()
  }, [])

  const isDesktop = layout === 'desktop' || layout === 'tablet'

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        <TopToolbar />
        <Box component="main" sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {isDesktop ? <DockLayoutView /> : <MobileTabLayout />}
        </Box>
        {layout !== 'mobile' && !headersHidden && <BottomStatusBar />}
      </Box>

      {notifications.map((n) => (
        <Snackbar
          key={n.id}
          open
          autoHideDuration={4000}
          onClose={() => dismissNotification(n.id)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ bottom: layout === 'mobile' ? 72 : 16 }}
        >
          <Alert
            severity={
              n.type === 'error'
                ? 'error'
                : n.type === 'warning'
                ? 'warning'
                : n.type === 'success'
                ? 'success'
                : 'info'
            }
            variant="filled"
            onClose={() => dismissNotification(n.id)}
          >
            {n.message}
          </Alert>
        </Snackbar>
      ))}
    </ThemeProvider>
  )
}
