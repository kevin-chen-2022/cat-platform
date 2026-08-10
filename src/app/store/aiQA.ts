import { create } from 'zustand'

// —— AI 问答设置 store ——
// 支持 DeepSeek / 豆包 / 通义千问 / 智谱 等开放平台 API（均兼容 OpenAI ChatCompletions 格式）
// localStorage 持久化；queryText/queryContext 供"AI解释"按钮写入

export type AiQaMode = 'api' | 'web'

/** 单个 AI 提供商配置 */
export interface AiProviderCfg {
  /** 是否启用（多选时 AIQAPanel 用 Tabs 切换） */
  enabled: boolean
  /** 用户自定义 API Key */
  apiKey: string
  /** 可选：自定义 base URL（兼容 OpenAI 网关、one-api、自建代理） */
  baseUrl: string
  /** 可选：用户指定模型名；为空则用各 provider 的默认模型 */
  model: string
}

/** Provider 标识 */
export type AiProviderKey = 'deepseek' | 'doubao' | 'tongyi' | 'zhipu'

/** 提供商元数据：显示名、默认 baseUrl、默认模型名 */
export interface AiProviderMeta {
  label: string
  /** 默认 API Base URL（兼容 OpenAI /v1/chat/completions 端点） */
  defaultBaseUrl: string
  /** 默认推荐模型；若某些平台要求"推理接入点 Endpoint ID"（如豆包）则此处留空并通过 hint 引导 */
  defaultModel: string
  /** 官网 / 获取 Key 链接（tooltip 提示） */
  helpUrl: string
  /**
   * 平台侧的额外配置提示。
   * 例如豆包/火山方舟：model 必须是控制台"推理接入点 → Endpoint ID（ep-xxxx）"而非模型展示名。
   */
  hint?: string
  /**
   * 平台侧对 ChatCompletions 请求参数的约束。
   * - temperatureRange: 合法数值范围
   * - omitStreamField: 有些兼容网关处理 stream 字段异常，设为 true 则不发送 stream
   * - modelMustBeEndpointId: 为 true 时前端会在设置里提示"填入 Endpoint ID"
   */
  constraints?: {
    temperatureRange?: [number, number]
    omitStreamField?: boolean
    modelMustBeEndpointId?: boolean
  }
}

export const AI_PROVIDER_META: Record<AiProviderKey, AiProviderMeta> = {
  deepseek: {
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    helpUrl: 'https://platform.deepseek.com/',
  },
  doubao: {
    label: '豆包 (字节 · 火山方舟)',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: '', // 必须由用户填入自己的 Endpoint ID
    helpUrl: 'https://www.volcengine.com/product/doubao',
    hint: '⚠️ 豆包的「模型」必须填写火山方舟控制台中的 推理接入点 Endpoint ID（格式为 ep-xxxxxxxxxxxxxxxx），不能填模型展示名。如果沿用默认模型占位符会导致服务端 5xx。请先在火山方舟 → 模型推理 → 创建推理接入点，并把 Endpoint ID 粘贴到下方「模型」输入框。',
    constraints: {
      temperatureRange: [0, 1],
      modelMustBeEndpointId: true,
    },
  },
  tongyi: {
    label: '通义千问 (阿里)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    helpUrl: 'https://dashscope.console.aliyun.com/',
  },
  zhipu: {
    label: '智谱清言',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    helpUrl: 'https://open.bigmodel.cn/',
  },
}

/** 不支持 iframe 嵌入的 AI 聊天网页（全部不支持，预留字段） */
export const AI_WEB_EMBED_UNSUPPORTED: Set<string> = new Set([
  'doubao', 'kimi', 'tongyi', 'yiyan', 'deepseek', 'zhipu', 'chatgpt', 'gemini', 'claude',
])

/** AI 解释场景系统提示词 */
export const AI_EXPLAIN_SYSTEM_PROMPT = `你是一名专业的翻译助理。请按以下结构化格式回答：

## 1. 原文释义
解释选中文本在原句中的具体含义（结合上下文）。如果是多义词，需指出在此语境中取哪个义项。

## 2. 推荐译法
给出 2-3 个推荐译法，并说明适用语境（如：直译/意译/行业术语/书面语/口语）。

## 3. 用法提示
如果选中文本涉及搭配、句型、时态、文化典故或易混淆点，补充说明。

语言要求：解释部分用中文，译法用中文。简洁专业，直接。`

/** AI 翻译场景系统提示词（可接受源/目标语言）。语言标签用中文或 ISO 代码均可。 */
export const AI_TRANSLATE_SYSTEM_PROMPT = `你是一名专业的翻译专家。请将用户提供的源语言文本准确翻译成目标语言文本。
要求：
1. 只输出翻译结果本身，不要添加任何解释、说明、前后缀或额外内容。
2. 保持原文的标点、换行、大小写风格（专有名词除外）。
3. 术语统一，符合目标语言的表达习惯，不生硬直译。
4. 如果有上下文或领域说明，结合该语境选择最合适的义项。`

interface AiQAState {
  mode: AiQaMode
  /** 各提供商配置（AI问答 / AI翻译 共用） */
  providers: Record<AiProviderKey, AiProviderCfg>
  /** 当前待查询文本（如选中文本） */
  queryText: string
  /** 上下文（整段原文 + 之前译文可选） */
  queryContext: string
  /** 查询时间戳，用于触发 AIQAPanel 重新发起请求 */
  queryTimestamp: number

  /** AI 翻译：待翻译文本 */
  translateText: string
  /** AI 翻译：源语言（如 en / zh-CN / auto） */
  translateSrc: string
  /** AI 翻译：目标语言（如 zh-CN / en） */
  translateTgt: string
  /** AI 翻译：时间戳，触发重新翻译 */
  translateTimestamp: number
  /** AI 翻译：领域/风格说明（可选），用于拼入 system prompt 最后一段 */
  translateDomain: string
  /** AI 翻译：用户可编辑的系统 Prompt（持久化），默认 AI_TRANSLATE_SYSTEM_PROMPT */
  translateSystemPrompt: string
  /** AI 问答：用户可编辑的系统 Prompt（持久化），默认 AI_EXPLAIN_SYSTEM_PROMPT */
  aiqaSystemPrompt: string
  /** AI 翻译：是否套用术语库（默认 true）。开启后自动匹配原文术语并注入 user prompt */
  applyTermsInTranslate: boolean

  setMode: (m: AiQaMode) => void
  setProvider: (k: AiProviderKey, patch: Partial<AiProviderCfg>) => void
  toggleProvider: (k: AiProviderKey) => void
  setQuery: (text: string, context?: string) => void
  setTranslate: (patch: Partial<{ text: string; src: string; tgt: string; domain: string }>) => void
  /** 设置 AI 翻译系统 Prompt（持久化） */
  setTranslateSystemPrompt: (prompt: string) => void
  /** 设置 AI 问答系统 Prompt（持久化） */
  setAiqaSystemPrompt: (prompt: string) => void
  /** 设置 AI 翻译是否套用术语库（持久化） */
  setApplyTermsInTranslate: (v: boolean) => void
}

const STORAGE_KEY = 'cat.aiqaSettings'

interface PersistShape {
  mode: AiQaMode
  providers: Record<AiProviderKey, AiProviderCfg>
  translateSystemPrompt?: string
  aiqaSystemPrompt?: string
  applyTermsInTranslate?: boolean
}

function defaultProviders(): Record<AiProviderKey, AiProviderCfg> {
  return {
    deepseek: { enabled: true, apiKey: '', baseUrl: AI_PROVIDER_META.deepseek.defaultBaseUrl, model: AI_PROVIDER_META.deepseek.defaultModel },
    doubao:   { enabled: false, apiKey: '', baseUrl: AI_PROVIDER_META.doubao.defaultBaseUrl, model: AI_PROVIDER_META.doubao.defaultModel },
    tongyi:   { enabled: false, apiKey: '', baseUrl: AI_PROVIDER_META.tongyi.defaultBaseUrl, model: AI_PROVIDER_META.tongyi.defaultModel },
    zhipu:    { enabled: false, apiKey: '', baseUrl: AI_PROVIDER_META.zhipu.defaultBaseUrl, model: AI_PROVIDER_META.zhipu.defaultModel },
  }
}

function loadPersist(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { mode: 'api', providers: defaultProviders() }
    const p = JSON.parse(raw) as PersistShape
    // 兼容性：确保 4 个 provider key 都存在
    const base = defaultProviders()
    for (const k of Object.keys(base) as AiProviderKey[]) {
      if (!p.providers[k]) p.providers[k] = base[k]
      else {
        // 填充缺省字段
        p.providers[k] = { ...base[k], ...p.providers[k] }
      }
    }
    // 兼容性：旧版本无 prompt 字段，填入默认值
    if (!p.translateSystemPrompt) p.translateSystemPrompt = AI_TRANSLATE_SYSTEM_PROMPT
    if (!p.aiqaSystemPrompt) p.aiqaSystemPrompt = AI_EXPLAIN_SYSTEM_PROMPT
    // 兼容性：旧版本无 applyTermsInTranslate 字段，默认开启
    if (p.applyTermsInTranslate == null) p.applyTermsInTranslate = true
    return p
  } catch {
    return { mode: 'api', providers: defaultProviders() }
  }
}

function savePersist(s: PersistShape) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

const initial = loadPersist()

export const useAiQAStore = create<AiQAState>((set, get) => ({
  mode: initial.mode,
  providers: initial.providers,
  queryText: '',
  queryContext: '',
  queryTimestamp: 0,
  translateText: '',
  translateSrc: 'auto',
  translateTgt: '',
  translateTimestamp: 0,
  translateDomain: '',
  translateSystemPrompt: initial.translateSystemPrompt ?? AI_TRANSLATE_SYSTEM_PROMPT,
  aiqaSystemPrompt: initial.aiqaSystemPrompt ?? AI_EXPLAIN_SYSTEM_PROMPT,
  applyTermsInTranslate: initial.applyTermsInTranslate ?? true,

  setMode: (m) => {
    set({ mode: m })
    savePersist({ mode: m, providers: get().providers, translateSystemPrompt: get().translateSystemPrompt, aiqaSystemPrompt: get().aiqaSystemPrompt, applyTermsInTranslate: get().applyTermsInTranslate })
  },
  setProvider: (k, patch) => {
    const providers = { ...get().providers, [k]: { ...get().providers[k], ...patch } }
    set({ providers })
    savePersist({ mode: get().mode, providers, translateSystemPrompt: get().translateSystemPrompt, aiqaSystemPrompt: get().aiqaSystemPrompt, applyTermsInTranslate: get().applyTermsInTranslate })
  },
  toggleProvider: (k) => {
    const providers = { ...get().providers, [k]: { ...get().providers[k], enabled: !get().providers[k].enabled } }
    set({ providers })
    savePersist({ mode: get().mode, providers, translateSystemPrompt: get().translateSystemPrompt, aiqaSystemPrompt: get().aiqaSystemPrompt, applyTermsInTranslate: get().applyTermsInTranslate })
  },
  setQuery: (text, context = '') => {
    set({ queryText: text, queryContext: context, queryTimestamp: Date.now() })
  },
  setTranslate: (patch) => {
    const shouldTick =
      patch.text !== undefined || patch.src !== undefined || patch.tgt !== undefined || patch.domain !== undefined
    set({
      translateText: patch.text ?? get().translateText,
      translateSrc: patch.src ?? get().translateSrc,
      translateTgt: patch.tgt ?? get().translateTgt,
      translateDomain: patch.domain ?? get().translateDomain,
      translateTimestamp: shouldTick ? Date.now() : get().translateTimestamp,
    })
  },
  setTranslateSystemPrompt: (prompt) => {
    set({ translateSystemPrompt: prompt })
    savePersist({ mode: get().mode, providers: get().providers, translateSystemPrompt: prompt, aiqaSystemPrompt: get().aiqaSystemPrompt, applyTermsInTranslate: get().applyTermsInTranslate })
  },
  setAiqaSystemPrompt: (prompt) => {
    set({ aiqaSystemPrompt: prompt })
    savePersist({ mode: get().mode, providers: get().providers, translateSystemPrompt: get().translateSystemPrompt, aiqaSystemPrompt: prompt, applyTermsInTranslate: get().applyTermsInTranslate })
  },
  setApplyTermsInTranslate: (v) => {
    set({ applyTermsInTranslate: v })
    savePersist({ mode: get().mode, providers: get().providers, translateSystemPrompt: get().translateSystemPrompt, aiqaSystemPrompt: get().aiqaSystemPrompt, applyTermsInTranslate: v })
  },
}))

/**
 * 调用兼容 OpenAI ChatCompletions 的 provider API。
 * 非流式，返回纯文本。支持根据各 provider 约束（temperature 范围、是否发送 stream 等）做兼容。
 */
export async function callAiChat(
  provider: AiProviderKey,
  cfg: AiProviderCfg,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
): Promise<string> {
  const meta = AI_PROVIDER_META[provider]
  const base = cfg.baseUrl || meta.defaultBaseUrl
  // 模型优先用用户自定义；否则用 meta.default（豆包 defaultModel 为空，此时要求用户填入 Endpoint ID）
  const model = (cfg.model || meta.defaultModel).trim()
  if (!cfg.apiKey) throw new Error(`未配置 ${meta.label} 的 API Key，请前往「设置 → AI问答」填写`)
  if (!model) throw new Error(`${meta.label} 未配置模型。请在「设置 → AI问答」填写：${meta.constraints?.modelMustBeEndpointId ? '火山方舟推理接入点 Endpoint ID（ep-xxxxxxxx）' : '模型名'}`)

  const url = base.endsWith('/') ? `${base}chat/completions` : `${base}/chat/completions`

  // 请求参数约束处理
  let temperature = 0.3
  if (meta.constraints?.temperatureRange) {
    const [min, max] = meta.constraints.temperatureRange
    temperature = Math.max(min, Math.min(max, temperature))
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
  }
  if (!meta.constraints?.omitStreamField) body.stream = false

  // 脱敏诊断日志
  try {
    // eslint-disable-next-line no-console
    console.debug(`[ai:${provider}] → POST ${url}`, {
      model,
      temperature: body.temperature,
      stream: body.stream,
      messagesLen: messages.length,
      bodySizeChars: JSON.stringify(body).length,
    })
  } catch { /* ignore */ }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    const reqId = res.headers.get('x-tt-logid') || res.headers.get('x-request-id') || res.headers.get('request-id') || ''
    let msg = `${meta.label} HTTP ${res.status}`
    if (reqId) msg += ` (ReqId=${reqId})`
    if (errText) {
      try {
        const j = JSON.parse(errText)
        msg += `: ${j?.error?.message || j?.message || errText.slice(0, 500)}`
      } catch { msg += `: ${errText.slice(0, 500)}` }
    }
    // 已知错误的更友好提示
    if (res.status === 500 && provider === 'doubao') {
      msg += '\n提示：若仍为 500，请再次核对「模型」输入是否为火山方舟推理接入点 Endpoint ID（ep-xxxxxxxxxxxxxxxx），而不是模型展示名（如 doubao-pro-32k）。'
    }
    throw new Error(msg)
  }
  const data = await res.json()
  const content: string | undefined = data?.choices?.[0]?.message?.content
  if (!content) throw new Error(`${meta.label} 返回为空。请检查模型参数（${meta.constraints?.modelMustBeEndpointId ? '需填 Endpoint ID' : '模型名'}）是否正确。`)
  return content
}
