import {
  Box,
  Stack,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Divider,
  IconButton,
  Tooltip,
  Paper,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  LinearProgress,
} from '@mui/material'
import type { ReactElement } from 'react'
import { useMemo, useState, useRef, useEffect } from 'react'
import HubIcon from '@mui/icons-material/Hub'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
import StopIcon from '@mui/icons-material/Stop'
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled'
import LockIcon from '@mui/icons-material/Lock'
import SendIcon from '@mui/icons-material/Send'
import ChatIcon from '@mui/icons-material/Chat'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import SearchIcon from '@mui/icons-material/Search'
import { useCollabStore } from '@/app/store/collab'
import { useUIStore, useProjectStore } from '@/app/store'
import { stopCollab, publishChat } from '@/services/collab/goeasy'
import { loadTeamTMEntries } from '@/services/tm/engine'
import type { TeamTMEntry, LanguageCode } from '@/types'

/** 头像颜色生成,根据用户id字符串hash取色 */
function avatarColor(uid: string): string {
  const palette = [
    '#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0',
    '#42a5f5', '#26c6da', '#26a69a', '#66bb6a', '#9ccc65',
    '#ffa726', '#8d6e63', '#78909c', '#29b6f6', '#ec407a',
  ]
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function CollabPanel(): ReactElement {
  const notify = useUIStore((s) => s.notify)
  const connectionStatus = useCollabStore((s) => s.connectionStatus)
  const connectionMessage = useCollabStore((s) => s.connectionMessage)
  const currentChannel = useCollabStore((s) => s.currentChannel)
  const users = useCollabStore((s) => s.users)
  const locks = useCollabStore((s) => s.locks)
  const logs = useCollabStore((s) => s.logs)
  const myUserId = useCollabStore((s) => s.myUserId)
  const chatMessages = useCollabStore((s) => s.chatMessages)
  const refreshUser = useCollabStore((s) => s.refreshUser)

  const [chatInput, setChatInput] = useState('')
  const chatListRef = useRef<HTMLDivElement>(null)

  // —— 视图切换：协同消息 / 团队译文 ——
  const [viewMode, setViewMode] = useState<'collab' | 'teamTM'>('collab')
  const [teamTMList, setTeamTMList] = useState<TeamTMEntry[]>([])
  const [teamTMLoading, setTeamTMLoading] = useState(false)
  const [teamTMSearch, setTeamTMSearch] = useState('')
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const projects = useProjectStore((s) => s.projects)
  // 订阅 logs.length 变化：每次收到 tm_sync 消息时重新加载团队译文列表
  const logsVersion = useCollabStore((s) => s.logs.length)

  // 加载团队译文列表
  useEffect(() => {
    if (viewMode !== 'teamTM') return
    let cancelled = false
    setTeamTMLoading(true)
    void (async () => {
      try {
        const cur = projects.find((p) => p.id === currentProjectId)
        const src = (cur?.sourceLang ?? 'en') as LanguageCode
        const tgt = (cur?.targetLang ?? 'zh-CN') as LanguageCode
        const list = await loadTeamTMEntries(src, tgt)
        if (!cancelled) setTeamTMList(list)
      } catch {
        if (!cancelled) setTeamTMList([])
      } finally {
        if (!cancelled) setTeamTMLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [viewMode, currentProjectId, projects, logsVersion])

  // 团队译文搜索过滤
  const filteredTeamTM = useMemo(() => {
    const q = teamTMSearch.trim().toLowerCase()
    if (!q) return teamTMList
    return teamTMList.filter(
      (e) => e.source.toLowerCase().includes(q) || e.target.toLowerCase().includes(q),
    )
  }, [teamTMList, teamTMSearch])

  // 聊天消息变化时自动滚动到底部
  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight
    }
  }, [chatMessages.length])

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.userId === myUserId) return -1
      if (b.userId === myUserId) return 1
      return a.joinedAt - b.joinedAt
    })
  }, [users, myUserId])

  const statusColor =
    connectionStatus === 'connected'
      ? 'success'
      : connectionStatus === 'connecting'
        ? 'warning'
        : connectionStatus === 'failed'
          ? 'error'
          : 'default'
  const statusLabel =
    connectionStatus === 'connected'
      ? '已连接'
      : connectionStatus === 'connecting'
        ? '连接中'
        : connectionStatus === 'failed'
          ? '失败'
          : '未连接'

  // 段锁定列表
  const lockList = useMemo(() => {
    const arr: { segmentId: unknown; userId: string; nickname: string; lockedAt: number }[] = []
    for (const key of Object.keys(locks)) {
      const l = locks[key]
      const u = users.find((x) => x.userId === l.userId)
      arr.push({
        segmentId: l.segmentId,
        userId: l.userId,
        nickname: u?.nickname ?? l.userId.slice(-4),
        lockedAt: l.lockedAt,
      })
    }
    return arr
  }, [locks, users])

  // 消息日志倒序（最新在前）
  const reversedLogs = useMemo(() => {
    return [...logs].reverse()
  }, [logs])

  const handleCopyChannel = () => {
    if (!currentChannel) return
    try {
      void navigator.clipboard?.writeText(currentChannel)
      notify('success', `频道名已复制:${currentChannel}`)
    } catch {
      notify('warning', '复制失败,请手动选择')
    }
  }

  const handleManualRefresh = () => {
    for (const u of users) refreshUser(u.userId, u.nickname, u.editingSegmentId)
    useCollabStore.getState().appendLog({ type: 'info', text: `手动刷新在线列表 (${users.length} 人)` })
    useCollabStore.getState().sweepStaleUsers()
  }

  const handleLeave = async () => {
    if (!window.confirm('确认离开协同频道?将停止接收同步消息并关闭协同面板。')) return
    await stopCollab()
  }

  const handleSendChat = () => {
    const text = chatInput.trim()
    if (!text) return
    void publishChat(text)
    setChatInput('')
  }

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendChat()
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <HubIcon
          color={connectionStatus === 'connected' ? 'primary' : undefined}
          sx={connectionStatus !== 'connected' ? { color: 'text.disabled' } : undefined}
        />
        <Stack direction="column" sx={{ justifyContent: 'center' }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>协同翻译</Typography>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label={statusLabel}
          color={statusColor as 'success'}
          sx={{ height: 22 }}
        />
        {connectionStatus === 'connected' && (
          <Tooltip title="离开协同">
            <IconButton size="small" edge="end" onClick={handleLeave} color="error">
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {connectionStatus === 'disconnected' && (
          <Tooltip title="启动协同翻译">
            <IconButton
              size="small"
              edge="end"
              color="success"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('cat:collab:start-requested'))
              }}
            >
              <PlayCircleFilledIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Divider className="panel-header" sx={{ my: 0.5 }} />

      {/* 视图切换：协同消息 / 团队译文 */}
      <Box sx={{ px: 1, pb: 0.5 }}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          fullWidth
          onChange={(_e, v) => v && setViewMode(v as 'collab' | 'teamTM')}
        >
          <ToggleButton value="collab" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
            <ChatIcon sx={{ fontSize: 14, mr: 0.5 }} />
            协同消息
          </ToggleButton>
          <ToggleButton value="teamTM" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
            <PeopleAltIcon sx={{ fontSize: 14, mr: 0.5 }} />
            团队译文
            {teamTMList.length > 0 && viewMode !== 'teamTM' && (
              <Chip size="small" label={teamTMList.length} sx={{ ml: 0.5, height: 14, fontSize: '0.65rem' }} />
            )}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* 顶部:频道信息 */}
      <Box sx={{ px: 1, pb: 1 }}>
        <Paper variant="outlined" sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography
            variant="caption"
            sx={{
              fontSize: 'calc(var(--app-content-font-size) * 0.86)',
              color: 'text.secondary',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            频道
          </Typography>
          <Typography
            variant="body2"
            noWrap
            sx={{
              flex: 1,
              fontSize: 'calc(var(--app-content-font-size) * 0.93)',
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            }}
            title={currentChannel ?? ''}
          >
            {currentChannel ?? '—'}
          </Typography>
          <Tooltip title="复制频道名">
            <IconButton size="small" onClick={handleCopyChannel} disabled={!currentChannel}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
        {connectionMessage && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 0.5,
              px: 0.5,
              fontSize: 'calc(var(--app-content-font-size) * 0.8)',
              color:
                connectionStatus === 'failed'
                  ? 'error.main'
                  : connectionStatus === 'connected'
                    ? 'success.main'
                    : 'text.secondary',
            }}
          >
            {connectionMessage}
          </Typography>
        )}
      </Box>

      {viewMode === 'collab' ? (
        <>
      {/* 译员列表 */}
      <Box sx={{ px: 1, pb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: 'calc(var(--app-content-font-size) * 0.86)' }}>
            在线译员
          </Typography>
          <Chip size="small" label={sortedUsers.length} sx={{ height: 18 }} />
        </Stack>
        <Tooltip title="刷新列表">
          <IconButton size="small" onClick={handleManualRefresh} disabled={connectionStatus !== 'connected'}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {/* 译员列表限高约 4 行(112px),50+译员时可滚动,避免挤压聊天和锁定状态区域 */}
      <Box sx={{ flex: '0 1 auto', maxHeight: 112, minHeight: 40, overflow: 'auto', px: 0.25 }}>
        {sortedUsers.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1, py: 1, fontSize: 'calc(var(--app-content-font-size) * 0.8)' }}>
            暂无译员。启动协同后你会出现在这里。
          </Typography>
        ) : (
          <List disablePadding dense>
            {sortedUsers.map((u) => {
              const isMe = u.userId === myUserId
              const color = avatarColor(u.userId)
              const initial = u.nickname ? u.nickname.trim().charAt(0).toUpperCase() : 'U'
              const editing = u.editingSegmentId
              const handleMention = () => {
                if (isMe) return
                const nick = (u.nickname || '译员').trim()
                if (!nick) return
                setChatInput((prev) => {
                  const tail = prev.endsWith(' ') || prev === '' ? '' : ' '
                  return `${prev}${tail}@${nick} `
                })
              }
              return (
                <ListItem key={u.userId} dense sx={{ py: 0.25 }}>
                  <ListItemAvatar sx={{ minWidth: 32 }}>
                    <Tooltip title={isMe ? '' : `@${(u.nickname || '译员').trim()} 提及`} placement="right" arrow>
                      <Avatar
                        onClick={handleMention}
                        sx={{
                          width: 24,
                          height: 24,
                          bgcolor: color,
                          color: '#fff',
                          fontSize: 'calc(var(--app-content-font-size) * 0.86)',
                          fontWeight: 700,
                          cursor: isMe ? 'default' : 'pointer',
                          '&:hover': isMe
                            ? {}
                            : { transform: 'scale(1.15)', filter: 'brightness(1.1)', transition: 'all 0.15s' },
                        }}
                      >
                        {initial}
                      </Avatar>
                    </Tooltip>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: 'calc(var(--app-content-font-size) * 0.93)',
                            fontWeight: isMe ? 700 : 500,
                          }}
                        >
                          {u.nickname || '译员'}
                        </Typography>
                        {isMe && (
                          <Chip
                            size="small"
                            label="我"
                            sx={{ height: 16, fontSize: 'calc(var(--app-content-font-size) * 0.7)', '& .MuiChip-label': { px: 0.5 } }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      editing != null ? (
                        <Typography
                          variant="caption"
                          color="primary.main"
                          sx={{ fontSize: 'calc(var(--app-content-font-size) * 0.78)' }}
                        >
                          正在编辑段 #{String(editing)}
                        </Typography>
                      ) : (
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ fontSize: 'calc(var(--app-content-font-size) * 0.78)' }}
                        >
                          {isMe ? '空闲中' : '加入 ' + formatTime(u.joinedAt)}
                        </Typography>
                      )
                    }
                    sx={{ my: 0 }}
                  />
                </ListItem>
              )
            })}
          </List>
        )}
      </Box>

      {/* 段锁定 */}
      <Box sx={{ px: 1, py: 0.5, mt: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <LockIcon color="action" sx={{ fontSize: 14 }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: 'calc(var(--app-content-font-size) * 0.86)' }}>
            段锁定状态
          </Typography>
          <Chip size="small" label={lockList.length} sx={{ height: 18 }} />
        </Stack>
      </Box>
      {/* 段锁定列表限制高度(多译员场景下避免占满面板),最多显示 6 行=约 6 名译员同时编辑 */}
      <Box sx={{ flex: '0 1 auto', maxHeight: 58, minHeight: 22, overflow: 'auto', px: 1 }}>
        {lockList.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 0.5, fontSize: 'calc(var(--app-content-font-size) * 0.8)' }}>
            当前无锁定段
          </Typography>
        ) : (
          <Stack spacing={0.25} sx={{ py: 0.5 }}>
            {lockList.map((l) => (
              <Chip
                key={String(l.segmentId) + l.userId}
                size="small"
                sx={{
                  alignSelf: 'flex-start',
                  height: 20,
                  fontSize: 'calc(var(--app-content-font-size) * 0.78)',
                  '& .MuiChip-label': { px: 0.75 },
                  bgcolor: avatarColor(l.userId) + '22',
                  color: 'text.primary',
                  border: `1px solid ${avatarColor(l.userId)}66`,
                }}
                label={`#${String(l.segmentId)} · ${l.nickname}`}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* 协同消息日志（倒序：最新在前） */}
      <Divider sx={{ mt: 0.5 }} />
      <Box sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: 'calc(var(--app-content-font-size) * 0.86)' }}>
            协同消息流
          </Typography>
          <Chip size="small" label={logs.length} sx={{ height: 18 }} />
        </Stack>
      </Box>
      <Box sx={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', px: 1, pb: 1 }}>
        {reversedLogs.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 0.5, fontSize: 'calc(var(--app-content-font-size) * 0.8)' }}>
            暂无协同消息
          </Typography>
        ) : (
          <Stack spacing={0.25} sx={{ width: '100%' }}>
            {reversedLogs.map((log) => {
              const color =
                log.type === 'join'
                  ? 'success.main'
                  : log.type === 'leave'
                    ? 'text.disabled'
                    : log.type === 'translate'
                      ? 'primary.main'
                      : log.type === 'tm'
                        ? 'success.dark'
                        : log.type === 'chat'
                          ? 'info.main'
                          : log.type === 'lock' || log.type === 'unlock'
                            ? 'warning.main'
                            : 'text.secondary'
              return (
                <Box
                  key={log.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 0.75,
                    fontSize: 'calc(var(--app-content-font-size) * 0.85)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ flexShrink: 0, color: 'text.disabled', fontSize: 'calc(var(--app-content-font-size) * 0.72)' }}
                  >
                    {formatTime(log.ts)}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: 'calc(var(--app-content-font-size) * 0.85)', color, wordBreak: 'break-all' }}>
                    {log.text}
                  </Typography>
                </Box>
              )
            })}
          </Stack>
        )}
      </Box>

      {/* 聊天区域 */}
      <Divider />
      <Box sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <ChatIcon color="action" sx={{ fontSize: 16 }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: 'calc(var(--app-content-font-size) * 0.86)' }}>
          聊天
        </Typography>
        <Box sx={{ flex: 1 }} />
        {chatMessages.length > 0 && (
          <Chip size="small" label={chatMessages.length} sx={{ height: 18 }} />
        )}
      </Box>
      <Box ref={chatListRef} sx={{ flex: '1 1 auto', minHeight: 60, overflow: 'auto', px: 1, pb: 0.5 }}>
        {chatMessages.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', py: 0.5, fontSize: 'calc(var(--app-content-font-size) * 0.8)' }}>
            暂无聊天消息。输入文字后按 Enter 发送。
          </Typography>
        ) : (
          <Stack spacing={0.5} sx={{ py: 0.5 }}>
            {chatMessages.map((msg, i) => {
              const isMe = msg.userId === myUserId
              const color = avatarColor(msg.userId)
              const initial = msg.nickname ? msg.nickname.trim().charAt(0).toUpperCase() : 'U'
              const handleMention = () => {
                if (isMe) return
                const nick = (msg.nickname || '译员').trim()
                if (!nick) return
                setChatInput((prev) => {
                  const tail = prev.endsWith(' ') || prev === '' ? '' : ' '
                  return `${prev}${tail}@${nick} `
                })
              }
              return (
                <Box key={`${msg.ts}-${i}`} sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
                  <Tooltip title={isMe ? '' : `@${(msg.nickname || '译员').trim()} 提及`} placement="top" arrow>
                    <Avatar
                      onClick={handleMention}
                      sx={{
                        width: 20,
                        height: 20,
                        bgcolor: color,
                        color: '#fff',
                        fontSize: 'calc(var(--app-content-font-size) * 0.72)',
                        fontWeight: 700,
                        mt: 0.25,
                        flexShrink: 0,
                        cursor: isMe ? 'default' : 'pointer',
                        '&:hover': isMe
                          ? {}
                          : { transform: 'scale(1.15)', filter: 'brightness(1.1)', transition: 'all 0.15s' },
                      }}
                    >
                      {initial}
                    </Avatar>
                  </Tooltip>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: isMe ? 700 : 500,
                          fontSize: 'calc(var(--app-content-font-size) * 0.78)',
                          color: isMe ? 'primary.main' : 'text.primary',
                        }}
                      >
                        {msg.nickname}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.disabled', fontSize: 'calc(var(--app-content-font-size) * 0.68)' }}
                      >
                        {formatTime(msg.ts)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: 'calc(var(--app-content-font-size) * 0.88)',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.text}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Stack>
        )}
      </Box>
      {/* 聊天输入框 */}
      <Box sx={{ px: 1, pb: 1, pt: 0.5 }}>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={3}
          placeholder="输入消息..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleChatKeyDown}
          disabled={connectionStatus !== 'connected'}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: 'calc(var(--app-content-font-size) * 0.88)',
            },
          }}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleSendChat}
                    disabled={connectionStatus !== 'connected' || !chatInput.trim()}
                  >
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
        </>
      ) : (
        /* —— 团队译文视图 —— */
        <>
          <Divider sx={{ mt: 0.5 }} />
          {/* 搜索框 */}
          <Box sx={{ px: 1, py: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="搜索原文或译文..."
              value={teamTMSearch}
              onChange={(e) => setTeamTMSearch(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: 'calc(var(--app-content-font-size) * 0.85)',
                },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
          {/* 统计条 */}
          <Box sx={{ px: 1, pb: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: 'calc(var(--app-content-font-size) * 0.86)' }}>
                团队译文
              </Typography>
              <Chip size="small" label={filteredTeamTM.length} sx={{ height: 18 }} />
              {teamTMSearch && filteredTeamTM.length !== teamTMList.length && (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 'calc(var(--app-content-font-size) * 0.72)' }}>
                  / {teamTMList.length}
                </Typography>
              )}
            </Stack>
          </Box>
          {/* 列表 */}
          {teamTMLoading ? (
            <LinearProgress sx={{ mx: 1 }} />
          ) : filteredTeamTM.length === 0 ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 'calc(var(--app-content-font-size) * 0.8)', textAlign: 'center', px: 2 }}>
                {teamTMList.length === 0
                  ? '暂无团队译文。\n启动协同翻译后，其他译员分享的译文将显示在这里。'
                  : '未找到匹配的团队译文'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', px: 1, pb: 1 }}>
              <Stack spacing={0.5}>
                {filteredTeamTM.map((e) => {
                  const color = avatarColor(e.createdByUserId || e.createdBy)
                  const initial = e.createdBy ? e.createdBy.trim().charAt(0).toUpperCase() : '?'
                  return (
                    <Paper
                      key={e.id}
                      variant="outlined"
                      sx={{ p: 0.75, borderRadius: 1 }}
                    >
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
                        <Avatar
                          sx={{
                            width: 20,
                            height: 20,
                            bgcolor: color,
                            color: '#fff',
                            fontSize: 'calc(var(--app-content-font-size) * 0.72)',
                            fontWeight: 700,
                            mt: 0.25,
                            flexShrink: 0,
                          }}
                        >
                          {initial}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.25 }}>
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: 600, fontSize: 'calc(var(--app-content-font-size) * 0.78)', color: 'text.primary' }}
                            >
                              {e.createdBy || '未知译员'}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.disabled', fontSize: 'calc(var(--app-content-font-size) * 0.68)' }}
                            >
                              {formatTime(e.updatedAt)}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: 'calc(var(--app-content-font-size) * 0.82)',
                              color: 'text.secondary',
                              wordBreak: 'break-word',
                              mb: 0.25,
                            }}
                          >
                            {e.source}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: 'calc(var(--app-content-font-size) * 0.88)',
                              color: 'success.dark',
                              wordBreak: 'break-word',
                              fontWeight: 500,
                            }}
                          >
                            {e.target}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  )
                })}
              </Stack>
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
