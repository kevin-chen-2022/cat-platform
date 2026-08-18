import { create } from 'zustand'
import type { ID } from '@/types'
import {
  ensureClientId,
  makeChannelName,
  type CollabUser,
  type SegmentLock,
  type CollabLogEntry,
} from '@/services/collab/messages'

/** 协同连接状态 */
export type CollabConnectionStatus =
  | 'disconnected'   // 未连接
  | 'connecting'     // 连接中
  | 'connected'      // 已连接
  | 'failed'         // 连接失败(鉴权/网络)

/** 协同配置(持久化到 localStorage) */
export interface CollabConfig {
  /** GoEasy AppKey */
  appkey: string
  /** GoEasy Host,如 https://rest-hangzhou.goeasy.io */
  host: string
  /** 我的译员昵称 */
  nickname: string
  /** 启动工作台时是否自动加入当前项目频道 */
  autoConnect: boolean
  /** 手动指定频道名（为空时自动用 projectId 生成） */
  manualChannel: string
  /** 最近成功加入过的频道名（最多 10 个，按最近使用排序） */
  recentChannels: string[]
  /** 收到团队译文时自动填充到当前视图中的未译和空白译文中 */
  autoFillTeamTM: boolean
}

const STORAGE_KEY = 'cat.collabSettings'
const RECENT_CHANNELS_LIMIT = 10

function defaultConfig(): CollabConfig {
  return {
    appkey: '',
    host: 'https://rest-hangzhou.goeasy.io',
    nickname: '',
    autoConnect: false,
    manualChannel: '',
    recentChannels: [],
    autoFillTeamTM: false,
  }
}

function loadPersist(): CollabConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultConfig()
    const parsed = JSON.parse(raw) as Partial<CollabConfig>
    return { ...defaultConfig(), ...parsed }
  } catch {
    return defaultConfig()
  }
}

function savePersist(cfg: CollabConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch {
    /* ignore */
  }
}

/** 在线用户超时阈值(milli),超过此时间没收到 presence_refresh 判定为离线 */
const USER_STALE_MS = 45_000

/** 聊天消息条目 */
export interface ChatMessageEntry {
  userId: string
  nickname: string
  text: string
  ts: number
}

export interface CollabState {
  // ====== 持久化配置 ======
  config: CollabConfig

  // ====== 运行状态 ======
  /** 连接状态 */
  connectionStatus: CollabConnectionStatus
  /** 连接/失败消息 */
  connectionMessage: string
  /** 连接成功时间戳 */
  connectedAt: number | null
  /** 当前加入的频道名 */
  currentChannel: string | null
  /** 当前项目ID(用于生成频道) */
  currentProjectId: ID | null

  /** 我的用户ID(持久化到localStorage,同一浏览器/设备永远不变,避免DAU浪费) */
  myUserId: string
  /** 在线译员列表 */
  users: CollabUser[]
  /** 段锁定状态 segmentId -> {userId, lockedAt} */
  locks: Record<string, SegmentLock>
  /** 协同消息日志(用于面板显示) */
  logs: CollabLogEntry[]
  /** 聊天消息列表（仅当前会话，不持久化） */
  chatMessages: ChatMessageEntry[]

  // ====== actions ======
  setConfig: (patch: Partial<CollabConfig>) => void
  setConnectionStatus: (status: CollabConnectionStatus, message?: string) => void
  joinChannel: (projectId: ID | null, nickFromProject?: string) => { channel: string; myUserId: string; nickname: string }
  leaveChannel: () => void

  /** 收到 user_join */
  addUser: (user: Omit<CollabUser, 'joinedAt'>) => void
  /** 收到 user_leave / 超时剔除 */
  removeUser: (userId: string) => void
  /** 收到 presence_response / presence_refresh,更新用户编辑段信息并刷新 joinedAt(防止被判定离线) */
  refreshUser: (userId: string, nickname: string, editingSegmentId: ID | null) => void
  /** 剔除超时不在线的用户 */
  sweepStaleUsers: () => CollabUser[]

  setEditingSegment: (segmentId: ID | null) => void

  addLock: (segmentId: ID, userId: string) => void
  removeLock: (segmentId: ID, userId?: string) => void

  appendLog: (entry: Omit<CollabLogEntry, 'id' | 'ts'>) => void

  /** 添加聊天消息 */
  addChatMessage: (msg: ChatMessageEntry) => void
  /** 从最近频道历史中删除指定频道 */
  forgetChannel: (channel: string) => void
}

function appendLogToArr(arr: CollabLogEntry[], entry: Omit<CollabLogEntry, 'id' | 'ts'>, limit = 200): CollabLogEntry[] {
  const now = Date.now()
  const next: CollabLogEntry[] = [
    ...arr,
    {
      id: `log_${now}_${Math.random().toString(36).slice(2, 7)}`,
      ts: now,
      ...entry,
    },
  ]
  // 保持日志长度限制,旧的在前,新的在后
  return next.length > limit ? next.slice(next.length - limit) : next
}

const initial = loadPersist()

export const useCollabStore = create<CollabState>((set, get) => ({
  config: initial,

  connectionStatus: 'disconnected',
  connectionMessage: '',
  connectedAt: null,
  currentChannel: null,
  currentProjectId: null,

  myUserId: '',
  users: [],
  locks: {},
  logs: [],
  chatMessages: [],

  setConfig: (patch) => {
    const next = { ...get().config, ...patch }
    set({ config: next })
    savePersist(next)
  },

  setConnectionStatus: (status, message) => {
    const update: Partial<CollabState> = {
      connectionStatus: status,
      connectionMessage: message ?? '',
    }
    if (status === 'connected') update.connectedAt = Date.now()
    if (status === 'disconnected' || status === 'failed') update.connectedAt = null
    set(update as CollabState)
  },

  joinChannel: (projectId, nickFromProject) => {
    const cfg = get().config
    // 昵称优先级: 手动配置 > 项目名传入 > 默认"译员XX"
    let nickname = cfg.nickname?.trim() || nickFromProject?.trim() || ''
    if (!nickname) {
      const rand = Math.random().toString(36).slice(2, 4).toUpperCase()
      nickname = `译员${rand}`
    }
    const myUserId = ensureClientId()
    // 频道优先级: 手动指定 > projectId 自动生成
    const manual = cfg.manualChannel?.trim()
    const channel = manual || makeChannelName(projectId)

    // 把此次使用的频道名追加到「最近频道」(去重,保留前 10 个,最新在前)
    const withoutDup = cfg.recentChannels.filter((c) => c !== channel)
    const nextRecent = [channel, ...withoutDup].slice(0, RECENT_CHANNELS_LIMIT)
    const nextCfg = { ...cfg, recentChannels: nextRecent }

    set({
      config: nextCfg,
      currentProjectId: projectId ?? null,
      currentChannel: channel,
      myUserId,
      users: [],
      locks: {},
      logs: [],
      chatMessages: [],
    })
    savePersist(nextCfg)
    // 写入一条我自己加入的日志(等服务层广播后其他端才会看到)
    const logs = appendLogToArr([], { type: 'info', text: `已加入协同频道:${channel},身份:${nickname}` })
    set({ logs })
    return { channel, myUserId, nickname }
  },

  leaveChannel: () => {
    const logs = appendLogToArr(get().logs, { type: 'info', text: `已离开协同频道` })
    set({
      connectionStatus: 'disconnected',
      connectionMessage: '',
      connectedAt: null,
      currentChannel: null,
      currentProjectId: null,
      myUserId: '',
      users: [],
      locks: {},
      logs,
      chatMessages: [],
    })
  },

  addUser: (user) => {
    const { users } = get()
    if (users.find((u) => u.userId === user.userId)) return
    const full: CollabUser = { joinedAt: Date.now(), ...user }
    const next = [...users, full]
    const logs = appendLogToArr(get().logs, { type: 'join', text: `${user.nickname} 加入了协同` })
    set({ users: next, logs })
  },

  removeUser: (userId) => {
    const { users } = get()
    const user = users.find((u) => u.userId === userId)
    if (!user) return
    const next = users.filter((u) => u.userId !== userId)
    // 移除该用户的锁定
    const locks = { ...get().locks }
    for (const k of Object.keys(locks)) {
      if (locks[k].userId === userId) delete locks[k]
    }
    const logs = appendLogToArr(get().logs, {
      type: 'leave',
      text: `${user.nickname} 离开了协同`,
    })
    set({ users: next, locks, logs })
  },

  refreshUser: (userId, nickname, editingSegmentId) => {
    const { users } = get()
    const idx = users.findIndex((u) => u.userId === userId)
    const now = Date.now()
    let next
    if (idx < 0) {
      next = [
        ...users,
        { userId, nickname, joinedAt: now, editingSegmentId },
      ]
      const logs = appendLogToArr(get().logs, { type: 'join', text: `${nickname} 加入了协同` })
      set({ users: next, logs })
    } else {
      next = [...users]
      next[idx] = { ...next[idx], nickname, joinedAt: now, editingSegmentId }
      set({ users: next })
    }
  },

  sweepStaleUsers() {
    const { users, myUserId } = get()
    const now = Date.now()
    const stale: CollabUser[] = []
    const alive: CollabUser[] = []
    for (const u of users) {
      if (u.userId === myUserId) {
        alive.push(u)
        continue
      }
      if (now - u.joinedAt > USER_STALE_MS) stale.push(u)
      else alive.push(u)
    }
    if (stale.length > 0) {
      // 清理锁定
      const locks = { ...get().locks }
      const staleIds = new Set(stale.map((s) => s.userId))
      for (const k of Object.keys(locks)) {
        if (staleIds.has(locks[k].userId)) delete locks[k]
      }
      let logs = get().logs
      for (const s of stale) {
        logs = appendLogToArr(logs, { type: 'leave', text: `${s.nickname} 离线(超时未响应)` })
      }
      set({ users: alive, locks, logs })
    }
    return stale
  },

  setEditingSegment: (segmentId) => {
    const { users, myUserId } = get()
    const idx = users.findIndex((u) => u.userId === myUserId)
    if (idx < 0) return
    const next = [...users]
    next[idx] = { ...next[idx], editingSegmentId: segmentId }
    set({ users: next })
  },

  addLock: (segmentId, userId) => {
    const key = String(segmentId)
    set({
      locks: {
        ...get().locks,
        [key]: { segmentId, userId, lockedAt: Date.now() },
      },
    })
  },

  removeLock: (segmentId, userId) => {
    const key = String(segmentId)
    const cur = get().locks[key]
    if (!cur) return
    if (userId && cur.userId !== userId) return
    const locks = { ...get().locks }
    delete locks[key]
    set({ locks })
  },

  appendLog: (entry) => {
    set({ logs: appendLogToArr(get().logs, entry) })
  },

  addChatMessage: (msg) => {
    const next = [...get().chatMessages, msg]
    // 限制聊天消息数量，保留最近 500 条
    const limited = next.length > 500 ? next.slice(next.length - 500) : next
    set({ chatMessages: limited })
  },

  forgetChannel: (channel) => {
    const cfg = get().config
    const next = { ...cfg, recentChannels: cfg.recentChannels.filter((c) => c !== channel) }
    set({ config: next })
    savePersist(next)
  },
}))
