import { Autocomplete, TextField, Typography } from '@mui/material'
import type { ReactElement } from 'react'
import { COMMON_LANGUAGES } from '@app/store/languages'

/** 通用代码 → 显示名 映射（用于下拉选项展示） */
const LANG_CODE_LABEL: Record<string, string> = Object.fromEntries(
  COMMON_LANGUAGES.map((o) => [o.code, o.label]),
)

export interface LangAutocompleteProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

/**
 * 语言选择 Autocomplete：支持从常用语言下拉选择，也支持自由输入自定义代码。
 * 输入框显示语言代码（如 en / zh-CN），下拉项显示「代码 + 中文名」。
 */
export function LangAutocomplete({
  label,
  value,
  onChange,
  placeholder,
}: LangAutocompleteProps): ReactElement {
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

export default LangAutocomplete
