import {
  createTheme as createMuiTheme,
  type Theme,
  type ThemeOptions,
} from '@mui/material/styles'
import type { ThemeMode } from '@/types'

const baseOptions: ThemeOptions = {
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif',
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h6: { fontSize: '1rem', fontWeight: 600 },
    body1: { fontSize: '0.9rem' },
    body2: { fontSize: '0.8rem' },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.hover:hover': { backgroundColor: 'action.hover' },
        },
      },
    },
  },
}

export function createTheme(mode: ThemeMode): Theme {
  const palette: ThemeOptions['palette'] =
    mode === 'dark'
      ? {
          mode: 'dark',
          primary: { main: '#90caf9' },
          secondary: { main: '#f48fb1' },
          background: {
            default: '#0f1720',
            paper: '#162130',
          },
        }
      : {
          mode: 'light',
          primary: { main: '#1976d2' },
          secondary: { main: '#e91e63' },
          background: {
            default: '#f5f7fa',
            paper: '#ffffff',
          },
        }

  return createMuiTheme({
    ...baseOptions,
    palette,
  })
}
