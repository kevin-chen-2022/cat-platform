import {
  Dialog,
  DialogContent,
  IconButton,
  Typography,
  Box,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SettingsIcon from '@mui/icons-material/Settings'
import type { ReactElement } from 'react'
import { SettingsPanel } from './Panels'

/* =========================
 * SettingsDialog 组件
 * 全屏弹窗，复用 SettingsPanel 内容（embedded 模式隐藏面板自带头部）
 * 入口：顶部工具栏「工具/设置/关于」菜单中的「设置」项（位于"重启工作台"之后）
 * ========================= */
export function SettingsDialog({ open, onClose, initialSection }: { open: boolean; onClose: () => void; initialSection?: string }): ReactElement {
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            设置
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="关闭">
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent
        sx={{
          p: 0,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            maxWidth: 820,
            mx: 'auto',
            height: '100%',
          }}
        >
          {/* key 随 initialSection 变化以重新挂载，确保打开时定位到指定一级分类 */}
          <SettingsPanel key={initialSection ?? 'basic'} embedded initialSection={initialSection} />
        </Box>
      </DialogContent>
    </Dialog>
  )
}
