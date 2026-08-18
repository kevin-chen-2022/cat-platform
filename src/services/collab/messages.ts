import type { ID, SegmentStatus } from '@/types'

/** 协同消息类型 */
export type CollabMessageType =
  | 'segment_update'
  | 'segment_lock'
  | 'segment_unlock'
  | 'user_join'
  | 'user_leave'
  | 'presence_request'
  | 'presence_response'
  | 'presence_refresh'
  | 'tm_sync'
  | 'chat'

/** 译员信息 */
export interface CollabUser {
  /** 用户 ID,本机生成: collab_user_{random8} */
  userId: string
  /** 显示昵称 */
  nickname: string
  /** 连接时间戳 */
  joinedAt: number
  /** 当前编辑段ID,null表示不在编辑 */
  editingSegmentId: ID | null
}

/** 段锁定信息 */
export interface SegmentLock {
  segmentId: ID
  userId: string
  lockedAt: number
}

/** 消息日志条目(用于面板显示) */
export interface CollabLogEntry {
  id: string
  ts: number
  type: 'info' | 'join' | 'leave' | 'translate' | 'status' | 'lock' | 'unlock' | 'tm' | 'chat'
  text: string
}

/** 协同消息体基础 */
export interface CollabMessageBase {
  type: CollabMessageType
  ts: number
}

/** 段译文/状态更新 */
export interface SegmentUpdateMessage extends CollabMessageBase {
  type: 'segment_update'
  segmentId: ID
  target?: string
  status?: SegmentStatus
  notes?: string
  userId: string
  nickname: string
}

/** 段锁定 */
export interface SegmentLockMessage extends CollabMessageBase {
  type: 'segment_lock'
  segmentId: ID
  userId: string
  nickname: string
}

/** 段解锁 */
export interface SegmentUnlockMessage extends CollabMessageBase {
  type: 'segment_unlock'
  segmentId: ID
  userId: string
}

/** 用户加入 */
export interface UserJoinMessage extends CollabMessageBase {
  type: 'user_join'
  userId: string
  nickname: string
}

/** 用户离开 */
export interface UserLeaveMessage extends CollabMessageBase {
  type: 'user_leave'
  userId: string
}

/** 请求在线列表(新加入者广播) */
export interface PresenceRequestMessage extends CollabMessageBase {
  type: 'presence_request'
  requesterUserId: string
}

/** 回复在线状态(已存在用户回复请求者) */
export interface PresenceResponseMessage extends CollabMessageBase {
  type: 'presence_response'
  userId: string
  nickname: string
  editingSegmentId: ID | null
  /** 只发给请求者,空=广播给所有人 */
  targetUserId?: string
}

/** 存在性心跳(定期广播,防止长期不发言被标记离线) */
export interface PresenceRefreshMessage extends CollabMessageBase {
  type: 'presence_refresh'
  userId: string
  nickname: string
  editingSegmentId: ID | null
}

/** TM 条目同步：译员保存译文时广播 */
export interface TMSyncMessage extends CollabMessageBase {
  type: 'tm_sync'
  userId: string
  nickname: string
  /** 源语言代码，如 'zh' */
  sourceLang: string
  /** 目标语言代码，如 'en' */
  targetLang: string
  /** 源文本（纯文本） */
  source: string
  /** 译文（纯文本） */
  target: string
}

/** 聊天消息 */
export interface ChatMessage extends CollabMessageBase {
  type: 'chat'
  userId: string
  nickname: string
  text: string
}

export type CollabMessage =
  | SegmentUpdateMessage
  | SegmentLockMessage
  | SegmentUnlockMessage
  | UserJoinMessage
  | UserLeaveMessage
  | PresenceRequestMessage
  | PresenceResponseMessage
  | PresenceRefreshMessage
  | TMSyncMessage
  | ChatMessage

/**
 * 客户端唯一 ID（持久化到 localStorage）
 * GoEasy DAU 按 connect({id}) 计费：同一 id 一天内多次连接只算 1 个 DAU
 * 必须用稳定 id，绝不能每次连接都随机生成（否则 DAU 暴涨）
 */
const CLIENT_ID_KEY = 'cat_collab_client_id_v1'

export function ensureClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY) || ''
    if (!id) {
      // 优先使用 crypto.randomUUID，不支持时退化为手动 hex
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID()
      } else {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.floor(Math.random() * 16)
          const v = c === 'x' ? r : (r & 0x3) | 0x8
          return v.toString(16)
        })
      }
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    // localStorage 异常时退化为内存随机 id（本次会话内稳定）
    return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

/** 生成频道名:cat_collab_{projectId} */
export function makeChannelName(projectId: ID | null): string {
  if (projectId == null) return 'cat_collab_no_project'
  return `cat_collab_${String(projectId)}`
}
