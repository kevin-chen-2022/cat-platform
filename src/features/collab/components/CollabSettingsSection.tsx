import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  TextField,
  FormControlLabel,
  Switch,
  Stack,
  InputAdornment,
  Tooltip,
  Chip,
  Alert,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HubIcon from '@mui/icons-material/Hub'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import DnsIcon from '@mui/icons-material/Dns'
import BadgeIcon from '@mui/icons-material/Badge'
import AutoStartIcon from '@mui/icons-material/Autorenew'
import InfoIcon from '@mui/icons-material/Info'
import TagIcon from '@mui/icons-material/Tag'
import CheckIcon from '@mui/icons-material/Check'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import DeleteIcon from '@mui/icons-material/Close'
import HistoryIcon from '@mui/icons-material/History'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useCollabStore } from '@/app/store/collab'
import { useProjectStore } from '@/app/store'
import { clearTeamTMEntries } from '@/services/tm/engine'
import { AppKeyQrScanner } from './AppKeyQrScanner'

export function CollabSettingsSection({
  expanded,
  onChange,
}: {
  expanded: boolean
  onChange: (expanded: boolean) => void
}) {
  const { config, setConfig, connectionStatus, connectionMessage, currentChannel, forgetChannel } =
    useCollabStore()
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.currentProjectId)
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const [showAppkey, setShowAppkey] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [flashKey, setFlashKey] = useState<number>(0)   // 扫码填入后闪烁高亮 AppKey 输入框
  const appkeyInputRef = useRef<HTMLInputElement | null>(null)

  // 最近频道(仅去重后的有效非空),独立 Menu 下拉显示
  const recentOptions = useMemo(
    () => [...new Set(config.recentChannels.filter((c) => c && c.trim()))],
    [config.recentChannels],
  )

  //
  // 频道名:使用「本地编辑态」,只在明确时刻才写入持久化 config,避免每敲一字写盘 → 重渲染 → 死循环
  // 写入触发点:输入框失焦 / 按 Enter / 点「确认并保存」按钮 / 从最近列表选中
  //
  const [editManualChannel, setEditManualChannel] = useState<string>(config.manualChannel ?? '')
  useEffect(() => {
    setEditManualChannel((prev) => {
      const next = config.manualChannel ?? ''
      return prev === next ? prev : next
    })
  }, [config.manualChannel])

  /** 把本地编辑值 flush 到持久化 config(trim 后为空视为清空 manualChannel) */
  const flushManualChannel = useCallback(
    (raw?: string) => {
      const val = (raw == null ? editManualChannel : raw).trim()
      setConfig({ manualChannel: val })
    },
    [editManualChannel, setConfig],
  )

  // 「最近频道」下拉菜单(挂在"最近"按钮上)
  const [recentMenuAnchor, setRecentMenuAnchor] = useState<null | HTMLElement>(null)
  const openRecent = (e: React.MouseEvent<HTMLElement>) => setRecentMenuAnchor(e.currentTarget)
  const closeRecent = () => setRecentMenuAnchor(null)
  const selectRecentChannel = (name: string) => {
    setEditManualChannel(name)
    flushManualChannel(name)
    closeRecent()
  }

  // 记录最近一次实际使用的频道(用于下拉 Chip 提示「上次使用」)
  const lastUsedChannelRef = useRef<string>('')
  useEffect(() => {
    if (currentChannel) lastUsedChannelRef.current = currentChannel
  }, [currentChannel])
  const lastUsedChannel = lastUsedChannelRef.current

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
          ? '连接失败'
          : '未连接'

  const inputLabelSx = { fontSize: 'calc(var(--app-content-font-size) * 0.92)' }
  const inputRootSx = {
    '& .MuiInputBase-root': {
      fontSize: 'calc(var(--app-content-font-size) * 0.93)',
    },
  }

  return (
    <Accordion
      disableGutters
      expanded={expanded}
      onChange={(_, isExpanded) => onChange(isExpanded)}
      sx={{ borderRadius: '6px !important' }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
        sx={{
          '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
          minHeight: 44,
        }}
      >
        <HubIcon fontSize="small" color="primary" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          网络协同翻译
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          label={statusLabel}
          color={statusColor as 'success'}
          size="small"
          sx={{ height: 20, fontSize: 'calc(var(--app-content-font-size) * 0.78)' }}
        />
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0 }}>
        <Stack direction="column" spacing={2}>
          {(connectionMessage || currentChannel) && (
            <Alert severity={connectionStatus === 'failed' ? 'error' : 'info'} sx={{ '& .MuiAlert-message': { fontSize: 'calc(var(--app-content-font-size) * 0.92)' } }}>
              {connectionStatus === 'failed'
                ? connectionMessage
                : currentChannel
                  ? `当前协同频道:${currentChannel}${connectionMessage ? ' · ' + connectionMessage : ''}`
                  : connectionMessage}
            </Alert>
          )}

          <TextField
            label="GoEasy AppKey"
            size="small"
            fullWidth
            type={showAppkey ? 'text' : 'password'}
            value={config.appkey}
            onChange={(e) => setConfig({ appkey: e.target.value })}
            placeholder="BC-xxxxx / BC2-xxxxx"
            sx={{
              ...inputRootSx,
              // 扫码填入后的闪烁高亮(避坑 6.2:先回调再关模态框,这里闪烁不会被焦点过渡干扰)
              animation: flashKey > 0 ? 'appkeyFlash 1.2s ease 2' : undefined,
            }}
            slotProps={{
              htmlInput: {
                ref: appkeyInputRef,
              },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <VpnKeyIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end" sx={{ gap: 0.25 }}>
                    <Tooltip
                      title={
                        <Box>
                          <Typography variant="caption" component="div">
                            <b>扫码输入 AppKey</b>
                          </Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                            打开摄像头扫描控制台二维码,本地解析,内容<b>不上传</b>,保护隐私。
                          </Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 0.5, color: 'text.secondary' }}>
                            仅 https:// 或 http://localhost 环境可用。
                          </Typography>
                        </Box>
                      }
                      placement="top"
                      arrow
                    >
                      <IconButton
                        size="small"
                        onClick={() => {
                          // 用户点击 = 用户手势,可用于 Safari video.play()
                          setQrOpen(true)
                        }}
                        aria-label="扫描二维码输入 AppKey"
                      >
                        <QrCodeScannerIcon fontSize="small" color="primary" />
                      </IconButton>
                    </Tooltip>
                    <IconButton
                      size="small"
                      onClick={() => setShowAppkey((v) => !v)}
                      aria-label={showAppkey ? '隐藏 AppKey' : '显示 AppKey'}
                    >
                      {showAppkey
                        ? <VisibilityOffIcon fontSize="small" />
                        : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                    <Tooltip
                      title={
                        <Box>
                          <Typography variant="caption" component="div">
                            从 GoEasy 控制台(https://console.goeasy.io) 申请免费额度后获取。
                          </Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                            Common Key 杭州区:BC-*,Singapore 区:BC2-*
                          </Typography>
                        </Box>
                      }
                      placement="top"
                      arrow
                    >
                      <InfoIcon fontSize="small" color="action" />
                    </Tooltip>
                  </InputAdornment>
                ),
              },
              inputLabel: { sx: inputLabelSx },
            }}
          />

          {/* 扫码弹窗:避坑 6.1+6.2 — onResult 先写入 + 高亮 + focus,再由弹窗内部 stopStream 后关闭 */}
          <AppKeyQrScanner
            open={qrOpen}
            onClose={() => setQrOpen(false)}
            onResult={(appkey, raw) => {
              // ① 保存值到 store(此为"先回调"的内容,执行时模态框仍开着,焦点过渡不会影响 focus)
              setConfig({ appkey })
              // ② 闪烁 2 次(1.2s × 2),给用户视觉反馈"已填入"
              setFlashKey((k) => k + 1)
              // ③ 同时显示明文,避免用户看不到填了什么
              setShowAppkey(true)
              // ④ 聚焦到输入框(模态框还在,DOM 焦点还没转移,避坑 6.2)
              const inp = appkeyInputRef.current
              if (inp) {
                try { inp.focus() } catch { /* ignore */ }
                try { inp.setSelectionRange(0, inp.value.length) } catch { /* ignore */ }
              }
              // ⑤ 关弹窗(最后一步 — 让 stopStream 在回调后执行)
              setQrOpen(false)
            }}
          />

          {/* 闪烁动画 */}
          <style>{`
            @keyframes appkeyFlash {
              0%   { box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.55);   border-radius: 4px; }
              50%  { box-shadow: 0 0 0 6px rgba(25, 118, 210, 0);     border-radius: 4px; }
              100% { box-shadow: 0 0 0 0 rgba(25, 118, 210, 0);       border-radius: 4px; }
            }
          `}</style>

          <TextField
            label="GoEasy Host"
            size="small"
            fullWidth
            value={config.host}
            onChange={(e) => setConfig({ host: e.target.value })}
            placeholder="https://rest-hangzhou.goeasy.io"
            sx={inputRootSx}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <DnsIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip
                      title={
                        <Box>
                          <Typography variant="caption" component="div">
                            Common Key 杭州区:https://rest-hangzhou.goeasy.io
                          </Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                            Singapore 区:https://rest-singapore.goeasy.io
                          </Typography>
                        </Box>
                      }
                      placement="top"
                      arrow
                    >
                      <InfoIcon fontSize="small" color="action" />
                    </Tooltip>
                  </InputAdornment>
                ),
              },
              inputLabel: { sx: inputLabelSx },
            }}
          />

          <TextField
            label="我的译员昵称"
            size="small"
            fullWidth
            value={config.nickname}
            onChange={(e) => setConfig({ nickname: e.target.value })}
            placeholder={activeProject?.name ? `默认:${activeProject.name}` : '加入时自动生成"译员XX"'}
            sx={inputRootSx}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <BadgeIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
              inputLabel: { sx: inputLabelSx },
            }}
          />

          {/* 频道名:纯 TextField(去 Autocomplete,彻底根除 freeSolo 的状态风暴卡死问题)
               + 「最近」独立下拉 Menu + 「确认并保存」按钮 + 「立即使用并启动协同」按钮。
               写入持久化 config 的触发点:输入框失焦 / 按 Enter / 点「确认并保存」/ 从最近 Menu 选择。
               「立即使用并启动协同」会先 flush 再直接调 startCollab,避免用户还要去点顶部工具栏连接按钮时忘记保存。*/}
          <TextField
            size="small"
            fullWidth
            label={
              recentOptions.length > 0
                ? '协同频道名（Enter / 失焦 / 点确认 即保存到本地记忆）'
                : '协同频道名（手动指定；Enter / 失焦 / 点确认 即保存）'
            }
            value={editManualChannel}
            onChange={(e) => setEditManualChannel(e.target.value)}
            onBlur={(e) => flushManualChannel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                flushManualChannel()
              }
            }}
            placeholder={activeProjectId ? `留空则自动用项目ID：cat_collab_${activeProjectId}` : '留空则自动生成'}
            sx={inputRootSx}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <TagIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment
                    position="end"
                    sx={{ gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}
                  >
                    {/* 最近频道下拉按钮 */}
                    <Tooltip title={`最近频道（${recentOptions.length}）：点击选择可直接复用`}>
                      <Button
                        size="small"
                        variant="outlined"
                        color={recentOptions.length ? 'inherit' : 'inherit'}
                        onClick={openRecent}
                        startIcon={<HistoryIcon sx={{ fontSize: 14 }} />}
                        endIcon={recentOptions.length ? <ArrowDropDownIcon sx={{ fontSize: 16 }} /> : null}
                        disabled={recentOptions.length === 0}
                        sx={{
                          height: 24,
                          fontSize: 'calc(var(--app-content-font-size) * 0.72)',
                          lineHeight: 1,
                          py: 0,
                          px: 1,
                          opacity: recentOptions.length ? 1 : 0.5,
                        }}
                      >
                        最近
                      </Button>
                    </Tooltip>

                    {/* 确认并保存：只要编辑值 ≠ 持久化值就高亮，提示用户保存 */}
                    <Tooltip title="将上方输入框中的频道名保存到本地记忆（按 Enter 或输入框失焦也会保存）">
                      <Button
                        size="small"
                        variant="contained"
                        color={editManualChannel.trim() === (config.manualChannel ?? '').trim() ? 'inherit' : 'primary'}
                        onClick={() => flushManualChannel()}
                        startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                        sx={{
                          height: 24,
                          fontSize: 'calc(var(--app-content-font-size) * 0.72)',
                          lineHeight: 1,
                          py: 0,
                          px: 1,
                          ...(editManualChannel.trim() === (config.manualChannel ?? '').trim()
                            ? { opacity: 0.55 }
                            : {}),
                        }}
                      >
                        确认并保存
                      </Button>
                    </Tooltip>

                    {currentChannel && (
                      <Chip
                        size="small"
                        label={`当前：${currentChannel.length > 18 ? currentChannel.slice(0, 18) + '…' : currentChannel}`}
                        sx={{ height: 22, fontSize: 'calc(var(--app-content-font-size) * 0.7)', color: 'primary.main' }}
                        color="primary"
                        variant="outlined"
                      />
                    )}

                    <Tooltip
                      title={
                        <Box>
                          <Typography variant="caption" component="div">
                            多人协作时，所有译员必须填写<b>相同的频道名</b>才能看到彼此。
                          </Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                            协作流程：A 输入并保存频道名 → 点「立即使用并启动协同」 → 把频道名发给 B → B 粘贴或从「最近」选择 → 点「立即使用并启动协同」。
                          </Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                            留空则自动用当前项目 ID 生成频道（仅同一设备/同一项目的两人可互通）。
                          </Typography>
                          <Typography variant="caption" component="div" sx={{ mt: 0.5, color: 'warning.main' }}>
                            改完频道名后请按 Enter / 失焦 / 点「确认并保存」再启动协同，或直接点「立即使用并启动协同」一键完成。
                          </Typography>
                          {recentOptions.length > 0 && (
                            <Typography variant="caption" component="div" sx={{ mt: 0.5, color: 'primary.main' }}>
                              已记住最近 {recentOptions.length} 个频道，「最近」下拉菜单里可复用或单条删除。
                            </Typography>
                          )}
                        </Box>
                      }
                      placement="top"
                      arrow
                    >
                      <InfoIcon fontSize="small" color="action" />
                    </Tooltip>
                  </InputAdornment>
                ),
              },
              inputLabel: { sx: inputLabelSx },
            }}
          />

          {/* 「最近频道」独立 Menu：避免 InputAdornment 嵌套问题,100% 可控;
               用 Box+Typography 手写内容以兼容不同 MUI 版本对 ListItemText prop 的差异 */}
          <Menu
            anchorEl={recentMenuAnchor}
            open={Boolean(recentMenuAnchor)}
            onClose={closeRecent}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={
              {
                paper: { sx: { maxWidth: 360 } },
              } as any
            }
          >
            <MenuItem disabled sx={{ py: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ mt: 0.25 }}><HistoryIcon fontSize="small" color="action" /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 'calc(var(--app-content-font-size) * 0.9)' }}>
                    最近使用的协同频道
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 'calc(var(--app-content-font-size) * 0.78)' }}>
                    选择即可写入频道名并保存；右侧 × 可删除此历史。
                  </Typography>
                </Box>
              </Box>
            </MenuItem>
            <Divider />
            {recentOptions.length === 0 ? (
              <MenuItem disabled>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontSize: 'calc(var(--app-content-font-size) * 0.9)' }}>
                    还没有历史频道
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 'calc(var(--app-content-font-size) * 0.78)' }}>
                    加入频道成功后会自动出现在这里。
                  </Typography>
                </Box>
              </MenuItem>
            ) : (
              recentOptions.map((option) => {
                const isLastUsed = option === lastUsedChannel
                return (
                  <MenuItem
                    key={option}
                    onClick={() => selectRecentChannel(option)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 0.25 }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 'calc(var(--app-content-font-size) * 0.9)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        mr: 1,
                      }}
                    >
                      {option}
                    </Typography>
                    {isLastUsed && (
                      <Chip size="small" label="上次使用" sx={{ height: 20, fontSize: 'calc(var(--app-content-font-size) * 0.72)', flexShrink: 0 }} />
                    )}
                    <IconButton
                      size="small"
                      sx={{ p: 0.25, flexShrink: 0 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        forgetChannel(option)
                      }}
                      aria-label={`删除历史频道 ${option}`}
                    >
                      <DeleteIcon sx={{ fontSize: 14 }} color="action" />
                    </IconButton>
                  </MenuItem>
                )
              })
            )}
          </Menu>

          {/* 频道提示 */}
          <Box sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {config.manualChannel
                ? `将使用手动频道：${config.manualChannel}`
                : activeProjectId
                  ? `将使用自动频道：cat_collab_${activeProjectId}`
                  : '请先打开一个项目再启动协同'}
            </Typography>
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={config.autoConnect}
                onChange={(_, v) => setConfig({ autoConnect: v })}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <AutoStartIcon fontSize="small" color="action" />
                <Typography variant="body2">
                  启动工作台时自动加入当前项目协同频道
                </Typography>
              </Box>
            }
            sx={{
              '& .MuiFormControlLabel-label': {
                fontSize: 'calc(var(--app-content-font-size) * 0.93)',
              },
              ml: 0,
            }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={config.autoFillTeamTM}
                onChange={(_, v) => setConfig({ autoFillTeamTM: v })}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <AutoStartIcon fontSize="small" color="action" />
                <Typography variant="body2">
                  自动填充未译（收到团队译文时自动填充到当前视图未译/空白段）
                </Typography>
              </Box>
            }
            sx={{
              '& .MuiFormControlLabel-label': {
                fontSize: 'calc(var(--app-content-font-size) * 0.93)',
              },
              ml: 0,
            }}
          />

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepIcon sx={{ fontSize: 16 }} />}
              onClick={() => {
                if (!window.confirm('确认清空团队译文记忆库？此操作不可恢复，将删除所有接收到的团队译文。')) return
                void clearTeamTMEntries().then(() => {
                  // 触发协同日志刷新，让团队译文卡片重新查询
                  useCollabStore.getState().appendLog({ type: 'info', text: '已清空团队译文记忆库' })
                })
              }}
              sx={{
                fontSize: 'calc(var(--app-content-font-size) * 0.82)',
                py: 0.25,
              }}
            >
              清空团队译文
            </Button>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
