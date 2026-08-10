import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 8765

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0])
    if (urlPath === '/') urlPath = '/index.html'

    // 防止路径穿越
    const filePath = normalize(join(__dirname, urlPath))
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    const stats = await stat(filePath)
    if (stats.isDirectory()) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    const data = await readFile(filePath)
    const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  } catch (err) {
    res.writeHead(404)
    res.end('404 Not Found')
  }
})

server.listen(PORT, () => {
  console.log(`\n  服务器已启动: http://localhost:${PORT}\n  按 Ctrl+C 停止\n`)
})
