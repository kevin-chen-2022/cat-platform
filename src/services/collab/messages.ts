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

/** 生成随机用户ID后缀 */
export function makeUserId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `collab_user_${rand}`
}

/** 生成频道名:cat_collab_{projectId} */
export function makeChannelName(projectId: ID | null): string {
  if (projectId == null) return 'cat_collab_no_project'
  return `cat_collab_${String(projectId)}`
}
