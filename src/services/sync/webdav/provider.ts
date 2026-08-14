import type { WebdavConfig } from '@/app/store'
import { useSyncStore } from '@/app/store'

/** 测试连接结果 */
export interface WebDavConnectResult {
  ok: boolean
  /** 分类错误码，用于 UI 提示 */
  code: 'success' | 'cors' | 'auth' | 'not_found' | 'network' | 'invalid_url' | 'unknown'
  message: string
  /** 服务器返回的 HTTP 状态码（如果拿到） */
  httpStatus?: number
  /** 根目录信息，验证成功时附带 */
  rootHref?: string
}

function basicAuthHeader(username: string, password: string): string {
  const combined = `${username}:${password}`
  // UTF-8 安全 base64
  const utf8 = unescape(encodeURIComponent(combined))
  let bin = ''
  for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8.charCodeAt(i))
  return `Basic ${btoa(bin)}`
}

function ensureTrailingSlash(url: string): string {
  if (!url) return url
  return url.endsWith('/') ? url : `${url}/`
}

/**
 * 向 WebDAV 服务器发送 PROPFIND 请求，验证鉴权、CORS 与服务可达性。
 * 仅发送 Depth: 0，只查询根目录自身属性，避免下载大目录列表。
 */
export async function testWebDavConnection(config: WebdavConfig): Promise<WebDavConnectResult> {
  const { url, username, password } = config

  if (!url) {
    return { ok: false, code: 'invalid_url', message: '请先填写 WebDAV URL' }
  }
  if (!username) {
    return { ok: false, code: 'invalid_url', message: '请先填写用户名' }
  }
  if (!password) {
    return { ok: false, code: 'invalid_url', message: '请先填写密码或应用密码' }
  }

  let normalized = url
  try {
    // 验证是合法 URL
    new URL(normalized)
    normalized = ensureTrailingSlash(normalized)
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL 格式不正确，请检查是否包含协议（https:// 或 http://）' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(normalized, {
      method: 'PROPFIND',
      headers: {
        Depth: '0',
        Authorization: basicAuthHeader(username, password),
        // 部分坚果云/Nextcloud 需要
        Accept: '*/*',
      },
      credentials: 'omit', // 不自动携带 cookie，统一用 Authorization 头
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok && (response.status >= 200 && response.status < 300)) {
      // 成功（一般返回 207 Multi-Status，部分服务器返回 200）
      // 尝试读取 href 用于校验真实返回内容
      let href: string | undefined
      try {
        const text = await response.text()
        const m = text.match(/<d:href[^>]*>([^<]+)<\/d:href>/i)
        if (m?.[1]) href = decodeURIComponent(m[1])
      } catch {
        /* ignore parse */
      }
      return {
        ok: true,
        code: 'success',
        message: `连接成功！服务器返回 HTTP ${response.status}`,
        httpStatus: response.status,
        rootHref: href,
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: 'auth',
        message: `鉴权失败（HTTP ${response.status}）：请检查用户名和密码，坚果云需使用「应用密码」而非账号密码。`,
        httpStatus: response.status,
      }
    }

    if (response.status === 404) {
      return {
        ok: false,
        code: 'not_found',
        message: '未找到 WebDAV 目录（HTTP 404）：请检查 URL 路径是否正确。',
        httpStatus: response.status,
      }
    }

    return {
      ok: false,
      code: 'unknown',
      message: `服务器返回 HTTP ${response.status}：${response.statusText || '未知错误'}`,
      httpStatus: response.status,
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const msg = err instanceof Error ? err.message : String(err ?? '')

    // Abort = 超时
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, code: 'network', message: '连接超时（15s）：请检查 URL 或网络。' }
    }

    // TypeError = fetch 无法建立连接 → 最大概率是 CORS 预检被拒绝
    if (err instanceof TypeError) {
      return {
        ok: false,
        code: 'cors',
        message:
          '无法直连 WebDAV 服务器：最常见原因是浏览器 CORS 策略阻止了请求。请确认目标服务商支持跨域，或需要自建反代；桌面打包环境可绕开此限制。',
      }
    }

    return {
      ok: false,
      code: 'network',
      message: `网络错误：${msg || '未知原因'}`,
    }
  }
}

/**
 * 与 useSyncStore 联动：执行测试连接并写回状态。
 */
export async function runConnectionTest(): Promise<WebDavConnectResult> {
  const config = useSyncStore.getState().webdav
  useSyncStore.getState().setConnectionStatus('testing', '正在验证 WebDAV 连接...')

  const result = await testWebDavConnection(config)

  if (result.ok) {
    useSyncStore.getState().setConnectionStatus('success', result.message)
  } else if (result.code === 'cors') {
    useSyncStore.getState().setConnectionStatus('cors_blocked', result.message)
  } else {
    useSyncStore.getState().setConnectionStatus('failed', result.message)
  }

  return result
}

/* =========================
 * P2: WebDAV 文件操作（PUT/GET/MKCOL/DELETE/PROPFIND 列表）
 * ========================= */

/** 单次 WebDAV 操作结果（统一错误分类，便于 UI 提示） */
export interface WebDavOpResult<T = unknown> {
  ok: boolean
  code: 'success' | 'cors' | 'auth' | 'not_found' | 'network' | 'invalid_url' | 'conflict' | 'unknown'
  message: string
  httpStatus?: number
  data?: T
}

/** WebDAV 目录条目 */
export interface WebDavEntry {
  href: string
  displayName: string
  isCollection: boolean
  contentLength?: number
  lastModified?: string
  contentType?: string
}

function buildAuthHeaders(config: WebdavConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: basicAuthHeader(config.username, config.password),
    Accept: '*/*',
    ...(extra ?? {}),
  }
}

/** 规范化路径：保证根 URL 末尾带 /，子路径拼接时不重复 / */
function joinUrl(base: string, sub: string): string {
  const b = ensureTrailingSlash(base)
  if (!sub) return b
  const s = sub.replace(/^\/+/, '')
  return `${b}${s}`
}

/** 统一错误转换：将 fetch 异常归类到 WebDavOpResult.code */
function classifyFetchError(err: unknown): Pick<WebDavOpResult, 'code' | 'message'> {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { code: 'network', message: '请求超时' }
  }
  if (err instanceof TypeError) {
    return {
      code: 'cors',
      message: '无法连接 WebDAV 服务器：可能是 CORS 跨域限制或网络不可达（桌面打包环境可绕开此限制）',
    }
  }
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return { code: 'network', message: `网络错误：${msg || '未知原因'}` }
}

/** MKCOL：创建目录（已存在视为成功，避免重复创建） */
export async function webdavMkcol(
  config: WebdavConfig,
  path: string,
  timeoutMs = 30000,
): Promise<WebDavOpResult<void>> {
  const target = joinUrl(config.url, path)
  try {
    new URL(target)
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL 格式不正确' }
  }
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'MKCOL',
      headers: buildAuthHeaders(config),
      credentials: 'omit',
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.status === 201) return { ok: true, code: 'success', message: '目录已创建', httpStatus: res.status }
    // 405 Method Not Allowed 通常表示目录已存在（坚果云/Nextcloud 行为）
    if (res.status === 405) return { ok: true, code: 'success', message: '目录已存在', httpStatus: res.status }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: 'auth', message: `鉴权失败（HTTP ${res.status}）`, httpStatus: res.status }
    }
    return { ok: false, code: 'unknown', message: `创建目录失败（HTTP ${res.status}）`, httpStatus: res.status }
  } catch (err) {
    clearTimeout(t)
    const e = classifyFetchError(err)
    return { ok: false, ...e }
  }
}

/** PUT：上传文本/二进制内容到指定路径，覆盖式写入 */
export async function webdavPut(
  config: WebdavConfig,
  path: string,
  body: string | Blob | ArrayBuffer,
  contentType = 'application/octet-stream',
  timeoutMs = 120000,
): Promise<WebDavOpResult<void>> {
  const target = joinUrl(config.url, path)
  try {
    new URL(target)
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL 格式不正确' }
  }
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'PUT',
      headers: buildAuthHeaders(config, { 'Content-Type': contentType }),
      credentials: 'omit',
      body,
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.status === 200 || res.status === 201 || res.status === 204) {
      return { ok: true, code: 'success', message: '上传成功', httpStatus: res.status }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: 'auth', message: `鉴权失败（HTTP ${res.status}）`, httpStatus: res.status }
    }
    if (res.status === 409) {
      return { ok: false, code: 'conflict', message: '父目录不存在（HTTP 409）', httpStatus: res.status }
    }
    return { ok: false, code: 'unknown', message: `上传失败（HTTP ${res.status}）`, httpStatus: res.status }
  } catch (err) {
    clearTimeout(t)
    const e = classifyFetchError(err)
    return { ok: false, ...e }
  }
}

/** GET：下载指定路径的文本内容 */
export async function webdavGetText(
  config: WebdavConfig,
  path: string,
  timeoutMs = 120000,
): Promise<WebDavOpResult<string>> {
  const target = joinUrl(config.url, path)
  try {
    new URL(target)
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL 格式不正确' }
  }
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'GET',
      headers: buildAuthHeaders(config),
      credentials: 'omit',
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.status === 200) {
      const text = await res.text()
      return { ok: true, code: 'success', message: '下载成功', httpStatus: res.status, data: text }
    }
    if (res.status === 404) {
      return { ok: false, code: 'not_found', message: '文件不存在（HTTP 404）', httpStatus: res.status }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: 'auth', message: `鉴权失败（HTTP ${res.status}）`, httpStatus: res.status }
    }
    return { ok: false, code: 'unknown', message: `下载失败（HTTP ${res.status}）`, httpStatus: res.status }
  } catch (err) {
    clearTimeout(t)
    const e = classifyFetchError(err)
    return { ok: false, ...e }
  }
}

/** GET：下载指定路径的二进制内容（用于 gzip 等压缩文件，避免 text() 解码破坏字节） */
export async function webdavGetBytes(
  config: WebdavConfig,
  path: string,
  timeoutMs = 120000,
): Promise<WebDavOpResult<Uint8Array>> {
  const target = joinUrl(config.url, path)
  try {
    new URL(target)
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL 格式不正确' }
  }
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'GET',
      headers: buildAuthHeaders(config),
      credentials: 'omit',
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.status === 200) {
      const buf = await res.arrayBuffer()
      return { ok: true, code: 'success', message: '下载成功', httpStatus: res.status, data: new Uint8Array(buf) }
    }
    if (res.status === 404) {
      return { ok: false, code: 'not_found', message: '文件不存在（HTTP 404）', httpStatus: res.status }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, code: 'auth', message: `鉴权失败（HTTP ${res.status}）`, httpStatus: res.status }
    }
    return { ok: false, code: 'unknown', message: `下载失败（HTTP ${res.status}）`, httpStatus: res.status }
  } catch (err) {
    clearTimeout(t)
    const e = classifyFetchError(err)
    return { ok: false, ...e }
  }
}

/** DELETE：删除指定路径（文件或空目录） */
export async function webdavDelete(
  config: WebdavConfig,
  path: string,
  timeoutMs = 30000,
): Promise<WebDavOpResult<void>> {
  const target = joinUrl(config.url, path)
  try {
    new URL(target)
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL 格式不正确' }
  }
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'DELETE',
      headers: buildAuthHeaders(config),
      credentials: 'omit',
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.status === 200 || res.status === 204) {
      return { ok: true, code: 'success', message: '删除成功', httpStatus: res.status }
    }
    if (res.status === 404) {
      return { ok: false, code: 'not_found', message: '文件不存在（HTTP 404）', httpStatus: res.status }
    }
    return { ok: false, code: 'unknown', message: `删除失败（HTTP ${res.status}）`, httpStatus: res.status }
  } catch (err) {
    clearTimeout(t)
    const e = classifyFetchError(err)
    return { ok: false, ...e }
  }
}

const PROPFIND_LIST_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <D:getcontentlength/>
    <D:getlastmodified/>
    <D:getcontenttype/>
  </D:prop>
</D:propfind>`

/** PROPFIND Depth:1：列出目录下的直接子条目（不包含自身） */
export async function webdavList(
  config: WebdavConfig,
  path: string,
  timeoutMs = 30000,
): Promise<WebDavOpResult<WebDavEntry[]>> {
  const target = joinUrl(config.url, path)
  try {
    new URL(target)
  } catch {
    return { ok: false, code: 'invalid_url', message: 'URL 格式不正确' }
  }
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method: 'PROPFIND',
      headers: buildAuthHeaders(config, { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }),
      credentials: 'omit',
      body: PROPFIND_LIST_BODY,
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.status !== 207 && !(res.status >= 200 && res.status < 300)) {
      if (res.status === 404) {
        return { ok: false, code: 'not_found', message: '目录不存在（HTTP 404）', httpStatus: res.status }
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, code: 'auth', message: `鉴权失败（HTTP ${res.status}）`, httpStatus: res.status }
      }
      return { ok: false, code: 'unknown', message: `列目录失败（HTTP ${res.status}）`, httpStatus: res.status }
    }
    const text = await res.text()
    const entries = parsePropfindResponse(text, target)
    return { ok: true, code: 'success', message: `共 ${entries.length} 项`, httpStatus: res.status, data: entries }
  } catch (err) {
    clearTimeout(t)
    const e = classifyFetchError(err)
    return { ok: false, ...e }
  }
}

/** 解析 PROPFIND 多状态响应，过滤掉自身目录，仅返回子条目 */
function parsePropfindResponse(xml: string, requestedUrl: string): WebDavEntry[] {
  const entries: WebDavEntry[] = []
  // 兼容命名空间前缀（D:, d:, 默认无前缀）
  const responseRegex = /<(?:D:|d:)?response[^>]*>([\s\S]*?)<\/(?:D:|d:)?response>/gi
  let m: RegExpExecArray | null
  while ((m = responseRegex.exec(xml)) !== null) {
    const block = m[1]
    const hrefMatch = block.match(/<(?:D:|d:)?href[^>]*>([^<]+)<\/(?:D:|d:)?href>/i)
    if (!hrefMatch?.[1]) continue
    const href = decodeURIComponent(hrefMatch[1])
    // 排除自身（请求 URL 的 path 部分与 href path 相同，或 href 末尾与请求路径末尾相同）
    try {
      const reqPath = new URL(requestedUrl).pathname.replace(/\/+$/, '')
      const hrefPath = new URL(href, requestedUrl).pathname.replace(/\/+$/, '')
      if (reqPath === hrefPath) continue
    } catch {
      /* ignore */
    }
    const nameMatch = block.match(/<(?:D:|d:)?displayname[^>]*>([^<]*)<\/(?:D:|d:)?displayname>/i)
    const isCollection = /<(?:D:|d:)?collection[^/]*\/>/i.test(block)
    const lenMatch = block.match(/<(?:D:|d:)?getcontentlength[^>]*>([^<]+)<\/(?:D:|d:)?getcontentlength>/i)
    const modMatch = block.match(/<(?:D:|d:)?getlastmodified[^>]*>([^<]+)<\/(?:D:|d:)?getlastmodified>/i)
    const typeMatch = block.match(/<(?:D:|d:)?getcontenttype[^>]*>([^<]+)<\/(?:D:|d:)?getcontenttype>/i)
    // 无 displayname 时从 href 末段推导
    const fallbackName = href.replace(/\/+$/, '').split('/').pop() || ''
    entries.push({
      href,
      displayName: (nameMatch?.[1] ?? fallbackName).trim(),
      isCollection,
      contentLength: lenMatch?.[1] ? Number(lenMatch[1]) : undefined,
      lastModified: modMatch?.[1]?.trim(),
      contentType: typeMatch?.[1]?.trim(),
    })
  }
  return entries
}
