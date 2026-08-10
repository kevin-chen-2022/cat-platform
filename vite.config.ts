import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const _dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(_dirname, './src'),
      '@app': path.resolve(_dirname, './src/app'),
      '@features': path.resolve(_dirname, './src/features'),
      '@services': path.resolve(_dirname, './src/services'),
      '@data': path.resolve(_dirname, './src/data'),
      '@shared': path.resolve(_dirname, './src/shared'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
})
