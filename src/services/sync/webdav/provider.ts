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
 * P1 只提供这个方法，后续上传/下载在 P2 中扩展。
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
