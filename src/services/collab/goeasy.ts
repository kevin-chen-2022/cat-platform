/**
 * GoEasy 协同翻译服务封装
 *
 * 职责:
 *  - 管理 GoEasy SDK 单例生命周期(connect / disconnect)
 *  - 订阅当前项目频道,将原始消息分派给 useCollabStore
 *  - 定期广播 presence_refresh 心跳,并定时清理在线列表
 *  - 对外暴露 publish 接口,供编辑器/UI层发送协同消息
 */
import type { ID, SegmentStatus } from '@/types'
import { useProjectStore } from '@/app/store'
import { db } from '@/data/db'
import { needsTranslation } from '@/shared/utils/segmentFilter'
import {
  useCollabStore,
  type CollabConnectionStatus,
} from '@/app/store/collab'
import {
  type CollabMessage,
  type CollabMessageType,
  type SegmentUpdateMessage,
  type SegmentLockMessage,
  type SegmentUnlockMessage,
  type UserJoinMessage,
  type UserLeaveMessage,
  type PresenceRequestMessage,
  type PresenceResponseMessage,
  type PresenceRefreshMessage,
  type TMSyncMessage,
  type ChatMessage,
} from './messages'
import type { CollabUser } from './messages'

/** "确认过"的段状态集合 —— translated / reviewing / approved / rejected 都算"用户做过明确状态选择" */
const CONFIRMED_STATUSES = new Set<SegmentStatus>(['translated', 'reviewing', 'approved', 'rejected'])

/** GoEasy SDK 2.x 使用静态单例 API：GoEasy.getInstance() → GoEasy.connect() → GoEasy.pubsub.subscribe/publish */

// 运行时加载 GoEasy SDK（Vite 动态 ESM import）
import type GoEasyType from 'goeasy'

let _GoEasy: typeof GoEasyType | null = null
let _loadingPromise: Promise<typeof GoEasyType | null> | null = null

async function getGoEasy(): Promise<typeof GoEasyType | null> {
  if (_GoEasy) return _GoEasy
  if (_loadingPromise) return _loadingPromise

  _loadingPromise = (async () => {
    try {
      const mod = await import('goeasy')
      const def = (mod as { default?: typeof GoEasyType }).default
      if (def && typeof def === 'object') {
        _GoEasy = def
      } else if (def && typeof def === 'function') {
        _GoEasy = def
      } else {
        _GoEasy = mod as unknown as typeof GoEasyType
      }
      return _GoEasy
    } catch (e) {
      console.error('[collab] goeasy import failed:', e)
      return null
    } finally {
      _loadingPromise = null
    }
  })()

  return _loadingPromise
}

/** 用户输入的 REST Host (如 https://rest-hangzhou.goeasy.io) 归一为 SDK host */
function normalizeHost(input: string): string {
  let h = (input || '').trim()
  if (!h) return 'hangzhou.goeasy.io'
  // 去掉协议
  h = h.replace(/^https?:\/\//, '')
  // 去掉 rest- 前缀(如果用户填了 REST 地址)
  h = h.replace(/^rest-/, '')
  // 去掉尾斜杠
  h = h.replace(/\/+$/, '')
  return h || 'hangzhou.goeasy.io'
}

// ========== 内部状态 ==========
let goeasyInitialized = false
let currentChannel: string | null = null
let heartbeatTimer: number | null = null
let sweepTimer: number | null = null

/** presence_refresh 心跳间隔 */
const HEARTBEAT_MS = 15_000
/** 在线列表清理间隔 */
const SWEEP_MS = 20_000

function clearTimers() {
  if (heartbeatTimer != null) {
    window.clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (sweepTimer != null) {
    window.clearInterval(sweepTimer)
    sweepTimer = null
  }
}

function setStatus(status: CollabConnectionStatus, msg?: string) {
  useCollabStore.getState().setConnectionStatus(status, msg)
}

// 远程 DB 写入抑制表（每 30s 扫过期项）
const remoteWriteSuppress = new Map<string, number>()
{
  const gc = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of remoteWriteSuppress) if (v < now) remoteWriteSuppress.delete(k)
  }, 30_000)
  if (typeof window !== 'undefined') {
    ;(window as unknown as { _collabGc?: NodeJS.Timeout })._collabGc = gc
  }
}

export function isRemoteWriteSuppressed(segmentId: ID): boolean {
  const until = remoteWriteSuppress.get(String(segmentId))
  if (until == null) return false
  if (until < Date.now()) {
    remoteWriteSuppress.delete(String(segmentId))
    return false
  }
  return true
}
function setSuppressFor(segmentId: ID, ms = 1000) {
  remoteWriteSuppress.set(String(segmentId), Date.now() + ms)
}

/** 处理收到的消息 */
async function handleIncomingMessage(rawMsg: { channel: string; content: string }) {
  const st = useCollabStore.getState()
  const myId = st.myUserId
  let parsed: CollabMessage | null = null
  try {
    parsed = JSON.parse(rawMsg.content) as CollabMessage
  } catch {
    return
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.type) return

  const type = parsed.type as CollabMessageType
  switch (type) {
    case 'user_join': {
      const m = parsed as UserJoinMessage
      if (m.userId === myId) return
      st.addUser({ userId: m.userId, nickname: m.nickname, editingSegmentId: null })
      // 对新加入者回包 presence_response(定向回给 requesterId)
      void publishInternal<PresenceResponseMessage>({
        type: 'presence_response',
        userId: st.myUserId,
        nickname: st.config.nickname?.trim() || '译员',
        editingSegmentId: findEditingSegmentId(st.myUserId, st.users),
        targetUserId: m.userId,
        ts: Date.now(),
      })
      break
    }
    case 'user_leave': {
      const m = parsed as UserLeaveMessage
      if (m.userId === myId) return
      st.removeUser(m.userId)
      break
    }
    case 'presence_request': {
      const m = parsed as PresenceRequestMessage
      if (m.requesterUserId === myId) return
      // 回复我的存在状态
      void publishInternal<PresenceResponseMessage>({
        type: 'presence_response',
        userId: st.myUserId,
        nickname: st.config.nickname?.trim() || '译员',
        editingSegmentId: findEditingSegmentId(st.myUserId, st.users),
        targetUserId: m.requesterUserId,
        ts: Date.now(),
      })
      break
    }
    case 'presence_response': {
      const m = parsed as PresenceResponseMessage
      if (m.targetUserId && m.targetUserId !== myId) return
      if (m.userId === myId) return
      st.refreshUser(m.userId, m.nickname, m.editingSegmentId)
      break
    }
    case 'presence_refresh': {
      const m = parsed as PresenceRefreshMessage
      if (m.userId === myId) return
      st.refreshUser(m.userId, m.nickname, m.editingSegmentId)
      break
    }
    case 'segment_lock': {
      const m = parsed as SegmentLockMessage
      if (m.userId === myId) return
      st.addLock(m.segmentId, m.userId)
      st.appendLog({ type: 'lock', text: `${m.nickname} 开始编辑段 #${m.segmentId}` })
      break
    }
    case 'segment_unlock': {
      const m = parsed as SegmentUnlockMessage
      if (m.userId === myId) return
      st.removeLock(m.segmentId, m.userId)
      break
    }
    case 'segment_update': {
      const m = parsed as SegmentUpdateMessage
      if (m.userId === myId) return
      // 将 patch 写入本地 IndexedDB(同步 UI),并打 1s 抑制标记防止 diff 回广播成循环
      const patch: Record<string, unknown> = {}
      if (m.target !== undefined) patch.target = m.target
      if (m.status !== undefined) patch.status = m.status
      if (m.notes !== undefined) patch.notes = m.notes
      if (Object.keys(patch).length > 0) {
        setSuppressFor(m.segmentId, 1200)
        void useProjectStore.getState().updateSegment(m.segmentId, patch as never)
      }
      st.appendLog({
        type: 'translate',
        text: `${m.nickname} 更新了段 #${m.segmentId} (${statusLabel(m.status ?? 'untranslated')})`,
      })
      break
    }
    case 'tm_sync': {
      const m = parsed as TMSyncMessage
      if (m.userId === myId) return
      // —— 团队译文记忆库存储逻辑 ——
      // 1. 首先根据昵称排除自己的译文（避免同一人不同 userId 的 echo）
      const myNickname = useCollabStore.getState().config.nickname?.trim()
      if (myNickname && m.nickname?.trim() === myNickname) return

      const now = Date.now()
      const entry = {
        source: m.source,
        target: m.target,
        sourceLang: m.sourceLang,
        targetLang: m.targetLang,
        createdBy: m.nickname,
        createdByUserId: m.userId,
        createdAt: now,
        updatedAt: now,
      }
      try {
        // 2. 同一译员同一原文 → 后面译文覆盖前面（复合唯一索引 &[source+sourceLang+targetLang+createdBy]）
        const existing = await db.teamTMEntries
          .where('[source+sourceLang+targetLang+createdBy]')
          .equals([m.source, m.sourceLang, m.targetLang, m.nickname])
          .first()
        if (existing) {
          await db.teamTMEntries.update(existing.id as number, {
            target: m.target,
            updatedAt: now,
          })
          console.debug(
            '[collab][tm_sync] UPDATED team TM entry',
            'source=', m.source.slice(0, 40),
            'target=', m.target.slice(0, 40),
            'by=', m.nickname,
          )
        } else {
          const newId = await db.teamTMEntries.add(entry)
          console.debug(
            '[collab][tm_sync] ADDED team TM entry id=', newId,
            'source=', m.source.slice(0, 40),
            'target=', m.target.slice(0, 40),
            'by=', m.nickname,
            'lang=', m.sourceLang, '→', m.targetLang,
          )
        }
      } catch (e) {
        console.warn('[collab][tm_sync] DB write failed:', e, 'msg=', m)
        st.appendLog({
          type: 'info',
          text: `【错误】接收 ${m.nickname} 的译文时写入团队 TM 失败：${e instanceof Error ? e.message : String(e)}`,
        })
        break
      }

      // 3. 自动填充：若开启了 autoFillTeamTM，将团队译文填充到当前视图中未译/空白段
      const autoFill = useCollabStore.getState().config.autoFillTeamTM
      if (autoFill) {
        try {
          const projState = useProjectStore.getState()
          const segs = projState.segments
          const srcTrimmed = m.source.trim()
          let filled = 0
          for (const seg of segs) {
            if (!seg.id) continue
            if (!needsTranslation(seg)) continue
            if ((seg.source ?? '').trim() !== srcTrimmed) continue
            // 未译或空白译文 → 填充
            await projState.updateSegment(seg.id, { target: m.target, status: 'draft' })
            filled++
          }
          if (filled > 0) {
            console.debug('[collab][tm_sync] auto-filled', filled, 'segments from team TM by', m.nickname)
          }
        } catch (e) {
          console.warn('[collab][tm_sync] auto-fill failed:', e)
        }
      }

      st.appendLog({
        type: 'tm',
        text: `${m.nickname} 分享了译文："${m.source.slice(0, 30)}${m.source.length > 30 ? '...' : ''}" → "${m.target.slice(0, 30)}${m.target.length > 30 ? '...' : ''}"`,
      })
      break
    }
    case 'chat': {
      const m = parsed as ChatMessage
      if (m.userId === myId) return
      st.addChatMessage({ userId: m.userId, nickname: m.nickname, text: m.text, ts: m.ts })
      break
    }
    default:
      break
  }
}

function findEditingSegmentId(uid: string, users: CollabUser[]): ID | null {
  const me = users.find((u) => u.userId === uid)
  return me?.editingSegmentId ?? null
}

function statusLabel(s: string): string {
  switch (s) {
    case 'untranslated':
      return '未译'
    case 'draft':
      return '草稿'
    case 'translated':
      return '已译'
    case 'reviewing':
      return '审稿中'
    case 'approved':
      return '通过'
    case 'rejected':
      return '退回'
    default:
      return s
  }
}

/** 内部发布(不触发订阅回调——由 GoEasy 广播,对方收到再处理) */
async function publishInternal<T extends CollabMessage>(msg: Omit<T, 'ts'> & { ts?: number }): Promise<boolean> {
  if (!goeasyInitialized || !currentChannel) return false
  const tsVal = msg.ts ?? Date.now()
  const full = { ...(msg as unknown as Record<string, unknown>), ts: tsVal } as unknown as CollabMessage
  try {
    await new Promise<void>((resolve, reject) => {
      _GoEasy!.pubsub.publish({
        channel: currentChannel!,
        message: JSON.stringify(full),
        onSuccess: () => resolve(),
        onFailed: (err) => reject(new Error(`${err.code} ${err.content}`)),
      })
    })
    return true
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[collab] publish failed', e)
    return false
  }
}

/**
 * 对外 API:启动协同连接
 * - 校验配置(appkey 必填)
 * - 创建 GoEasy 实例
 * - 订阅频道
 * - 广播 user_join + presence_request
 * - 启动心跳 & 清理定时器
 */
export async function startCollab(opts: {
  projectId: ID | null
  projectName?: string
}): Promise<{ ok: boolean; channel: string; error?: string }> {
  const st = useCollabStore.getState()
  const { config } = st

  // 0. 已连接的话先断开
  if (goeasyInitialized) {
    try {
      await stopCollab()
    } catch {
      /* ignore */
    }
  }

  // 1. 校验 appkey
  const appkey = config.appkey?.trim()
  if (!appkey) {
    setStatus('failed', '未配置 GoEasy AppKey,请先在设置中填写')
    return { ok: false, channel: '', error: '未配置 GoEasy AppKey' }
  }
  const SDKHost = normalizeHost(config.host)
  const GoEasy = await getGoEasy()
  if (!GoEasy) {
    setStatus('failed', 'GoEasy SDK 加载失败，请检查 goeasy 依赖是否正确安装')
    return { ok: false, channel: '', error: 'GoEasy SDK 加载失败' }
  }

  // 2. 分配身份 & 频道
  const { channel, myUserId, nickname } = st.joinChannel(opts.projectId, opts.projectName)
  currentChannel = channel
  setStatus('connecting', `连接 ${SDKHost} ...`)

  // 3. 初始化 SDK（静态单例）
  try {
    if (typeof GoEasy.getInstance === 'function') {
      GoEasy.getInstance({
        host: SDKHost,
        appkey,
        modules: ['pubsub'],
      })
    } else if (typeof (GoEasy as unknown as { init?: () => void }).init === 'function') {
      ;(GoEasy as unknown as { init: (cfg: unknown) => void }).init({ host: SDKHost, appkey, modules: ['pubsub'] })
    } else {
      throw new Error(`GoEasy SDK 无 getInstance/init 方法，keys: ${Object.keys(GoEasy).join(', ')}`)
    }
    goeasyInitialized = true
  } catch (e) {
    console.error('[collab] GoEasy init error:', e)
    const msg = e instanceof Error ? e.message : 'GoEasy 初始化失败: ' + String(e)
    setStatus('failed', msg)
    st.leaveChannel()
    goeasyInitialized = false
    currentChannel = null
    return { ok: false, channel, error: msg }
  }

  // 4. 连接
  const connected = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false
    try {
      GoEasy.connect({
        id: myUserId,
        data: { nickname },
        onSuccess: () => { if (!settled) { settled = true; resolve({ ok: true }) } },
        onFailed: (err) => { if (!settled) { settled = true; resolve({ ok: false, error: `${err.code} ${err.content}` }) } },
      })
    } catch (e) {
      if (!settled) { settled = true; resolve({ ok: false, error: e instanceof Error ? e.message : 'GoEasy connect 抛异常' }) }
    }
    // 连接超时兜底:8s
    window.setTimeout(() => {
      if (!settled) { settled = true; resolve({ ok: false, error: '连接超时(8秒未响应)' }) }
    }, 8000)
  })

  if (!connected.ok) {
    const msg = connected.error ?? '连接失败'
    setStatus('failed', msg)
    st.leaveChannel()
    try { GoEasy.disconnect() } catch { /* ignore */ }
    goeasyInitialized = false
    currentChannel = null
    return { ok: false, channel, error: msg }
  }

  // 5. 订阅频道
  const subscribed = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false
    try {
      GoEasy.pubsub.subscribe({
        channel,
        onMessage: handleIncomingMessage,
        onSuccess: () => { if (!settled) { settled = true; resolve({ ok: true }) } },
        onFailed: (err) => { if (!settled) { settled = true; resolve({ ok: false, error: `${err.code} ${err.content}` }) } },
      })
    } catch (e) {
      if (!settled) { settled = true; resolve({ ok: false, error: e instanceof Error ? e.message : 'subscribe 抛异常' }) }
    }
  })

  if (!subscribed.ok) {
    const msg = subscribed.error ?? '订阅失败'
    setStatus('failed', msg)
    try { GoEasy.disconnect() } catch { /* ignore */ }
    goeasyInitialized = false
    currentChannel = null
    st.leaveChannel()
    return { ok: false, channel, error: msg }
  }

  // 6. 广播 user_join & presence_request
  setStatus('connected')

  // 6.1 一次性旧数据迁移：tmEntries 中带译员作者信息的历史条目 → 迁移到 teamTMEntries，
  //     避免升级后老版本协同期间已收到的译文丢失
  void (async () => {
    try {
      const old = await db.tmEntries.toArray()
      const candidates = old.filter(
        (e) => e.meta?.createdByUserId && e.meta?.createdBy,
      )
      if (candidates.length === 0) return
      let migrated = 0
      const now = Date.now()
      for (const e of candidates) {
        const authorId = e.meta!.createdByUserId!
        const authorName = e.meta!.createdBy!
        try {
          // 同一译员同一原文只保留一条：用 &[source+sourceLang+targetLang+createdBy] 唯一键
          const existing = await db.teamTMEntries
            .where('[source+sourceLang+targetLang+createdBy]')
            .equals([e.source, e.sourceLang, e.targetLang, authorName])
            .first()
          if (!existing) {
            await db.teamTMEntries.add({
              source: e.source,
              target: e.target,
              sourceLang: e.sourceLang,
              targetLang: e.targetLang,
              createdBy: authorName,
              createdByUserId: authorId,
              createdAt: e.createdAt ?? now,
              updatedAt: e.updatedAt ?? now,
            })
            migrated++
          }
        } catch { /* 单条失败不影响其他 */ }
      }
      if (migrated > 0) {
        console.debug(`[collab][startup] migrated ${migrated} legacy TM entries to teamTMEntries`)
        st.appendLog({ type: 'info', text: `已从历史翻译记忆库迁移 ${migrated} 条团队译文` })
      }
    } catch (err) {
      console.warn('[collab][startup] legacy TM migration failed:', err)
    }
  })()

  void publishInternal<UserJoinMessage>({
    type: 'user_join',
    userId: myUserId,
    nickname,
    ts: Date.now(),
  })
  void publishInternal<PresenceRequestMessage>({
    type: 'presence_request',
    requesterUserId: myUserId,
    ts: Date.now(),
  })

  // 7. 定时器
  clearTimers()
  heartbeatTimer = window.setInterval(() => {
    const s = useCollabStore.getState()
    if (!s.myUserId || !goeasyInitialized) return
    const myEditingId = findEditingSegmentId(s.myUserId, s.users)
    void publishInternal<PresenceRefreshMessage>({
      type: 'presence_refresh',
      userId: s.myUserId,
      nickname: s.config.nickname?.trim() || '译员',
      editingSegmentId: myEditingId,
      ts: Date.now(),
    })
  }, HEARTBEAT_MS)

  sweepTimer = window.setInterval(() => {
    useCollabStore.getState().sweepStaleUsers()
  }, SWEEP_MS)

  return { ok: true, channel }
}

/**
 * 对外 API:停止协同
 *  0. (可选)flush 当前激活段 TM 条目,避免最后一段漏发
 *  1. 广播 user_leave
 *  2. 退订 & 断连
 *  3. 清理定时器
 *
 * @param opts.snapshots 编辑器侧进入段时的快照映射,用于 flush 当前段的 TM
 * @param opts.activeSegmentId 当前激活段 ID
 */
export async function stopCollab(opts?: {
  snapshots?: ReadonlyMap<ID, SegmentEntrySnapshot>
  activeSegmentId?: ID | null
}): Promise<void> {
  // 先 flush 当前段(同步立即执行判断,不等待异步 publish 结果以避免阻塞断开流程)
  // 若调用方未传 activeSegmentId,则自己从 projectStore 读当前激活段兜底(无快照时会退化成"已确认+target非空就发")
  try {
    let segId = opts?.activeSegmentId ?? null
    if (segId == null) {
      segId = useProjectStore.getState().activeSegmentId ?? null
    }
    if (segId != null) {
      const snap = opts?.snapshots?.get(segId) ?? undefined
      flushSegmentTMEntry(segId, snap)
    }
  } catch {
    /* ignore */
  }
  const st = useCollabStore.getState()
  const myId = st.myUserId
  if (goeasyInitialized && currentChannel && myId) {
    // 先告诉别人我要离开
    try {
      await publishInternal<UserLeaveMessage>({
        type: 'user_leave',
        userId: myId,
        ts: Date.now(),
      })
    } catch {
      /* ignore */
    }
    try {
      _GoEasy?.pubsub.unsubscribe({ channel: currentChannel })
    } catch {
      /* ignore */
    }
    try {
      _GoEasy?.disconnect()
    } catch {
      /* ignore */
    }
  }
  clearTimers()
  goeasyInitialized = false
  currentChannel = null
  useCollabStore.getState().leaveChannel()
}

// ========== 对外 publish 便捷方法 ==========

/** 段锁定广播(编辑器聚焦时调用) */
export async function publishSegmentLock(segmentId: ID, nickname: string): Promise<boolean> {
  const st = useCollabStore.getState()
  if (!st.myUserId) return false
  return publishInternal<SegmentLockMessage>({
    type: 'segment_lock',
    segmentId,
    userId: st.myUserId,
    nickname,
  })
}

/** 段解锁广播(失焦时调用) */
export async function publishSegmentUnlock(segmentId: ID): Promise<boolean> {
  const st = useCollabStore.getState()
  if (!st.myUserId) return false
  return publishInternal<SegmentUnlockMessage>({
    type: 'segment_unlock',
    segmentId,
    userId: st.myUserId,
  })
}

/** 段译文/状态/备注 更新广播(保存译文时调用,仅传有变化的字段 patch) */
export async function publishSegmentUpdate(
  segmentId: ID,
  patch: Partial<{ target: string; status: SegmentUpdateMessage['status']; notes: string }>,
  nickname: string,
): Promise<boolean> {
  const st = useCollabStore.getState()
  if (!st.myUserId) return false
  return publishInternal<SegmentUpdateMessage>({
    type: 'segment_update',
    segmentId,
    target: patch.target,
    status: patch.status,
    notes: patch.notes,
    userId: st.myUserId,
    nickname,
  })
}

/** 主动广播我的 presence(段切换时触发,让新加入者立即知道我在哪里编辑) */
export async function publishPresenceRefresh(): Promise<boolean> {
  const st = useCollabStore.getState()
  if (!st.myUserId) return false
  const editing = st.users.find((u) => u.userId === st.myUserId)?.editingSegmentId ?? null
  return publishInternal<PresenceRefreshMessage>({
    type: 'presence_refresh',
    userId: st.myUserId,
    nickname: st.config.nickname?.trim() || '译员',
    editingSegmentId: editing,
  })
}

/** TM 条目同步广播（译员保存译文时调用，将 source+target 广播给频道内其他译员） */
export async function publishTMEntry(opts: {
  source: string
  target: string
  sourceLang: string
  targetLang: string
}): Promise<boolean> {
  const st = useCollabStore.getState()
  if (!st.myUserId) return false
  return publishInternal<TMSyncMessage>({
    type: 'tm_sync',
    userId: st.myUserId,
    nickname: st.config.nickname?.trim() || '译员',
    sourceLang: opts.sourceLang,
    targetLang: opts.targetLang,
    source: opts.source,
    target: opts.target,
  })
}

/**
 * 进入段时的快照结构,用于离开时判断是否需要广播 TM 条目
 */
export interface SegmentEntrySnapshot {
  target: string
  status: SegmentStatus
}

/**
 * 判断某段「离开时」是否需要广播其译文为 TM 条目,并在需要时实际发送。
 *
 * 判定规则(经过产品确认的简化方案):
 *  1. 必须已建立协同连接(connectionStatus === 'connected')
 *  2. 离开时 status 属于「已确认」集合(translated / reviewing / approved / rejected)
 *  3. 离开时 target.trim() !== 进入时快照 target.trim()(真的改过了)
 *  4. source / target 都非空
 *  5. segmentId 不在远程写入抑制窗口(避免自己的广播又被 echo 回来后死循环)
 *
 * 该函数可被多个触发点复用:离开段 / Ctrl+S 主动保存 / 断开协同时兜底 / 关闭页面前兜底。
 *
 * @returns true 表示实际广播了一条 TM 条目,false 表示未满足条件未广播
 */
export function flushSegmentTMEntry(
  segmentId: ID,
  entrySnapshot: SegmentEntrySnapshot | undefined,
): boolean {
  const cst = useCollabStore.getState()
  if (cst.connectionStatus !== 'connected') return false
  if (!cst.myUserId) return false

  const proj = useProjectStore.getState()
  const seg = proj.segments.find((s) => s.id === segmentId)
  if (!seg) return false

  const srcText = (seg.source ?? '').trim()
  if (!srcText) return false
  const curTarget = (seg.target ?? '').trim()
  if (!curTarget) return false

  const curStatus: SegmentStatus = seg.status ?? 'untranslated'
  if (!CONFIRMED_STATUSES.has(curStatus)) return false

  // 进入时快照不存在(例如刚进入段立刻被踢走,未记录快照)→ 进入基线视为空字符串,只要现在 target 非空+已确认就算
  const entryTarget = entrySnapshot?.target?.trim() ?? ''
  if (curTarget === entryTarget) return false

  // 不在抑制窗口才广播
  if (isRemoteWriteSuppressed(segmentId)) return false

  const project = proj.projects.find((p) => p.id === proj.currentProjectId)
  void publishTMEntry({
    source: srcText,
    target: curTarget,
    sourceLang: project?.sourceLang ?? 'en',
    targetLang: project?.targetLang ?? 'zh-CN',
  })
  return true
}

/**
 * 一次性 flush 多个段的 TM 条目(如断开前:当前激活段 + 所有进入过的段快照中未发布过的)
 * @param snapshots 进入时快照映射(segmentId → snapshot)
 */
export function flushAllSegmentsTMEntries(
  snapshots: ReadonlyMap<ID, SegmentEntrySnapshot>,
  activeSegmentId: ID | null,
): number {
  let published = 0
  // 先处理当前激活段(最容易漏)
  if (activeSegmentId != null) {
    if (flushSegmentTMEntry(activeSegmentId, snapshots.get(activeSegmentId))) published++
  }
  // 再遍历所有有快照但没被上面覆盖的段,兜底检查(例如连续敲字后直接关页面,激活段虽然是最后一段,但别的段可能也在进入时被记了快照却离开时没经过 flush)
  // 为了避免 N 次 projectStore.segments.find 太频繁,这里只做 activeSegmentId 兜底
  return published
}

/** 聊天消息广播 */
export async function publishChat(text: string): Promise<boolean> {
  const st = useCollabStore.getState()
  if (!st.myUserId) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  // 自己的消息也加入本地聊天列表
  st.addChatMessage({
    userId: st.myUserId,
    nickname: st.config.nickname?.trim() || '我',
    text: trimmed,
    ts: Date.now(),
  })
  return publishInternal<ChatMessage>({
    type: 'chat',
    userId: st.myUserId,
    nickname: st.config.nickname?.trim() || '译员',
    text: trimmed,
  })
}
