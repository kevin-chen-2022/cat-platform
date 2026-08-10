export const DEFAULT_DOCK_LAYOUT = {
  dockbox: {
    mode: 'horizontal' as const,
    children: [
      {
        size: 229,
        tabs: [makeTab('project', '项目文件')],
      },
      {
        size: 547,
        mode: 'vertical' as const,
        children: [
          { size: 399, tabs: [makeTab('editor', '双语编辑器')] },
          {
            size: 317,
            tabs: [
              makeTab('tm', '翻译记忆'),
              makeTab('fragmentSearch', '片段搜索'),
              makeTab('aitranslate', 'AI翻译'),
            ],
          },
        ],
      },
      {
        size: 299,
        mode: 'vertical' as const,
        children: [
          { size: 200, tabs: [makeTab('tb', '术语显示')] },
          { size: 200, tabs: [makeTab('aiqa', 'AI问答')] },
        ],
      },
    ],
  },
}

/** 进入词典/记忆布局时，如果读不到原布局的左侧面板实际宽度，则回退到这个默认宽度 */
export const IMMUTABLE_LEFT_PANEL_WIDTH = 229

function makeTab(id: string, title: string) {
  return {
    id,
    title,
    closable: true,
    cached: true,
  }
}

export const DEFAULT_VISIBLE_TABS = [
  'project',
  'editor',
  'tm',
  'fragmentSearch',
  'aitranslate',
  'tb',
  'aiqa',
]
export const DICTIONARY_VISIBLE_TABS = ['project', 'projectDictionary']
export const MEMORY_VISIBLE_TABS = ['project', 'projectMemory']
