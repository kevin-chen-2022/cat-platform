import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactElement, ChangeEvent } from 'react'
import {
  Box, Stack, Typography, Divider, TextField, Button, IconButton, Tooltip,
  Accordion, AccordionSummary, AccordionDetails, FormControlLabel, Checkbox, RadioGroup, Radio,
  Tabs, Tab, Paper, Grid, Slider, ToggleButton, ToggleButtonGroup,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, Chip, Alert,
  Menu, Popover, ListItemIcon, ListItemText, Collapse, Switch,
  Autocomplete,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import LanguageIcon from '@mui/icons-material/Language'
import CloudIcon from '@mui/icons-material/Cloud'
import MemoryIcon from '@mui/icons-material/Memory'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import AssessmentIcon from '@mui/icons-material/Assessment'
import SettingsIcon from '@mui/icons-material/Settings'
import TranslateIcon from '@mui/icons-material/Translate'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'
import FolderIcon from '@mui/icons-material/Folder'
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import ScienceIcon from '@mui/icons-material/Science'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SendIcon from '@mui/icons-material/Send'
import UploadIcon from '@mui/icons-material/Upload'
import MergeIcon from '@mui/icons-material/MergeType'
import SplitIcon from '@mui/icons-material/CallSplit'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import SyncIcon from '@mui/icons-material/Sync'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import PencilIcon from '@mui/icons-material/Edit'
import SaveAsIcon from '@mui/icons-material/SaveAs'
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom'
import WarningIcon from '@mui/icons-material/WarningAmber'
import ErrorIcon from '@mui/icons-material/Error'
import InfoIcon from '@mui/icons-material/Info'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CleaningServicesIcon from '@mui/icons-material/CleaningServices'
import FilePresentIcon from '@mui/icons-material/InsertDriveFileOutlined'
import StopIcon from '@mui/icons-material/Stop'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { DivBilingualEditor } from '@/features/editor/components/DivBilingualEditor'
import { ProjectPanel as FeatureProjectPanel } from '@/features/project/components/ProjectPanel'
import {
  useEditorContextStore, useTermStore, useProjectStore, useUIStore,
  useDictionaryStore,
  ONLINE_DICT_URL, LOCAL_DICT_URL, ONLINE_DICT_LABEL, LOCAL_DICT_LABEL, EMBED_UNSUPPORTED,
  useMachineTranslationStore,
  MT_WEB_URL, MT_WEB_LABEL, MT_API_LABEL, MT_EMBED_UNSUPPORTED,
  useAiQAStore,
  AI_PROVIDER_META, AI_EXPLAIN_SYSTEM_PROMPT, AI_TRANSLATE_SYSTEM_PROMPT, TRANSLATE_PRESETS, AI_WEB_EMBED_UNSUPPORTED, callAiChat,
  useLinkageTMStore, useLinkageFragmentSearchStore,
  useTMStore,
  useUiAppearanceStore,
  FONT_PRESETS, DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE,
  COMMON_LANGUAGES, toBaiduLang, toCaiyunTransType,
  useQAStore, AI_QA_CHECK_SYSTEM_PROMPT,
} from '@app/store'
import type { OnlineDictState, LocalDictState, MtWebState, MtApiState, AiProviderKey, AiProviderMeta, Term, TokenUsage, LangOption, QAIssue } from '@app/store'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import FormatSizeIcon from '@mui/icons-material/FormatSize'
import PaletteIcon from '@mui/icons-material/Palette'
import BackupIcon from '@mui/icons-material/Backup'
import RestorePageIcon from '@mui/icons-material/RestorePage'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import RefreshIcon from '@mui/icons-material/Refresh'
import HistoryIcon from '@mui/icons-material/History'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer'
import { ExpandableText } from '@/shared/components/ExpandableText'
import { doInsertViaExecCommand } from '@/shared/utils/insertText'
import { matchTermsForSource, buildTermHint } from '@/shared/utils/termMatch'
import { htmlToPlainText } from '@/shared/utils/segmentFilter'
import { similarityScore, searchMemory } from '@/services/tm/engine'
import { db } from '@data/db'
import type { Segment, TMEntry, LanguageCode, Project, ID } from '@/types'
import {
  BackupScheduler,
  getBackupStatus,
  getBackupReminderStatus,
  updateBackupConfig,
  updateBackupReminderConfig,
  listSnapshots,
  deleteSnapshot,
  restoreSnapshot,
  downloadSnapshot,
  clearAllSnapshots,
  markFullBackupDone,
  type BackupStatus,
  type ReminderStatus,
} from '@/services/io/backup-scheduler'
import type { BackupSnapshot } from '@/data/db'

type SearchScope = 'file' | 'project'

interface ProjectHit {
  segment: Segment
  fileName: string
}

const _sty = {
  p: 2,
  height: '100%',
  width: '100%',
  boxSizing: 'border-box',
} as const

/** 检测文本是否包含富文本 HTML 标签（b/sup/sub/span 等，来自译文编辑器的格式化） */
function hasRichTextHtml(text: string | null | undefined): boolean {
  if (!text) return false
  return /<\/?(b|sup|sub|span|strong|i|u)\b[^>]*>/i.test(text)
}

/** 简易 CSV 行解析：支持双引号包裹（含转义 ""）和逗号分隔 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
  }
  cells.push(cur)
  return cells
}

export function EditorPanel(): ReactElement {
  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DivBilingualEditor />
      </Box>
    </Box>
  )
}

type TMSearchScope = 'project' | 'global'

export function TMPanel(): ReactElement {
  const querySource = useLinkageTMStore((s) => s.querySource)
  const queryTimestamp = useLinkageTMStore((s) => s.queryTimestamp)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const projects = useProjectStore((s) => s.projects)
  const segments = useProjectStore((s) => s.segments)
  const selectSegment = useProjectStore((s) => s.selectSegment)
  const activeProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  )
  const sourceLang = activeProject?.sourceLang
  const targetLang = activeProject?.targetLang
  const projectIdToName = useMemo(
    () => new Map(projects.map((p) => [p.id as number, p.name])),
    [projects],
  )

  // 最低匹配阈值（0-100），默认 70%
  const [threshold, setThreshold] = useState(70)
  // TM 搜索范围：当前项目 / 全局
  const [scope, setScope] = useState<TMSearchScope>('project')
  // tmEntries 异步加载（持久化翻译记忆库）
  const [tmEntries, setTmEntries] = useState<TMEntry[]>([])
  const [tmLoading, setTmLoading] = useState(false)

  // 加载 TM：依赖 scope、project、语言对（变动就重新拉）
  useEffect(() => {
    let cancelled = false
    setTmLoading(true)
    ;(async () => {
      try {
        let rows: TMEntry[] = []
        if (scope === 'project' && currentProjectId != null) {
          rows = await db.tmEntries.where('projectId').equals(currentProjectId as number).toArray()
        } else if (sourceLang) {
          rows = await db.tmEntries.where('sourceLang').equals(sourceLang).toArray()
        } else {
          rows = await db.tmEntries.toArray()
        }
        if (!cancelled) setTmEntries(rows)
      } catch (err) {
        console.error('[TMPanel:loadTM]', err)
        if (!cancelled) setTmEntries([])
      } finally {
        if (!cancelled) setTmLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [scope, currentProjectId, sourceLang, targetLang])

  // 回退数据源：当 tmEntries 为空时，用当前文件已译段落构造伪 TMEntry
  // 这样即使 tmEntries 表没数据（如测试数据直接写 store 绕过 DB），TM 卡片仍能工作
  const fallbackEntries = useMemo<TMEntry[]>(() => {
    if (tmEntries.length > 0) return []
    if (scope !== 'project') return []
    const now = Date.now()
    return segments
      .filter((s) => s.target?.trim() && s.source?.trim())
      .map((s) => ({
        source: s.source,
        target: s.target,
        sourceLang: (sourceLang ?? 'en') as LanguageCode,
        targetLang: (targetLang ?? 'zh-CN') as LanguageCode,
        projectId: currentProjectId ?? undefined,
        meta: { sourceFile: '当前文件' },
        createdAt: now,
        updatedAt: now,
      }))
  }, [tmEntries.length, scope, sourceLang, targetLang, segments, currentProjectId])

  // 合并数据源：持久化 tmEntries + 回退 segments
  const effectiveEntries = tmEntries.length > 0 ? tmEntries : fallbackEntries

  // 匹配 TM：searchMemory 二次过滤
  const matches = useMemo<Array<{ entry: TMEntry; score: number }>>(() => {
    if (!querySource.trim()) return []
    return searchMemory(effectiveEntries, querySource.trim(), {
      sourceLang: sourceLang as LanguageCode | undefined,
      targetLang: targetLang as LanguageCode | undefined,
      projectId: scope === 'project' ? (currentProjectId as any) : undefined,
      threshold,
      limit: 5,
    })
  }, [querySource, queryTimestamp, effectiveEntries, sourceLang, targetLang, currentProjectId, scope, threshold])

  const scopeLabel = scope === 'project' ? '当前项目' : '全局'

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column' }}>
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <MemoryIcon color="primary" />
          <Typography variant="h6">匹配TM</Typography>
          {effectiveEntries.length > 0 && (
            <Typography variant="caption" color="text.disabled">
              {scopeLabel} {effectiveEntries.length} 条
            </Typography>
          )}
        </Stack>
        <ToggleButtonGroup
          value={scope}
          exclusive
          size="small"
          onChange={(_e, v) => v && setScope(v as TMSearchScope)}
        >
          <ToggleButton value="project" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
            当前项目
          </ToggleButton>
          <ToggleButton value="global" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
            全局
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Divider className="panel-header" sx={{ my: 1 }} />
      {/* 最低匹配阈值滑块 */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.5, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          最低匹配
        </Typography>
        <Slider
          value={threshold}
          onChange={(_e, v) => setThreshold(v as number)}
          min={50}
          max={100}
          step={5}
          size="small"
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          sx={{ flex: 1, maxWidth: 140 }}
        />
        <Typography variant="caption" color="primary" sx={{ fontWeight: 600, flexShrink: 0, minWidth: 32 }}>
          {threshold}%
        </Typography>
      </Stack>
      {!querySource.trim() ? (
        <Typography variant="body2" color="text.secondary">
          激活段后会自动匹配翻译记忆。
        </Typography>
      ) : tmLoading ? (
        <Typography variant="body2" color="text.secondary">
          加载翻译记忆库中...
        </Typography>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            原文：{querySource.length > 40 ? querySource.slice(0, 40) + '…' : querySource}
          </Typography>
          {matches.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {effectiveEntries.length === 0
                ? `翻译记忆库（${scopeLabel}）为空，尚未产生可用记忆。`
                : '未找到匹配的记忆。'}
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {matches.map((m, i) => {
                const entry = m.entry
                const projName = entry.projectId != null ? projectIdToName.get(entry.projectId as number) : undefined
                // 反查当前文件 segments，找到则可"跳转上下文"（source+target 均精确匹配）
                const hitSeg = segments.find(
                  (s) => s.source === entry.source && s.target === entry.target,
                )
                const canJump = hitSeg != null
                return (
                  <Box
                    key={entry.id ?? `${entry.source}_${entry.target}_${i}`}
                    sx={{
                      p: 1,
                      borderRadius: 0.5,
                      bgcolor: i === 0 ? 'action.selected' : 'transparent',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.25 }}>
                      <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                        {m.score}%
                      </Typography>
                      {projName && scope === 'global' && (
                        <Tooltip title={projName}>
                          <Typography variant="caption" color="text.disabled" sx={{
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 80,
                          }}>
                            · {projName}
                          </Typography>
                        </Tooltip>
                      )}
                      {entry.meta?.sourceFile && (
                        <Tooltip title={entry.meta.sourceFile}>
                          <Typography variant="caption" color="text.disabled" sx={{
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 80,
                          }}>
                            · {entry.meta.sourceFile}
                          </Typography>
                        </Tooltip>
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Tooltip
                        title={
                          canJump
                            ? hitSeg?.index != null
                              ? `跳转到第 ${hitSeg.index} 段`
                              : '跳转到上下文'
                            : '仅当前文件的匹配结果可跳转'
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            sx={{ p: 0.25 }}
                            disabled={!canJump}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => canJump && selectSegment(hitSeg.id ?? null)}
                          >
                            <OpenInNewIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="发送原文到译文光标位置（选中原文字优先）">
                        <IconButton
                          size="small"
                          sx={{ p: 0.25 }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => sendTextToTarget(entry.source ?? '')}
                          disabled={!entry.source}
                        >
                          <SendIcon sx={{ fontSize: 12 }} />
                          <Box
                            sx={{
                              ml: 0.25,
                              fontSize: 9,
                              lineHeight: 1,
                              color: 'text.secondary',
                              alignSelf: 'flex-end',
                              pb: 0.25,
                            }}
                          >
                            原
                          </Box>
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="发送译文到译文光标位置（选中译文优先）">
                        <IconButton
                          size="small"
                          sx={{ p: 0.25 }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => sendTextToTarget(entry.target)}
                          disabled={!entry.target}
                        >
                          <SendIcon sx={{ fontSize: 12 }} />
                          <Box
                            sx={{
                              ml: 0.25,
                              fontSize: 9,
                              lineHeight: 1,
                              color: 'text.secondary',
                              alignSelf: 'flex-end',
                              pb: 0.25,
                            }}
                          >
                            译
                          </Box>
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    <ExpandableText variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
                      {entry.source}
                    </ExpandableText>
                    <ExpandableText
                      variant="body2"
                      color="text.primary"
                      html={hasRichTextHtml(entry.target)}
                    >
                      {entry.target}
                    </ExpandableText>
                  </Box>
                )
              })}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  )
}

export function TBPanel(): ReactElement {
  const terms = useTermStore((s) => s.terms)
  const addTerm = useTermStore((s) => s.addTerm)
  const deleteTerm = useTermStore((s) => s.deleteTerm)
  const sourceSelection = useEditorContextStore((s) => s.sourceSelection)
  const targetSelection = useEditorContextStore((s) => s.targetSelection)
  const targetCursor = useEditorContextStore((s) => s.targetCursor)
  const activeSegmentId = useProjectStore((s) => s.activeSegmentId)
  const segments = useProjectStore((s) => s.segments)

  const [termSource, setTermSource] = useState('')
  const [termTarget, setTermTarget] = useState('')

  const activeSegment = useMemo(
    () => segments.find((s) => s.id === activeSegmentId),
    [segments, activeSegmentId],
  )

  // 过滤激活段原文中出现过的术语（复用共享工具函数，与 AI 翻译术语注入保持一致）
  const matchedTerms = useMemo(() => {
    if (!activeSegment || !activeSegment.source) return []
    return matchTermsForSource(activeSegment.source, terms)
  }, [terms, activeSegment])

  // 自动填充：编辑器选中内容实时同步到术语输入框（仅同步非空文本，避免取消选中时清空已有内容）
  useEffect(() => {
    if (sourceSelection?.text) setTermSource(sourceSelection.text)
  }, [sourceSelection])

  useEffect(() => {
    if (targetSelection?.text) setTermTarget(targetSelection.text)
  }, [targetSelection])

  // 提交术语
  const handleSubmit = useCallback(() => {
    if (!termSource.trim() || !termTarget.trim()) return
    addTerm(termSource, termTarget)
    setTermSource('')
    setTermTarget('')
  }, [termSource, termTarget, addTerm])

  // 点击术语：仅当译文已处于编辑态时，模拟 Ctrl+V 粘贴到译文编辑器（选区优先替换，否则光标插入）
  // 如果译文未进入编辑态，就提示用户手动点击译文区域，不自动进入编辑态
  const insertToTargetCursor = useCallback((text: string) => {
    if (activeSegmentId == null) {
      useUIStore.getState().notify('warning', '请先在双语编辑器中选择一个段落')
      return
    }
    const finalTargetSel = targetSelection && targetSelection.segmentId === activeSegmentId ? targetSelection : null
    const ok = doInsertViaExecCommand(activeSegmentId, text, finalTargetSel, targetCursor)
    if (!ok) {
      useUIStore.getState().notify('info', '请先点击译文区域进入编辑状态，再插入术语')
    }
  }, [targetCursor, targetSelection, activeSegmentId])

  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0, px: 1.5, py: 1 }}>
        <BookmarkIcon color="primary" fontSize="small" />
        <Typography variant="subtitle2">术语显示</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.disabled">匹配 {matchedTerms.length}/{terms.length} 条</Typography>
      </Stack>
      <Divider className="panel-header" sx={{ flexShrink: 0 }} />

      {/* 上部：术语显示区（只显示激活行匹配到的术语） */}
      <Box sx={{
        flex: 1, minHeight: 0, overflow: 'auto', px: 1, py: 0.5,
      }}>
        {matchedTerms.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', mt: 3 }}>
            {activeSegment ? '当前激活段未匹配到术语' : '请先选择激活段'}
          </Typography>
        ) : (
          matchedTerms.map((t) => (
            <Box
              key={t.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 1,
                px: 1,
                py: 0.5,
                gap: 1,
                '&:hover': { bgcolor: 'action.hover' },
                '&:hover .term-delete': { opacity: 1 },
              }}
            >
              <Tooltip title={t.source} enterDelay={500}>
                <Typography
                  variant="body2"
                  onClick={() => insertToTargetCursor(t.source)}
                  onMouseDown={(e) => e.preventDefault()}
                  sx={{
                    flex: 1, cursor: 'pointer', textAlign: 'right',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'text.secondary',
                    '&:hover': { color: 'primary.main' },
                  }}
                >
                  {t.source}
                </Typography>
              </Tooltip>
              <Typography variant="body2" sx={{ color: 'text.disabled', flexShrink: 0 }}>|</Typography>
              <Tooltip title={t.target} enterDelay={500}>
                <Typography
                  variant="body2"
                  onClick={() => insertToTargetCursor(t.target)}
                  onMouseDown={(e) => e.preventDefault()}
                  sx={{
                    flex: 1, cursor: 'pointer', textAlign: 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'text.primary',
                    '&:hover': { color: 'primary.main' },
                  }}
                >
                  {t.target}
                </Typography>
              </Tooltip>
              <IconButton
                size="small"
                className="term-delete"
                onClick={() => {
                  setTermSource(t.source)
                  setTermTarget(t.target)
                  deleteTerm(t.id)
                }}
                sx={{ opacity: 0, transition: 'opacity 150ms', p: 0.25 }}
              >
                <DeleteOutlineOutlinedIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          ))
        )}
      </Box>

      <Divider sx={{ flexShrink: 0 }} />

      {/* 下部：术语输入区 */}
      <Box sx={{ flexShrink: 0, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField
          size="small"
          label="术语原文"
          value={termSource}
          onChange={(e) => setTermSource(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSubmit() } }}
          placeholder="选中文本自动填充"
          fullWidth
        />
        <TextField
          size="small"
          label="术语译文"
          value={termTarget}
          onChange={(e) => setTermTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSubmit() } }}
          placeholder="选中文本自动填充"
          fullWidth
        />
        <Button
          variant="contained"
          size="small"
          onClick={handleSubmit}
          disabled={!termSource.trim() || !termTarget.trim()}
          sx={{ alignSelf: 'flex-end' }}
        >
          确定 (Ctrl+Enter)
        </Button>
      </Box>
    </Box>
  )
}

/**
 * 机器翻译面板。
 * - 网页模式：iframe 加载翻译网页（预填查询文本）
 * - API 模式：直接调用翻译 API，显示译文结果，支持插入到译文
 * - 订阅 useMachineTranslationStore.queryText/queryTimestamp，自动响应原文"机器翻译"按钮
 */
export function MTPanel(): ReactElement {
  const mode = useMachineTranslationStore((s) => s.mode)
  const web = useMachineTranslationStore((s) => s.web)
  const api = useMachineTranslationStore((s) => s.api)
  const queryText = useMachineTranslationStore((s) => s.queryText)
  const queryTimestamp = useMachineTranslationStore((s) => s.queryTimestamp)
  const storeSrc = useMachineTranslationStore((s) => s.srcLang)
  const storeTgt = useMachineTranslationStore((s) => s.tgtLang)
  const setLang = useMachineTranslationStore((s) => s.setLang)

  // 当前项目的 sourceLang / targetLang，作为默认语言对（响应项目切换）
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const projects = useProjectStore((s) => s.projects)
  const projectLang = useMemo(() => {
    const cur = projects.find((p) => p.id === currentProjectId)
    return cur ? { src: cur.sourceLang, tgt: cur.targetLang } : null
  }, [projects, currentProjectId])

  // 本地语言对：项目语言优先，其次 store 持久值，最后默认 en → zh-CN
  const [inputSrc, setInputSrc] = useState(projectLang?.src ?? storeSrc ?? 'auto')
  const [inputTgt, setInputTgt] = useState(projectLang?.tgt ?? storeTgt ?? 'zh-CN')
  // 项目切换时跟随项目语言对（用户可临时手改，仅影响当前翻译）
  useEffect(() => {
    if (projectLang) {
      setInputSrc(projectLang.src)
      setInputTgt(projectLang.tgt)
    }
  }, [projectLang])

  const onSrcChange = (v: string) => { setInputSrc(v); setLang(v, inputTgt) }
  const onTgtChange = (v: string) => { setInputTgt(v); setLang(inputSrc, v) }
  // 交换源/目标语言对（同步本地与持久化）
  const swapLangs = () => {
    const newSrc = inputTgt
    const newTgt = inputSrc
    setInputSrc(newSrc)
    setInputTgt(newTgt)
    setLang(newSrc, newTgt)
  }

  // 输入框文本
  const [inputText, setInputText] = useState('')
  useEffect(() => {
    if (queryText) setInputText(queryText)
  }, [queryText, queryTimestamp])

  // 当前待翻译文本
  const activeText = queryText || inputText

  // 网页模式：已勾选的翻译网页
  const webKeys = Object.keys(MT_WEB_LABEL) as (keyof MtWebState)[]
  const activeWebKeys = useMemo(
    () => webKeys.filter((k) => web[k]),
    [web, webKeys],
  )
  const [activeWebIdx, setActiveWebIdx] = useState(0)
  useEffect(() => {
    if (activeWebIdx >= activeWebKeys.length) setActiveWebIdx(0)
  }, [activeWebKeys.length, activeWebIdx])
  const activeWebKey = activeWebKeys[activeWebIdx]

  // API 模式：已启用的 API 列表
  const apiKeys = Object.keys(MT_API_LABEL) as (keyof MtApiState)[]
  const activeApiKeys = useMemo(
    () => apiKeys.filter((k) => api[k].enabled),
    [api, apiKeys],
  )
  const [activeApiIdx, setActiveApiIdx] = useState(0)
  useEffect(() => {
    if (activeApiIdx >= activeApiKeys.length) setActiveApiIdx(0)
  }, [activeApiKeys.length, activeApiIdx])

  // API 翻译结果：{ [api key]: { loading, result, error } }
  const [apiResults, setApiResults] = useState<Record<string, { loading: boolean; result: string; error: string }>>({})
  const activeSegmentId = useProjectStore((s) => s.activeSegmentId)
  const updateSegment = useProjectStore((s) => s.updateSegment)

  // 触发 API 翻译
  const runApiTranslate = useCallback(
    async (key: keyof MtApiState, text: string) => {
      if (!text.trim()) return
      setApiResults((prev) => ({ ...prev, [key]: { loading: true, result: '', error: '' } }))
      try {
        const apiState = useMachineTranslationStore.getState().api
        let result = ''
        if (key === 'baidu') {
          const cfg = apiState.baidu
          result = await translateByBaidu(text, cfg.appId, cfg.secret, inputSrc, inputTgt)
        } else if (key === 'caiyun') {
          const cfg = apiState.caiyun
          result = await translateByCaiyun(text, cfg.token, inputSrc, inputTgt)
        }
        setApiResults((prev) => ({ ...prev, [key]: { loading: false, result, error: '' } }))
      } catch (e: any) {
        setApiResults((prev) => ({ ...prev, [key]: { loading: false, result: '', error: e?.message || String(e) } }))
      }
    },
    [inputSrc, inputTgt],
  )

  // 当 queryText 变化且为 API 模式时，自动翻译所有已启用的 API
  useEffect(() => {
    if (mode !== 'api' || !queryText.trim()) return
    activeApiKeys.forEach((k) => runApiTranslate(k, queryText))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTimestamp, mode])

  // 插入译文到激活段
  const insertToTarget = useCallback((text: string) => {
    if (activeSegmentId == null) return
    updateSegment(activeSegmentId, { target: text, status: 'draft' })
  }, [activeSegmentId, updateSegment])

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column', p: 1.5 }}>
      {/* 头部 */}
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <AutoAwesomeIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1">机器翻译</Typography>
        <Typography variant="caption" color="text.secondary">
          {mode === 'web' ? '网页嵌入' : 'API 调用'}
        </Typography>
      </Stack>
      <Divider sx={{ mb: 1 }} />

      {/* 语言对选择（默认跟随项目，可临时手改） */}
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
        <LangAutocomplete
          label="源语言"
          value={inputSrc}
          onChange={onSrcChange}
          placeholder={projectLang?.src ?? 'auto'}
        />
        <Tooltip title="交换源/目标语言">
          <IconButton size="small" onClick={swapLangs} sx={{ p: 0.5 }}>
            <SwapHorizIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <LangAutocomplete
          label="目标语言"
          value={inputTgt}
          onChange={onTgtChange}
          placeholder={projectLang?.tgt ?? 'zh-CN'}
        />
      </Stack>

      {/* 文本输入区 */}
      <TextField
        size="small"
        multiline
        minRows={2}
        maxRows={4}
        placeholder="输入要翻译的文本"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            useMachineTranslationStore.getState().setQueryText(inputText.trim())
          }
        }}
        sx={{ mb: 1 }}
      />
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Button
          size="small"
          variant="contained"
          onClick={() => useMachineTranslationStore.getState().setQueryText(inputText.trim())}
        >
          翻译
        </Button>
        {mode === 'api' && activeApiKeys.length > 0 && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => activeApiKeys.forEach((k) => runApiTranslate(k, activeText))}
            disabled={!activeText.trim()}
          >
            重新翻译
          </Button>
        )}
      </Stack>

      {/* 主体 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {mode === 'web' ? (
          activeWebKeys.length === 0 ? (
            <EmptyHint text="未勾选任何翻译网页。请到「设置」中勾选。" />
          ) : activeText.trim() ? (
            <>
              {activeWebKeys.length > 1 && (
                <Tabs
                  value={activeWebIdx}
                  onChange={(_, v) => setActiveWebIdx(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32 } }}
                >
                  {activeWebKeys.map((k) => (
                    <Tab
                      key={k}
                      label={
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <span>{MT_WEB_LABEL[k]}</span>
                          {MT_EMBED_UNSUPPORTED.has(k) && (
                            <Tooltip title="该网站不支持嵌入，需在新窗口打开">
                              <OpenInNewIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                            </Tooltip>
                          )}
                        </Stack>
                      }
                      sx={{ minHeight: 32 }}
                    />
                  ))}
                </Tabs>
              )}
              {activeWebKey && MT_EMBED_UNSUPPORTED.has(activeWebKey) ? (
                <UnsupportedEmbedView
                  label={MT_WEB_LABEL[activeWebKey]}
                  url={MT_WEB_URL[activeWebKey](activeText.trim(), inputSrc, inputTgt)}
                />
              ) : (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: 'center', justifyContent: 'flex-end',
                      py: 0.25, px: 0.5, bgcolor: 'action.hover',
                    }}
                  >
                    <Tooltip title="在新窗口打开">
                      <IconButton
                        size="small"
                        href={activeWebKey ? MT_WEB_URL[activeWebKey](activeText.trim(), inputSrc, inputTgt) : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ p: 0.25 }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Box sx={{ flex: 1, minHeight: 0, border: 1, borderColor: 'divider', borderTop: 0 }}>
                    <iframe
                      key={`${activeWebKey}-${activeText}`}
                      src={activeWebKey ? MT_WEB_URL[activeWebKey](activeText.trim(), inputSrc, inputTgt) : ''}
                      title={activeWebKey ? MT_WEB_LABEL[activeWebKey] : ''}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <EmptyHint text="输入文本后回车或点击「翻译」按钮" />
          )
        ) : (
          // API 模式
          activeApiKeys.length === 0 ? (
            <EmptyHint text="未启用任何翻译 API。请到「设置」中配置并启用。" />
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {activeApiKeys.length > 1 && (
                <Tabs
                  value={activeApiIdx}
                  onChange={(_, v) => setActiveApiIdx(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32 } }}
                >
                  {activeApiKeys.map((k) => (
                    <Tab key={k} label={MT_API_LABEL[k]} sx={{ minHeight: 32 }} />
                  ))}
                </Tabs>
              )}
              {activeApiKeys.map((k) => {
                const r = apiResults[k]
                if (activeApiKeys.length > 1 && k !== activeApiKeys[activeApiIdx]) return null
                return (
                  <Box key={k} sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {MT_API_LABEL[k]}
                      </Typography>
                      <Stack direction="row" spacing={0.5}>
                        <Button
                          size="small"
                          onClick={() => runApiTranslate(k, activeText)}
                          disabled={!activeText.trim() || r?.loading}
                          sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                        >
                          重译
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => insertToTarget(r?.result || '')}
                          disabled={!r?.result}
                          sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                        >
                          插入译文
                        </Button>
                      </Stack>
                    </Stack>
                    {r?.loading ? (
                      <Typography variant="body2" color="text.secondary">翻译中...</Typography>
                    ) : r?.error ? (
                      <Typography variant="body2" color="error.main">错误：{r.error}</Typography>
                    ) : r?.result ? (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r.result}</Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        点击「重译」按钮发起翻译
                      </Typography>
                    )}
                  </Box>
                )
              })}
            </Box>
          )
        )}
      </Box>
    </Box>
  )
}

/** 不支持嵌入的视图：提示 + 外链按钮 */
function UnsupportedEmbedView({ label, url }: { label: string; url: string }): ReactElement {
  return (
    <Box
      sx={{
        flex: 1, minHeight: 0, border: 1, borderColor: 'divider',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', p: 3, gap: 2,
      }}
    >
      <LanguageIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {label} 不支持在页面内嵌入显示
        <br />
        （网站设置了 X-Frame-Options 拦截）
      </Typography>
      <Button
        variant="contained"
        size="small"
        startIcon={<OpenInNewIcon />}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        在新窗口打开 {label}
      </Button>
    </Box>
  )
}

// —— 百度翻译 API（浏览器直连，MD5 签名）——
// 文档：https://fanyi-api.baidu.com/doc/21
async function translateByBaidu(text: string, appId: string, secret: string, src: string, tgt: string): Promise<string> {
  if (!appId || !secret) throw new Error('未配置百度翻译 AppID 或密钥')
  const from = toBaiduLang(src)
  const to = toBaiduLang(tgt)
  // 百度目标语言不支持 auto
  if (to === 'auto') throw new Error('百度翻译目标语言不能为「自动检测」')
  const salt = String(Date.now())
  const sign = await md5Hex(`${appId}${text}${salt}${secret}`)
  const url = `https://fanyi-api.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(text)}&from=${from}&to=${to}&appid=${appId}&salt=${salt}&sign=${sign}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error_code) throw new Error(`百度[${data.error_code}] ${data.error_msg}`)
  if (!data.trans_result || !data.trans_result.length) throw new Error('百度返回空结果')
  return data.trans_result.map((r: any) => r.dst).join('\n')
}

// —— 彩云小译 API（浏览器直连，token 认证）——
// 文档：https://docs.caiyunapp.com/docs/lingocloud-api
async function translateByCaiyun(text: string, token: string, src: string, tgt: string): Promise<string> {
  if (!token) throw new Error('未配置彩云小译 token')
  const transType = toCaiyunTransType(src, tgt)
  if (!transType) throw new Error('彩云小译不支持该语言对（仅支持 en/zh/ja/ko/fr/de/es/ru/it 之间的互译）')
  const url = 'https://api.interpreter.caiyunai.com/v1/translator'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Authorization': `token ${token}`,
    },
    body: JSON.stringify({
      source: [text],
      trans_type: transType,
      request_id: 'cat-web',
      detect: true,
    }),
  })
  const data = await res.json()
  if (!data.target || !data.target.length) throw new Error('彩云返回空结果')
  return data.target.join('\n')
}

// —— 极简 MD5 实现（用于百度签名，避免引入大依赖）——
// 来自标准 RFC 1321 的参考实现的精简版本
function md5Hex(str: string): Promise<string> {
  return new Promise((resolve) => {
    // 使用 Web Crypto API 不支持 MD5，这里用纯 JS 实现
    resolve(md5Sync(str))
  })
}

// 以下为 MD5 同步实现（Joseph Myers 的公共域实现精简版）
function md5Sync(input: string): string {
  function toUtf8(s: string): string {
    return unescape(encodeURIComponent(s))
  }
  function add32(a: number, b: number): number {
    return (a + b) & 0xffffffff
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    a = add32(add32(a, q), add32(x, t))
    return add32((a << s) | (a >>> (32 - s)), b)
  }
  function ff(a:number,b:number,c:number,d:number,x:number,s:number,t:number){return cmn((b&c)|((~b)&d),a,b,x,s,t)}
  function gg(a:number,b:number,c:number,d:number,x:number,s:number,t:number){return cmn((b&d)|(c&(~d)),a,b,x,s,t)}
  function hh(a:number,b:number,c:number,d:number,x:number,s:number,t:number){return cmn(b^c^d,a,b,x,s,t)}
  function ii(a:number,b:number,c:number,d:number,x:number,s:number,t:number){return cmn(c^(b|(~d)),a,b,x,s,t)}
  function md5cycle(x: number[], k: number[]) {
    let [a, b, c, d] = [x[0], x[1], x[2], x[3]]
    a = ff(a,b,c,d,k[0],7,-680876936); d=ff(d,a,b,c,k[1],12,-389564586); c=ff(c,d,a,b,k[2],17,606105819); b=ff(b,c,d,a,k[3],22,-1044525330)
    a=ff(a,b,c,d,k[4],7,-176418897); d=ff(d,a,b,c,k[5],12,1200080426); c=ff(c,d,a,b,k[6],17,-1473231341); b=ff(b,c,d,a,k[7],22,-45705983)
    a=ff(a,b,c,d,k[8],7,1770035416); d=ff(d,a,b,c,k[9],12,-1958414417); c=ff(c,d,a,b,k[10],17,-42063); b=ff(b,c,d,a,k[11],22,-1990404162)
    a=ff(a,b,c,d,k[12],7,1804603682); d=ff(d,a,b,c,k[13],12,-40341101); c=ff(c,d,a,b,k[14],17,-1502002290); b=ff(b,c,d,a,k[15],22,1236535329)
    a=gg(a,b,c,d,k[1],5,-165796510); d=gg(d,a,b,c,k[6],9,-1069501632); c=gg(c,d,a,b,k[11],14,643717713); b=gg(b,c,d,a,k[0],20,-373897302)
    a=gg(a,b,c,d,k[5],5,-701558691); d=gg(d,a,b,c,k[10],9,38016083); c=gg(c,d,a,b,k[15],14,-660478335); b=gg(b,c,d,a,k[4],20,-405537848)
    a=gg(a,b,c,d,k[9],5,568446438); d=gg(d,a,b,c,k[14],9,-1019803690); c=gg(c,d,a,b,k[3],14,-187363961); b=gg(b,c,d,a,k[8],20,1163531501)
    a=gg(a,b,c,d,k[13],5,-1444681467); d=gg(d,a,b,c,k[2],9,-51403784); c=gg(c,d,a,b,k[7],14,1735328473); b=gg(b,c,d,a,k[12],20,-1926607734)
    a=hh(a,b,c,d,k[5],4,-378558); d=hh(d,a,b,c,k[8],11,-2022574463); c=hh(c,d,a,b,k[11],16,1839030562); b=hh(b,c,d,a,k[14],23,-35309556)
    a=hh(a,b,c,d,k[1],4,-1530992060); d=hh(d,a,b,c,k[4],11,1272893353); c=hh(c,d,a,b,k[7],16,-155497632); b=hh(b,c,d,a,k[10],23,-1094730640)
    a=hh(a,b,c,d,k[13],4,681279174); d=hh(d,a,b,c,k[0],11,-358537222); c=hh(c,d,a,b,k[3],16,-722521979); b=hh(b,c,d,a,k[6],23,76029189)
    a=hh(a,b,c,d,k[9],4,-640364487); d=hh(d,a,b,c,k[12],11,-421815835); c=hh(c,d,a,b,k[15],16,530742520); b=hh(b,c,d,a,k[2],23,-995338651)
    a=ii(a,b,c,d,k[0],6,-198630844); d=ii(d,a,b,c,k[7],10,1126891415); c=ii(c,d,a,b,k[14],15,-1416354905); b=ii(b,c,d,a,k[5],21,-57434055)
    a=ii(a,b,c,d,k[12],6,1700485571); d=ii(d,a,b,c,k[3],10,-1894986606); c=ii(c,d,a,b,k[10],15,-1051523); b=ii(b,c,d,a,k[1],21,-2054922799)
    a=ii(a,b,c,d,k[8],6,1873313359); d=ii(d,a,b,c,k[15],10,-30611744); c=ii(c,d,a,b,k[6],15,-1560198380); b=ii(b,c,d,a,k[13],21,1309151649)
    a=ii(a,b,c,d,k[4],6,-145523070); d=ii(d,a,b,c,k[11],10,-1120210379); c=ii(c,d,a,b,k[2],15,718787259); b=ii(b,c,d,a,k[9],21,-343485551)
    x[0]=add32(a,x[0]); x[1]=add32(b,x[1]); x[2]=add32(c,x[2]); x[3]=add32(d,x[3])
  }
  function md5blk(s: string): number[] {
    const md5blks: number[] = []
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24)
    }
    return md5blks
  }
  function md51(s: string): number[] {
    const n = s.length
    const state = [1732584193, -271733879, -1732584194, 271733878]
    let i: number
    for (i = 0; i < n - 64; i += 64) {
      md5cycle(state, md5blk(s.substring(i, i + 64)))
    }
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const sub = s.substring(i)
    for (let j = 0; j < sub.length; j++) {
      tail[j >> 2] |= sub.charCodeAt(j) << ((j % 4) << 3)
    }
    tail[sub.length >> 2] |= 0x80 << ((sub.length % 4) << 3)
    if (sub.length > 55) {
      md5cycle(state, tail)
      for (let k = 0; k < 16; k++) tail[k] = 0
    }
    tail[14] = n * 8
    md5cycle(state, tail)
    return state
  }
  function rhex(n: number): string {
    let s = ''
    const hexChr = '0123456789abcdef'
    for (let j = 0; j < 4; j++) {
      s += hexChr.charAt((n >> (j * 8 + 4)) & 0x0f) + hexChr.charAt((n >> (j * 8)) & 0x0f)
    }
    return s
  }
  function hex(x: number[]): string {
    return x.map(rhex).join('')
  }
  return hex(md51(toUtf8(input)))
}

/** 质检问题类型标签映射 */
const QA_TYPE_LABEL: Record<QAIssue['type'], string> = {
  term_mismatch: '术语不一致',
  number_mismatch: '数字丢失',
  tag_mismatch: '标签丢失',
  empty_target: '空译文',
  duplicate: '重复译文',
  length_ratio: '长度异常',
  custom: 'AI质检',
}

/** 严重度 → 图标 + 颜色 */
function SeverityIcon({ severity }: { severity: QAIssue['severity'] }): ReactElement {
  if (severity === 'error') return <ErrorIcon fontSize="small" color="error" />
  if (severity === 'warning') return <WarningIcon fontSize="small" color="warning" />
  return <InfoIcon fontSize="small" color="info" />
}

export function QAPanel(): ReactElement {
  const issues = useQAStore((s) => s.issues)
  const loading = useQAStore((s) => s.loading)
  const scanScope = useQAStore((s) => s.scanScope)
  const scanSegment = useQAStore((s) => s.scanSegment)
  const scanSegments = useQAStore((s) => s.scanSegments)
  const resolveIssue = useQAStore((s) => s.resolveIssue)
  const clearIssues = useQAStore((s) => s.clearIssues)
  const aiEnabled = useQAStore((s) => s.aiEnabled)
  const aiPrompt = useQAStore((s) => s.aiPrompt)
  const aiTokenUsage = useQAStore((s) => s.aiTokenUsage)
  const setAiEnabled = useQAStore((s) => s.setAiEnabled)
  const setAiPrompt = useQAStore((s) => s.setAiPrompt)
  const resetAiPrompt = useQAStore((s) => s.resetAiPrompt)
  const autoLabelEnabled = useQAStore((s) => s.autoLabelEnabled)
  const setAutoLabelEnabled = useQAStore((s) => s.setAutoLabelEnabled)
  const followMode = useQAStore((s) => s.followMode)
  const setFollowMode = useQAStore((s) => s.setFollowMode)
  const aiChecking = useQAStore((s) => s.aiChecking)
  const setAiChecking = useQAStore((s) => s.setAiChecking)
  const abortFileScan = useQAStore((s) => s.abortFileScan)
  const resetAbort = useQAStore((s) => s.resetAbort)
  const runAiCheckForSegment = useQAStore((s) => s.runAiCheckForSegment)
  const notify = useUIStore((s) => s.notify)

  const segments = useProjectStore((s) => s.segments)
  const selectSegment = useProjectStore((s) => s.selectSegment)
  const activeSegmentId = useEditorContextStore((s) => s.activeSegmentId)
  const setActiveSegment = useEditorContextStore((s) => s.setActiveSegment)
  const terms = useTermStore((s) => s.terms)
  const providers = useAiQAStore((s) => s.providers)
  const pKeys = Object.keys(AI_PROVIDER_META) as AiProviderKey[]
  const activeProviders = useMemo(
    () => pKeys.filter((k) => providers[k].enabled),
    [providers, pKeys],
  )

  // AI 质检输入区折叠（默认折叠）
  const [showAiSection, setShowAiSection] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  // 全文件AI质检进度（null=未运行，[0,N]=已完成/总数）
  const [aiFileProgress, setAiFileProgress] = useState<{ done: number; total: number } | null>(null)

  // 统计
  const errorCount = issues.filter((i) => !i.resolved && i.severity === 'error').length
  const warningCount = issues.filter((i) => !i.resolved && i.severity === 'warning').length
  const infoCount = issues.filter((i) => !i.resolved && i.severity === 'info').length

  // 按段分组（排除已解决）
  const groupedBySegment = useMemo(() => {
    const map = new Map<ID, QAIssue[]>()
    for (const issue of issues) {
      if (issue.resolved) continue
      if (!map.has(issue.segmentId)) map.set(issue.segmentId, [])
      map.get(issue.segmentId)!.push(issue)
    }
    return Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]))
  }, [issues])

  // AI 质检（单段）—— 委托 store，UI 层只负责反馈
  const runAiCheck = async (seg: Segment): Promise<boolean> => {
    if (!aiEnabled) return false
    if (activeProviders.length === 0) {
      notify('error', '未启用任何AI提供商，请在「设置 → AI问答」中启用至少一个')
      return false
    }
    try {
      return await runAiCheckForSegment(seg)
    } catch (e: any) {
      const errorMsg = e?.message || 'AI质检失败，请检查API Key和网络连接'
      notify('error', errorMsg)
      console.warn('AI质检失败:', errorMsg)
      return false
    }
  }

  // 质检当前段（一次性，不影响跟随模式状态）
  const handleScanCurrent = () => {
    if (activeSegmentId == null) return
    const seg = segments.find((s) => s.id === activeSegmentId)
    if (!seg) return
    scanSegment(seg, terms)
    // AI 质检（如开启）—— 每次实时读取设置
    if (aiEnabled) {
      setAiRunning(true)
      runAiCheck(seg).finally(() => setAiRunning(false))
    }
  }

  // 全文件质检
  const handleScanFile = () => {
    // 互斥：启动全文件质检时退出跟随模式
    if (followMode) setFollowMode(false)
    resetAbort()
    scanSegments(segments, terms)
    // AI 质检（如开启）— 串行逐个段，显示进度；每次实时读取设置，响应用户中途开关AI
    if (aiEnabled && activeProviders.length > 0) {
      const targets = segments.filter((s) => s.source?.trim() && s.target?.trim())
      if (targets.length === 0) return
      // 开始前：批量设置 AI 质检中标志，让每段都显示loading占位（流式逐条反馈）
      setAiChecking(targets.map((t) => t.id!), true)
      setAiFileProgress({ done: 0, total: targets.length })
      setAiRunning(true)
      ;(async () => {
        try {
          for (let i = 0; i < targets.length; i++) {
            // 检查中止标志
            if (useQAStore.getState().fileScanAborted) break
            // 每次实时读取 aiEnabled，响应用户中途调整
            if (useQAStore.getState().aiEnabled) {
              await runAiCheck(targets[i])
            } else {
              // 用户中途关闭AI，清除该段checking标志
              setAiChecking([targets[i].id!], false)
            }
            setAiFileProgress({ done: i + 1, total: targets.length })
          }
        } finally {
          setAiRunning(false)
          resetAbort()
          // 收尾：清除所有残余 checking 标志（中止、中途关AI都可能残留）
          setAiChecking(targets.map((t) => t.id!), false)
          setTimeout(() => setAiFileProgress(null), 3000)
        }
      })()
    }
  }

  // 停止全文件质检
  const handleStopScan = () => {
    abortFileScan()
  }

  // 跳转到段：同步设置 projectStore（编辑器主状态） + editorContext
  const handleJumpTo = (segId: ID) => {
    selectSegment(segId)
    setActiveSegment(segId)
  }

  return (
    <Box sx={{
      ..._sty,
      display: 'flex',
      flexDirection: 'column',
      p: 1.5,
      '@global': {
        '@keyframes qaDots': {
          '0%': { letterSpacing: 0, opacity: 0.3 },
          '25%': { letterSpacing: 0, opacity: 0.5 },
          '50%': { letterSpacing: 0, opacity: 0.7 },
          '75%': { letterSpacing: 0, opacity: 0.9 },
          '100%': { letterSpacing: 0, opacity: 0.3 },
        },
      },
    }}>
      {/* 顶部 header */}
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <AssessmentIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1">QA 质检</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {errorCount > 0 && <span style={{ color: '#f44336' }}>{errorCount} error</span>}
          {errorCount > 0 && warningCount > 0 && ' / '}
          {warningCount > 0 && <span style={{ color: '#ff9800' }}>{warningCount} warn</span>}
          {(errorCount > 0 || warningCount > 0) && infoCount > 0 && ' / '}
          {infoCount > 0 && <span style={{ color: '#2196f3' }}>{infoCount} info</span>}
          {errorCount === 0 && warningCount === 0 && infoCount === 0 && '无问题'}
        </Typography>
      </Stack>
      <Divider sx={{ my: 1 }} />

      {/* 操作按钮 */}
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
        <Tooltip title={followMode ? '已开启跟随模式：切换段时自动质检当前段。再次点击关闭' : '开启后立即质检当前段，且切换段时自动质检（规则+AI按设置）'}>
          <Button
            size="small"
            variant={followMode ? 'contained' : 'outlined'}
            color={followMode ? 'primary' : 'inherit'}
            startIcon={<PlayArrowIcon />}
            onClick={() => {
              if (followMode) {
                setFollowMode(false)
              } else {
                setFollowMode(true)
                // 立即质检当前段一次
                handleScanCurrent()
              }
            }}
            disabled={activeSegmentId == null || loading || aiRunning}
          >
            {followMode ? '跟随当前段 ✓' : '质检当前段'}
          </Button>
        </Tooltip>
        <Button
          size="small"
          variant="outlined"
          startIcon={<FilePresentIcon />}
          onClick={handleScanFile}
          disabled={segments.length === 0 || loading || aiRunning}
        >
          全文件质检
        </Button>
        {aiRunning && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<StopIcon />}
            onClick={handleStopScan}
          >
            停止
          </Button>
        )}
        <Tooltip title="清空结果">
          <IconButton size="small" onClick={clearIssues} disabled={issues.length === 0 || aiRunning}>
            <CleaningServicesIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* AI 质检（可折叠，默认关闭） */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ alignItems: 'center', mb: showAiSection ? 1 : 0.5 }}
      >
        <Tooltip title={showAiSection ? '收起AI质检' : '展开AI质检'}>
          <IconButton size="small" onClick={() => setShowAiSection((v) => !v)} sx={{ p: 0.5 }}>
            {showAiSection ? <UnfoldLessIcon fontSize="small" /> : <UnfoldMoreIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <FormControlLabel
          control={<Switch size="small" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />}
          label={<Typography variant="caption">AI 质检</Typography>}
          sx={{ mr: 0 }}
        />
        {aiRunning && aiFileProgress && (
          <Typography variant="caption" color="primary">
            AI质检中 {aiFileProgress.done}/{aiFileProgress.total}
          </Typography>
        )}
        {aiTokenUsage && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: aiRunning && aiFileProgress ? 1 : 'auto' }}>
            ↑{aiTokenUsage.prompt_tokens} ↓{aiTokenUsage.completion_tokens} 共{aiTokenUsage.total_tokens}
          </Typography>
        )}
      </Stack>
      {showAiSection && aiEnabled && (
        <Box sx={{ mb: 1.5, pl: 0.5 }}>
          <TextField
            size="small"
            multiline
            minRows={3}
            maxRows={8}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="AI 质检提示词"
            sx={{ width: '100%', mb: 0.5 }}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button size="small" onClick={resetAiPrompt}>恢复默认</Button>
            {aiRunning && !aiFileProgress && (
              <Typography variant="caption" color="primary">AI质检中...</Typography>
            )}
          </Stack>
        </Box>
      )}

      {/* 自动标注开关 */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ alignItems: 'center', mb: 0.5 }}
      >
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={autoLabelEnabled}
              onChange={(e) => setAutoLabelEnabled(e.target.checked)}
            />
          }
          label={<Typography variant="caption">根据质检结果自动标注（无问题→通过/有Error→驳回/警告→审校中）</Typography>}
          sx={{ mr: 0 }}
        />
      </Stack>

      <Divider sx={{ mb: 1 }} />

      {/* 质检结果（按段分组） */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {groupedBySegment.length === 0 ? (
          <EmptyHint text={scanScope ? '质检通过，未发现问题' : '点击「质检当前段」开启跟随模式，或「全文件质检」批量检查'} />
        ) : (
          <Stack spacing={1}>
            {groupedBySegment.map(([segId, segIssues]) => (
              <Paper key={segId} variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    段 #{segId}
                  </Typography>
                  <Chip
                    label={`${segIssues.length}个问题`}
                    size="small"
                    color={segIssues.some((i) => i.severity === 'error') ? 'error' : 'default'}
                    sx={{ height: 20, fontSize: 11 }}
                  />
                  <Button
                    size="small"
                    sx={{ ml: 'auto', minWidth: 'auto', p: 0.25, fontSize: 11 }}
                    onClick={() => handleJumpTo(segId)}
                  >
                    跳转
                  </Button>
                </Stack>
                <Stack spacing={0.5}>
                  {segIssues.map((issue, idx) => (
                    <Stack
                      key={idx}
                      direction="row"
                      spacing={0.5}
                      sx={{ alignItems: 'flex-start' }}
                    >
                      {issue.type === 'custom' ? (
                        <SmartToyIcon fontSize="small" color="secondary" sx={{ fontSize: 16 }} />
                      ) : (
                        <SeverityIcon severity={issue.severity} />
                      )}
                      <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-word' }}>
                        {issue.type === 'custom' && (
                          <Box component="span" sx={{
                            display: 'inline-block',
                            fontSize: 10,
                            lineHeight: '14px',
                            px: 0.5,
                            mr: 0.5,
                            borderRadius: 0.5,
                            bgcolor: 'secondary.main',
                            color: 'secondary.contrastText',
                            verticalAlign: 'middle',
                          }}>
                            AI
                          </Box>
                        )}
                        <Box component="span" sx={{ fontWeight: 600, mr: 0.5 }}>
                          {QA_TYPE_LABEL[issue.type]}:
                        </Box>
                        {issue.message}
                      </Typography>
                      <Tooltip title="标记已解决">
                        <IconButton
                          size="small"
                          sx={{ p: 0.25 }}
                          onClick={() => resolveIssue(segId, issue.type, issue.message)}
                        >
                          <CheckCircleIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ))}
                  {/* AI 质检中占位 */}
                  {aiChecking[String(segId)] && (
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <SmartToyIcon fontSize="small" color="secondary" sx={{ fontSize: 16 }} />
                      <Typography
                        variant="caption"
                        color="secondary"
                        sx={{ flex: 1, display: 'flex', alignItems: 'center' }}
                      >
                        <Box component="span" sx={{
                          display: 'inline-block',
                          fontSize: 10,
                          lineHeight: '14px',
                          px: 0.5,
                          mr: 0.5,
                          borderRadius: 0.5,
                          bgcolor: 'secondary.main',
                          color: 'secondary.contrastText',
                        }}>
                          AI
                        </Box>
                        质检中
                        <Box component="span" sx={{
                          display: 'inline-block',
                          ml: 0.25,
                          width: '1.2em',
                          textAlign: 'left',
                          animation: 'qaDots 1.2s steps(4, end) infinite',
                        }}>
                          ...
                        </Box>
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

export function ProjectPanel(): ReactElement {
  return <FeatureProjectPanel />
}

export function ProjectDictionaryLibraryPanel(): ReactElement {
  const terms = useTermStore((s) => s.terms)
  const selectedIds = useTermStore((s) => s.selectedIds)
  const toggleSelect = useTermStore((s) => s.toggleSelect)
  const selectAll = useTermStore((s) => s.selectAll)
  const deleteTerm = useTermStore((s) => s.deleteTerm)
  const deleteTerms = useTermStore((s) => s.deleteTerms)
  const updateTerm = useTermStore((s) => s.updateTerm)
  const addTerms = useTermStore((s) => s.addTerms)
  const notify = useUIStore((s) => s.notify)

  // 隐藏的文件选择 input（用于导入）
  const importInputRef = useRef<HTMLInputElement>(null)

  // 导出：选中术语优先，无选中则导出全部；支持 xlsx / csv / json / txt
  const handleExport = useCallback((format: 'xlsx' | 'csv' | 'json' | 'txt') => {
    const selIds = Array.from(selectedIds)
    const list = selIds.length > 0
      ? terms.filter((t) => selIds.includes(t.id))
      : terms
    if (list.length === 0) {
      notify('warning', selIds.length > 0 ? '选中的术语为空，无法导出' : '词典库为空，无法导出')
      return
    }
    const stamp = new Date()
    const fname = `glossary_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}`
    // Excel：极简两列（原文/译文），可直接在 WPS/Excel 打开编辑
    if (format === 'xlsx') {
      import('xlsx').then((XLSX) => {
        const aoa: any[][] = [['原文', '译文']]
        for (const t of list) aoa.push([t.source, t.target])
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws['!cols'] = [{ wch: 30 }, { wch: 40 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '术语表')
        XLSX.writeFile(wb, `${fname}.xlsx`)
        notify('success', `已导出 ${list.length} 条术语到 ${fname}.xlsx`)
      }).catch((e) => notify('error', `导出失败：${(e as Error).message}`))
      return
    }
    let content = ''
    let mime = 'text/plain;charset=utf-8'
    let ext = format
    if (format === 'csv') {
      // CSV：原文,译文 两列，含表头；用双引号包裹避免逗号干扰
      const rows = ['source,target']
      for (const t of list) {
        rows.push(`"${t.source.replace(/"/g, '""')}","${t.target.replace(/"/g, '""')}"`)
      }
      // 加 BOM 让 Excel 正确识别 UTF-8
      content = '\uFEFF' + rows.join('\n')
      mime = 'text/csv;charset=utf-8'
    } else if (format === 'json') {
      content = JSON.stringify(list.map((t) => ({ source: t.source, target: t.target, createdAt: t.createdAt, updatedAt: t.updatedAt })), null, 2)
      mime = 'application/json;charset=utf-8'
    } else {
      // txt：每行 source \t target
      content = list.map((t) => `${t.source}\t${t.target}`).join('\n')
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fname
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify('success', `已导出 ${list.length} 条术语到 ${fname}`)
  }, [terms, selectedIds, notify])

  // 导入：解析文件（xlsx/xls/csv/json/txt），去重后写入术语库
  const handleImportFile = useCallback((file: File) => {
    const lower = file.name.toLowerCase()
    // Excel 格式（.xlsx/.xls）：走 xlsx 库二进制读取，读取第一个 sheet 两列（原文、译文）
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          import('xlsx').then((XLSX) => {
            const wb = XLSX.read(reader.result, { type: 'binary' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
            if (aoa.length === 0) { notify('warning', 'Excel 中没有数据'); return }
            // 识别表头：第一列是否为 原文/source/术语原文
            const first = aoa[0].map((c) => String(c ?? '').trim())
            const isHeader = first.length >= 2 && (
              first[0] === '原文' || first[0].toLowerCase() === 'source' || first[0] === '术语原文'
            )
            const pairs: Array<{ source: string; target: string }> = []
            for (let i = isHeader ? 1 : 0; i < aoa.length; i++) {
              const row = aoa[i].map((c) => String(c ?? '').trim())
              if (row.length >= 2 && row[0] && row[1]) {
                pairs.push({ source: row[0], target: row[1] })
              }
            }
            if (pairs.length === 0) { notify('warning', `Excel ${file.name} 中未解析到有效术语对`); return }
            const result = addTerms(pairs, 'skip')
            notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
          }).catch((e) => notify('error', `解析 Excel 失败：${(e as Error).message}`))
        } catch (err) { notify('error', `读取 ${file.name} 失败：${(err as Error).message}`) }
      }
      reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
      reader.readAsBinaryString(file)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      let pairs: Array<{ source: string; target: string }> = []
      try {
        if (lower.endsWith('.json')) {
          const data = JSON.parse(text)
          if (!Array.isArray(data)) throw new Error('JSON 必须是数组')
          for (const item of data) {
            if (item && typeof item === 'object' && typeof item.source === 'string' && typeof item.target === 'string') {
              pairs.push({ source: item.source, target: item.target })
            }
          }
        } else if (lower.endsWith('.csv')) {
          // 去掉可能的 BOM
          const raw = text.replace(/^\uFEFF/, '')
          const lines = raw.split(/\r?\n/).filter((l) => l.trim())
          // 跳过表头：若第一行是 source,target 或 原文,译文
          const firstCells = splitCsvLine(lines[0] ?? '')
          const isHeader = firstCells.length >= 2 && (
            firstCells[0].toLowerCase() === 'source' || firstCells[0] === '原文'
          )
          const startIdx = isHeader ? 1 : 0
          for (let i = startIdx; i < lines.length; i++) {
            const cells = splitCsvLine(lines[i])
            if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) {
              pairs.push({ source: cells[0], target: cells[1] })
            }
          }
        } else {
          // txt：每行按 Tab 分割（兼容 Excel 复制粘贴）；无 Tab 时按 1 个空格分割
          const lines = text.split(/\r?\n/).filter((l) => l.trim())
          for (const line of lines) {
            let cells: string[]
            if (line.includes('\t')) cells = line.split('\t')
            else cells = line.split(/\s{2,}|—|→/) // 兼容 "source  target" / "source — target" / "source → target"
            if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) {
              pairs.push({ source: cells[0].trim(), target: cells.slice(1).join(' ').trim() })
            }
          }
        }
      } catch (err) {
        notify('error', `解析失败：${(err as Error).message}`)
        return
      }
      if (pairs.length === 0) {
        notify('warning', `文件 ${file.name} 中未解析到有效术语对（需含原文和译文）`)
        return
      }
      const result = addTerms(pairs, 'skip')
      notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
    }
    reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
    reader.readAsText(file, 'utf-8')
  }, [addTerms, notify])

  const onImportInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const f of Array.from(files)) handleImportFile(f)
    // 清空 input，允许再次选择同一文件
    e.target.value = ''
  }, [handleImportFile])

  // 导出格式选择菜单
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null)

  // 排序状态：null=默认顺序，'source'|'createdAt'=排序字段，asc=升序
  const [sortField, setSortField] = useState<'source' | 'createdAt' | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  // 双击编辑的术语 id
  const [editingId, setEditingId] = useState<number | null>(null)
  // 编辑缓冲
  const [editSource, setEditSource] = useState('')
  const [editTarget, setEditTarget] = useState('')

  // 切换排序：点击同字段切换升降序，第三次恢复默认
  const handleSort = (field: 'source' | 'createdAt') => {
    if (sortField !== field) {
      setSortField(field)
      setSortAsc(true)
    } else if (sortAsc) {
      setSortAsc(false)
    } else {
      // 第三次点击恢复默认
      setSortField(null)
    }
  }

  // 排序后的术语列表
  const sortedTerms = useMemo(() => {
    if (!sortField) return terms
    const sorted = [...terms].sort((a, b) => {
      if (sortField === 'source') {
        return a.source.localeCompare(b.source)
      }
      return a.createdAt - b.createdAt
    })
    return sortAsc ? sorted : sorted.reverse()
  }, [terms, sortField, sortAsc])

  // 进入编辑状态
  const startEdit = (t: Term) => {
    setEditingId(t.id)
    setEditSource(t.source)
    setEditTarget(t.target)
  }
  // 保存编辑
  const saveEdit = () => {
    if (editingId == null) return
    const s = editSource.trim()
    const t = editTarget.trim()
    if (!s || !t) {
      notify('warning', '原文和译文都不能为空')
      return
    }
    updateTerm(editingId, { source: s, target: t })
    setEditingId(null)
  }
  // 取消编辑
  const cancelEdit = () => setEditingId(null)

  // 全选/取消全选（基于当前排序后的列表）
  const allIds = sortedTerms.map((t) => t.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const someSelected = allIds.some((id) => selectedIds.has(id))

  // 批量删除选中
  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      notify('info', '请先勾选要删除的术语')
      return
    }
    if (!window.confirm(`确认删除选中的 ${ids.length} 条术语？`)) return
    deleteTerms(ids)
    notify('success', `已删除 ${ids.length} 条术语`)
  }

  // 格式化时间
  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // 列头排序图标
  const sortIcon = (field: 'source' | 'createdAt') => {
    if (sortField !== field) return null
    return sortAsc ? <ArrowUpwardIcon sx={{ fontSize: 12 }} /> : <ArrowDownwardIcon sx={{ fontSize: 12 }} />
  }

  // 表格统一样式（Grid 布局，表头与行体共用同一列模板，保证对齐）
  // 行高 = 行内最高单元格高度（alignItems: stretch 统高 + 单元格 flex center 居中）
  const gridTemplate = '36px 1fr 1fr 1fr 56px'
  const thSx = { px: 1, py: 0.5, textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', borderBottom: 1, borderColor: 'divider', whiteSpace: 'nowrap', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' } as const
  const tdSx = { px: 1, py: 0.5, fontSize: '0.8125rem', borderBottom: 1, borderColor: 'divider', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, display: 'flex', alignItems: 'center' } as const

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column', p: 2 }}>
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <BookmarkIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1">项目词典库</Typography>
        <Box sx={{ flex: 1 }} />
        {selectedIds.size > 0 && (
          <Typography variant="caption" color="primary">
            已选 {selectedIds.size} 条
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">共 {terms.length} 条</Typography>
        <Tooltip title={`导入术语（Excel / CSV / JSON / TXT）`}>
          <IconButton
            size="small"
            onClick={() => importInputRef.current?.click()}
          >
            <FileUploadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={`导出术语${selectedIds.size > 0 ? `（选中 ${selectedIds.size} 条）` : '（全部）'}`}>
          <IconButton
            size="small"
            onClick={(e) => setExportAnchor(e.currentTarget)}
          >
            <FileDownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Divider className="panel-header" sx={{ mb: 1 }} />
      {/* 隐藏的文件选择 input：多选、接受 Excel/CSV/JSON/TXT */}
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.json,.txt,.tsv"
        multiple
        style={{ display: 'none' }}
        onChange={onImportInputChange}
      />
      {/* 导出格式选择菜单 */}
      <Menu
        open={!!exportAnchor}
        anchorEl={exportAnchor}
        onClose={() => setExportAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => { handleExport('xlsx'); setExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 Excel" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
        <MenuItem onClick={() => { handleExport('csv'); setExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 CSV" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
        <MenuItem onClick={() => { handleExport('json'); setExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 JSON" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
        <MenuItem onClick={() => { handleExport('txt'); setExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 TXT" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部术语'} />
        </MenuItem>
      </Menu>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {terms.length === 0 ? (
          <EmptyHint text="项目词典库暂无术语。可在「项目文件 → 项目词典」中添加，或双击下方区域新增。" />
        ) : (
          <Box sx={{ width: '100%' }}>
            {/* 表头（对齐方式：stretch 统高 + thSx 内 flex center） */}
            <Box sx={{ display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'stretch', bgcolor: 'action.hover', position: 'sticky', top: 0, zIndex: 1 }}>
              <Box sx={{ justifyContent: 'center', ...thSx }}>
                <Checkbox
                  size="small"
                  sx={{ p: 0.25 }}
                  checked={allSelected}
                  indeterminate={!allSelected && someSelected}
                  onChange={() => selectAll(allIds)}
                />
              </Box>
              <Box sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' }, ...thSx }} onClick={() => handleSort('source')}>
                <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', display: 'inline-flex' }}>
                  <span>原文</span>
                  {sortIcon('source')}
                </Stack>
              </Box>
              <Box sx={{ ...thSx }}>译文</Box>
              <Box sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' }, ...thSx }} onClick={() => handleSort('createdAt')}>
                <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', display: 'inline-flex' }}>
                  <span>创建时间</span>
                  {sortIcon('createdAt')}
                </Stack>
              </Box>
              <Box sx={{ justifyContent: 'center', ...thSx }}>
                <Tooltip title="删除选中">
                  <span>
                    <IconButton size="small" sx={{ p: 0.25 }} disabled={selectedIds.size === 0} onClick={handleDeleteSelected}>
                      <DeleteOutlineOutlinedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
            {/* 表体：alignItems: stretch 保证每列高度=行内最高者；tdSx 内 flex center 让内容垂直居中 */}
            {sortedTerms.map((t) => {
              const isSelected = selectedIds.has(t.id)
              const isEditing = editingId === t.id
              return (
                <Box
                  key={t.id}
                  sx={{
                    display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'stretch',
                    bgcolor: isEditing ? 'action.selected' : isSelected ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: isEditing ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Box sx={{ justifyContent: 'center', ...tdSx }}>
                    {!isEditing && (
                      <Checkbox
                        size="small"
                        sx={{ p: 0.25 }}
                        checked={isSelected}
                        onChange={() => toggleSelect(t.id)}
                      />
                    )}
                  </Box>
                  {isEditing ? (
                    <>
                      <Box sx={{ ...tdSx, pr: 0.5 }}>
                        <TextField
                          size="small"
                          fullWidth
                          value={editSource}
                          onChange={(e) => setEditSource(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit()
                            else if (e.key === 'Escape') cancelEdit()
                          }}
                          slotProps={{ htmlInput: { style: { paddingTop: 4, paddingBottom: 4 } } }}
                        />
                      </Box>
                      <Box sx={{ ...tdSx, pr: 0.5 }}>
                        <TextField
                          size="small"
                          fullWidth
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit()
                            else if (e.key === 'Escape') cancelEdit()
                          }}
                          slotProps={{ htmlInput: { style: { paddingTop: 4, paddingBottom: 4 } } }}
                        />
                      </Box>
                      <Box sx={{ ...tdSx, color: 'text.disabled' }}>
                        {formatTime(t.createdAt)}
                      </Box>
                      <Box sx={{ justifyContent: 'center', gap: 0.25, ...tdSx }}>
                        <Tooltip title="保存 (Enter)">
                          <IconButton size="small" sx={{ p: 0.25 }} onClick={saveEdit}>
                            <CheckIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="取消 (Esc)">
                          <IconButton size="small" sx={{ p: 0.25 }} onClick={cancelEdit}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </>
                  ) : (
                    <>
                      <Tooltip title={t.source} placement="top" enterDelay={400}>
                        <Box
                          sx={{ ...tdSx, color: 'text.secondary', cursor: 'text' }}
                          onDoubleClick={() => startEdit(t)}
                        >
                          {t.source}
                        </Box>
                      </Tooltip>
                      <Tooltip title={t.target} placement="top" enterDelay={400}>
                        <Box
                          sx={{ ...tdSx, cursor: 'text' }}
                          onDoubleClick={() => startEdit(t)}
                        >
                          {t.target}
                        </Box>
                      </Tooltip>
                      <Tooltip title={formatTime(t.createdAt)} placement="top" enterDelay={400}>
                        <Box
                          sx={{ ...tdSx, color: 'text.disabled', fontSize: '0.7rem', cursor: 'text' }}
                          onDoubleClick={() => startEdit(t)}
                        >
                          {formatTime(t.createdAt)}
                        </Box>
                      </Tooltip>
                      <Box sx={{ justifyContent: 'center', ...tdSx }}>
                        <Tooltip title="删除此条">
                          <IconButton
                            size="small"
                            sx={{ p: 0.25, opacity: 0, transition: 'opacity 0.15s', '.MuiBox-root:hover &': { opacity: 1 } }}
                            onClick={() => {
                              deleteTerm(t.id)
                              notify('success', '已删除')
                            }}
                          >
                            <DeleteOutlineOutlinedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function ProjectMemoryLibraryPanel(): ReactElement {
  const entries = useTMStore((s) => s.entries)
  const loading = useTMStore((s) => s.loading)
  const selectedIds = useTMStore((s) => s.selectedIds)
  const scope = useTMStore((s) => s.scope)
  const setScope = useTMStore((s) => s.setScope)
  const loadEntries = useTMStore((s) => s.loadEntries)
  const toggleSelect = useTMStore((s) => s.toggleSelect)
  const selectAll = useTMStore((s) => s.selectAll)
  const deleteEntry = useTMStore((s) => s.deleteEntry)
  const deleteEntries = useTMStore((s) => s.deleteEntries)
  const updateEntry = useTMStore((s) => s.updateEntry)
  const addEntry = useTMStore((s) => s.addEntry)
  const addEntries = useTMStore((s) => s.addEntries)
  const notify = useUIStore((s) => s.notify)

  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const projects = useProjectStore((s) => s.projects)
  const files = useProjectStore((s) => s.files)
  const segments = useProjectStore((s) => s.segments)
  const activeProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId) ?? null,
    [projects, currentProjectId],
  )
  const sourceLang = activeProject?.sourceLang
  const targetLang = activeProject?.targetLang

  // 隐藏的文件选择 input（用于导入）
  const tmImportInputRef = useRef<HTMLInputElement>(null)
  // 导出菜单锚点
  const [tmExportAnchor, setTmExportAnchor] = useState<HTMLElement | null>(null)

  // 解析 CSV 行（兼容双引号转义）
  const splitCsvLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++ }
          else inQ = false
        } else cur += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') { out.push(cur); cur = '' }
        else cur += ch
      }
    }
    out.push(cur)
    return out
  }

  // 导出：选中条目优先，无选中则全部；支持 xlsx/csv/json/txt（两列：原文/译文）
  const handleTmExport = useCallback((format: 'xlsx' | 'csv' | 'json' | 'txt') => {
    const selIds = Array.from(selectedIds)
    const list = selIds.length > 0
      ? entries.filter((e) => selIds.includes(e.id as number))
      : entries
    if (list.length === 0) {
      notify('warning', selIds.length > 0 ? '选中的记忆条目为空，无法导出' : '记忆库为空，无法导出')
      return
    }
    const stamp = new Date()
    const fname = `memory_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}_${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}`
    if (format === 'xlsx') {
      import('xlsx').then((XLSX) => {
        const aoa: any[][] = [['原文', '译文']]
        for (const t of list) aoa.push([t.source, t.target])
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws['!cols'] = [{ wch: 50 }, { wch: 60 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '记忆表')
        XLSX.writeFile(wb, `${fname}.xlsx`)
        notify('success', `已导出 ${list.length} 条记忆到 ${fname}.xlsx`)
      }).catch((e) => notify('error', `导出失败：${(e as Error).message}`))
      return
    }
    let content = ''
    let mime = 'text/plain;charset=utf-8'
    let ext = format
    if (format === 'csv') {
      const rows = ['source,target']
      for (const t of list) {
        rows.push(`"${t.source.replace(/"/g, '""')}","${t.target.replace(/"/g, '""')}"`)
      }
      content = '\uFEFF' + rows.join('\n')
      mime = 'text/csv;charset=utf-8'
    } else if (format === 'json') {
      content = JSON.stringify(list.map((t) => ({ source: t.source, target: t.target, sourceLang: t.sourceLang, targetLang: t.targetLang, meta: t.meta, createdAt: t.createdAt, updatedAt: t.updatedAt })), null, 2)
      mime = 'application/json;charset=utf-8'
    } else {
      content = list.map((t) => `${t.source}\t${t.target}`).join('\n')
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fname}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notify('success', `已导出 ${list.length} 条记忆到 ${fname}.${ext}`)
  }, [entries, selectedIds, notify])

  // 导入：解析文件（xlsx/xls/csv/json/txt），去重后写入记忆库
  const handleTmImportFile = useCallback((file: File) => {
    const sl = sourceLang ?? 'en'
    const tl = targetLang ?? 'zh-CN'
    const projId = scope === 'project' ? (currentProjectId ?? undefined) : undefined
    const lower = file.name.toLowerCase()
    // Excel 格式
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          import('xlsx').then(async (XLSX) => {
            const wb = XLSX.read(reader.result, { type: 'binary' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
            if (aoa.length === 0) { notify('warning', 'Excel 中没有数据'); return }
            const first = aoa[0].map((c) => String(c ?? '').trim())
            const isHeader = first.length >= 2 && (
              first[0] === '原文' || first[0].toLowerCase() === 'source' || first[0] === '记忆原文'
            )
            const pairs: Array<{ source: string; target: string }> = []
            for (let i = isHeader ? 1 : 0; i < aoa.length; i++) {
              const row = aoa[i].map((c) => String(c ?? '').trim())
              if (row.length >= 2 && row[0] && row[1]) pairs.push({ source: row[0], target: row[1] })
            }
            if (pairs.length === 0) { notify('warning', `Excel ${file.name} 中未解析到有效记忆对`); return }
            const result = await addEntries(pairs, { sourceLang: sl, targetLang: tl, projectId: projId }, 'skip')
            notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
          }).catch((e) => notify('error', `解析 Excel 失败：${(e as Error).message}`))
        } catch (err) { notify('error', `读取 ${file.name} 失败：${(err as Error).message}`) }
      }
      reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
      reader.readAsBinaryString(file)
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const text = String(reader.result ?? '')
      let pairs: Array<{ source: string; target: string }> = []
      try {
        if (lower.endsWith('.json')) {
          const data = JSON.parse(text)
          if (!Array.isArray(data)) throw new Error('JSON 必须是数组')
          for (const item of data) {
            if (item && typeof item === 'object' && typeof item.source === 'string' && typeof item.target === 'string') {
              pairs.push({ source: item.source, target: item.target })
            }
          }
        } else if (lower.endsWith('.csv')) {
          const raw = text.replace(/^\uFEFF/, '')
          const lines = raw.split(/\r?\n/).filter((l) => l.trim())
          const firstCells = splitCsvLine(lines[0] ?? '')
          const isHeader = firstCells.length >= 2 && (
            firstCells[0].toLowerCase() === 'source' || firstCells[0] === '原文'
          )
          const startIdx = isHeader ? 1 : 0
          for (let i = startIdx; i < lines.length; i++) {
            const cells = splitCsvLine(lines[i])
            if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) pairs.push({ source: cells[0], target: cells[1] })
          }
        } else {
          // txt：按 Tab/双空格/箭头等分割
          const lines = text.split(/\r?\n/).filter((l) => l.trim())
          for (const line of lines) {
            let cells: string[]
            if (line.includes('\t')) cells = line.split('\t')
            else cells = line.split(/\s{2,}|—|→/)
            if (cells.length >= 2 && cells[0].trim() && cells[1].trim()) {
              pairs.push({ source: cells[0].trim(), target: cells.slice(1).join(' ').trim() })
            }
          }
        }
      } catch (err) { notify('error', `解析失败：${(err as Error).message}`); return }
      if (pairs.length === 0) { notify('warning', `文件 ${file.name} 中未解析到有效记忆对`); return }
      const result = await addEntries(pairs, { sourceLang: sl, targetLang: tl, projectId: projId }, 'skip')
      notify('success', `导入完成：新增 ${result.added} 条，跳过重复 ${result.skipped} 条（共解析 ${pairs.length} 对）`)
    }
    reader.onerror = () => notify('error', `读取文件 ${file.name} 失败`)
    reader.readAsText(file, 'utf-8')
  }, [addEntries, sourceLang, targetLang, scope, currentProjectId, notify])

  const onTmImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) handleTmImportFile(files[i])
    }
    e.target.value = ''
  }

  // 双语导入整理面板
  const [importOpen, setImportOpen] = useState(false)

  // 同步当前项目已译段落到记忆库
  const [syncing, setSyncing] = useState(false)
  const handleSyncSegments = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      // 当前文件的 segments（store 中已加载的）
      const currentSegs = segments
        .filter((s) => s.source?.trim() && s.target?.trim())
      const currentFileId = currentSegs[0]?.fileId
      const currentFileName = currentFileId ? files.find((f) => f.id === currentFileId)?.name : undefined
      // 若项目文件数量多（还有其他文件），从 DB 拉其他文件的已译段落
      let otherSegs: Segment[] = []
      if (currentProjectId != null) {
        const currentFileIds = currentSegs.map((s) => s.fileId).filter((x): x is ID => x != null)
        const allFileIds = files.filter((f) => f.projectId === currentProjectId).map((f) => f.id).filter((x): x is ID => x != null)
        const missingFileIds = allFileIds.filter((id) => !currentFileIds.includes(id))
        if (missingFileIds.length > 0) {
          try {
            const rows = await db.segments.where('fileId').anyOf(missingFileIds as number[]).toArray()
            otherSegs = rows.filter((s) => s.source?.trim() && s.target?.trim())
          } catch { /* ignore */ }
        }
      }
      const allSegs = [...currentSegs, ...otherSegs]
      const sl = sourceLang ?? 'en'
      const tl = targetLang ?? 'zh-CN'
      const fileIdToName = new Map<ID, string>(
        files.filter((f) => f.id != null).map((f) => [f.id as ID, f.name]),
      )
      let added = 0
      let updated = 0
      const now = Date.now()
      for (const seg of allSegs) {
        const src = seg.source.trim()
        const tgt = seg.target.trim()
        const existing = await db.tmEntries
          .where('[source+target+sourceLang+targetLang]')
          .equals([src, tgt, sl, tl])
          .first()
        const fileName = currentFileName ?? fileIdToName.get(seg.fileId)
        if (existing) {
          await db.tmEntries.update(existing.id as number, {
            updatedAt: now,
            meta: fileName ? { sourceFile: fileName } : existing.meta,
            projectId: existing.projectId ?? (currentProjectId ?? undefined),
          })
          updated++
        } else {
          try {
            await db.tmEntries.add({
              source: src, target: tgt, sourceLang: sl, targetLang: tl,
              projectId: currentProjectId ?? undefined,
              meta: fileName ? { sourceFile: fileName } : undefined,
              createdAt: seg.createdAt ?? now,
              updatedAt: now,
              usageCount: 1, lastUsedAt: now,
            })
            added++
          } catch { /* 唯一索引冲突等 */ }
        }
      }
      // 刷新列表
      await loadEntries(currentProjectId, sourceLang, targetLang)
      notify('success', `同步完成：新增 ${added} 条，更新 ${updated} 条`)
    } finally {
      setSyncing(false)
    }
  }

  // 排序状态
  const [sortField, setSortField] = useState<'source' | 'createdAt' | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  // 双击编辑
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSource, setEditSource] = useState('')
  const [editTarget, setEditTarget] = useState('')

  // 加载数据：scope / 项目 / 语言对变化时触发
  useEffect(() => {
    loadEntries(currentProjectId, sourceLang, targetLang)
  }, [loadEntries, currentProjectId, sourceLang, targetLang, scope])

  // 切换排序
  const handleSort = (field: 'source' | 'createdAt') => {
    if (sortField !== field) {
      setSortField(field)
      setSortAsc(true)
    } else if (sortAsc) {
      setSortAsc(false)
    } else {
      setSortField(null)
    }
  }

  const sortedEntries = useMemo(() => {
    if (!sortField) return entries
    const sorted = [...entries].sort((a, b) => {
      if (sortField === 'source') return a.source.localeCompare(b.source)
      return a.createdAt - b.createdAt
    })
    return sortAsc ? sorted : sorted.reverse()
  }, [entries, sortField, sortAsc])

  const startEdit = (e: TMEntry) => {
    setEditingId(e.id as number)
    setEditSource(e.source)
    setEditTarget(e.target)
  }
  const saveEdit = async () => {
    if (editingId == null) return
    const s = editSource.trim()
    const t = editTarget.trim()
    if (!s || !t) {
      notify('warning', '原文和译文都不能为空')
      return
    }
    await updateEntry(editingId, { source: s, target: t })
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)

  const allIds = sortedEntries.map((e) => e.id as number)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const someSelected = allIds.some((id) => selectedIds.has(id))

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      notify('info', '请先勾选要删除的条目')
      return
    }
    if (!window.confirm(`确认删除选中的 ${ids.length} 条记忆？`)) return
    await deleteEntries(ids)
    notify('success', `已删除 ${ids.length} 条记忆`)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const sortIcon = (field: 'source' | 'createdAt') => {
    if (sortField !== field) return null
    return sortAsc ? <ArrowUpwardIcon sx={{ fontSize: 12 }} /> : <ArrowDownwardIcon sx={{ fontSize: 12 }} />
  }

  // Grid 列模板：复选 | 原文 | 译文 | 来源 | 创建时间 | 操作
  // 原文/译文用 1fr + 换行显示全文；来源/时间固定宽度
  const gridTemplate = '36px 1fr 1fr 120px 110px 56px'
  const thSx = { px: 1, py: 0.5, textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', borderBottom: 1, borderColor: 'divider', whiteSpace: 'nowrap', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis' } as const
  // 原文/译文单元格：允许换行显示全文；高度跟随行内最高字段，内容垂直居中
  const tdWrapSx = { px: 1, py: 0.5, fontSize: '0.8125rem', borderBottom: 1, borderColor: 'divider', whiteSpace: 'normal', wordBreak: 'break-word', minWidth: 0, display: 'flex', alignItems: 'center' } as const
  // 来源/时间/操作单元格：单行省略；高度跟随行内最高字段，内容垂直居中
  const tdSx = { px: 1, py: 0.5, fontSize: '0.8125rem', borderBottom: 1, borderColor: 'divider', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, display: 'flex', alignItems: 'center' } as const

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column', p: 2 }}>
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <MemoryIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1">项目记忆库</Typography>
        {sourceLang && targetLang && (
          <Typography variant="caption" color="text.disabled">
            {sourceLang} → {targetLang}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          value={scope}
          exclusive
          size="small"
          onChange={(_e, v) => v && setScope(v)}
        >
          <ToggleButton value="project" sx={{ px: 1, py: 0.25, fontSize: '0.7rem' }}>
            当前项目
          </ToggleButton>
          <ToggleButton value="global" sx={{ px: 1, py: 0.25, fontSize: '0.7rem' }}>
            全局
          </ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title={syncing ? '同步中...' : '同步当前项目已译段落（含所有文件）'}>
          <span>
            <IconButton
              size="small"
              sx={{ '&:hover': { bgcolor: 'action.hover' } }}
              onClick={handleSyncSegments}
              disabled={syncing}
            >
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <SyncIcon fontSize="small" sx={{ opacity: syncing ? 0.2 : 1 }} />
                {syncing && (
                  <CircularProgress
                    size={16}
                    sx={{ position: 'absolute', top: 0, left: 0 }}
                    color="primary"
                  />
                )}
              </Box>
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="导入记忆（支持 Excel/CSV/JSON/TXT，两列：原文/译文）">
          <IconButton
            size="small"
            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => tmImportInputRef.current?.click()}
          >
            <FileUploadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={selectedIds.size > 0 ? `导出选中 ${selectedIds.size} 条记忆` : '导出全部记忆'}>
          <IconButton
            size="small"
            sx={{ '&:hover': { bgcolor: 'action.hover' } }}
            onClick={(e) => setTmExportAnchor(e.currentTarget)}
          >
            <FileDownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="导入双语（粘贴/上传文本，在校对表格中整理对齐后导入）">
          <IconButton
            size="small"
            sx={{ color: 'primary.main', '&:hover': { bgcolor: 'action.hover' } }}
            onClick={() => setImportOpen(true)}
          >
            <VerticalAlignBottomIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {selectedIds.size > 0 && (
          <Typography variant="caption" color="primary">
            已选 {selectedIds.size} 条
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">共 {entries.length} 条</Typography>
      </Stack>
      <Divider className="panel-header" sx={{ mb: 1 }} />
      {/* 记忆导入隐藏 input */}
      <input
        ref={tmImportInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.json,.txt,.tsv"
        multiple
        style={{ display: 'none' }}
        onChange={onTmImportInputChange}
      />
      {/* 记忆导出菜单 */}
      <Menu
        open={!!tmExportAnchor}
        anchorEl={tmExportAnchor}
        onClose={() => setTmExportAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => { handleTmExport('xlsx'); setTmExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 Excel" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTmExport('csv'); setTmExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 CSV" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTmExport('json'); setTmExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 JSON" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
        <MenuItem onClick={() => { handleTmExport('txt'); setTmExportAnchor(null) }}>
          <ListItemIcon><FilePresentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="导出为 TXT" secondary={selectedIds.size > 0 ? `仅选中 ${selectedIds.size} 条` : '全部记忆'} />
        </MenuItem>
      </Menu>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {loading ? (
          <Typography variant="body2" color="text.secondary">加载中...</Typography>
        ) : entries.length === 0 ? (
          <EmptyHint text={`项目记忆库暂无条目。可在「项目文件 → 项目记忆」中添加，或通过导入功能批量导入。${scope === 'global' ? '（当前为全局视图，仅显示跨项目共享的记忆）' : ''}`} />
        ) : (
          <Box sx={{ width: '100%' }}>
            {/* 表头 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'center', bgcolor: 'action.hover', position: 'sticky', top: 0, zIndex: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', ...thSx }}>
                <Checkbox
                  size="small"
                  sx={{ p: 0.25 }}
                  checked={allSelected}
                  indeterminate={!allSelected && someSelected}
                  onChange={() => selectAll(allIds)}
                />
              </Box>
              <Box sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' }, ...thSx }} onClick={() => handleSort('source')}>
                <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', display: 'inline-flex' }}>
                  <span>原文</span>
                  {sortIcon('source')}
                </Stack>
              </Box>
              <Box sx={{ ...thSx }}>译文</Box>
              <Box sx={{ ...thSx }}>来源</Box>
              <Box sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' }, ...thSx }} onClick={() => handleSort('createdAt')}>
                <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', display: 'inline-flex' }}>
                  <span>创建时间</span>
                  {sortIcon('createdAt')}
                </Stack>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', ...thSx }}>
                <Tooltip title="删除选中">
                  <span>
                    <IconButton size="small" sx={{ p: 0.25 }} disabled={selectedIds.size === 0} onClick={handleDeleteSelected}>
                      <DeleteOutlineOutlinedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
            {/* 表体 */}
            {sortedEntries.map((e) => {
              const id = e.id as number
              const isSelected = selectedIds.has(id)
              const isEditing = editingId === id
              const sourceFile = e.meta?.sourceFile
              return (
                <Box
                  key={id}
                  sx={{
                    display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'stretch',
                    bgcolor: isEditing ? 'action.selected' : isSelected ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: isEditing ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Box sx={{ ...tdSx, justifyContent: 'center' }}>
                    {!isEditing && (
                      <Checkbox
                        size="small"
                        sx={{ p: 0.25 }}
                        checked={isSelected}
                        onChange={() => toggleSelect(id)}
                      />
                    )}
                  </Box>
                  {isEditing ? (
                    <>
                      <Box sx={{ ...tdWrapSx, pr: 0.5, display: 'block' }}>
                        <TextField
                          size="small"
                          fullWidth
                          multiline
                          maxRows={4}
                          value={editSource}
                          onChange={(ev) => setEditSource(ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); saveEdit() }
                            else if (ev.key === 'Escape') cancelEdit()
                          }}
                        />
                      </Box>
                      <Box sx={{ ...tdWrapSx, pr: 0.5, display: 'block' }}>
                        <TextField
                          size="small"
                          fullWidth
                          multiline
                          maxRows={4}
                          value={editTarget}
                          onChange={(ev) => setEditTarget(ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); saveEdit() }
                            else if (ev.key === 'Escape') cancelEdit()
                          }}
                        />
                      </Box>
                      <Box sx={{ ...tdSx, color: 'text.disabled' }}>
                        {sourceFile ?? '—'}
                      </Box>
                      <Box sx={{ ...tdSx, color: 'text.disabled' }}>
                        {formatTime(e.createdAt)}
                      </Box>
                      <Box sx={{ ...tdSx, justifyContent: 'center', gap: 0.25 }}>
                        <Tooltip title="保存 (Enter)">
                          <IconButton size="small" sx={{ p: 0.25 }} onClick={saveEdit}>
                            <CheckIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="取消 (Esc)">
                          <IconButton size="small" sx={{ p: 0.25 }} onClick={cancelEdit}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </>
                  ) : (
                    <>
                      <Box
                        sx={{ ...tdWrapSx, color: 'text.secondary', cursor: 'text' }}
                        onDoubleClick={() => startEdit(e)}
                      >
                        {e.source}
                      </Box>
                      <Box
                        sx={{ ...tdWrapSx, cursor: 'text' }}
                        onDoubleClick={() => startEdit(e)}
                      >
                        {hasRichTextHtml(e.target) ? (
                          <span dangerouslySetInnerHTML={{ __html: e.target }} />
                        ) : (
                          e.target
                        )}
                      </Box>
                      <Tooltip title={sourceFile ?? ''} placement="top" enterDelay={400}>
                        <Box
                          sx={{ ...tdSx, color: 'text.disabled', cursor: 'text' }}
                          onDoubleClick={() => startEdit(e)}
                        >
                          {sourceFile ?? '—'}
                        </Box>
                      </Tooltip>
                      <Tooltip title={formatTime(e.createdAt)} placement="top" enterDelay={400}>
                        <Box
                          sx={{ ...tdSx, color: 'text.disabled', fontSize: '0.7rem', cursor: 'text' }}
                          onDoubleClick={() => startEdit(e)}
                        >
                          {formatTime(e.createdAt)}
                        </Box>
                      </Tooltip>
                      <Box sx={{ ...tdSx, justifyContent: 'center' }}>
                        <Tooltip title="删除此条">
                          <IconButton
                            size="small"
                            sx={{ p: 0.25, opacity: 0, transition: 'opacity 0.15s', '.MuiBox-root:hover &': { opacity: 1 } }}
                            onClick={async () => {
                              await deleteEntry(id)
                              notify('success', '已删除')
                            }}
                          >
                            <DeleteOutlineOutlinedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
      <BilingualImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        sourceLang={sourceLang}
        targetLang={targetLang}
        projectId={currentProjectId ?? undefined}
        onImported={() => loadEntries(currentProjectId, sourceLang, targetLang)}
        notify={notify}
      />
    </Box>
  )
}

export function FragmentSearchPanel(): ReactElement {
  const segments = useProjectStore((s) => s.segments)
  const activeSegmentId = useProjectStore((s) => s.activeSegmentId)
  const activeFileId = useProjectStore((s) => s.activeFileId)
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const selectSegment = useProjectStore((s) => s.selectSegment)
  const selectFile = useProjectStore((s) => s.selectFile)
  const [keyword, setKeyword] = useState('')
  const [scope, setScope] = useState<SearchScope>('file')
  // 整个项目范围下：异步加载的聚合结果
  const [projectHits, setProjectHits] = useState<ProjectHit[]>([])
  const [projectLoading, setProjectLoading] = useState(false)

  // 翻译联动：接收外部关键词（如选中原文后自动搜索）
  const linkageKeyword = useLinkageFragmentSearchStore((s) => s.queryKeyword)
  const linkageTimestamp = useLinkageFragmentSearchStore((s) => s.queryTimestamp)
  useEffect(() => {
    if (linkageKeyword) setKeyword(linkageKeyword)
  }, [linkageKeyword, linkageTimestamp])

  // 整个项目搜索：切换范围、项目、关键词时触发异步加载
  useEffect(() => {
    if (scope !== 'project') {
      setProjectHits([])
      return
    }
    const kw = keyword.trim().toLowerCase()
    if (!kw || currentProjectId == null) {
      setProjectHits([])
      return
    }
    let cancelled = false
    setProjectLoading(true)
    ;(async () => {
      try {
        // 1) 整个项目的所有文件（当前 projectId）
        const projectFiles = await db.files.where({ projectId: currentProjectId as number }).toArray()
        if (projectFiles.length === 0) {
          if (!cancelled) { setProjectHits([]); setProjectLoading(false) }
          return
        }
        const fileIdToName = new Map(projectFiles.map((f) => [f.id as number, f.name]))
        // 2) 按文件分批拉 segments（segments 有 fileId 索引，Dexie 自动批量）
        const fileIds = projectFiles.map((f) => f.id as number)
        const rows = await db.segments.where('fileId').anyOf(fileIds).sortBy('index')
        // 3) 过滤 + 聚合
        const hits: ProjectHit[] = []
        for (const seg of rows) {
          const src = (seg.source ?? '').toLowerCase()
          const tgt = (seg.target ?? '').toLowerCase()
          if (src.includes(kw) || tgt.includes(kw)) {
            hits.push({
              segment: seg,
              fileName: fileIdToName.get(seg.fileId as number) ?? '（未知文件）',
            })
          }
        }
        if (!cancelled) {
          setProjectHits(hits)
          setProjectLoading(false)
        }
      } catch (err) {
        console.error('[fragmentSearch:project]', err)
        if (!cancelled) {
          setProjectHits([])
          setProjectLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [scope, keyword, currentProjectId])

  // 当前文件范围的过滤结果（同步）
  const fileFiltered = useMemo(() => {
    const kw = keyword.trim()
    if (!kw) return []
    const lower = kw.toLowerCase()
    return segments.filter((s) => {
      const src = (s.source ?? '').toLowerCase()
      const tgt = (s.target ?? '').toLowerCase()
      return src.includes(lower) || tgt.includes(lower)
    })
  }, [keyword, segments])

  // 跳转到对应段：若在"整个项目"范围内，命中的文件不同则先切换文件
  const jumpTo = useCallback(async (seg: Segment) => {
    if (seg.fileId !== activeFileId) {
      await selectFile(seg.fileId ?? null)
    }
    selectSegment(seg.id ?? null)
  }, [activeFileId, selectFile, selectSegment])

  const hits = scope === 'file'
    ? fileFiltered.map((s) => ({ segment: s, fileName: null as string | null }))
    : projectHits.map((h) => ({ segment: h.segment, fileName: h.fileName as string | null }))

  const isEmpty = scope === 'project'
    ? !projectLoading && (!keyword.trim() || projectHits.length === 0)
    : (!keyword.trim() || fileFiltered.length === 0)

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column' }}>
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ManageSearchIcon color="primary" />
          <Typography variant="h6">片段搜索</Typography>
        </Stack>
        <ToggleButtonGroup
          value={scope}
          exclusive
          size="small"
          onChange={(_e, v) => v && setScope(v as SearchScope)}
        >
          <ToggleButton value="file" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
            当前文件
          </ToggleButton>
          <ToggleButton value="project" sx={{ px: 1, py: 0.25, fontSize: '0.75rem' }}>
            整个项目
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Divider className="panel-header" sx={{ my: 1 }} />
      <TextField
        size="small"
        fullWidth
        placeholder={scope === 'file' ? '在当前文件搜索原文/译文...' : '在整个项目搜索原文/译文...'}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        sx={{ mb: 1 }}
        slotProps={{ htmlInput: { style: { paddingTop: 8, paddingBottom: 8 } } }}
      />
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {scope === 'project' && projectLoading ? (
          <Typography variant="body2" color="text.secondary">
            搜索中...
          </Typography>
        ) : isEmpty ? (
          <Typography variant="body2" color="text.secondary">
            {!keyword.trim() ? '请输入关键词开始搜索。' : '未找到匹配片段。'}
          </Typography>
        ) : (
          <Stack spacing={0.25}>
            {hits.map(({ segment: s, fileName }) => {
              const isActive = s.id === activeSegmentId
              return (
                <Box
                  key={`${s.fileId}_${s.id}`}
                  sx={{
                    px: 1,
                    py: 0.75,
                    borderRadius: 0.5,
                    bgcolor: isActive ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: isActive ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      onClick={() => jumpTo(s)}
                      onMouseDown={(e) => e.stopPropagation()}
                      sx={{ minWidth: 32, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                    >
                      #{s.index}
                    </Typography>
                    {fileName && (
                      <Tooltip title={fileName}>
                        <Typography variant="caption" color="text.disabled" sx={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: 110,
                        }}>
                          · {fileName}
                        </Typography>
                      </Tooltip>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Tooltip title={`跳转到第 ${s.index} 段${fileName ? `（${fileName}）` : ''}`}>
                      <span>
                        <IconButton
                          size="small"
                          sx={{ p: 0.25 }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => jumpTo(s)}
                        >
                          <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="发送原文到译文光标位置（选中原文字优先）">
                      <IconButton
                        size="small"
                        sx={{ p: 0.25 }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => sendTextToTarget(s.source ?? '')}
                        disabled={!s.source}
                      >
                        <SendIcon sx={{ fontSize: 12 }} />
                        <Box
                          sx={{
                            ml: 0.25,
                            fontSize: 9,
                            lineHeight: 1,
                            color: 'text.secondary',
                            alignSelf: 'flex-end',
                            pb: 0.25,
                          }}
                        >
                          原
                        </Box>
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="发送译文到译文光标位置（选中译文优先）">
                      <IconButton
                        size="small"
                        sx={{ p: 0.25 }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => sendTextToTarget(s.target ?? '')}
                        disabled={!s.target}
                      >
                        <SendIcon sx={{ fontSize: 12 }} />
                        <Box
                          sx={{
                            ml: 0.25,
                            fontSize: 9,
                            lineHeight: 1,
                            color: 'text.secondary',
                            alignSelf: 'flex-end',
                            pb: 0.25,
                          }}
                        >
                          译
                        </Box>
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <ExpandableText variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
                    {s.source}
                  </ExpandableText>
                  {s.target ? (
                    <ExpandableText
                      variant="body2"
                      color="text.primary"
                      html={hasRichTextHtml(s.target)}
                    >
                      {s.target}
                    </ExpandableText>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ mb: 0.25 }}>
                      （暂无译文）
                    </Typography>
                  )}
                </Box>
              )
            })}
          </Stack>
        )}
      </Box>
    </Box>
  )
}

export function SettingsPanel(): ReactElement {
  // 一级 Accordion 互斥：基本设置 / 词典查询 / 机器翻译 / AI问答 / 数据备份，一次只展开一个
  const [level1Expanded, setLevel1Expanded] = useState<string>('basic')
  const handleL1Expand = (panel: string) => (_e: unknown, isExpanded: boolean) => {
    setLevel1Expanded(isExpanded ? panel : '')
  }

  return (
    <Box sx={{ ..._sty, overflowY: 'auto' }}>
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <SettingsIcon color="primary" />
        <Typography variant="h6">设置</Typography>
      </Stack>
      <Divider className="panel-header" sx={{ my: 1 }} />

      {/* 一级：基本设置（字体 + 字号） */}
      <Accordion expanded={level1Expanded === 'basic'} onChange={handleL1Expand('basic')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <PaletteIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>基本设置</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1 }}>
          <BasicSettingsSection />
        </AccordionDetails>
      </Accordion>

      {/* 一级：词典查询 */}
      <Accordion expanded={level1Expanded === 'dictionary'} onChange={handleL1Expand('dictionary')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LanguageIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>词典查询</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1 }}>
          <DictionarySettingsSection />
        </AccordionDetails>
      </Accordion>

      {/* 一级：机器翻译 */}
      <Accordion expanded={level1Expanded === 'mt'} onChange={handleL1Expand('mt')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <SmartToyIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>机器翻译</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1 }}>
          <MachineTranslationSettingsSection />
        </AccordionDetails>
      </Accordion>

      {/* 一级：AI问答 */}
      <Accordion expanded={level1Expanded === 'aiqa'} onChange={handleL1Expand('aiqa')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <AutoAwesomeMotionIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>AI问答</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1 }}>
          <AiQASettingsSection />
        </AccordionDetails>
      </Accordion>

      {/* 一级：数据备份（自动快照 + 本地备份提醒） */}
      <Accordion expanded={level1Expanded === 'backup'} onChange={handleL1Expand('backup')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <BackupIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>数据备份</Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1 }}>
          <BackupSettingsSection />
        </AccordionDetails>
      </Accordion>
    </Box>
  )
}

/** 基本设置：字体选择 + 字号调节（全局 CSS 变量作用于 rc-dock 内容区） */
function BasicSettingsSection(): ReactElement {
  const fontFamilyId = useUiAppearanceStore((s) => s.fontFamilyId)
  const fontSize = useUiAppearanceStore((s) => s.fontSize)
  const setFontFamilyId = useUiAppearanceStore((s) => s.setFontFamilyId)
  const setFontSize = useUiAppearanceStore((s) => s.setFontSize)
  const resetAppearance = useUiAppearanceStore((s) => s.resetAppearance)

  const isDefault = fontFamilyId === 'system' && fontSize === DEFAULT_FONT_SIZE

  const handleFontSizeSlider = (_e: Event, value: number | number[]) => {
    setFontSize(Array.isArray(value) ? value[0] : value)
  }
  const handleFontSizeInput = (e: ChangeEvent<HTMLInputElement>) => {
    const n = parseInt(e.target.value, 10)
    if (!Number.isNaN(n)) setFontSize(n)
  }

  return (
    <Stack direction="column" spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        设置作用于所有功能卡片的内容区（项目文件、双语编辑器、翻译记忆等），不影响顶部菜单栏、底部状态栏以及 rc-dock 的 Tab 按钮与分隔条。
      </Typography>

      {/* 字体选择 */}
      <FormControl size="small" fullWidth>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
          <TextFieldsIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <InputLabel sx={{ position: 'relative' }} shrink>字体</InputLabel>
        </Stack>
        <Select
          value={fontFamilyId}
          onChange={(e) => setFontFamilyId(e.target.value as string)}
          size="small"
        >
          {FONT_PRESETS.map((f) => (
            <MenuItem key={f.id} value={f.id}>
              <Box sx={{ fontFamily: f.fontFamily }}>{f.label}</Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* 基准字号 */}
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
          <FormatSizeIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography variant="caption" color="text.secondary">
            基准字号（body2 层级）
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={`恢复默认（${DEFAULT_FONT_SIZE}px）`}>
            <span>
              <IconButton
                size="small"
                onClick={resetAppearance}
                disabled={isDefault}
                sx={{ p: 0.25 }}
              >
                <RestartAltIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Slider
            size="small"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={fontSize}
            onChange={handleFontSizeSlider}
            valueLabelDisplay="auto"
            marks={[
              { value: MIN_FONT_SIZE, label: `${MIN_FONT_SIZE}px` },
              { value: DEFAULT_FONT_SIZE, label: `${DEFAULT_FONT_SIZE}px` },
              { value: MAX_FONT_SIZE, label: `${MAX_FONT_SIZE}px` },
            ]}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            type="number"
            value={fontSize}
            onChange={handleFontSizeInput}
            slotProps={{ htmlInput: { min: MIN_FONT_SIZE, max: MAX_FONT_SIZE, step: 1 } }}
            sx={{ width: 72 }}
          />
        </Stack>
      </Box>

      {/* 预览 */}
      <Box
        sx={{
          mt: 0.5,
          p: 1.25,
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'action.hover',
        }}
      >
        <Typography
          variant="subtitle2"
          gutterBottom
          sx={{
            fontFamily: FONT_PRESETS.find((f) => f.id === fontFamilyId)?.fontFamily ?? 'inherit',
            fontSize: `${Math.round(fontSize * 1.07)}px`,
          }}
        >
          预览：The quick brown fox jumps over the lazy dog. 敏捷的棕色狐狸跳过懒狗。
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontFamily: FONT_PRESETS.find((f) => f.id === fontFamilyId)?.fontFamily ?? 'inherit',
            fontSize: `${fontSize}px`,
          }}
        >
          正文正文（body2）：这是正文基准字号，用于所有功能卡片的主要文本显示。
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.25,
            fontFamily: FONT_PRESETS.find((f) => f.id === fontFamilyId)?.fontFamily ?? 'inherit',
            fontSize: `${Math.round(fontSize * 0.86)}px`,
            color: 'text.secondary',
          }}
        >
          Caption 说明文字（约 0.86x），用于次要信息展示。
        </Typography>
      </Box>
    </Stack>
  )
}

/** 机器翻译设置区：Accordion 互斥展开，网页嵌入/API 调用两种方式 */
function MachineTranslationSettingsSection(): ReactElement {
  const mode = useMachineTranslationStore((s) => s.mode)
  const web = useMachineTranslationStore((s) => s.web)
  const api = useMachineTranslationStore((s) => s.api)
  const setMode = useMachineTranslationStore((s) => s.setMode)
  const toggleWeb = useMachineTranslationStore((s) => s.toggleWeb)
  const setApi = useMachineTranslationStore((s) => s.setApi)

  // Accordion 互斥：一次只展开一个。默认展开"网页嵌入"
  const [expanded, setExpanded] = useState<string>(mode === 'api' ? 'api' : 'web')
  const handleExpand = (panel: string) => (_e: unknown, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : '')
  }

  const webKeys = Object.keys(MT_WEB_LABEL) as (keyof MtWebState)[]

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        选择翻译方式。"机器翻译"按钮会按此处设置调用对应翻译。
      </Typography>

      {/* 方式切换：单选 */}
      <RadioGroup
        row
        value={mode}
        onChange={(e) => {
          const m = e.target.value as 'web' | 'api'
          setMode(m)
          setExpanded(m)
        }}
        sx={{ mb: 1 }}
      >
        <FormControlLabel value="web" control={<Radio size="small" />} label="网页嵌入" />
        <FormControlLabel value="api" control={<Radio size="small" />} label="API 调用" />
      </RadioGroup>

      {/* 网页嵌入面板（默认展开） */}
      <Accordion expanded={expanded === 'web'} onChange={handleExpand('web')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LanguageIcon fontSize="small" color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>网页嵌入</Typography>
            <Typography variant="caption" color="text.secondary">
              （通过 iframe 加载翻译网页）
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            可勾选多个，在机器翻译面板中切换查看。实测 6 个国内翻译网页均支持嵌入
          </Typography>
          {webKeys.map((k) => (
            <FormControlLabel
              key={k}
              control={
                <Checkbox size="small" checked={web[k]} onChange={() => toggleWeb(k)} />
              }
              label={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <span>{MT_WEB_LABEL[k]}</span>
                  {MT_EMBED_UNSUPPORTED.has(k) && (
                    <Tooltip title="该网站禁止 iframe 嵌入，将在新窗口打开">
                      <OpenInNewIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                    </Tooltip>
                  )}
                </Stack>
              }
            />
          ))}
        </AccordionDetails>
      </Accordion>

      {/* API 调用面板 */}
      <Accordion expanded={expanded === 'api'} onChange={handleExpand('api')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CloudIcon fontSize="small" color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>API 调用</Typography>
            <Typography variant="caption" color="text.secondary">
              （直接返回译文，体验更佳）
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            需配置密钥。仅支持浏览器可直连的 API（百度、彩云）。腾讯/阿里云需后端代理，暂不支持
          </Typography>
          {/* 百度翻译 API */}
          <Box sx={{ mb: 2, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={api.baidu.enabled}
                  onChange={() => setApi('baidu', { enabled: !api.baidu.enabled })}
                />
              }
              label={<Typography variant="body2" sx={{ fontWeight: 500 }}>{MT_API_LABEL.baidu}</Typography>}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, pl: 3 }}>
              免费额度 5 万字/月，QPS=1。需在 fanyi-api.baidu.com 注册获取
            </Typography>
            <Stack direction="row" spacing={1} sx={{ px: 3 }}>
              <TextField
                size="small"
                label="AppID"
                value={api.baidu.appId}
                onChange={(e) => setApi('baidu', { appId: e.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="密钥"
                type="password"
                value={api.baidu.secret}
                onChange={(e) => setApi('baidu', { secret: e.target.value })}
                sx={{ flex: 1 }}
              />
            </Stack>
          </Box>
          {/* 彩云小译 API */}
          <Box sx={{ mb: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={api.caiyun.enabled}
                  onChange={() => setApi('caiyun', { enabled: !api.caiyun.enabled })}
                />
              }
              label={<Typography variant="body2" sx={{ fontWeight: 500 }}>{MT_API_LABEL.caiyun}</Typography>}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, pl: 3 }}>
              免费额度 100 万字/月。需在 dashboard.caiyunapp.com 获取 token
            </Typography>
            <Stack direction="row" spacing={1} sx={{ px: 3 }}>
              <TextField
                size="small"
                label="Token"
                type="password"
                fullWidth
                value={api.caiyun.token}
                onChange={(e) => setApi('caiyun', { token: e.target.value })}
              />
            </Stack>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  )
}

/** 词典查询设置区：Accordion 互斥展开，在线/本地两种方式 */
function DictionarySettingsSection(): ReactElement {
  const mode = useDictionaryStore((s) => s.mode)
  const online = useDictionaryStore((s) => s.online)
  const local = useDictionaryStore((s) => s.local)
  const setMode = useDictionaryStore((s) => s.setMode)
  const toggleOnline = useDictionaryStore((s) => s.toggleOnline)
  const toggleLocal = useDictionaryStore((s) => s.toggleLocal)

  // Accordion 互斥：一次只展开一个。默认展开"在线词典"面板（按用户需求）
  const [expanded, setExpanded] = useState<string>(mode === 'local' ? 'local' : 'online')
  const handleExpand = (panel: string) => (_e: unknown, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : '')
  }

  const onlineKeys = Object.keys(ONLINE_DICT_LABEL) as (keyof OnlineDictState)[]
  const localKeys = Object.keys(LOCAL_DICT_LABEL) as (keyof LocalDictState)[]

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        选择查询方式并勾选词典来源。"词典查询"按钮会按此处设置调用对应词典。
      </Typography>

      {/* 方式切换：单选，决定展开哪个 Accordion */}
      <RadioGroup
        row
        value={mode}
        onChange={(e) => {
          const m = e.target.value as 'online' | 'local'
          setMode(m)
          // 切换方式时自动展开对应面板
          setExpanded(m)
        }}
        sx={{ mb: 1 }}
      >
        <FormControlLabel value="online" control={<Radio size="small" />} label="在线网页词典" />
        <FormControlLabel value="local" control={<Radio size="small" />} label="本地词典软件" />
      </RadioGroup>

      {/* 在线词典面板（默认展开） */}
      <Accordion expanded={expanded === 'online'} onChange={handleExpand('online')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CloudIcon fontSize="small" color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>在线网页词典</Typography>
            <Typography variant="caption" color="text.secondary">
              （通过 iframe 加载网页）
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            可勾选多个，在词典查询面板中切换查看
          </Typography>
          {onlineKeys.map((k) => (
            <FormControlLabel
              key={k}
              control={
                <Checkbox
                  size="small"
                  checked={online[k]}
                  onChange={() => toggleOnline(k)}
                />
              }
              label={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <span>{ONLINE_DICT_LABEL[k]}</span>
                  {EMBED_UNSUPPORTED.has(k) && (
                    <Tooltip title="该词典网站禁止 iframe 嵌入，将在新窗口打开">
                      <OpenInNewIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                    </Tooltip>
                  )}
                </Stack>
              }
            />
          ))}
        </AccordionDetails>
      </Accordion>

      {/* 本地词典面板 */}
      <Accordion expanded={expanded === 'local'} onChange={handleExpand('local')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <MemoryIcon fontSize="small" color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>本地词典软件</Typography>
            <Typography variant="caption" color="text.secondary">
              （通过自定义协议调用）
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            需本地已安装对应词典软件。点击查询时弹出本地软件窗口
          </Typography>
          {localKeys.map((k) => (
            <FormControlLabel
              key={k}
              control={
                <Checkbox
                  size="small"
                  checked={local[k]}
                  onChange={() => toggleLocal(k)}
                />
              }
              label={LOCAL_DICT_LABEL[k]}
            />
          ))}
        </AccordionDetails>
      </Accordion>
    </Box>
  )
}

export const PANEL_ICONS: Record<string, ReactElement> = {
  editor: <TranslateIcon fontSize="small" />,
  tm: <LibraryBooksIcon fontSize="small" />,
  tb: <BookmarkIcon fontSize="small" />,
  mt: <AutoAwesomeIcon fontSize="small" />,
  qa: <AssessmentIcon fontSize="small" />,
  project: <FolderIcon fontSize="small" />,
  settings: <SettingsIcon fontSize="small" />,
}

/** AI问答设置区：Accordion 互斥展开，API 调用 / 网页嵌入 */
function AiQASettingsSection(): ReactElement {
  const mode = useAiQAStore((s) => s.mode)
  const providers = useAiQAStore((s) => s.providers)
  const setMode = useAiQAStore((s) => s.setMode)
  const setProvider = useAiQAStore((s) => s.setProvider)
  const toggleProvider = useAiQAStore((s) => s.toggleProvider)

  const [expanded, setExpanded] = useState<string>(mode === 'web' ? 'web' : 'api')
  const handleExpand = (panel: string) => (_e: unknown, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : '')
  }

  const pKeys = Object.keys(AI_PROVIDER_META) as AiProviderKey[]

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        "AI解释"按钮调用大模型 API 解释选中文本含义并推荐译法。
      </Typography>

      <RadioGroup
        row
        value={mode}
        onChange={(e) => {
          const m = e.target.value as 'api' | 'web'
          setMode(m)
          setExpanded(m)
        }}
        sx={{ mb: 1 }}
      >
        <FormControlLabel value="api" control={<Radio size="small" />} label="API 调用" />
        <FormControlLabel value="web" control={<Radio size="small" />} label="网页嵌入" />
      </RadioGroup>

      <Accordion expanded={expanded === 'api'} onChange={handleExpand('api')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CloudIcon fontSize="small" color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>API 调用</Typography>
            <Typography variant="caption" color="text.secondary">
              （直接返回结果，推荐）
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            兼容 OpenAI ChatCompletions 格式。可勾选多个，在 AI问答面板中切换查看。API Key 本地存储，浏览器直连。
          </Typography>
          {pKeys.map((k) => {
            const meta = AI_PROVIDER_META[k]
            const cfg = providers[k]
            const modelPlaceholder = meta.constraints?.modelMustBeEndpointId
              ? '请填入 Endpoint ID（形如 ep-xxxxxxxxxxxxxxxx）'
              : (meta.defaultModel || '例如：qwen-plus / glm-4-flash')
            return (
              <Box
                key={k}
                sx={{ mb: 1.5, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={cfg.enabled}
                        onChange={() => toggleProvider(k)}
                      />
                    }
                    label={<Typography variant="body2" sx={{ fontWeight: 500 }}>{meta.label}</Typography>}
                  />
                  <Tooltip title={`前往 ${meta.helpUrl} 获取 API Key`}>
                    <IconButton
                      size="small"
                      component="a"
                      href={meta.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ p: 0.5 }}
                    >
                      <OpenInNewIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
                {meta.hint && (
                  <Typography
                    variant="caption"
                    color={meta.constraints?.modelMustBeEndpointId ? 'warning.main' : 'text.secondary'}
                    sx={{ display: 'block', px: 3, mb: 0.5 }}
                  >
                    {meta.hint}
                  </Typography>
                )}
                <Stack direction="column" spacing={0.5} sx={{ px: 3 }}>
                  <TextField
                    size="small"
                    label="API Key"
                    type="password"
                    fullWidth
                    value={cfg.apiKey}
                    onChange={(e) => setProvider(k, { apiKey: e.target.value })}
                  />
                  <TextField
                    size="small"
                    label="Base URL"
                    fullWidth
                    value={cfg.baseUrl}
                    placeholder={meta.defaultBaseUrl}
                    onChange={(e) => setProvider(k, { baseUrl: e.target.value })}
                    sx={{
                      '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                    }}
                  />
                  <TextField
                    size="small"
                    label={meta.constraints?.modelMustBeEndpointId ? 'Endpoint ID（模型）' : '模型'}
                    fullWidth
                    value={cfg.model}
                    placeholder={modelPlaceholder}
                    onChange={(e) => setProvider(k, { model: e.target.value })}
                    sx={{
                      '& .MuiInputLabel-root': { fontSize: '0.75rem' },
                      '& .MuiInputBase-input': { fontSize: '0.75rem' },
                      ...(meta.constraints?.modelMustBeEndpointId && {
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: (t: any) => t.palette.warning.light },
                      }),
                    }}
                  />
                </Stack>
              </Box>
            )
          })}
        </AccordionDetails>
      </Accordion>

      <Accordion expanded={expanded === 'web'} onChange={handleExpand('web')} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LanguageIcon fontSize="small" color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>网页嵌入</Typography>
            <Typography variant="caption" color="text.secondary">
              （备用方式）
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>
            ⚠ 主流 AI 聊天网页几乎都禁止 iframe 嵌入（登录安全策略）。如需使用，请在新窗口手动打开。
          </Typography>
          {pKeys.map((k) => (
            <FormControlLabel
              key={k}
              control={<Checkbox size="small" disabled />}
              label={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <span>{AI_PROVIDER_META[k].label}</span>
                  <Tooltip title="该网站禁止 iframe 嵌入">
                    <OpenInNewIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                  </Tooltip>
                </Stack>
              }
            />
          ))}
        </AccordionDetails>
      </Accordion>
    </Box>
  )
}

/**
 * 词典查询面板。
 * - 在线模式：iframe 加载选中词典；多词典勾选时用 Tabs 切换
 * - 本地模式：点击按钮通过自定义协议触发本地词典软件
 * - 订阅 useDictionaryStore.queryWord/queryTimestamp，自动响应原文"词典查询"按钮
 */
export function DictPanel(): ReactElement {
  const mode = useDictionaryStore((s) => s.mode)
  const online = useDictionaryStore((s) => s.online)
  const local = useDictionaryStore((s) => s.local)
  const queryWord = useDictionaryStore((s) => s.queryWord)
  const queryTimestamp = useDictionaryStore((s) => s.queryTimestamp)

  // 本地输入框，优先显示 store 中的 queryWord
  const [inputWord, setInputWord] = useState('')
  useEffect(() => {
    if (queryWord) setInputWord(queryWord)
  }, [queryWord, queryTimestamp])

  // 当前实际查询词：以 store 的 queryWord 为主（按钮触发），无则用输入框
  const activeWord = queryWord || inputWord

  // 在线模式：已勾选的词典列表
  const onlineKeys = Object.keys(ONLINE_DICT_LABEL) as (keyof OnlineDictState)[]
  const activeOnlineKeys = useMemo(
    () => onlineKeys.filter((k) => online[k]),
    [online, onlineKeys],
  )
  // 当前选中的在线词典 tab（默认第一个勾选项）
  const [activeDictIdx, setActiveDictIdx] = useState(0)
  useEffect(() => {
    if (activeDictIdx >= activeOnlineKeys.length) setActiveDictIdx(0)
  }, [activeOnlineKeys.length, activeDictIdx])
  const activeOnlineKey = activeOnlineKeys[activeDictIdx]

  // 本地模式：已勾选的词典列表
  const localKeys = Object.keys(LOCAL_DICT_LABEL) as (keyof LocalDictState)[]
  const activeLocalKeys = useMemo(
    () => localKeys.filter((k) => local[k]),
    [local, localKeys],
  )

  const triggerLocalDict = useCallback((key: keyof LocalDictState, word: string) => {
    if (!word.trim()) return
    const url = LOCAL_DICT_URL[key](word.trim())
    // 通过隐藏 iframe 触发自定义协议，避免页面跳转
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = url
    document.body.appendChild(iframe)
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }, [])

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column', p: 1.5 }}>
      {/* 头部 */}
      <Stack className="panel-header" direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <TranslateIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1">词典查询</Typography>
        <Typography variant="caption" color="text.secondary">
          {mode === 'online' ? '在线网页' : '本地软件'}
        </Typography>
      </Stack>
      <Divider sx={{ mb: 1 }} />

      {/* 查询输入区 */}
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="输入要查询的词"
          value={inputWord}
          onChange={(e) => setInputWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              useDictionaryStore.getState().setQueryWord(inputWord.trim())
            }
          }}
        />
        <Button
          size="small"
          variant="contained"
          onClick={() => useDictionaryStore.getState().setQueryWord(inputWord.trim())}
        >
          查询
        </Button>
      </Stack>

      {/* 主体：根据 mode 渲染 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {mode === 'online' ? (
          activeOnlineKeys.length === 0 ? (
            <EmptyHint text="未勾选任何在线词典。请到「设置」中勾选。" />
          ) : activeWord.trim() ? (
            <>
              {/* 多词典时显示 Tabs 切换 */}
              {activeOnlineKeys.length > 1 && (
                <Tabs
                  value={activeDictIdx}
                  onChange={(_, v) => setActiveDictIdx(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32 } }}
                >
                  {activeOnlineKeys.map((k) => (
                    <Tab
                      key={k}
                      label={
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <span>{ONLINE_DICT_LABEL[k]}</span>
                          {EMBED_UNSUPPORTED.has(k) && (
                            <Tooltip title="该词典不支持嵌入，需在新窗口打开">
                              <OpenInNewIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                            </Tooltip>
                          )}
                        </Stack>
                      }
                      sx={{ minHeight: 32 }}
                    />
                  ))}
                </Tabs>
              )}
              {activeOnlineKey && EMBED_UNSUPPORTED.has(activeOnlineKey) ? (
                // 不支持嵌入的词典：显示提示 + 外链按钮
                <Box
                  sx={{
                    flex: 1, minHeight: 0, border: 1, borderColor: 'divider',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', p: 3, gap: 2,
                  }}
                >
                  <LanguageIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                    {ONLINE_DICT_LABEL[activeOnlineKey]} 不支持在页面内嵌入显示
                    <br />
                    （网站设置了 X-Frame-Options 拦截）
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<OpenInNewIcon />}
                    href={ONLINE_DICT_URL[activeOnlineKey](activeWord.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    在新窗口打开 {ONLINE_DICT_LABEL[activeOnlineKey]}
                  </Button>
                </Box>
              ) : (
                // 支持嵌入的词典：iframe + 顶部外链工具条
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Stack
                    direction="row"
                    sx={{
                      alignItems: 'center', justifyContent: 'flex-end',
                      py: 0.25, px: 0.5, bgcolor: 'action.hover',
                    }}
                  >
                    <Tooltip title="在新窗口打开">
                      <IconButton
                        size="small"
                        href={activeOnlineKey ? ONLINE_DICT_URL[activeOnlineKey](activeWord.trim()) : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ p: 0.25 }}
                      >
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Box sx={{ flex: 1, minHeight: 0, border: 1, borderColor: 'divider', borderTop: 0 }}>
                    <iframe
                      key={`${activeOnlineKey}-${activeWord}`}
                      src={activeOnlineKey ? ONLINE_DICT_URL[activeOnlineKey](activeWord.trim()) : ''}
                      title={activeOnlineKey ? ONLINE_DICT_LABEL[activeOnlineKey] : ''}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <EmptyHint text="输入查询词后回车或点击「查询」按钮" />
          )
        ) : (
          // 本地模式
          activeLocalKeys.length === 0 ? (
            <EmptyHint text="未勾选任何本地词典。请到「设置」中勾选。" />
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                点击下方词典按钮，调用本地软件查询「{activeWord.trim() || '（请先输入查询词）'}」
              </Typography>
              {activeLocalKeys.map((k) => (
                <Button
                  key={k}
                  variant="outlined"
                  startIcon={<MemoryIcon />}
                  onClick={() => triggerLocalDict(k, activeWord)}
                  disabled={!activeWord.trim()}
                >
                  {LOCAL_DICT_LABEL[k]} 查询
                </Button>
              ))}
            </Stack>
          )
        )}
      </Box>
    </Box>
  )
}

function EmptyHint({ text }: { text: string }): ReactElement {
  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', px: 2 }}>
        {text}
      </Typography>
    </Box>
  )
}

/** 通用代码 → 显示名 映射（用于下拉选项展示） */
const LANG_CODE_LABEL: Record<string, string> = Object.fromEntries(
  COMMON_LANGUAGES.map((o) => [o.code, o.label]),
)

/**
 * 语言选择 Autocomplete：支持从常用语言下拉选择，也支持自由输入自定义代码。
 * 输入框显示语言代码（如 en / zh-CN），下拉项显示「代码 + 中文名」。
 */
function LangAutocomplete({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): ReactElement {
  return (
    <Autocomplete
      size="small"
      freeSolo
      options={COMMON_LANGUAGES.map((o) => o.code)}
      value={value}
      onChange={(_, v) => onChange(typeof v === 'string' ? v : (v ?? ''))}
      onInputChange={(_, v, reason) => {
        // freeSolo 下用户清空或手动输入时同步
        if (reason === 'input' || reason === 'clear') onChange(v ?? '')
      }}
      renderOption={(props, code) => (
        <li {...props}>
          <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', minWidth: 56 }}>{code}</Typography>
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {LANG_CODE_LABEL[code] ?? ''}
          </Typography>
        </li>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} />
      )}
      sx={{ flex: '1 1 120px', minWidth: 120 }}
    />
  )
}

/**
 * 把文本粘贴到双语编辑器当前激活段的译文（模拟 Ctrl+V 效果）。
 * - 仅当译文处于编辑状态（targetSelection 或 targetCursor 存在且匹配当前段）时才操作
 * - 浏览状态（无选区、无光标）不操作，并通过 Snackbar 提示用户点击译文区域
 * - 选区优先级 > 光标：若译文有选中文本，用新内容覆盖选区；否则插入到光标位置
 * - 发送内容：优先取结果区选中的部分文本（window.getSelection），否则用整个 fallbackText
 */
/**
 * AI 译文 / AI 问答 / 机器翻译 等"非术语"发送文本（统一入口）：
 * - 取结果区选中文本（必须不属于译文 contenteditable），否则用完整 fallbackText
 * - 译文始终处于编辑态（contenteditable 始终挂载），直接 execCommand 插入
 * - 兜底：段未渲染（离屏）等异常情况直接写 store
 */
function sendTextToTarget(fallbackText: string): void {
  const resultSel = window.getSelection()
  let selected = ''
  if (resultSel && resultSel.rangeCount > 0 && resultSel.toString().trim()) {
    const range = resultSel.getRangeAt(0)
    const ancestor = range.commonAncestorContainer as HTMLElement
    const containerEl: HTMLElement | null =
      ancestor.nodeType === Node.ELEMENT_NODE ? (ancestor as HTMLElement) : ancestor.parentElement
    if (!containerEl?.closest('[contenteditable="true"]')) {
      selected = resultSel.toString().trim()
    }
  }
  const text = selected || fallbackText
  if (!text) return

  const projStore = useProjectStore.getState()
  const editorCtx = useEditorContextStore.getState()
  const segId = editorCtx.activeSegmentId || projStore.activeSegmentId
  if (!segId) {
    useUIStore.getState().notify('warning', '请先在双语编辑器中选择一个段落')
    return
  }
  const seg = projStore.segments.find((s) => s.id === segId)
  if (!seg) return

  const finalTargetSel = editorCtx.targetSelection?.segmentId === segId ? editorCtx.targetSelection : null
  const finalTargetCur =
    !finalTargetSel && editorCtx.targetCursor?.segmentId === segId
      ? editorCtx.targetCursor
      : { segmentId: segId, offset: seg.target.length }

  // 1) 译文始终编辑态：直接插入
  if (doInsertViaExecCommand(segId, text, finalTargetSel, finalTargetCur)) return

  // 2) 兜底：段未渲染（离屏）等异常情况直接写 store
  const s = useProjectStore.getState().segments.find((s) => s.id === segId)
  if (!s) return
  const start = finalTargetSel && finalTargetSel.start < finalTargetSel.end
    ? finalTargetSel.start
    : Math.max(0, Math.min(finalTargetCur.offset, s.target.length))
  const end = finalTargetSel && finalTargetSel.start < finalTargetSel.end
    ? finalTargetSel.end
    : start
  useProjectStore.getState().updateSegment(segId, {
    target: s.target.slice(0, start) + text + s.target.slice(end),
    status: 'draft',
  })
}

/**
 * AI 问答面板。
 * - API 模式：调用 ChatCompletions 接口，支持多 provider，Tabs 切换
 * - 订阅 useAiQAStore.queryText/queryContext/queryTimestamp，自动响应原文"AI解释"按钮发起请求
 * - 支持自定义 prompt（默认用 AI_EXPLAIN_SYSTEM_PROMPT）
 */
export function AIQAPanel(): ReactElement {
  const mode = useAiQAStore((s) => s.mode)
  const providers = useAiQAStore((s) => s.providers)
  const queryText = useAiQAStore((s) => s.queryText)
  const queryContext = useAiQAStore((s) => s.queryContext)
  const queryTimestamp = useAiQAStore((s) => s.queryTimestamp)

  const pKeys = Object.keys(AI_PROVIDER_META) as AiProviderKey[]
  const activeProviders = useMemo(
    () => pKeys.filter((k) => providers[k].enabled),
    [providers, pKeys],
  )
  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    if (activeIdx >= activeProviders.length) setActiveIdx(0)
  }, [activeProviders.length, activeIdx])

  // 输入区折叠开关（默认折叠，减少视觉干扰；结果自动呈现）
  const [showInputs, setShowInputs] = useState(false)

  // 各 provider 的回答状态（含 token 消耗）
  const [answers, setAnswers] = useState<Record<string, { loading: boolean; result: string; error: string; usage?: TokenUsage }>>({})

  // 系统 Prompt 持久化到 store（刷新不丢失）
  const systemPrompt = useAiQAStore((s) => s.aiqaSystemPrompt)
  const setSystemPrompt = useAiQAStore((s) => s.setAiqaSystemPrompt)
  const [customUserPrompt, setCustomUserPrompt] = useState('')

  // 同步输入框内容
  const [inputText, setInputText] = useState('')
  const [inputContext, setInputContext] = useState('')
  useEffect(() => {
    if (queryText) setInputText(queryText)
    if (queryContext !== undefined) setInputContext(queryContext)
  }, [queryText, queryContext, queryTimestamp])

  /** 组装 user 消息 */
  const buildUserMessage = useCallback((text: string, ctx: string, custom: string): string => {
    const parts: string[] = []
    if (ctx.trim()) parts.push(`【整段原文】\n${ctx.trim()}`)
    parts.push(`【待解释内容】\n${text.trim()}`)
    if (custom.trim()) parts.push(`【用户附加说明】\n${custom.trim()}`)
    return parts.join('\n\n')
  }, [])

  const runQueryForProvider = useCallback(
    async (k: AiProviderKey, text: string, ctx: string, custom: string, sysPrompt: string) => {
      if (!text.trim()) return
      setAnswers((prev) => ({ ...prev, [k]: { loading: true, result: '', error: '' } }))
      try {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: buildUserMessage(text, ctx, custom) },
        ]
        const { content, usage } = await callAiChat(k, providers[k], messages)
        setAnswers((prev) => ({ ...prev, [k]: { loading: false, result: content, error: '', usage } }))
      } catch (e: any) {
        setAnswers((prev) => ({ ...prev, [k]: { loading: false, result: '', error: e?.message || String(e) } }))
      }
    },
    [providers, buildUserMessage],
  )

  const runQuery = useCallback(
    (text: string, ctx: string, custom: string, sysPrompt: string) => {
      activeProviders.forEach((k) => runQueryForProvider(k, text, ctx, custom, sysPrompt))
    },
    [activeProviders, runQueryForProvider],
  )

  // queryTimestamp 变化时自动触发（来自原文按钮）
  useEffect(() => {
    if (!queryTimestamp) return
    if (mode !== 'api') return
    if (!queryText.trim()) return
    if (activeProviders.length === 0) return
    runQuery(queryText, queryContext, customUserPrompt, systemPrompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTimestamp])

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column', p: 1.5 }}>
      <Stack
        className="panel-header"
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <AutoAwesomeMotionIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1">AI问答</Typography>
          <Typography variant="caption" color="text.secondary">
            {mode === 'api' ? 'API 调用' : '网页嵌入'}
            {activeProviders.length > 0 ? ` · ${activeProviders.length} 个模型` : ''}
          </Typography>
        </Stack>
        <Tooltip title={showInputs ? '隐藏输入区' : '显示输入区（手动输入/调参）'}>
          <IconButton size="small" onClick={() => setShowInputs((v) => !v)} sx={{ p: 0.25 }}>
            {showInputs ? <UnfoldLessIcon sx={{ fontSize: 18 }} /> : <UnfoldMoreIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Divider sx={{ mb: showInputs ? 1 : 0.5 }} />

      {mode === 'api' ? (
        activeProviders.length === 0 ? (
          <EmptyHint text="未启用任何 AI 提供商。请到「设置 → AI问答 → API 调用」配置并启用。" />
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* 输入区（默认折叠） */}
            {showInputs && (
              <Stack direction="column" spacing={0.5} sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                    待解释内容（选中文本）
                  </Typography>
                  <TextField
                    size="small"
                    multiline
                    minRows={2}
                    maxRows={3}
                    fullWidth
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="选中原文后点「AI解释」自动填入此处"
                  />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                    上下文（整段原文，可选）
                  </Typography>
                  <TextField
                    size="small"
                    multiline
                    minRows={2}
                    maxRows={4}
                    fullWidth
                    value={inputContext}
                    onChange={(e) => setInputContext(e.target.value)}
                    placeholder="提供上下文，让 AI 给出更准确的释义"
                  />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                    用户附加说明（可选，如："IT 领域"、"法律文本"）
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    value={customUserPrompt}
                    onChange={(e) => setCustomUserPrompt(e.target.value)}
                    placeholder="例如：IT 计算机领域"
                  />
                </Box>
                <Box>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">
                      系统 Prompt（可编辑，自动保存）
                    </Typography>
                    <Tooltip title="重置为默认 Prompt">
                      <IconButton
                        size="small"
                        onClick={() => setSystemPrompt(AI_EXPLAIN_SYSTEM_PROMPT)}
                        sx={{ p: 0.25 }}
                      >
                        <RestartAltIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <TextField
                    size="small"
                    multiline
                    minRows={3}
                    maxRows={6}
                    fullWidth
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                  />
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => runQuery(inputText, inputContext, customUserPrompt, systemPrompt)}
                  disabled={!inputText.trim()}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  开始解释
                </Button>
                <Divider sx={{ mt: 0.25 }} />
              </Stack>
            )}

            {activeProviders.length > 1 && (
              <Tabs
                value={activeIdx}
                onChange={(_, v) => setActiveIdx(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32 } }}
              >
                {activeProviders.map((k) => (
                  <Tab key={k} label={AI_PROVIDER_META[k].label} sx={{ minHeight: 32 }} />
                ))}
              </Tabs>
            )}

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {activeProviders.map((k, idx) => {
                if (activeProviders.length > 1 && idx !== activeIdx) return null
                const a = answers[k]
                const meta = AI_PROVIDER_META[k]
                // 用于"重新生成"的最终参数：用户手动输入优先，否则用 store 最新值
                const useText = inputText.trim() || queryText
                const useCtx = inputContext || queryContext
                return (
                  <Box key={k} sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">{meta.label}</Typography>
                        {a?.usage && (
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
                            ↑{a.usage.prompt_tokens} ↓{a.usage.completion_tokens} 共{a.usage.total_tokens}
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={0.25}>
                        <Tooltip title="发送到译文光标位置（选中文本优先，否则发送整体）">
                          <IconButton
                            size="small"
                            sx={{ p: 0.25 }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => a?.result && sendTextToTarget(a.result)}
                            disabled={!a?.result}
                          >
                            <SendIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        <Button
                          size="small"
                          onClick={() => runQueryForProvider(k, useText, useCtx, customUserPrompt, systemPrompt)}
                          disabled={!useText.trim() || a?.loading}
                          sx={{ minWidth: 'auto', fontSize: '0.75rem' }}
                        >
                          重新生成
                        </Button>
                      </Stack>
                    </Stack>
                    {a?.loading ? (
                      <Typography variant="body2" color="text.secondary">生成中...</Typography>
                    ) : a?.error ? (
                      <Stack direction="column" spacing={0.5}>
                        <Typography variant="body2" color="error.main">
                          错误：{a.error}
                        </Typography>
                        {(a.error.toLowerCase().includes('cors') || a.error.toLowerCase().includes('fetch')) && (
                          <Typography variant="caption" color="warning.main">
                            可能是浏览器 CORS 拦截。建议使用 DeepSeek（已验证支持浏览器直连），或填写自定义 Base URL 指向代理。
                          </Typography>
                        )}
                      </Stack>
                    ) : a?.result ? (
                      <MarkdownRenderer variant="body2">{a.result}</MarkdownRenderer>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {queryTimestamp > 0
                          ? '正在调用模型，请稍候...'
                          : '选中原文后点「AI解释」会自动发起解释。或展开输入区手动输入。'}
                      </Typography>
                    )}
                  </Box>
                )
              })}
            </Box>
          </Box>
        )
      ) : (
        <EmptyHint text="AI 聊天网页均禁止 iframe 嵌入。可切换至「API 调用」模式直接返回结果。" />
      )}
    </Box>
  )
}

/**
 * AI 翻译面板。
 * - 多 AI 提供商同时翻译、并排 Grid 对比显示
 * - 语言对优先取当前 project 的 sourceLang/targetLang，可手动覆盖
 * - 订阅 translateText/src/tgt/domain/translateTimestamp，自动响应「AI解释」按钮无选中文本时发起的整段翻译请求
 * - 输入区默认折叠，仅在点击右上开关后展开（减少视觉干扰；结果自动呈现）
 */
export function AITranslatePanel(): ReactElement {
  const mode = useAiQAStore((s) => s.mode)
  const providers = useAiQAStore((s) => s.providers)
  const translateText = useAiQAStore((s) => s.translateText)
  const translateSrc = useAiQAStore((s) => s.translateSrc)
  const translateTgt = useAiQAStore((s) => s.translateTgt)
  const translateTimestamp = useAiQAStore((s) => s.translateTimestamp)
  const setTranslate = useAiQAStore((s) => s.setTranslate)
  const applyTermsInTranslate = useAiQAStore((s) => s.applyTermsInTranslate)
  const setApplyTermsInTranslate = useAiQAStore((s) => s.setApplyTermsInTranslate)
  const terms = useTermStore((s) => s.terms)

  // 当前项目的 sourceLang / targetLang，作为默认语言对（响应项目切换）
  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const projects = useProjectStore((s) => s.projects)
  const projectLang = useMemo(() => {
    const cur = projects.find((p) => p.id === currentProjectId)
    return cur ? { src: cur.sourceLang, tgt: cur.targetLang } : null
  }, [projects, currentProjectId])

  const pKeys = Object.keys(AI_PROVIDER_META) as AiProviderKey[]
  const activeProviders = useMemo(
    () => pKeys.filter((k) => providers[k].enabled),
    [providers, pKeys],
  )

  // 输入区折叠开关（默认折叠，减少视觉干扰；结果自动呈现）
  const [showInputs, setShowInputs] = useState(false)

  // 本地状态：文本、src、tgt 本地输入
  const [inputText, setInputText] = useState('')
  const [inputSrc, setInputSrc] = useState(projectLang?.src ?? translateSrc)
  const [inputTgt, setInputTgt] = useState(projectLang?.tgt ?? translateTgt)

  // 项目切换时跟随项目语言对（用户可临时手改，仅影响当前翻译）
  useEffect(() => {
    if (projectLang) {
      setInputSrc(projectLang.src)
      setInputTgt(projectLang.tgt)
    }
  }, [projectLang])

  // 交换源/目标语言对（仅改本地状态，不影响项目设置）
  const swapLangs = () => {
    const newSrc = inputTgt
    const newTgt = inputSrc
    setInputSrc(newSrc)
    setInputTgt(newTgt)
  }

  // 同步 store -> 本地（当「AI解释」按钮触发整段翻译时）
  useEffect(() => {
    if (translateText) setInputText(translateText)
    if (translateSrc) setInputSrc((prev) => (prev ? prev : translateSrc))
    if (translateTgt) setInputTgt((prev) => (prev ? prev : translateTgt))
  }, [translateText, translateSrc, translateTgt, translateTimestamp])

  // 各 provider 结果状态
  const [results, setResults] = useState<Record<string, { loading: boolean; result: string; error: string; usage?: TokenUsage }>>({})

  // 系统 Prompt 持久化到 store（刷新不丢失）
  const translateSystemPrompt = useAiQAStore((s) => s.translateSystemPrompt)
  const setTranslateSystemPrompt = useAiQAStore((s) => s.setTranslateSystemPrompt)

  /** 组装 system prompt（追加语言对） */
  const buildSystemPrompt = useCallback((src: string, tgt: string): string => {
    const parts: string[] = [translateSystemPrompt]
    if (src && src.trim()) parts.push(`源语言标签：${src.trim()}`)
    if (tgt && tgt.trim()) parts.push(`目标语言标签：${tgt.trim()}`)
    return parts.join('\n')
  }, [translateSystemPrompt])

  const runForProvider = useCallback(
    async (k: AiProviderKey, text: string, src: string, tgt: string) => {
      if (!text.trim()) return
      setResults((prev) => ({ ...prev, [k]: { loading: true, result: '', error: '' } }))
      try {
        const trimmedText = text.trim()
        // 术语套用：开关开启时，匹配原文术语并追加到 user prompt
        const termHint = applyTermsInTranslate ? buildTermHint(trimmedText, terms) : ''
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: buildSystemPrompt(src, tgt) },
          { role: 'user', content: trimmedText + termHint },
        ]
        const { content, usage } = await callAiChat(k, providers[k], messages)
        setResults((prev) => ({ ...prev, [k]: { loading: false, result: content, error: '', usage } }))
      } catch (e: any) {
        setResults((prev) => ({ ...prev, [k]: { loading: false, result: '', error: e?.message || String(e) } }))
      }
    },
    [providers, buildSystemPrompt, applyTermsInTranslate, terms],
  )

  const runAll = useCallback(
    (text: string, src: string, tgt: string) => {
      activeProviders.forEach((k) => runForProvider(k, text, src, tgt))
    },
    [activeProviders, runForProvider],
  )

  // translateTimestamp 变化时自动触发（来自"AI解释"按钮的整段翻译）
  // 直接以 store 中的最新值为准，避免本地 input 尚未同步导致回退值被覆盖
  useEffect(() => {
    if (!translateTimestamp) return
    if (mode !== 'api') return
    const text = translateText.trim()
    if (!text) return
    if (activeProviders.length === 0) return
    const src = translateSrc
    const tgt = translateTgt
    runAll(text, src, tgt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateTimestamp])

  const applyAndRun = () => {
    // 写入 store 会触发 timestamp 变化，也会同步其他实例
    setTranslate({ text: inputText, src: inputSrc, tgt: inputTgt })
  }

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch { /* ignore */ }
  }

  return (
    <Box sx={{ ..._sty, display: 'flex', flexDirection: 'column', p: 1.5 }}>
      <Stack
        className="panel-header"
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ScienceIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1">AI翻译</Typography>
          <Typography variant="caption" color="text.secondary">
            {activeProviders.length > 0 ? `${activeProviders.length} 个模型并排对比` : '尚未启用任何 AI 提供商'}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
          <Tooltip title={applyTermsInTranslate ? '术语套用：开启（翻译时自动注入匹配术语，点击关闭）' : '术语套用：关闭（点击开启，翻译时自动注入匹配术语）'}>
            <IconButton
              size="small"
              onClick={() => setApplyTermsInTranslate(!applyTermsInTranslate)}
              sx={{ p: 0.25, color: applyTermsInTranslate ? 'primary.main' : 'text.disabled' }}
            >
              <BookmarkIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={showInputs ? '隐藏输入区' : '显示输入区（手动输入/调参）'}>
            <IconButton size="small" onClick={() => setShowInputs((v) => !v)} sx={{ p: 0.25 }}>
              {showInputs ? <UnfoldLessIcon sx={{ fontSize: 18 }} /> : <UnfoldMoreIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Divider sx={{ mb: showInputs ? 1 : 0.5 }} />

      {mode === 'api' ? (
        activeProviders.length === 0 ? (
          <EmptyHint text="未启用任何 AI 提供商。请到「设置 → AI问答 → API 调用」中配置并启用。" />
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* 输入区（默认折叠） */}
            {showInputs && (
              <Stack direction="column" spacing={0.5} sx={{ mb: 1 }}>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <LangAutocomplete
                    label="源语言"
                    value={inputSrc}
                    onChange={setInputSrc}
                    placeholder={projectLang?.src ?? 'auto / en / zh-CN'}
                  />
                  <Tooltip title="交换源/目标语言">
                    <IconButton size="small" onClick={swapLangs} sx={{ p: 0.5 }}>
                      <SwapHorizIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <LangAutocomplete
                    label="目标语言"
                    value={inputTgt}
                    onChange={setInputTgt}
                    placeholder={projectLang?.tgt ?? 'zh-CN / en'}
                  />
                </Stack>
                <TextField
                  size="small"
                  label="待翻译原文"
                  multiline
                  minRows={3}
                  maxRows={6}
                  fullWidth
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="在原文中点击「AI解释」按钮（不选中文本）会把整段原文送到此处并自动翻译。"
                />
                <Box>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.25, flexWrap: 'wrap', gap: 0.5 }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                        系统 Prompt（可编辑，自动保存）
                      </Typography>
                      {TRANSLATE_PRESETS.map((p) => (
                        <Chip
                          key={p.key}
                          label={p.label}
                          size="small"
                          onClick={() => setTranslateSystemPrompt(p.prompt)}
                          sx={{
                            height: 20,
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            bgcolor: translateSystemPrompt === p.prompt ? 'primary.main' : 'action.hover',
                            color: translateSystemPrompt === p.prompt ? 'primary.contrastText' : 'text.secondary',
                            '&:hover': { bgcolor: translateSystemPrompt === p.prompt ? 'primary.dark' : 'action.selected' },
                          }}
                        />
                      ))}
                    </Stack>
                    <Tooltip title="重置为默认 Prompt">
                      <IconButton
                        size="small"
                        onClick={() => setTranslateSystemPrompt(AI_TRANSLATE_SYSTEM_PROMPT)}
                        sx={{ p: 0.25 }}
                      >
                        <RestartAltIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <TextField
                    size="small"
                    multiline
                    minRows={3}
                    maxRows={6}
                    fullWidth
                    value={translateSystemPrompt}
                    onChange={(e) => setTranslateSystemPrompt(e.target.value)}
                  />
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={applyAndRun}
                    disabled={!inputText.trim()}
                  >
                    开始翻译（{activeProviders.length} 个模型）
                  </Button>
                  {projectLang && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setInputSrc(projectLang.src)
                        setInputTgt(projectLang.tgt)
                      }}
                    >
                      使用项目语言对 ({projectLang.src}→{projectLang.tgt})
                    </Button>
                  )}
                </Stack>
                <Divider sx={{ mt: 0.25 }} />
              </Stack>
            )}

            {/* 对比结果：多列 Grid，1列→2列→3列自适应 */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.25 }}>
              <Grid container spacing={1}>
                {activeProviders.map((k) => {
                  const a = results[k]
                  const meta = AI_PROVIDER_META[k]
                  // 用于"重译"的最终参数：用户手动输入优先，否则用 store 最新值
                  const useText = inputText.trim() || translateText
                  const useSrc = inputSrc || translateSrc
                  const useTgt = inputTgt || translateTgt
                  return (
                    <Grid
                      key={k}
                      size={{
                        xs: 12,
                        sm: activeProviders.length >= 2 ? 6 : 12,
                        md: activeProviders.length >= 3 ? 4 : (activeProviders.length === 2 ? 6 : 12),
                        lg: activeProviders.length >= 4 ? 3 : (activeProviders.length === 3 ? 4 : (activeProviders.length === 2 ? 6 : 12)),
                      }}
                    >
                      <Paper
                        variant="outlined"
                        sx={{
                          height: '100%',
                          minHeight: 200,
                          display: 'flex',
                          flexDirection: 'column',
                          p: 1,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}
                        >
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                            <ScienceIcon sx={{ fontSize: 14 }} color="primary" />
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                              {meta.label}
                            </Typography>
                            {a?.usage && (
                              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
                                ↑{a.usage.prompt_tokens} ↓{a.usage.completion_tokens} 共{a.usage.total_tokens}
                              </Typography>
                            )}
                          </Stack>
                          <Stack direction="row" spacing={0.25}>
                            <Tooltip title="复制译文">
                              <IconButton
                                size="small"
                                sx={{ p: 0.25 }}
                                onClick={() => a?.result && onCopy(a.result)}
                                disabled={!a?.result}
                              >
                                <ContentCopyIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="发送到译文光标位置（选中文本优先，否则发送整体）">
                              <IconButton
                                size="small"
                                sx={{ p: 0.25 }}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => a?.result && sendTextToTarget(a.result)}
                                disabled={!a?.result}
                              >
                                <SendIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                            <Button
                              size="small"
                              onClick={() => runForProvider(k, useText, useSrc, useTgt)}
                              disabled={!useText.trim() || a?.loading}
                              sx={{ minWidth: 'auto', fontSize: '0.75rem', p: '2px 6px' }}
                            >
                              重译
                            </Button>
                          </Stack>
                        </Stack>
                        <Divider sx={{ mb: 0.5 }} />
                        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                          {a?.loading ? (
                            <Typography variant="body2" color="text.secondary">翻译中...</Typography>
                          ) : a?.error ? (
                            <Stack direction="column" spacing={0.5}>
                              <Typography variant="body2" color="error.main">
                                错误：{a.error}
                              </Typography>
                              {(a.error.toLowerCase().includes('cors') || a.error.toLowerCase().includes('fetch')) && (
                                <Typography variant="caption" color="warning.main">
                                  可能是浏览器 CORS 拦截。推荐使用 DeepSeek（已验证支持浏览器直连），或在「设置」中配置自定义 Base URL 指向代理。
                                </Typography>
                              )}
                            </Stack>
                          ) : a?.result ? (
                            <MarkdownRenderer variant="body2">{a.result}</MarkdownRenderer>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {translateTimestamp > 0
                                ? '正在调用模型，请稍候...'
                                : '在原文不选中文本直接点「AI解释」会自动发起翻译。或展开输入区手动输入。'}
                            </Typography>
                          )}
                        </Box>
                      </Paper>
                    </Grid>
                  )
                })}
              </Grid>
            </Box>
          </Box>
        )
      ) : (
        <EmptyHint text="AI翻译仅支持 API 调用模式。请到「设置 → AI问答」中切换为「API 调用」。" />
      )}
    </Box>
  )
}

// ============================================================================
// 双语导入整理 Dialog（全屏面板）
// ============================================================================

type BilingualFormat =
  | 'line_pair'      // 行对齐：奇数行原文，偶数行译文
  | 'tab_split'      // 制表符/多空格分隔：原文\t译文
  | 'numbered_pair'  // 编号句对：1. xxx  1. yyy 交替
  | 'two_column_sep' // 自定义分隔符（双列模式）
  | 'csv_two_col'    // CSV 两列：原文,译文（含引号兼容）

type InputTab = 'paste' | 'file'

interface AlignRow {
  id: number
  source: string
  target: string
  selected: boolean
  issue?: 'empty_source' | 'empty_target' | 'dup' | null
}

interface BilingualImportDialogProps {
  open: boolean
  onClose: () => void
  sourceLang: LanguageCode | undefined
  targetLang: LanguageCode | undefined
  projectId: ID | null | undefined
  onImported: () => Promise<void> | void
  notify: (level: 'success' | 'error' | 'info' | 'warning', msg: string) => void
}

const FORMAT_LABELS: Record<BilingualFormat, string> = {
  line_pair: '逐行对照（原文一行、译文一行交替）',
  tab_split: '制表符分隔（原文\\t译文，每行一对）',
  numbered_pair: '编号句对（1.原文 2.译文…交替出现）',
  two_column_sep: '自定义分隔符（原文【分隔符】译文，每行一对）',
  csv_two_col: 'CSV 双列（"原文","译文"，每行一对）',
}

let _rowIdSeq = 1
const nextRowId = () => _rowIdSeq++

function parseBilingualText(raw: string, format: BilingualFormat, customSep: string): AlignRow[] {
  const text = raw.replace(/\r\n?/g, '\n').replace(/\u3000/g, ' ')
  const lines = text.split('\n')
  const rows: AlignRow[] = []

  const norm = (s: string) => s
    .replace(/^\s+|\s+$/g, '')
    .replace(/^[\d]+[\.\)、]\s*/, '') // 去掉行首编号 1. / 1) / 1、
    .replace(/^【[^】]+】\s*/, '') // 去掉行首【分类】标记

  switch (format) {
    case 'line_pair': {
      for (let i = 0; i < lines.length; i += 2) {
        const src = norm(lines[i] ?? '')
        const tgt = norm(lines[i + 1] ?? '')
        if (!src && !tgt) continue
        rows.push({ id: nextRowId(), source: src, target: tgt, selected: true })
      }
      break
    }
    case 'tab_split': {
      for (const line of lines) {
        if (!line.trim()) continue
        const parts = line.split(/\t|\s{2,}/).map((s) => s.trim())
        const src = parts[0] ?? ''
        const tgt = parts.slice(1).join(' ').trim()
        rows.push({ id: nextRowId(), source: norm(src), target: norm(tgt), selected: true })
      }
      break
    }
    case 'numbered_pair': {
      const stripped = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.replace(/^[\d]+[\.\)、]\s*/, ''))
      for (let i = 0; i < stripped.length; i += 2) {
        const src = norm(stripped[i] ?? '')
        const tgt = norm(stripped[i + 1] ?? '')
        rows.push({ id: nextRowId(), source: src, target: tgt, selected: true })
      }
      break
    }
    case 'two_column_sep': {
      const sep = customSep || '|||'
      for (const line of lines) {
        if (!line.trim()) continue
        const idx = line.indexOf(sep)
        let src: string, tgt: string
        if (idx === -1) {
          src = line.trim()
          tgt = ''
        } else {
          src = line.slice(0, idx).trim()
          tgt = line.slice(idx + sep.length).trim()
        }
        rows.push({ id: nextRowId(), source: norm(src), target: norm(tgt), selected: true })
      }
      break
    }
    case 'csv_two_col': {
      const csvSplit = (line: string): string[] => {
        const out: string[] = []
        let cur = ''
        let inQ = false
        for (let i = 0; i < line.length; i++) {
          const c = line[i]
          if (c === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
            else inQ = !inQ
          } else if (c === ',' && !inQ) {
            out.push(cur); cur = ''
          } else cur += c
        }
        out.push(cur)
        return out
      }
      for (const line of lines) {
        if (!line.trim()) continue
        const parts = csvSplit(line)
        const src = parts[0] ?? ''
        const tgt = parts[1] ?? ''
        rows.push({ id: nextRowId(), source: norm(src), target: norm(tgt), selected: true })
      }
      break
    }
  }

  return rows.filter((r) => r.source || r.target)
}

/** 双列模式：按行号一一配对原文与译文，多出的行另一方配空串 */
function pairByLines(srcRaw: string, tgtRaw: string): AlignRow[] {
  const normLine = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\u3000/g, ' ').replace(/\s+$/g, '')
  const srcLines = normLine(srcRaw).split('\n')
  const tgtLines = normLine(tgtRaw).split('\n')
  const count = Math.max(srcLines.length, tgtLines.length)
  const rows: AlignRow[] = []
  for (let i = 0; i < count; i++) {
    const src = (srcLines[i] ?? '').trim()
    const tgt = (tgtLines[i] ?? '').trim()
    if (!src && !tgt) continue
    rows.push({ id: nextRowId(), source: src, target: tgt, selected: true })
  }
  return rows
}

function detectIssueFlags(rows: AlignRow[]): AlignRow[] {
  const seen = new Set<string>()
  return rows.map((r) => {
    let issue: AlignRow['issue'] = null
    if (!r.source.trim()) issue = 'empty_source'
    else if (!r.target.trim()) issue = 'empty_target'
    else {
      const key = r.source + '\u0000' + r.target
      if (seen.has(key)) issue = 'dup'
      else seen.add(key)
    }
    return { ...r, issue }
  })
}

export function BilingualImportDialog(props: BilingualImportDialogProps): ReactElement {
  const { open, onClose, sourceLang, targetLang, projectId, onImported, notify } = props
  const [tab, setTab] = useState<InputTab>('paste')
  const [pasteText, setPasteText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileText, setFileText] = useState('')
  const [format, setFormat] = useState<BilingualFormat>('tab_split')
  const [customSep, setCustomSep] = useState('|||')
  const [rows, setRows] = useState<AlignRow[]>([])
  const [importing, setImporting] = useState(false)
  const [previewDupHint, setPreviewDupHint] = useState<{ dup: number; add: number; update: number } | null>(null)
  const [inputCollapsed, setInputCollapsed] = useState(false)
  const [dualMode, setDualMode] = useState(false)
  const [enablePreprocess, setEnablePreprocess] = useState(false)
  const [pasteSrcText, setPasteSrcText] = useState('')
  const [pasteTgtText, setPasteTgtText] = useState('')
  const [srcFileName, setSrcFileName] = useState('')
  const [srcFileText, setSrcFileText] = useState('')
  const [tgtFileName, setTgtFileName] = useState('')
  const [tgtFileText, setTgtFileText] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const srcFileInputRef = useRef<HTMLInputElement | null>(null)
  const tgtFileInputRef = useRef<HTMLInputElement | null>(null)

  const preprocessText = useCallback((text: string) => {
    if (!enablePreprocess) return text
    // 删除每行句前空白
    let processed = text.replace(/^\s+/gm, '')
    // 删除多余空行（连续多个空行合并为一个空行）
    processed = processed.replace(/^\s*[\r\n]{2,}\s*/gm, '\n\n')
    // 移除开头空行
    processed = processed.replace(/^\s*[\r\n]+/, '')
    return processed
  }, [enablePreprocess])

  const resetState = () => {
    setTab('paste')
    setPasteText('')
    setFileName('')
    setFileText('')
    setFormat('tab_split')
    setCustomSep('|||')
    setRows([])
    setImporting(false)
    setPreviewDupHint(null)
    setInputCollapsed(false)
    setDualMode(false)
    setEnablePreprocess(false)
    setPasteSrcText('')
    setPasteTgtText('')
    setSrcFileName('')
    setSrcFileText('')
    setTgtFileName('')
    setTgtFileText('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (srcFileInputRef.current) srcFileInputRef.current.value = ''
    if (tgtFileInputRef.current) tgtFileInputRef.current.value = ''
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const handleFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    try {
      const text = await f.text()
      setFileText(preprocessText(text))
    } catch (err) {
      notify('error', '读取文件失败：' + (err as Error).message)
    }
  }

  const readMultipleSorted = async (files: FileList | null) => {
    if (!files || files.length === 0) return { names: '', text: '' }
    const arr = Array.from(files).sort((a, b) => a.name.localeCompare(b.name))
    const chunks: string[] = []
    for (const f of arr) {
      const t = await f.text()
      if (!t.endsWith('\n')) chunks.push(t + '\n')
      else chunks.push(t)
    }
    return {
      names: arr.length > 1 ? `${arr[0].name} 等 ${arr.length} 个文件` : arr[0].name,
      text: chunks.join(''),
    }
  }

  const handleSrcFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const { names, text } = await readMultipleSorted(files)
      setSrcFileName(names)
      setSrcFileText(preprocessText(text))
    } catch (err) {
      notify('error', '读取原文文件失败：' + (err as Error).message)
    }
  }

  const handleTgtFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const { names, text } = await readMultipleSorted(files)
      setTgtFileName(names)
      setTgtFileText(preprocessText(text))
    } catch (err) {
      notify('error', '读取译文文件失败：' + (err as Error).message)
    }
  }

  const doParse = () => {
    let parsed: AlignRow[]
    if (dualMode) {
      const srcText = tab === 'paste' ? preprocessText(pasteSrcText) : srcFileText
      const tgtText = tab === 'paste' ? preprocessText(pasteTgtText) : tgtFileText
      if (!srcText.trim() && !tgtText.trim()) {
        notify('warning', '请先粘贴或上传原文与译文（双列模式）')
        return
      }
      parsed = pairByLines(srcText, tgtText)
    } else {
      const srcText = tab === 'paste' ? preprocessText(pasteText) : fileText
      if (!srcText.trim()) {
        notify('warning', '请先粘贴或上传待整理的双语文本')
        return
      }
      parsed = parseBilingualText(srcText, format, customSep)
    }
    const withFlags = detectIssueFlags(parsed)
    setRows(withFlags)
    setPreviewDupHint(null)
    notify('info', `解析完成：共 ${withFlags.length} 对，请校对对齐后再导入`)
  }

  const toggleSelectRow = (id: number) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)))

  const toggleSelectAll = () => {
    const allSelected = rows.length > 0 && rows.every((r) => r.selected)
    setRows((rs) => rs.map((r) => ({ ...r, selected: !allSelected })))
  }

  const deleteRow = (id: number) =>
    setRows((rs) => rs.filter((r) => r.id !== id))

  const moveRow = (id: number, dir: -1 | 1) => {
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === id)
      if (idx === -1) return rs
      const target = idx + dir
      if (target < 0 || target >= rs.length) return rs
      const copy = rs.slice()
      const [it] = copy.splice(idx, 1)
      copy.splice(target, 0, it)
      return copy
    })
  }

  const mergeWithNext = (id: number) => {
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === id)
      if (idx === -1 || idx >= rs.length - 1) return rs
      const a = rs[idx]
      const b = rs[idx + 1]
      const merged: AlignRow = {
        id: nextRowId(),
        source: [a.source, b.source].filter(Boolean).join(' '),
        target: [a.target, b.target].filter(Boolean).join(' '),
        selected: a.selected || b.selected,
      }
      const copy = rs.slice()
      copy.splice(idx, 2, merged)
      return detectIssueFlags(copy)
    })
  }

  const splitRow = (id: number) => {
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === id)
      if (idx === -1) return rs
      const r = rs[idx]
      const srcParts = r.source.split(/(?<=[。！？.!?；;])\s*/).filter(Boolean)
      const tgtParts = r.target.split(/(?<=[。！？.!?；;])\s*/).filter(Boolean)
      if (srcParts.length < 2 && tgtParts.length < 2) {
        notify('info', '当前行不包含可拆分的句末标点（。！？.!?；;）')
        return rs
      }
      const count = Math.max(srcParts.length, tgtParts.length)
      const newRows: AlignRow[] = []
      for (let i = 0; i < count; i++) {
        newRows.push({
          id: nextRowId(),
          source: srcParts[i] ?? '',
          target: tgtParts[i] ?? '',
          selected: r.selected,
        })
      }
      const copy = rs.slice()
      copy.splice(idx, 1, ...newRows)
      return detectIssueFlags(copy)
    })
  }

  const updateCell = (id: number, field: 'source' | 'target', value: string) => {
    setRows((rs) => detectIssueFlags(rs.map((r) => (r.id === id ? { ...r, [field]: value } : r))))
  }

  const removeEmpty = () =>
    setRows((rs) => detectIssueFlags(rs.filter((r) => !r.selected || (r.source.trim() || r.target.trim()))))

  const dedupeSelected = () => {
    setRows((rs) => {
      const seen = new Set<string>()
      return rs.filter((r) => {
        if (!r.selected) return true
        const key = r.source.trim() + '\u0000' + r.target.trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    })
  }

  const runDupPreview = async () => {
    const sel = rows.filter((r) => r.selected && r.source.trim() && r.target.trim())
    if (sel.length === 0) {
      notify('warning', '当前无有效勾选行')
      return
    }
    const sl = sourceLang ?? 'en'
    const tl = targetLang ?? 'zh-CN'
    let dup = 0, add = 0
    for (const r of sel) {
      const existing = await db.tmEntries
        .where('[source+target+sourceLang+targetLang]')
        .equals([r.source.trim(), r.target.trim(), sl, tl])
        .first()
      if (existing) dup++; else add++
    }
    setPreviewDupHint({ dup, add, update: dup })
    notify('info', `去重预检：新增 ${add} 条，已存在更新 ${dup} 条`)
  }

  const handleImport = async () => {
    const sel = rows.filter((r) => r.selected && r.source.trim() && r.target.trim())
    if (sel.length === 0) {
      notify('warning', '无有效勾选可导入（需同时有原文和译文）')
      return
    }
    setImporting(true)
    const now = Date.now()
    const sl = sourceLang ?? 'en'
    const tl = targetLang ?? 'zh-CN'
    let added = 0, updated = 0
    try {
      for (const r of sel) {
        const src = r.source.trim()
        const tgt = r.target.trim()
        const existing = await db.tmEntries
          .where('[source+target+sourceLang+targetLang]')
          .equals([src, tgt, sl, tl])
          .first()
        if (existing) {
          await db.tmEntries.update(existing.id as number, {
            updatedAt: now,
            projectId: existing.projectId ?? (projectId ?? undefined),
            usageCount: (existing.usageCount ?? 0) + 1,
            lastUsedAt: now,
          })
          updated++
        } else {
          try {
            await db.tmEntries.add({
              source: src, target: tgt, sourceLang: sl, targetLang: tl,
              projectId: projectId ?? undefined,
              meta: fileName ? { sourceFile: fileName } : undefined,
              createdAt: now, updatedAt: now,
              usageCount: 1, lastUsedAt: now,
            })
            added++
          } catch { /* 唯一索引冲突 */ updated++ }
        }
      }
      await onImported()
      notify('success', `导入完成：新增 ${added} 条，更新 ${updated} 条`)
      handleClose()
    } catch (err) {
      notify('error', '导入失败：' + (err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const stats = useMemo(() => {
    const total = rows.length
    const selected = rows.filter((r) => r.selected).length
    const emptySrc = rows.filter((r) => r.issue === 'empty_source').length
    const emptyTgt = rows.filter((r) => r.issue === 'empty_target').length
    const dups = rows.filter((r) => r.issue === 'dup').length
    const valid = rows.filter((r) => r.selected && r.source.trim() && r.target.trim()).length
    return { total, selected, emptySrc, emptyTgt, dups, valid }
  }, [rows])

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen
      sx={{ '& .MuiDialog-paper': { bgcolor: 'background.default' } }}
      aria-labelledby="bilingual-import-title"
    >
      <DialogTitle id="bilingual-import-title" sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <VerticalAlignBottomIcon color="primary" />
          <Typography variant="h6">双语整理导入</Typography>
          <Chip size="small" color="primary" variant="outlined"
            label={`${sourceLang ?? 'en'} → ${targetLang ?? 'zh-CN'}`} />
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" onClick={handleClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
        <Paper elevation={1} sx={{ p: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', mb: inputCollapsed ? 0 : 2 }}>
            <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
              <Tab label="粘贴文本" icon={<ContentCopyIcon />} iconPosition="start" value="paste" />
              <Tab label="上传文件" icon={<FileUploadIcon />} iconPosition="start" value="file" />
            </Tabs>
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={() => setInputCollapsed((v) => !v)}
              aria-label={inputCollapsed ? '展开输入区' : '折叠输入区'}
            >
              {inputCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
            </IconButton>
          </Stack>

          <Collapse in={!inputCollapsed}>
          <Stack direction="row" sx={{ mb: 2, alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={dualMode}
                  onChange={(e) => setDualMode(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">双列模式（按行号一一对应原文与译文，分开粘贴/上传）</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={enablePreprocess}
                  onChange={(e) => setEnablePreprocess(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">文本预处理（删除句前空白、合并多余空行）</Typography>}
            />
          </Stack>

          {tab === 'paste' ? (
            dualMode ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    multiline minRows={6} maxRows={10} fullWidth
                    label="原文" placeholder="粘贴原文，按行与右侧译文一一对应"
                    value={pasteSrcText}
                    onChange={(e) => setPasteSrcText(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    multiline minRows={6} maxRows={10} fullWidth
                    label="译文" placeholder="粘贴译文，按行与左侧原文一一对应"
                    value={pasteTgtText}
                    onChange={(e) => setPasteTgtText(e.target.value)}
                  />
                </Grid>
              </Grid>
            ) : (
              <TextField
                multiline minRows={6} maxRows={10} fullWidth
                placeholder={`粘贴双语文本，例如使用【制表符分隔】格式：
Hello\t你好
World\t世界
...`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
            )
          ) : (
            dualMode ? (
              <Stack direction="column" spacing={2}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined" startIcon={<UploadIcon />}
                    onClick={() => srcFileInputRef.current?.click()}
                    title="支持多选，按文件名排序后自动拼接"
                  >
                    选择原文文件（可多选）
                  </Button>
                  <input
                    ref={srcFileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.csv,.md"
                    style={{ display: 'none' }}
                    onChange={handleSrcFilePicked}
                  />
                  {srcFileName ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <FilePresentIcon fontSize="small" color="action" />
                      <Typography variant="body2">{srcFileName}</Typography>
                      <Chip size="small" color="primary" label={`原文 ${srcFileText.length} 字符`} variant="outlined" />
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">未选择原文文件</Typography>
                  )}
                </Stack>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined" startIcon={<UploadIcon />}
                    onClick={() => tgtFileInputRef.current?.click()}
                    title="支持多选，按文件名排序后自动拼接"
                  >
                    选择译文文件（可多选）
                  </Button>
                  <input
                    ref={tgtFileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.csv,.md"
                    style={{ display: 'none' }}
                    onChange={handleTgtFilePicked}
                  />
                  {tgtFileName ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <FilePresentIcon fontSize="small" color="action" />
                      <Typography variant="body2">{tgtFileName}</Typography>
                      <Chip size="small" color="primary" label={`译文 ${tgtFileText.length} 字符`} variant="outlined" />
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">未选择译文文件</Typography>
                  )}
                </Stack>
              </Stack>
            ) : (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Button
                  variant="outlined" startIcon={<UploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择文件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.md,.tmx"
                  style={{ display: 'none' }}
                  onChange={handleFilePicked}
                />
                {fileName ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <FilePresentIcon fontSize="small" color="action" />
                    <Typography variant="body2">{fileName}</Typography>
                    <Chip size="small" label={`${fileText.length} 字符`} variant="outlined" />
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    支持 .txt / .csv / .md 文本文件（TMX 支持后续扩展）
                  </Typography>
                )}
              </Stack>
            )
          )}

          <Divider sx={{ my: 2 }} />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <FormControl size="small" sx={{ minWidth: 320 }}>
              <InputLabel id="bilingual-format-label">解析格式</InputLabel>
              <Select
                labelId="bilingual-format-label"
                label="解析格式"
                value={dualMode ? 'tab_split' : format}
                disabled={dualMode}
                onChange={(e) => setFormat(e.target.value as BilingualFormat)}
                renderValue={dualMode ? () => '双列模式：按行号自动对齐' : undefined}
              >
                {(Object.keys(FORMAT_LABELS) as BilingualFormat[]).map((k) => (
                  <MenuItem key={k} value={k}>{FORMAT_LABELS[k]}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {format === 'two_column_sep' && (
              <TextField
                size="small" label="自定义分隔符" value={customSep} sx={{ width: 180 }}
                onChange={(e) => setCustomSep(e.target.value)}
                placeholder="例如：|||"
              />
            )}

            <Button variant="contained" onClick={doParse} startIcon={<SyncIcon />}>
              解析对齐
            </Button>
            <Button
              size="small"
              onClick={() => {
                if (dualMode) {
                  if (tab === 'paste') {
                    setPasteSrcText(''); setPasteTgtText('')
                  } else {
                    setSrcFileName(''); setSrcFileText(''); setTgtFileName(''); setTgtFileText('')
                    if (srcFileInputRef.current) srcFileInputRef.current.value = ''
                    if (tgtFileInputRef.current) tgtFileInputRef.current.value = ''
                  }
                } else {
                  if (tab === 'paste') {
                    setPasteText('')
                  } else {
                    setFileName(''); setFileText('')
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }
                }
                setRows([]); setPreviewDupHint(null)
              }}
              startIcon={<ClearAllIcon />}
            >
              清空
            </Button>

            <Box sx={{ flex: 1 }} />

            <Button size="small" onClick={removeEmpty} disabled={rows.length === 0} startIcon={<DeleteOutlineOutlinedIcon />}>
              移除空行
            </Button>
            <Button size="small" onClick={dedupeSelected} disabled={rows.length === 0} startIcon={<LibraryBooksIcon />}>
              去重勾选
            </Button>
            <Button size="small" variant="outlined" onClick={runDupPreview} disabled={rows.length === 0} startIcon={<WarningIcon />}>
              去重预检
            </Button>
          </Stack>

          {previewDupHint && (
            <Alert severity="info" sx={{ mt: 2 }}>
              预检出可导入 {stats.valid} 对 → 新增 {previewDupHint.add} 条，已存在更新 {previewDupHint.dup} 条（语言对 {sourceLang ?? 'en'}→{targetLang ?? 'zh-CN'}）
            </Alert>
          )}
          </Collapse>
        </Paper>

        <Paper elevation={1} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <Box sx={{
            px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5,
            borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap',
          }}>
            <Typography variant="subtitle2">对齐校对表格</Typography>
            <Chip size="small" label={`共 ${stats.total} 行`} />
            <Chip size="small" color="primary" variant="outlined" label={`勾选 ${stats.selected}`} />
            <Chip size="small" color="success" variant="outlined" label={`有效 ${stats.valid}`} />
            {stats.emptySrc > 0 && (
              <Chip size="small" color="warning" label={`缺原文 ${stats.emptySrc}`} />
            )}
            {stats.emptyTgt > 0 && (
              <Chip size="small" color="warning" label={`缺译文 ${stats.emptyTgt}`} />
            )}
            {stats.dups > 0 && (
              <Chip size="small" color="default" variant="outlined" label={`重复 ${stats.dups}`} />
            )}
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineOutlinedIcon />}
              disabled={stats.selected === 0}
              onClick={() => {
                const before = rows.length
                setRows((rs) => rs.filter((r) => !r.selected))
                const removed = before - rows.filter((r) => !r.selected).length
                notify('info', `已删除 ${removed} 行勾选的语料`)
              }}
            >
              删除勾选 ({stats.selected})
            </Button>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={rows.length > 0 && rows.every((r) => r.selected)}
                  indeterminate={rows.some((r) => r.selected) && !rows.every((r) => r.selected)}
                  onChange={toggleSelectAll}
                />
              }
              label={<Typography variant="caption">全选</Typography>}
            />
          </Box>

          <TableContainer sx={{ flex: 1, minHeight: 200 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ width: 48 }}>选</TableCell>
                  <TableCell sx={{ width: 52 }}>#</TableCell>
                  <TableCell sx={{ width: '42%' }}>原文</TableCell>
                  <TableCell sx={{ width: '42%' }}>译文</TableCell>
                  <TableCell sx={{ width: 130, whiteSpace: 'nowrap' }} align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      暂无数据：先粘贴文本或上传文件，然后点击「解析对齐」开始校对。
                    </TableCell>
                  </TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={r.id} hover selected={r.selected}
                    sx={r.issue ? { bgcolor: r.issue === 'dup' ? 'action.selected' : 'warning.50' } : undefined}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={r.selected} onChange={() => toggleSelectRow(r.id)} />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 24 }}>{i + 1}</Typography>
                        {r.issue === 'empty_source' && (
                          <Tooltip title="原文为空"><WarningIcon fontSize="inherit" color="warning" sx={{ fontSize: 14 }} /></Tooltip>
                        )}
                        {r.issue === 'empty_target' && (
                          <Tooltip title="译文为空"><WarningIcon fontSize="inherit" color="warning" sx={{ fontSize: 14 }} /></Tooltip>
                        )}
                        {r.issue === 'dup' && (
                          <Tooltip title="导入列表内重复"><LibraryBooksIcon fontSize="inherit" color="action" sx={{ fontSize: 14 }} /></Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small" fullWidth multiline minRows={1}
                        value={r.source}
                        onChange={(e) => updateCell(r.id, 'source', e.target.value)}
                        sx={{
                          '& .MuiInputBase-root': { py: 0.25, fontSize: 13 },
                          '& fieldset': { borderColor: r.issue === 'empty_source' ? 'warning.main' : undefined },
                        }}
                        error={r.issue === 'empty_source'}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small" fullWidth multiline minRows={1}
                        value={r.target}
                        onChange={(e) => updateCell(r.id, 'target', e.target.value)}
                        sx={{
                          '& .MuiInputBase-root': { py: 0.25, fontSize: 13 },
                          '& fieldset': { borderColor: r.issue === 'empty_target' ? 'warning.main' : undefined },
                        }}
                        error={r.issue === 'empty_target'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip title="上移"><IconButton size="small" onClick={() => moveRow(r.id, -1)} disabled={i === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton></Tooltip>
                        <Tooltip title="下移"><IconButton size="small" onClick={() => moveRow(r.id, 1)} disabled={i === rows.length - 1}><ArrowDownwardIcon fontSize="inherit" /></IconButton></Tooltip>
                        <Tooltip title="和下一行合并"><IconButton size="small" onClick={() => mergeWithNext(r.id)} disabled={i === rows.length - 1}><MergeIcon fontSize="inherit" /></IconButton></Tooltip>
                        <Tooltip title="按标点拆分为多行"><IconButton size="small" onClick={() => splitRow(r.id)}><SplitIcon fontSize="inherit" /></IconButton></Tooltip>
                        <Tooltip title="删除此行"><IconButton size="small" color="error" onClick={() => deleteRow(r.id)}><DeleteOutlineOutlinedIcon fontSize="inherit" /></IconButton></Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
          提示：可直接编辑原文/译文单元格修正文本；重复/空行会用背景色和图标提示。
        </Typography>
        <Button onClick={handleClose} disabled={importing}>取消</Button>
        <Button
          variant="contained"
          disabled={importing || stats.valid === 0}
          onClick={handleImport}
          startIcon={importing ? <CircularProgress size={16} color="inherit" /> : <SaveAsIcon />}
        >
          {importing ? `导入中 (${stats.valid})` : `导入 ${stats.valid} 对到记忆库`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/* =========================================================================
 * 数据备份设置区：自动快照 + 本地备份提醒 + 快照列表管理
 * ========================================================================= */
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}
function formatDateTime(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function BackupSettingsSection(): ReactElement {
  const notify = useUIStore((s) => s.notify)
  const [status, setStatus] = useState<BackupStatus>({
    enabled: true, intervalMin: 5, keep: 10, lastAt: null, count: 0,
  })
  const [reminder, setReminder] = useState<ReminderStatus>({
    enabled: true, intervalHour: 24, lastFullDownloadAt: null, shouldRemind: false,
  })
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([])
  const [loadingSnap, setLoadingSnap] = useState(false)
  const [busyId, setBusyId] = useState<number | 'now' | 'clear' | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<BackupSnapshot | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [restoreSettings, setRestoreSettings] = useState(true)

  const refreshAll = useCallback(async () => {
    try {
      const [s, r, list] = await Promise.all([
        getBackupStatus(),
        getBackupReminderStatus(),
        listSnapshots(100),
      ])
      setStatus(s)
      setReminder(r)
      setSnapshots(list)
    } catch (e) {
      console.error('[BackupSettings] refresh failed', e)
    }
  }, [])

  // 初始化 + 订阅调度器广播
  useEffect(() => {
    void refreshAll()
    const unsub = BackupScheduler.subscribe((s) => setStatus(s))
    // 定时轻量刷新快照列表（调度器只广播 BackupStatus 计数，不含完整列表）
    const iv = setInterval(() => { void refreshAll() }, 30_000)
    return () => { unsub(); clearInterval(iv) }
  }, [refreshAll])

  const currentProjectId = useProjectStore((s) => s.currentProjectId)
  const currentProjectName = useProjectStore((s) =>
    s.projects.find((p) => p.id === currentProjectId)?.name,
  )

  const onToggleEnabled = async (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.checked
    await updateBackupConfig({ enabled: v })
    notify(v ? 'success' : 'info', v ? '已启用自动快照' : '已关闭自动快照')
    await refreshAll()
  }

  const onIntervalChange = async (v: number) => {
    await updateBackupConfig({ intervalMin: v })
    notify('success', `快照间隔已调整为 ${v} 分钟`)
    await refreshAll()
  }

  const onKeepChange = async (v: number) => {
    await updateBackupConfig({ keep: v })
    notify('success', `保留份数已调整为 ${v} 份`)
    await refreshAll()
  }

  const onReminderToggle = async (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.checked
    await updateBackupReminderConfig({ enabled: v })
    notify('info', v ? '已开启本地备份提醒' : '已关闭本地备份提醒')
    await refreshAll()
  }

  const onReminderHourChange = async (v: number) => {
    await updateBackupReminderConfig({ intervalHour: v })
    notify('success', `本地备份提醒间隔已调整为 ${v} 小时`)
    await refreshAll()
  }

  const onManualSnapshot = async () => {
    try {
      setBusyId('now')
      await BackupScheduler.triggerNow({ currentProjectId, currentProjectName })
      notify('success', '已创建手动快照')
    } catch (e) {
      notify('error', `快照创建失败：${(e as Error)?.message ?? '未知错误'}`)
    } finally {
      setBusyId(null)
      await refreshAll()
    }
  }

  const onClearAll = async () => {
    try {
      setBusyId('clear')
      await clearAllSnapshots()
      notify('success', '已清理所有本地快照')
    } catch (e) {
      notify('error', `清理失败：${(e as Error)?.message ?? ''}`)
    } finally {
      setBusyId(null)
      setConfirmClear(false)
      await refreshAll()
    }
  }

  const onDelete = async (id: number) => {
    try {
      setBusyId(id)
      await deleteSnapshot(id)
      notify('success', '已删除快照')
    } catch (e) {
      notify('error', `删除失败：${(e as Error)?.message ?? ''}`)
    } finally {
      setBusyId(null)
      await refreshAll()
    }
  }

  const onDownload = async (snap: BackupSnapshot) => {
    try {
      setBusyId(snap.id!)
      await downloadSnapshot(snap)
      // 用户下载了文件即视为一次完整本地备份
      await markFullBackupDone()
      notify('success', '快照已导出下载')
    } catch (e) {
      notify('error', `导出失败：${(e as Error)?.message ?? ''}`)
    } finally {
      setBusyId(null)
      await refreshAll()
    }
  }

  const onRestore = async () => {
    if (!confirmRestore) return
    let snapId: number | undefined
    try {
      setBusyId(confirmRestore.id!)
      snapId = confirmRestore.id
      const projName = confirmRestore.summary.currentProjectName
      await restoreSnapshot(confirmRestore, { restoreSettings })
      // 刷新项目列表
      const s = useProjectStore.getState()
      if (typeof s.loadProjects === 'function') await s.loadProjects()
      notify('success', `已恢复快照${projName ? '（' + projName + '）' : ''}，建议刷新页面以确保所有状态同步`)
      setConfirmRestore(null)
    } catch (e) {
      notify('error', `恢复失败：${(e as Error)?.message ?? '未知错误'}`)
    } finally {
      if (snapId) setBusyId(null)
      await refreshAll()
    }
  }

  return (
    <Box>
      {/* === 自动快照配置 === */}
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <HistoryIcon color="primary" fontSize="small" />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>自动快照（fflate 压缩）</Typography>
            </Stack>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={status.enabled}
                  onChange={onToggleEnabled}
                />
              }
              label={<Typography variant="body2">{status.enabled ? '已启用' : '已关闭'}</Typography>}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 1 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel shrink>快照间隔（分钟）</InputLabel>
              <Select
                value={status.intervalMin}
                label="快照间隔（分钟）"
                onChange={(e) => onIntervalChange(Number(e.target.value))}
              >
                {[1, 3, 5, 10, 15, 30, 60, 120].map((m) => (
                  <MenuItem key={m} value={m}>{m} 分钟</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel shrink>滚动保留份数</InputLabel>
              <Select
                value={status.keep}
                label="滚动保留份数"
                onChange={(e) => onKeepChange(Number(e.target.value))}
              >
                {[5, 10, 20, 50, 100].map((n) => (
                  <MenuItem key={n} value={n}>{n} 份</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={busyId === 'now' ? <CircularProgress size={14} color="inherit" /> : <BackupIcon />}
              onClick={onManualSnapshot}
              disabled={busyId !== null}
            >
              {busyId === 'now' ? '快照中…' : '立即创建快照'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={busyId === 'clear' ? <CircularProgress size={14} color="inherit" /> : <DeleteForeverIcon />}
              onClick={() => setConfirmClear(true)}
              disabled={busyId !== null || snapshots.length === 0}
            >
              清理全部快照
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={<RefreshIcon />}
              onClick={() => { setLoadingSnap(true); refreshAll().finally(() => setLoadingSnap(false)) }}
              disabled={busyId !== null}
            >
              刷新列表
            </Button>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
            <Chip
              size="small"
              label={`现有 ${status.count} 份`}
              color={status.count > 0 ? 'primary' : 'default'}
              variant="outlined"
            />
            <Chip size="small" label={`上次：${formatDateTime(status.lastAt)}`} variant="outlined" />
            {status.avgRatio != null && (
              <Chip
                size="small"
                label={`压缩率 ${(status.avgRatio * 100).toFixed(0)}%`}
                variant="outlined"
                color="success"
              />
            )}
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              快照写入 IndexedDB 的 backupSnapshots 表；关闭页面/切换后台时自动再存一份。
            </Typography>
          </Stack>
        </Box>

        {/* === 本地备份提醒 === */}
        <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <NotificationsActiveIcon color="warning" fontSize="small" />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>全量本地备份提醒</Typography>
            </Stack>
            <FormControlLabel
              control={
                <Checkbox size="small" checked={reminder.enabled} onChange={onReminderToggle} />
              }
              label={<Typography variant="body2">{reminder.enabled ? '已启用' : '已关闭'}</Typography>}
            />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 1 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel shrink>提醒间隔（小时）</InputLabel>
              <Select
                value={reminder.intervalHour}
                label="提醒间隔（小时）"
                onChange={(e) => onReminderHourChange(Number(e.target.value))}
              >
                {[6, 12, 24, 48, 72].map((h) => (
                  <MenuItem key={h} value={h}>{h} 小时</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                上次下载备份：{reminder.lastFullDownloadAt ? formatDateTime(reminder.lastFullDownloadAt) : '从未'}
                {reminder.shouldRemind && (
                  <Chip size="small" color="warning" sx={{ ml: 1 }} label="已到期提醒" />
                )}
              </Typography>
            </Box>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            到期后在顶栏以非打断 banner 提示用户把数据下载到本地文件（双保险：IndexedDB 自动快照 + 本地文件存档）。
          </Typography>
        </Box>
      </Stack>

      {/* === 快照列表 === */}
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>快照列表</Typography>
          {loadingSnap && <CircularProgress size={14} />}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            共 {snapshots.length} 条（最多显示 100 条）
          </Typography>
        </Stack>

        <Paper variant="outlined" sx={{ maxHeight: 320, overflow: 'auto' }}>
          <TableContainer sx={{ minWidth: 640 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 48 }}>#</TableCell>
                  <TableCell>创建时间</TableCell>
                  <TableCell>激活项目</TableCell>
                  <TableCell align="right">段/项目/文件</TableCell>
                  <TableCell align="right">压缩前</TableCell>
                  <TableCell align="right">压缩后</TableCell>
                  <TableCell align="right" sx={{ width: 156 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshots.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        暂无快照。点击上方「立即创建快照」开始创建第一份。
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {snapshots.map((snap, idx) => {
                  const isBusy = busyId === snap.id
                  return (
                    <TableRow key={snap.id} hover>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{formatDateTime(snap.createdAt)}</TableCell>
                      <TableCell>
                        <Tooltip title={snap.summary.currentProjectName ?? '(无激活项目)'}>
                          <span style={{
                            maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle',
                          }}>
                            {snap.summary.currentProjectName ?? '—'}
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={`${snap.summary.segmentCount}段 / ${snap.summary.projectCount}项目 / ${snap.summary.fileCount}文件`} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">{formatBytes(snap.originalSize)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          <span>{formatBytes(snap.compressedSize)}</span>
                          <Chip
                            size="small"
                            label={snap.compression.toUpperCase()}
                            variant="outlined"
                            color={snap.compression === 'gzip' ? 'success' : 'default'}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
                          <Tooltip title="恢复到此快照（会清库重建）">
                            <span>
                              <IconButton
                                size="small"
                                color="primary"
                                disabled={isBusy}
                                onClick={() => { setRestoreSettings(true); setConfirmRestore(snap) }}
                              >
                                <RestorePageIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="下载为本地 .cat-project.json（便于迁移）">
                            <span>
                              <IconButton
                                size="small"
                                color="inherit"
                                disabled={isBusy}
                                onClick={() => onDownload(snap)}
                              >
                                {isBusy ? <CircularProgress size={14} /> : <DownloadIcon fontSize="inherit" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="删除此快照">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={isBusy}
                                onClick={() => onDelete(snap.id!)}
                              >
                                <DeleteOutlineOutlinedIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* === Dialog：恢复确认 === */}
      <Dialog open={!!confirmRestore} onClose={() => !busyId && setConfirmRestore(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <WarningIcon color="warning" />
            <span>恢复快照确认</span>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            恢复操作会<strong>清空当前所有项目、文件、段落、术语库、记忆库</strong>，然后用快照数据重建。
            此操作不可逆，建议先点击下方「下载备份」另存一份当前数据。
          </Alert>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="caption" color="text.secondary">快照时间</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {confirmRestore ? formatDateTime(confirmRestore.createdAt) : '—'}
              </Typography>
            </Box>
            {confirmRestore?.summary.currentProjectName && (
              <Box>
                <Typography variant="caption" color="text.secondary">快照激活项目</Typography>
                <Typography variant="body2">{confirmRestore.summary.currentProjectName}</Typography>
              </Box>
            )}
            {confirmRestore && (
              <Box>
                <Typography variant="caption" color="text.secondary">数据规模</Typography>
                <Typography variant="body2">
                  {confirmRestore.summary.projectCount} 项目 / {confirmRestore.summary.fileCount} 文件 / {confirmRestore.summary.segmentCount} 段
                  {' · '}TM {confirmRestore.summary.tmCount} · TB {confirmRestore.summary.tbCount}
                </Typography>
              </Box>
            )}
            <FormControlLabel
              control={
                <Checkbox size="small" checked={restoreSettings} onChange={(e) => setRestoreSettings(e.target.checked)} />
              }
              label="同时恢复设置（db.settings：主题、词典/翻译/AI 配置等）"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => confirmRestore && onDownload(confirmRestore)} startIcon={<DownloadIcon />} disabled={busyId !== null}>
            下载备份
          </Button>
          <Button onClick={() => setConfirmRestore(null)} disabled={busyId !== null}>取消</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={onRestore}
            disabled={busyId !== null}
            startIcon={busyId === confirmRestore?.id ? <CircularProgress size={16} color="inherit" /> : <RestorePageIcon />}
          >
            {busyId === confirmRestore?.id ? '恢复中…' : '确认恢复到此快照'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* === Dialog：清理全部确认 === */}
      <Dialog open={confirmClear} onClose={() => !busyId && setConfirmClear(false)} maxWidth="xs">
        <DialogTitle>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <DeleteForeverIcon color="error" />
            <span>清理所有快照？</span>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            将删除当前 IndexedDB 中全部 {snapshots.length} 条自动快照。
            已下载到本地的 .cat-project.json 文件不受影响。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)} disabled={busyId !== null}>取消</Button>
          <Button
            color="error" variant="contained"
            onClick={onClearAll}
            disabled={busyId !== null}
            startIcon={busyId === 'clear' ? <CircularProgress size={16} color="inherit" /> : <DeleteForeverIcon />}
          >
            {busyId === 'clear' ? '清理中…' : '确认全部删除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
