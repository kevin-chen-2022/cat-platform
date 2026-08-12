import { create } from 'zustand'

/** WebDAV 服务商预设 */
export type WebdavPreset = 'jianguoyun' | 'nextcloud' | 'owncloud' | 'custom'

export interface WebdavPresetMeta {
  key: WebdavPreset
  label: string
  /** 默认 URL 前缀，用户选择预设时自动填入输入框 */
  urlPlaceholder: string
  /** 帮助说明，显示在预设名称下方 */
  hint?: string
}

export const WEBDAV_PRESETS: Record<WebdavPreset, WebdavPresetMeta> = {
  jianguoyun: {
    key: 'jianguoyun',
    label: '坚果云',
    urlPlaceholder: 'https://dav.jianguoyun.com/dav/',
    hint: '需使用"应用密码"（非账号密码），可在坚果云设置 → 安全选项 → 第三方应用管理中生成',
  },
  nextcloud: {
    key: 'nextcloud',
    label: 'Nextcloud',
    urlPlaceholder: 'https://your-nextcloud.example.com/remote.php/dav/files/your-username/',
  },
  owncloud: {
    key: 'owncloud',
    label: 'ownCloud',
    urlPlaceholder: 'https://your-owncloud.example.com/remote.php/dav/files/your-username/',
  },
  custom: {
    key: 'custom',
    label: '自定义',
    urlPlaceholder: 'https://your-webdav.example.com/',
  },
}

/** WebDAV 配置（持久化） */
export interface WebdavConfig {
  preset: WebdavPreset
  /** WebDAV 根 URL */
  url: string
  /** 用户名 */
  username: string
  /** 密码（或应用密码），前端做简单 Base64 混淆后存储 */
  password: string
}

const STORAGE_KEY = 'cat.syncSettings'

const DEFAULT_PASSWORD_OBFUSCATE_PREFIX = 'v1:'

function defaultConfig(): WebdavConfig {
  return {
    preset: 'jianguoyun',
    url: WEBDAV_PRESETS.jianguoyun.urlPlaceholder,
    username: '',
    password: '',
  }
}

/** 简单的前端存储混淆（非加密，仅避免 DevTools 中明文立即可读） */
function obfuscatePassword(plain: string): string {
  if (!plain) return ''
  try {
    const utf8 = unescape(encodeURIComponent(plain))
    let b64 = ''
    for (let i = 0; i < utf8.length; i++) b64 += String.fromCharCode(utf8.charCodeAt(i))
    return DEFAULT_PASSWORD_OBFUSCATE_PREFIX + btoa(b64)
  } catch {
    return DEFAULT_PASSWORD_OBFUSCATE_PREFIX + btoa(unescape(encodeURIComponent(plain)))
  }
}

function deobfuscatePassword(obf: string): string {
  if (!obf) return ''
  if (!obf.startsWith(DEFAULT_PASSWORD_OBFUSCATE_PREFIX)) return obf // 兼容旧版本
  try {
    const b64 = obf.slice(DEFAULT_PASSWORD_OBFUSCATE_PREFIX.length)
    const raw = atob(b64)
    let out = ''
    for (let i = 0; i < raw.length; i++) out += '%' + raw.charCodeAt(i).toString(16).padStart(2, '0')
    return decodeURIComponent(out)
  } catch {
    return ''
  }
}

interface PersistShape {
  webdav: WebdavConfig
}

function defaultPersist(): PersistShape {
  return { webdav: defaultConfig() }
}

function loadPersist(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPersist()
    const parsed = JSON.parse(raw) as Partial<PersistShape>
    const wd: WebdavConfig = { ...defaultConfig(), ...(parsed.webdav ?? {}) }
    // 密码解混淆
    wd.password = deobfuscatePassword(wd.password)
    return { webdav: wd }
  } catch {
    return defaultPersist()
  }
}

function savePersist(s: PersistShape) {
  try {
    const serialized: PersistShape = {
      webdav: {
        ...s.webdav,
        password: obfuscatePassword(s.webdav.password),
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
  } catch {
    /* ignore */
  }
}

/** 连接状态 */
export type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failed' | 'cors_blocked'

export interface SyncState {
  webdav: WebdavConfig
  /** 最近一次测试连接的状态 */
  connectionStatus: ConnectionStatus
  /** 最近一次测试连接的消息（成功/失败原因） */
  connectionMessage: string
  /** 最近一次测试连接成功的时间戳 */
  lastConnectedAt: number | null

  setPreset: (preset: WebdavPreset) => void
  setWebdav: (patch: Partial<WebdavConfig>) => void
  setConnectionStatus: (status: ConnectionStatus, message?: string) => void
  clearWebdavPassword: () => void
}

const initial = loadPersist()

export const useSyncStore = create<SyncState>((set, get) => ({
  webdav: initial.webdav,
  connectionStatus: 'idle',
  connectionMessage: '',
  lastConnectedAt: null,

  setPreset: (preset) => {
    const existing = get().webdav
    const presetMeta = WEBDAV_PRESETS[preset]
    // 切换预设时，如果用户还没改 URL（等于原预设的 placeholder），自动替换为新预设 placeholder
    const oldPlaceholder = WEBDAV_PRESETS[existing.preset]?.urlPlaceholder ?? ''
    const shouldReplaceUrl = !existing.url || existing.url === oldPlaceholder
    const next: WebdavConfig = {
      ...existing,
      preset,
      url: shouldReplaceUrl ? presetMeta.urlPlaceholder : existing.url,
    }
    set({ webdav: next, connectionStatus: 'idle', connectionMessage: '' })
    savePersist({ webdav: next })
  },

  setWebdav: (patch) => {
    const next: WebdavConfig = { ...get().webdav, ...patch }
    set({ webdav: next, connectionStatus: 'idle', connectionMessage: '' })
    savePersist({ webdav: next })
  },

  setConnectionStatus: (status, message) => {
    const update: Partial<SyncState> = {
      connectionStatus: status,
      connectionMessage: message ?? '',
    }
    if (status === 'success') update.lastConnectedAt = Date.now()
    set(update as SyncState)
  },

  clearWebdavPassword: () => {
    const next = { ...get().webdav, password: '' }
    set({ webdav: next, connectionStatus: 'idle', connectionMessage: '' })
    savePersist({ webdav: next })
  },
}))
