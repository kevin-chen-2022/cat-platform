export { useUIStore } from './ui'
export { useProjectStore } from './project'
export { useLayoutStore, setDockRef, getDockRef, collectVisibleTabs } from './layout'
export { useEditorContextStore } from './editorContext'
export type { SourceSelection, TargetSelection, TargetCursorInfo, EditorContextInfo } from './editorContext'
export { useTermStore } from './term'
export type { Term } from './term'
export { useTMStore } from './tm'
export {
  useDictionaryStore,
  ONLINE_DICT_URL,
  LOCAL_DICT_URL,
  ONLINE_DICT_LABEL,
  LOCAL_DICT_LABEL,
  EMBED_UNSUPPORTED,
} from './dictionary'
export type { DictMode, OnlineDictState, LocalDictState } from './dictionary'
export {
  useMachineTranslationStore,
  MT_WEB_URL,
  MT_WEB_LABEL,
  MT_API_LABEL,
  MT_EMBED_UNSUPPORTED,
} from './machineTranslation'
export type { MtMode, MtWebState, MtApiState } from './machineTranslation'
export {
  useAiQAStore,
  AI_PROVIDER_META,
  AI_EXPLAIN_SYSTEM_PROMPT,
  AI_TRANSLATE_SYSTEM_PROMPT,
  AI_WEB_EMBED_UNSUPPORTED,
  callAiChat,
} from './aiQA'
export type { AiQaMode, AiProviderCfg, AiProviderKey, AiProviderMeta } from './aiQA'
export {
  dispatchLinkage,
  dispatchSegmentActivated,
  dispatchSourceSelected,
  dispatchTargetSelected,
  dispatchReverseLinkage,
  useLinkageTMStore,
  useLinkageFragmentSearchStore,
} from './linkage'
export type { LinkageEvent } from './linkage'
export {
  useUiAppearanceStore,
  FONT_PRESETS,
  DEFAULT_FONT_ID,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  resolveFontFamily,
  applyAppearanceToRoot,
  CSS_VAR_FONT_FAMILY,
  CSS_VAR_FONT_SIZE,
} from './uiAppearance'
export type { FontPreset } from './uiAppearance'
