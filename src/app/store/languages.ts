/**
 * 翻译语言常量与平台代码映射
 *
 * - COMMON_LANGUAGES：AI翻译、机器翻译面板共用的常用语言下拉列表
 * - 百度/阿里 网页与 API 共用一套语言代码（BAIDU_LANG_MAP）
 * - 彩云小译 使用独立的代码与 trans_type 方向（CAIYUN_LANG_MAP）
 *
 * 说明：通用代码（如 zh-CN / ja）为本应用内部默认写法；
 *       调用各平台时通过下面的映射函数转换为平台所需代码。
 */

/** 语言选项 */
export interface LangOption {
  /** 通用语言代码（本应用内部使用，如 en / zh-CN / ja） */
  code: string
  /** 显示名 */
  label: string
}

/**
 * 常用语言列表（源/目标语言下拉共用）
 * 「自动检测」仅对源语言有意义，目标语言选择时由调用方自行忽略。
 */
export const COMMON_LANGUAGES: LangOption[] = [
  { code: 'auto', label: '自动检测' },
  { code: 'en', label: '英语' },
  { code: 'zh-CN', label: '中文(简体)' },
  { code: 'zh-TW', label: '中文(繁体)' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
  { code: 'it', label: '意大利语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'ar', label: '阿拉伯语' },
  { code: 'th', label: '泰语' },
  { code: 'vi', label: '越南语' },
]

/** 通用代码 → 百度翻译代码（百度 API 与百度网页 URL 通用） */
const BAIDU_LANG_MAP: Record<string, string> = {
  auto: 'auto',
  en: 'en',
  'zh-CN': 'zh',
  'zh-TW': 'cht',
  ja: 'jp',
  ko: 'kor',
  fr: 'fra',
  de: 'de',
  es: 'spa',
  ru: 'ru',
  it: 'it',
  pt: 'pt',
  ar: 'ara',
  th: 'th',
  vi: 'vie',
}

/** 通用代码 → 阿里翻译代码（与百度基本一致，复用同一映射） */
const ALI_LANG_MAP: Record<string, string> = {
  auto: 'auto',
  en: 'en',
  'zh-CN': 'zh',
  'zh-TW': 'zh-TW',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  it: 'it',
  pt: 'pt',
  ar: 'ar',
  th: 'th',
  vi: 'vi',
}

/** 通用代码 → 彩云小译代码 */
const CAIYUN_LANG_MAP: Record<string, string> = {
  en: 'en',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  it: 'it',
}

/** 通用代码 → 百度/阿里 网页语言段代码；未命中则回退原值 */
export function toBaiduLang(code: string): string {
  if (!code) return 'auto'
  return BAIDU_LANG_MAP[code] ?? code
}

/** 通用代码 → 阿里网页语言段代码；未命中则回退原值 */
export function toAliLang(code: string): string {
  if (!code) return 'auto'
  return ALI_LANG_MAP[code] ?? code
}

/**
 * 构造彩云 trans_type（如 en2zh）；源/目标任一不支持时返回空串。
 * 注意：彩云仅支持有限方向组合，调用方需对空串做提示处理。
 */
export function toCaiyunTransType(src: string, tgt: string): string {
  const from = CAIYUN_LANG_MAP[src]
  const to = CAIYUN_LANG_MAP[tgt]
  if (!from || !to || from === 'auto' || to === 'auto') return ''
  return `${from}2${to}`
}
