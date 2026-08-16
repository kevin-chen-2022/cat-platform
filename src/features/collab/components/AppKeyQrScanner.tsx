import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import ErrorIcon from '@mui/icons-material/ErrorOutlined'
import { useEffect, useRef, useState, useCallback } from 'react'
import jsQR from 'jsqr'

/* ===============================================================================
 *  AppKeyQrScanner — GoEasy AppKey 二维码扫码弹窗
 *
 *  实现参考「教学弹幕」项目避坑经验(project_memory.md #L123-L186):
 *  1. 回调时序:保存回调 → 清空原引用 → 执行回调 → 清理资源
 *  2. 先执行回调再关模态框,避免 focus()/高亮闪烁失效
 *  3. jsQR 使用 inversionAttempts:'attemptBoth',兼容正/反色二维码
 *  4. 移动端 HTTPS/localhost 要求、iOS Safari playsinline、facingMode:environment
 *  5. 每 3 帧解析一次,CPU 友好;关闭时 stop tracks + cancelAnimationFrame
 *  6. 结果校验:清洗 goeasy:// 等 scheme 前缀,识别 BC-/BC2- 前缀的 AppKey
 * =============================================================================== */

export interface AppKeyQrScannerProps {
  open: boolean
  /** 识别成功回调。先执行回调,再由外部控制关闭弹窗(回调时序 v3 正确版) */
  onResult: (extractedAppKey: string, rawText: string) => void
  /** 关闭弹窗(用户点取消/右上角 ×)。内部不负责清理回调,仅通知外部。 */
  onClose: () => void
}

/** 清洗扫码结果:去掉 scheme 前缀、空白、首尾引号 */
function cleanQrResult(raw: string): { cleaned: string; looksLikeAppKey: boolean } {
  let s = (raw ?? '').trim()
  // 去掉常见 scheme 前缀
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/+/, '')
  // 去掉首尾引号(有的扫码工具会包一层)
  s = s.replace(/^["'`]+|["'`]+$/g, '')
  s = s.trim()
  // 轻量判断:GoEasy AppKey 通常 BC- 或 BC2- 开头
  const looksLikeAppKey = /^BC2?-/.test(s)
  return { cleaned: s, looksLikeAppKey }
}

export function AppKeyQrScanner({ open, onResult, onClose }: AppKeyQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const scanFrameRef = useRef<number>(0)
  // —— 避坑 6.1:回调先用局部变量保存,再清空原引用,再执行
  const resultCallbackRef = useRef<AppKeyQrScannerProps['onResult'] | null>(null)
  const closingRef = useRef<boolean>(false)

  const [status, setStatus] = useState<'idle' | 'requesting' | 'scanning' | 'error' | 'found'>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [elapsed, setElapsed] = useState<number>(0)
  const startTimeRef = useRef<number>(0)

  /* ---------- 核心:停止摄像头 + RAF ---------- */
  const stopStream = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop())
      } catch { /* ignore */ }
      streamRef.current = null
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null
      } catch { /* ignore */ }
    }
  }, [])

  /* ---------- 核心:识别成功后的 finishScan(避坑 6.1 + 6.2) ----------
   * 正确时序 v3:
   *   1. 立即保存回调到局部变量 + 清空原引用(防止资源清理过程中回调被置空)
   *   2. 先执行回调(onResult 里会写入 input + focus + 闪烁高亮,此时模态框仍在)
   *   3. 再 stopStream + 通知外部关模态框
   */
  const finishScan = useCallback((rawText: string) => {
    if (closingRef.current) return
    closingRef.current = true

    // —— ① 保存回调 → 清空原引用 ——
    const cb = resultCallbackRef.current
    resultCallbackRef.current = null

    const { cleaned } = cleanQrResult(rawText)

    // —— ② setTimeout 里先回调,再关资源/模态框 ——
    //   450ms 延迟给用户看一眼"识别成功"的 UI
    setTimeout(() => {
      // 回调先执行(此时模态框尚未关闭,input.focus() 不会被焦点过渡干扰)
      if (cb) cb(cleaned, rawText)
      // 再清理资源
      stopStream()
    }, 450)
  }, [stopStream])

  /* ---------- 启动摄像头 + 扫描循环 ---------- */
  const startCamera = useCallback(async () => {
    setStatus('requesting')
    setErrorMsg('')

    // 安全上下文检查(避坑 6.4)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setStatus('error')
      setErrorMsg('当前页面非安全上下文。摄像头仅在 https:// 或 http://localhost 下可用。')
      return
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setErrorMsg('当前浏览器不支持摄像头 API。请使用最新版 Chrome / Edge / Safari。')
      return
    }

    let stream: MediaStream | null = null
    // facingMode:environment(后摄优先),桌面浏览器会自动 fallback(避坑 6.4)
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } as MediaTrackConstraints['facingMode'], width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
    } catch (e1) {
      // 有些浏览器不支持 facingMode 对象写法,兜底任意摄像头
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      } catch (e2) {
        setStatus('error')
        const msg = e2 instanceof Error ? e2.message : String(e2)
        if (/denied|notallow|permission/i.test(msg)) {
          setErrorMsg('摄像头权限被拒绝。请在浏览器设置 → 隐私 → 摄像头中恢复权限后重试。')
        } else if (/notfound|device/i.test(msg)) {
          setErrorMsg('未检测到可用的摄像头设备。')
        } else {
          setErrorMsg(`无法打开摄像头:${msg}`)
        }
        return
      }
    }

    if (!stream) return
    streamRef.current = stream

    const video = videoRef.current
    if (!video) { stopStream(); return }

    // iOS Safari 必须加 playsinline,否则视频会全屏播放(避坑 6.4)
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.muted = true

    try {
      video.srcObject = stream
      // 用户点击按钮已触发用户手势,这里 play() 在大多数浏览器不会被拦截
      await video.play()
    } catch (e) {
      stopStream()
      setStatus('error')
      setErrorMsg(`视频启动失败:${e instanceof Error ? e.message : String(e)}。请点击画面或重试。`)
      return
    }

    setStatus('scanning')
    startTimeRef.current = Date.now()
    scanFrameRef.current = 0

    // —— 扫描循环(每 3 帧解析一次,CPU 友好;避坑 6.5) ——
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { stopStream(); setStatus('error'); setErrorMsg('无法创建 Canvas 2D 上下文。'); return }

    const tick = () => {
      if (!streamRef.current || !videoRef.current || closingRef.current) return
      const v = videoRef.current
      const w = v.videoWidth
      const h = v.videoHeight
      if (w > 0 && h > 0) {
        scanFrameRef.current++
        // 每 3 帧解析一次
        if (scanFrameRef.current % 3 === 0) {
          if (canvas.width !== w) canvas.width = w
          if (canvas.height !== h) canvas.height = h
          ctx.drawImage(v, 0, 0, w, h)
          const img = ctx.getImageData(0, 0, w, h)
          // inversionAttempts:'attemptBoth' → 正相反色都识别(避坑 6.3)
          const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' })
          if (code && code.data) {
            setStatus('found')
            finishScan(code.data)
            return // 识别成功,不再继续 RAF
          }
        }
        // 扫描时间统计(便于诊断"假死")
        if (scanFrameRef.current % 30 === 0) {
          setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [finishScan, stopStream])

  /* ---------- 弹窗打开/关闭生命周期 ---------- */
  useEffect(() => {
    if (open) {
      // 每次打开重置状态
      closingRef.current = false
      resultCallbackRef.current = onResult
      setElapsed(0)
      setStatus('idle')
      setErrorMsg('')
      // 需要等 video/canvas ref 挂载后再启,下一个 tick 启动
      const t = window.setTimeout(() => startCamera(), 50)
      return () => window.clearTimeout(t)
    } else {
      // 关闭:立即清理摄像头
      closingRef.current = true
      resultCallbackRef.current = null
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ---------- unmount 兜底(防止组件卸载后摄像头还亮着) ---------- */
  useEffect(() => {
    return () => {
      closingRef.current = true
      resultCallbackRef.current = null
      stopStream()
    }
  }, [stopStream])

  return (
    <Dialog
      open={open}
      onClose={() => {
        // 点遮罩关闭等同于取消,不执行回调
        closingRef.current = true
        resultCallbackRef.current = null
        stopStream()
        onClose()
      }}
      maxWidth="sm"
      fullWidth
      aria-label="扫码输入 GoEasy AppKey"
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <CameraAltIcon color="primary" fontSize="small" />
        <Typography variant="subtitle2" component="span" sx={{ fontWeight: 600 }}>
          扫描 AppKey 二维码
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton
          size="small"
          onClick={() => {
            closingRef.current = true
            resultCallbackRef.current = null
            stopStream()
            onClose()
          }}
          aria-label="关闭扫码"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1, pb: 1 }}>
        <Box sx={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', bgcolor: '#000', borderRadius: 1, overflow: 'hidden' }}>
          {/* 视频画面铺满 */}
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              background: '#000',
            }}
          />
          {/* 离屏 canvas,实际不显示 */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* 扫码覆盖框 */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                width: '55%',
                aspectRatio: '1 / 1',
                border: '2px solid rgba(255,255,255,0.85)',
                borderRadius: 2,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                position: 'relative',
              }}
            >
              {/* 四角高亮 */}
              {/* 四角高亮:直接用 4 个独立 Box,避免 TS 动态赋值属性类型冲突 */}
              <Box sx={{ position: 'absolute', left: -2, top: -2, width: 28, height: 28, borderColor: '#4fc3f7', borderStyle: 'solid', borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 }} />
              <Box sx={{ position: 'absolute', right: -2, top: -2, width: 28, height: 28, borderColor: '#4fc3f7', borderStyle: 'solid', borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 }} />
              <Box sx={{ position: 'absolute', left: -2, bottom: -2, width: 28, height: 28, borderColor: '#4fc3f7', borderStyle: 'solid', borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 }} />
              <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderColor: '#4fc3f7', borderStyle: 'solid', borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 }} />
              {/* 扫描动画线 */}
              {status === 'scanning' && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: 4,
                    right: 4,
                    height: 2,
                    bgcolor: '#4fc3f7',
                    boxShadow: '0 0 8px #4fc3f7',
                    animation: 'scanSlide 1.8s ease-in-out infinite alternate',
                    top: '50%',
                  }}
                />
              )}
            </Box>
          </Box>

          {/* 状态浮层 */}
          {status === 'requesting' && (
            <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
              <CircularProgress size={32} color="primary" />
              <Typography variant="body2" sx={{ color: '#fff' }}>正在请求摄像头权限…</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                请在浏览器弹窗中点击「允许」
              </Typography>
            </Box>
          )}
          {status === 'error' && (
            <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, gap: 1.5 }}>
              <ErrorIcon sx={{ fontSize: 40, color: '#f44336' }} />
              <Typography variant="body2" sx={{ color: '#fff', textAlign: 'center', fontSize: 'calc(var(--app-content-font-size) * 0.93)' }}>
                {errorMsg || '摄像头启动失败'}
              </Typography>
            </Box>
          )}
          {status === 'found' && (
            <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(16,185,129,0.22)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <Box sx={{
                width: 72, height: 72, borderRadius: '50%',
                bgcolor: 'rgba(16,185,129,0.9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 40,
              }}>✓</Box>
              <Typography variant="body1" sx={{ color: '#fff', fontWeight: 700 }}>识别成功</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>正在填入输入框…</Typography>
            </Box>
          )}
        </Box>

        {/* 说明文本:避免 Stack mt/spacing 类型冲突,直接用 Box + flex-col */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {status === 'scanning'
                ? `扫描中… 已运行 ${elapsed}s。请将 GoEasy 控制台 AppKey 二维码对准框内。`
                : status === 'idle'
                  ? '准备启动摄像头…'
                  : status === 'requesting'
                    ? '等待您授权摄像头…'
                    : status === 'found'
                      ? '识别成功,正在填入。'
                      : ''}
            </Typography>
          </Box>
          {(status === 'scanning' || status === 'idle' || status === 'error') && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              • 仅在本地解析,二维码内容<b>不会上传</b>任何服务器,保护隐私。
              <br />
              • 支持格式:AppKey 纯文本、含 <code>goeasy://</code> scheme 的二维码。
              <br />
              • 若摄像头无法使用,请改用 AppKey <b>手动复制粘贴</b>输入。
            </Typography>
          )}
          {status === 'error' && (
            <Alert severity="warning" sx={{ mt: 1, fontSize: 'calc(var(--app-content-font-size) * 0.86)', '& .MuiAlert-message': { fontSize: 'inherit' } }}>
              无法使用摄像头?请到 <b>GoEasy 控制台(console.goeasy.io)</b> 手动复制 AppKey 字符串粘贴到输入框。
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2 }}>
        {status === 'error' && (
          <Button size="small" onClick={() => { closingRef.current = false; startCamera() }} startIcon={<CameraAltIcon sx={{ fontSize: 16 }} />}>
            重试
          </Button>
        )}
        <Button
          size="small"
          onClick={() => {
            closingRef.current = true
            resultCallbackRef.current = null
            stopStream()
            onClose()
          }}
          color="inherit"
        >
          取消
        </Button>
      </DialogActions>

      {/* 扫描线动画 keyframes */}
      <style>{`
        @keyframes scanSlide {
          0%   { transform: translateY(calc(-50% - 70px)); opacity: 0.9; }
          50%  { opacity: 1; }
          100% { transform: translateY(calc(-50% + 70px)); opacity: 0.9; }
        }
      `}</style>
    </Dialog>
  )
}

