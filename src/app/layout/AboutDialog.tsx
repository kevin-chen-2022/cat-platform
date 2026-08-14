import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Link,
  Button,
  Tooltip,
  useTheme,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import FavoriteIcon from '@mui/icons-material/Favorite'
import type { ReactElement, ReactNode } from 'react'

/* =========================
 * 键盘按键标签组件
 * ========================= */
function Kbd({ children }: { children: ReactNode }): ReactElement {
  return (
    <Box
      component="kbd"
      sx={{
        fontFamily: 'monospace',
        fontSize: '0.8em',
        px: 0.5,
        py: 0.1,
        border: 1,
        borderColor: 'divider',
        borderRadius: 0.5,
        mx: 0.15,
        whiteSpace: 'nowrap',
        bgcolor: 'action.hover',
      }}
    >
      {children}
    </Box>
  )
}

/** 快捷键行：左侧按键组合，右侧说明文字 */
function ShortcutRow({ keys, desc }: { keys: ReactNode; desc: string }): ReactElement {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 0.5 }}>
      <Box sx={{ flexShrink: 0, minWidth: 120, pt: 0.2 }}>{keys}</Box>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
        {desc}
      </Typography>
    </Stack>
  )
}

/** 快捷键分组标题 */
function ShortcutGroupTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', mt: 1.5, mb: 0.75 }}>
      {children}
    </Typography>
  )
}

/* =========================
 * 使用说明数据
 * ========================= */
const USAGE_SECTIONS: Array<{
  id: string
  title: string
  summary?: string
  render: () => ReactElement
}> = [
  {
    id: 'about',
    title: '关于本工具',
    render: () => (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
          CAT 工作台
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          版本 1.0 · 更新日期：2026 年 8 月
        </Typography>
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          开源免费、实用强大的 CAT 工具。基于浏览器本地运行，数据存储在 IndexedDB 中，无需注册、无需联网即可使用。
        </Typography>
        <Typography variant="body2">
          开源仓库：
          <Link
            href="https://github.com/kevin-chen-2022/cat-platform"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ ml: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
          >
            github.com/kevin-chen-2022/cat-platform
            <OpenInNewIcon sx={{ fontSize: 14 }} />
          </Link>
        </Typography>
      </Box>
    ),
  },
  {
    id: 'quick-start',
    title: '快速上手',
    summary: '从创建项目到完成翻译的基本流程',
    render: () => (
      <Box sx={{ '& .step-item': { mb: 1.5 } }}>
        <div className="step-item">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>1. 创建项目</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            点击顶部菜单「项目 → 新建项目」，设置项目名称、源语言和目标语言，即可创建一个翻译工程。
          </Typography>
        </div>
        <div className="step-item">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>2. 导入原文</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            点击「文件 → 导入原文…」，支持 txt / md / docx / pdf / xlsx / json / csv 等格式。导入时可选择解析粒度（段落级 / 句子级 / 混合），句子级模式下会自动合并跨行句子。docx 和 pdf 文件会保留原始二进制数据，供原格式预览使用。
          </Typography>
        </div>
        <div className="step-item">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>3. 翻译编辑</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            在「双语编辑器」卡片中逐段翻译。左侧为原文，右侧为译文输入框。支持标注段落状态（未译 / 已译 / 草稿等）。Markdown 文件保留原始语法（#、**、[] 等），便于译文格式与原文一致。
          </Typography>
        </div>
        <div className="step-item">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>4. 原格式预览</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            在「全文预览」卡片中切换到「原格式预览」，可查看 docx / pdf 文件的原始排版（含字体、图片、表格）。预览支持与编辑器双向联动：点击段落高亮预览位置，点击预览文本跳转回编辑器。
          </Typography>
        </div>
        <div className="step-item">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>5. 辅助翻译</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            利用翻译记忆、术语库、机器翻译、AI 翻译等功能辅助翻译。各卡片之间支持正向联动和反向联动。
          </Typography>
        </div>
        <div className="step-item">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>6. 导出译文</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            点击「文件 → 导出译文/双语…」，按选中文件或全部文件，导出双语对照或仅译文。
          </Typography>
        </div>
        <div className="step-item">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>7. 保存项目</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
            点击「项目 → 保存项目」，下载带时间戳的 .cat-project.json 存档文件，可随时通过「打开项目」恢复。
          </Typography>
        </div>
      </Box>
    ),
  },
  {
    id: 'panels',
    title: '功能卡片一览',
    summary: '各功能卡片的用途和操作说明',
    render: () => (
      <Box>
        {[
          { name: '项目文件', desc: '管理翻译项目、文件和文件夹树。可创建、切换、关闭项目，查看文件列表和翻译进度。' },
          { name: '双语编辑器', desc: '核心工作区。逐段翻译编辑，支持状态标注、批量操作、快捷键。原文行内提供"AI解释""机器翻译""词典查询""定位""片段搜索"等操作按钮。聚焦编辑台可让单段编辑独占空间。' },
          { name: '全文预览', desc: '实时预览整篇文档。支持 Markdown 富文本渲染和纯文本切换；docx/pdf 文件支持原格式预览（保留原始排版、字体、表格、图片），并提供缩放控制（50%~200%）。预览与编辑器双向联动：点击段落高亮预览位置，点击预览文本跳转回编辑器。' },
          { name: '翻译记忆', desc: '管理和查询翻译记忆库。系统自动保存已译段落，翻译时自动匹配相似句对。支持手动增删、批量导入导出（Excel/CSV/JSON/TXT）、复制导入。原文译文过长时自动折叠，点击展开。' },
          { name: '片段搜索', desc: '在全部翻译段中搜索原文或译文关键词，快速定位段落。结果过长时自动折叠，点击展开。' },
          { name: '术语显示', desc: '展示当前原文命中的术语条目，高亮匹配内容。支持术语的增删改查。' },
          { name: '机器翻译', desc: '集成百度、有道、彩云等多个机器翻译引擎。支持源/目标语言选择（默认跟随项目语言对，可手动调整并一键交换），支持正向联动（点击段落自动翻译）和反向联动。' },
          { name: 'AI 翻译', desc: '基于大语言模型（DeepSeek / 豆包 / 通义 / 智谱）的智能翻译。支持源/目标语言选择（默认跟随项目语言对，可手动调整并一键交换）、自定义 Prompt、术语套用（自动注入命中术语）、批量自动翻译。' },
          { name: 'AI 问答', desc: '向 AI 提问翻译相关问题，支持上下文对话、原文语境引用。结果以 Markdown 渲染。' },
          { name: 'QA 质检', desc: '自动检测翻译质量问题。规则质检覆盖术语一致性、数字/标签丢失、空译文、重复译文、长度比例异常；AI 质检可启用大模型深度检查（可自定义提示词，显示 token 用量）。支持跟随模式（切换段自动质检当前段）、全文件批量质检、根据质检结果自动标注段状态、结果按段分组并一键跳转。' },
          { name: '项目词典库', desc: '项目级术语库管理，独立于全局术语库，随项目导入导出。' },
          { name: '项目记忆库', desc: '项目级翻译记忆库管理，独立于全局记忆库，随项目导入导出。' },
          { name: '设置', desc: '配置 AI 接口、机器翻译 API、词典源、字体字号、深浅主题、显示选项等。支持设置导入导出。入口：顶部工具栏「维护」菜单中的「设置」项（全屏弹窗）。' },
        ].map((item) => (
          <Box key={item.name} sx={{ mb: 1.5 }}>
            <Typography variant="body2" component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
              {item.name}
            </Typography>
            <Typography variant="body2" component="span" color="text.secondary" sx={{ ml: 1 }}>
              — {item.desc}
            </Typography>
          </Box>
        ))}
      </Box>
    ),
  },
  {
    id: 'linkage',
    title: '联动机制',
    summary: '正向联动与反向联动的行为说明',
    render: () => (
      <Box>
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          CAT 工作台的各功能卡片之间存在联动机制，实现"选中段落 → 自动查询"的效果。
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>正向联动</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            在双语编辑器中点击或激活某个段落时，翻译记忆、术语显示、片段搜索、机器翻译、AI 翻译等卡片会自动查询当前段落的原文内容。全文预览（含原格式预览）会自动滚动并高亮对应位置。对于机器翻译和 AI 翻译，仅当段落状态为「未译」时才会自动触发翻译，避免对已译段落重复翻译。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>反向联动</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            当你手动切换到某个功能卡片的 Tab 时（如点击"翻译记忆"标签），系统会以当前激活段落的内容重新触发一次查询，确保卡片显示的数据与当前段落一致。反向联动同样会过滤已译段落，不重复翻译。在原格式预览中点击文本，会跳转到编辑器对应段落（反向定位）。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>手动操作不受限</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            原文行内的"AI 解释""机器翻译""词典查询"等按钮和 AI 翻译卡片中的"重译"按钮属于用户主动操作，不判断段落状态，随时可用。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>TM 自动填充（✅ 列表打勾图标）</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            双语编辑器工具栏提供 TM 自动填充按钮（位于自动翻译按钮右侧），可批量处理未译段落：<br/>
            • <strong>普通点击</strong>：以 100% 匹配阈值填充当前文件所有未译段——从翻译记忆库查找完全匹配的句对，自动填入译文并标记为草稿。<br/>
            • <strong>Shift + 点击</strong>：弹出阈值设置对话框，可降低匹配阈值（如 75%）以填充模糊匹配段，但准确度相应降低。<br/>
            数据源优先级：当前项目 TM → 全局同语言对 TM → 当前文件已译段落（回退）。已译段落不会被覆盖。建议先用 TM 自动填充处理高匹配段（免费、即时），再对剩余未译段用 AI/MT 翻译。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'clipboard',
    title: '剪贴板翻译',
    summary: '快速翻译零散资料的便捷小工具',
    render: () => (
      <Box>
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          双语编辑器顶部工具栏右侧提供两个剪贴板图标，用于快速处理零散资料（如邮件、网页片段、聊天记录等），无需经过完整的导入流程。
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>从剪贴板导入（📋 粘贴图标）</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            点击后读取系统剪贴板内容，按句子级粒度自动拆分为翻译段，保存到当前项目下名为「剪贴板翻译」的文件中。若该项目已存在同名文件，则将新内容追加到文件末尾（原有段落保留），并自动激活第一个新段落以便立即翻译。即使未打开任何文件，只要有项目存在即可使用。快捷键 <Kbd>Ctrl/Cmd</Kbd>+<Kbd>Alt</Kbd>+<Kbd>V</Kbd> 可快速触发。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>导出到剪贴板（📄 复制图标）</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            将当前文件中所有已译段落（状态非「未译」且译文非空）的译文按顺序导出到剪贴板，每段一行。未译段落自动跳过，便于将翻译结果粘贴到其他应用。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>剪贴板读取失败的兜底</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            若浏览器因安全策略拒绝直接读取剪贴板（如非 HTTPS 环境、权限被拒），会弹出一个多行文本框，可手动粘贴（Ctrl+V）内容后点击「导入」。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'qa',
    title: 'QA 质检',
    summary: '规则质检 + AI 质检，覆盖单段跟随与全文件批量',
    render: () => (
      <Box>
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          QA 质检卡片提供规则质检与 AI 质检两套机制，可单独使用，也可组合使用。结果按段分组展示，每条问题可标记已解决，支持一键跳转到对应段。
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>规则质检（内置）</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            自动检查：术语一致性（未用约定译法）、数字丢失、HTML 标签/占位符丢失、空译文、相同原文存在多种译文（重复检测，仅全文件质检时触发）、译文长度比例异常（过短疑似漏译、过长疑似冗余）。规则质检即时完成，不消耗 token。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>AI 质检（可选）</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            展开「AI 质检」开关后，质检会调用已启用的 AI 服务商（DeepSeek / 豆包 / 通义 / 智谱）对原文+译文做深度检查，可发现漏译、错译、语法、风格等规则无法覆盖的问题。提示词可自定义，结果以紫色 AI 标签区分于机器质检，并显示单次 token 用量（↑prompt ↓completion 共total）。AI 无问题时会返回一条 info 提示，避免误以为未跑 AI。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>质检当前段（跟随模式）</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            点击「质检当前段」按钮即开启跟随模式（按钮变为蓝色实心「跟随当前段 ✓」）：立即对当前段质检一次，且之后每切换一段都会自动质检（规则 + AI 按当前设置）。再次点击关闭。跟随模式与全文件质检互斥：启动全文件质检会自动退出跟随模式。AI 质检进行中时，对应段会显示紫色「AI 质检中…」占位，结果返回后替换为真实问题。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>全文件质检</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            点击「全文件质检」对当前文件所有段批量检查：先同步完成规则质检，再串行逐段执行 AI 质检。进行中按钮自动禁用，并显示「停止」按钮可中途取消。AI 质检中每段先显示占位，完成一条即显示一条（流式反馈）。循环中每次实时读取用户设置，可中途开关 AI 质检，剩余段按最新设置处理。顶部进度条显示「AI质检中 X/N」。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>根据质检结果自动标注</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            开启「根据质检结果自动标注」开关后，质检完成会按问题严重度自动更新段状态：无问题且有译文 → 通过（approved）；存在 error → 驳回（rejected）；仅 warning → 审校中（reviewing）。便于在段列表一眼识别哪些段需要返工。开关默认关闭，状态不会强制覆盖。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>结果操作</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            结果按段分组，每段显示问题数 Chip 和「跳转」按钮（点击跳转到编辑器对应段并激活）。每条问题可点击右侧 ✓ 图标标记为已解决（从列表中隐藏）。点击右上角清空按钮可清空全部结果。AI 质检开关、提示词、自动标注开关、跟随模式均持久化到 localStorage，刷新页面后保留。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'shortcuts',
    title: '快捷键',
    summary: '键盘快捷键速查表',
    render: () => (
      <Box>
        <Typography variant="body2" component="div" sx={{ mb: 1 }}>
          以下快捷键在「双语编辑器」中生效。Windows/Linux 使用 <Kbd>Ctrl</Kbd>，macOS 使用 <Kbd>Cmd</Kbd>（⌘），下文统一写作「Ctrl/Cmd」。
        </Typography>

        <ShortcutGroupTitle>全局快捷键（无需焦点在编辑区）</ShortcutGroupTitle>
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>F</Kbd></>}
          desc="打开 / 关闭查找替换栏"
        />
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd></>}
          desc="跳至下个未译段落"
        />
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>Shift</Kbd>+<Kbd>M</Kbd></>}
          desc="将当前段与下一段合并"
        />
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>Shift</Kbd>+<Kbd>S</Kbd></>}
          desc="在选区起点拆分当前段"
        />
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>Alt</Kbd>+<Kbd>V</Kbd></>}
          desc="从剪贴板导入原文（剪贴板翻译）"
        />

        <ShortcutGroupTitle>译文编辑（焦点在译文输入框时）</ShortcutGroupTitle>
        <ShortcutRow
          keys={<><Kbd>Enter</Kbd></>}
          desc="提交译文（草稿）并跳到下一段"
        />
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>Enter</Kbd></>}
          desc="标记为已译并跳到下一段"
        />
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd></>}
          desc="标记为已译并跳到下个未译段"
        />
        <ShortcutRow
          keys={<><Kbd>Tab</Kbd></>}
          desc="提交并跳到下一段"
        />
        <ShortcutRow
          keys={<><Kbd>Shift</Kbd>+<Kbd>Tab</Kbd></>}
          desc="提交并跳到上一段"
        />
        <ShortcutRow
          keys={<><Kbd>Esc</Kbd></>}
          desc="取消编辑，退出当前段选中"
        />

        <ShortcutGroupTitle>聚焦编辑台</ShortcutGroupTitle>
        <ShortcutRow
          keys={<><Kbd>Enter</Kbd></>}
          desc="提交并跳到下一段"
        />
        <ShortcutRow
          keys={<><Kbd>Shift</Kbd>+<Kbd>Enter</Kbd></>}
          desc="提交并跳到上一段"
        />
        <ShortcutRow
          keys={<><Kbd>Tab</Kbd> / <Kbd>Shift</Kbd>+<Kbd>Tab</Kbd></>}
          desc="下一段 / 上一段"
        />
        <ShortcutRow
          keys={<><Kbd>Esc</Kbd></>}
          desc="恢复原译文并退出聚焦编辑台"
        />

        <ShortcutGroupTitle>查找 / 替换</ShortcutGroupTitle>
        <ShortcutRow
          keys={<><Kbd>Enter</Kbd></>}
          desc="跳到下一处匹配"
        />
        <ShortcutRow
          keys={<><Kbd>Shift</Kbd>+<Kbd>Enter</Kbd></>}
          desc="跳到上一处匹配"
        />
        <ShortcutRow
          keys={<><Kbd>Esc</Kbd></>}
          desc="关闭查找替换栏"
        />

        <ShortcutGroupTitle>原文编辑 / 输入框惯例</ShortcutGroupTitle>
        <ShortcutRow
          keys={<><Kbd>Enter</Kbd></>}
          desc="确认原文修改 / 在术语、记忆库新增表单中切换到下一个输入框"
        />
        <ShortcutRow
          keys={<><Kbd>Ctrl/Cmd</Kbd>+<Kbd>Enter</Kbd></>}
          desc="在术语、记忆库新增表单中直接提交"
        />
        <ShortcutRow
          keys={<><Kbd>Esc</Kbd></>}
          desc="取消编辑"
        />

        <Box sx={{ mt: 2, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            提示：中文输入法下，部分组合键（如 Ctrl+Shift+S）可能被输入法拦截。如遇快捷键不响应，请切换到英文输入法或暂时关闭输入法的冲突快捷键。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'layout',
    title: '布局与视图',
    summary: '自定义工作台布局、Tab 管理、极简模式',
    render: () => (
      <Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>布局管理</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            通过「视图」菜单可以保存当前布局、加载已有布局、恢复默认布局。布局包含各卡片的位置、大小比例和 Tab 顺序，可随时切换。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>Tab 显隐</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            在「视图」菜单中勾选/取消勾选各功能卡片，即可控制其在工作台中的显示与隐藏。关闭的 Tab 可以随时重新打开。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>极简模式</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            开启极简模式后，隐藏面板边框与标题栏，仅保留内容区，提供更沉浸的翻译体验。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>深色模式</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            点击工具栏右侧的日/月图标切换深色/浅色主题，所有卡片自动适配。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>字体设置</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            在「设置」（顶部工具栏「维护」菜单 → 设置）的「基本设置」中可调整字体和字号，作用于所有功能卡片的内容显示区域。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>预览模式切换</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            在「全文预览」卡片顶部工具栏可切换显示模式：Markdown 文件支持「Markdown 富文本」和「纯文本」切换；docx / pdf 文件支持「原格式预览」和「纯文本」切换。原格式预览提供独立的缩放控制（50%~200%）。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'ai-config',
    title: 'AI 与机器翻译配置',
    summary: '配置 AI 接口、机器翻译 API 的方法',
    render: () => (
      <Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>AI 翻译 / AI 问答</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            在「设置」（顶部工具栏「维护」菜单 → 设置）中配置 AI 服务商（支持 DeepSeek、豆包、通义千问、智谱），填入 API Key、Base URL 和模型名称。可自定义翻译系统 Prompt 和问答系统 Prompt。翻译时可开启「术语套用」自动注入匹配术语。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>机器翻译</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            机器翻译支持网页模式（百度、有道、QQ、阿里巴巴、搜狗、爱词霸）和 API 模式（百度翻译 API、彩云小译 API）。在「设置」（顶部工具栏「维护」菜单 → 设置）中切换模式并配置相应的密钥。机器翻译面板提供源/目标语言选择，默认读取当前项目的语言对，可临时手动调整或点击切换按钮交换语言对，仅影响当前翻译，不修改项目设置。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>词典查询</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            支持在线词典（必应、有道、欧路）和本地词典，可在「设置」（顶部工具栏「维护」菜单 → 设置）中配置。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'backup',
    title: '数据备份与迁移',
    summary: '项目存档、设置导出导入、自动快照',
    render: () => (
      <Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>项目存档</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            「项目 → 保存项目」可下载 .cat-project.json 存档文件，包含项目、文件、段落、翻译记忆、术语等全部数据。「另存项目为…」可选择仅当前项目或全量导出。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>用户设置导出/导入</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            「项目 → 导出用户设置…」可下载 .cat-settings.json，包含主题、字体、AI 配置、MT 配置、词典设置、术语库、自定义布局、WebDAV 云同步配置、网络协同翻译配置等本地偏好。通过「导入用户设置…」可恢复到另一台设备。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>自动快照</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            系统会按设定间隔自动创建本地快照（存储在 IndexedDB），在意外关闭时可恢复数据。可在「设置」（顶部工具栏「维护」菜单 → 设置）中配置快照间隔和保留份数。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'cloud-sync',
    title: '云端同步（WebDAV）',
    summary: '通过 WebDAV 备份/恢复项目数据、同步翻译记忆库',
    render: () => (
      <Box>
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          云端同步基于 WebDAV 协议，将本地项目数据和翻译记忆库备份到网盘（如坚果云、Nextcloud、ownCloud），并在其他设备上恢复，实现跨设备协作与数据安全。
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>配置连接</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            在「设置」（顶部工具栏「维护」菜单 → 云端同步）中填写 WebDAV 服务商（预设坚果云/Nextcloud/ownCloud）、URL、用户名和密码。坚果云需使用「应用密码」（非账号登录密码），在坚果云官网「安全选项 → 第三方应用管理」中生成。填写后点击「测试连接」验证。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>项目备份与恢复</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            连接成功后，可选择「全部项目」或「当前项目」一键上传备份（自动 gzip 压缩，远端存放于 <code>cat-platform/</code> 目录下，文件名含时间戳）。点击「刷新列表」可拉取远端备份，选中后选择恢复策略：<br/>
            • <strong>合并</strong>：按 ID 覆盖同名数据，最常用、最安全；<br/>
            • <strong>追加</strong>：作为新项目导入，不覆盖已有数据；<br/>
            • <strong>覆盖</strong>：先清空本地全部数据再写入（危险，需二次确认）。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>翻译记忆库（TM）同步</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            点击「TM 双向同步」会同时执行：上传本地全部 TM 条目到远端，并拉取远端最新 TM 合并到本地（按唯一键 upsert，不产生重复）。便于多台设备共享翻译记忆积累。
          </Typography>
        </Box>
        <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            提示：浏览器直接访问 WebDAV 存在 CORS 跨域限制（坚果云等不支持跨域）。网页中点击「测试连接」可能失败，但使用 Tauri 打包后的桌面程序可绕过此限制正常通信。建议在桌面版中使用云端同步功能。
          </Typography>
        </Box>
      </Box>
    ),
  },
  {
    id: 'collab',
    title: '网络协同翻译',
    summary: '多人实时协作：段锁定、译文共享、即时聊天',
    render: () => (
      <Box>
        <Typography variant="body2" component="div" sx={{ mb: 2 }}>
          网络协同翻译基于 GoEasy 实时消息服务，支持多名译员同时翻译同一项目，实时查看彼此的编辑状态、共享译文并即时沟通。
        </Typography>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>配置与启动</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            在「设置」（顶部工具栏「协同」菜单 → 网络协同配置信息，或「维护」菜单 → 设置 → 网络协同翻译）中填写 GoEasy AppKey、频道名和译员昵称。配置后点击顶部工具栏「协同」按钮即可启动（或停止）。启动后会自动打开协同面板。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>段锁定</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            当某译员正在编辑某段落时，该段会自动对其余人锁定，避免重复翻译。锁定状态在协同面板的「协同消息」视图中实时展示。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>团队译文共享</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            译员提交译文后会自动同步到团队译文记忆库（独立于本地 TM）。在双语编辑器原文行点击「团队译文」按钮可查看其他译员对该原文的译文，一键采纳。也可在协同面板切换到「团队译文」视图浏览全部共享译文。
          </Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>即时聊天与 @提及</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 2, mt: 0.5 }}>
            协同面板底部提供聊天框，可发送文字消息。点击在线译员头像可快速追加 <code>@昵称</code> 到聊天框，实现轻量提醒。
          </Typography>
        </Box>
        <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            提示：GoEasy 免费版有日活量（DAU）限制，用量详情需在 GoEasy 后台查看。多人协作时建议约定统一的频道名。
          </Typography>
        </Box>
      </Box>
    ),
  },
]

/* =========================
 * 邮箱混淆：拆分为字符数组渲染，防止爬虫抓取
 * ========================= */
const EMAIL_PARTS = ['youxun', 'chen', '@', '163', '.com']

function buildMailto(): string {
  return `mailto:${EMAIL_PARTS.join('')}`
}

/* =========================
 * AboutDialog 组件
 * ========================= */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const [expanded, setExpanded] = useState<string>(USAGE_SECTIONS[0]?.id ?? '')
  const muiTheme = useTheme()
  const isDark = muiTheme.palette.mode === 'dark'

  const handleAccordionChange = (panelId: string) => (_e: unknown, isExpanded: boolean) => {
    setExpanded(isExpanded ? panelId : '')
  }

  const mailtoLink = useMemo(() => buildMailto(), [])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'background.default',
            backgroundImage: 'none',
          },
        },
      }}
    >
      {/* 顶部标题栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          关于 CAT 工作台
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="关闭">
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          p: 0,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: { xs: 2, sm: 4, md: 6 },
            py: 3,
          }}
        >
          {/* ========== 上半部分：使用说明 ========== */}
          <Box sx={{ maxWidth: 820, mx: 'auto' }}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
              使用说明
            </Typography>
            <Box sx={{ mt: 1 }}>
              {USAGE_SECTIONS.map((section) => (
                <Accordion
                  key={section.id}
                  expanded={expanded === section.id}
                  onChange={handleAccordionChange(section.id)}
                  slotProps={{
                    transition: { unmountOnExit: true },
                  }}
                  sx={{
                    mb: 0.5,
                    '&:before': { display: 'none' },
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: '8px !important',
                    overflow: 'hidden',
                    '&.Mui-expanded': { my: 0.5 },
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      '&:hover': { bgcolor: 'action.hover' },
                      minHeight: 48,
                      '&.Mui-expanded': { minHeight: 48 },
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {section.title}
                      </Typography>
                      {section.summary && (
                        <Typography variant="caption" color="text.secondary">
                          {section.summary}
                        </Typography>
                      )}
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 1, pb: 2, px: 3 }}>
                    {section.render()}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          </Box>

          {/* ========== 下半部分：作者信息 ========== */}
          <Divider sx={{ my: 4, maxWidth: 820, mx: 'auto' }} />
          <Box
            sx={{
              maxWidth: 820,
              mx: 'auto',
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 3,
              alignItems: { sm: 'flex-start' },
            }}
          >
            {/* 左侧：作者文字信息 */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
                作者信息
              </Typography>
              <Typography variant="h5" sx={{ mt: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                总在跑步的蜗牛
              </Typography>
              <Box sx={{ mt: 1.5 }}>
                <Tooltip title="发送邮件给作者" placement="top">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<MailOutlineIcon />}
                    href={mailtoLink}
                    sx={{ textTransform: 'none' }}
                  >
                    给作者留言
                  </Button>
                </Tooltip>
              </Box>
              <Typography variant="body2" sx={{ mt: 2, lineHeight: 1.8, color: 'text.secondary' }}>
                本工具永久开源免费，欢迎使用。但开发维护需要花费大量时间和精力，如果你用了觉得好，可以考虑请作者喝一杯咖啡，谢谢！
              </Typography>
            </Box>

            {/* 右侧：赞赏码 */}
            <Box
              sx={{
                flexShrink: 0,
                width: { xs: '100%', sm: 200 },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  maxWidth: 200,
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: isDark ? '#fff' : '#fff',
                  p: 1,
                }}
              >
                <Box
                  component="img"
                  src="author-donate-qr.png"
                  alt="作者赞赏码"
                  sx={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <FavoriteIcon sx={{ fontSize: 12, color: 'error.main' }} />
                扫码赞赏作者
              </Typography>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
