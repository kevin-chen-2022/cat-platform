import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFileSync, existsSync } from 'node:fs'

const _dirname = path.dirname(fileURLToPath(import.meta.url))

// 将 desktop-server/ 下的桌面运行时脚本复制到 dist，
// 使构建产物自包含（双击 启动服务器.bat 即可预览）。
function copyDesktopServer(): Plugin {
  const files = ['server.mjs', '启动服务器.bat']
  return {
    name: 'copy-desktop-server',
    closeBundle() {
      const srcDir = path.resolve(_dirname, 'desktop-server')
      const outDir = path.resolve(_dirname, 'dist')
      if (!existsSync(srcDir) || !existsSync(outDir)) return
      for (const f of files) {
        const s = path.join(srcDir, f)
        if (existsSync(s)) copyFileSync(s, path.join(outDir, f))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyDesktopServer()],
  base: './',
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
