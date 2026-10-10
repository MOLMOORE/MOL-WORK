import { useEffect, useRef, useState } from 'react'
import { Copy, Maximize2, Minus, Square, X } from 'lucide-react'
import { isEscapeFullscreenBlocked } from '../../lib/escape'
import type { WindowStatePayload } from '@shared/types/ipc'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'

/**
 * 自绘窗口标题栏：整条随主题变色，右侧是全屏 / 最小化 / 最大化还原 / 关闭。
 * 左侧只留拖动区（双击最大化 / 还原），不再重复放软件图标——侧栏顶部已有品牌标识。
 * F11 切全屏，全屏后本条隐藏，Esc 或再按 F11 退出。
 */
export function TitleBar(): JSX.Element | null {
  const [state, setState] = useState<WindowStatePayload>({ maximized: false, fullscreen: false })
  const fullscreenRef = useRef(false)
  const apply = (next: WindowStatePayload): void => {
    fullscreenRef.current = next.fullscreen
    setState(next)
  }

  // 主进程会推窗口状态；Windows 上全屏切换的事件不一定准时到，
  // 所以窗口尺寸 / 焦点一变就再问一次，标题栏的显示与图标始终跟得上。
  useEffect(() => {
    const pull = (): void => {
      void api.win.getState().then(apply).catch(() => undefined)
    }
    pull()
    let timer = 0
    const onResize = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(pull, 120)
    }
    const off = api.onWindowState(apply)
    window.addEventListener('resize', onResize)
    window.addEventListener('focus', pull)
    // Windows 的全屏事件偶尔迟到：只要处于全屏就再确认一次，标题栏不会莫名消失
    const heartbeat = window.setInterval(() => {
      if (fullscreenRef.current) pull()
    }, 1500)
    return () => {
      off()
      window.clearTimeout(timer)
      window.clearInterval(heartbeat)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('focus', pull)
    }
  }, [])

  // 全屏快捷键：F11 切换、Esc 退出（与浏览器 / VS Code 一致，任何页面都生效）。
  // 页面里开着侧栏、弹窗、对比浮层时，Esc 先归它们用，这里不抢（见 lib/escape.ts）。
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'F11') {
        event.preventDefault()
        event.stopPropagation()
        void api.win.setFullscreen().catch(() => undefined)
        return
      }
      if (event.key !== 'Escape') return
      if (!fullscreenRef.current || isEscapeFullscreenBlocked()) return
      event.preventDefault()
      void api.win.setFullscreen(false).catch(() => undefined)
    }
    // capture：阅读界面等页面级快捷键不会先把事件吃掉
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (state.fullscreen) return null

  const toggleFullscreen = (): void => {
    void api.win.setFullscreen(true).catch(() => undefined)
  }

  return (
    <div className={cn('app-titlebar flex h-8 shrink-0 items-stretch justify-between bg-surface select-none')}>
      {/* 左侧整条可拖动；分隔线在侧栏宽度处续上，让标题栏与下方外壳连成一片 */}
      <div className="titlebar-drag flex min-w-0 flex-1 items-stretch">
        <span className="titlebar-rail" aria-hidden />
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="titlebar-actions flex shrink-0 items-stretch">
        <button type="button" className="titlebar-btn" title="全屏（F11）" onClick={toggleFullscreen}>
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        {/* 最小化就用一根「减号」，和系统窗口按钮的观感一致 */}
        <button type="button" className="titlebar-btn" title="最小化" onClick={() => void api.win.minimize()}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          title={state.maximized ? '还原（双击标题栏）' : '最大化（双击标题栏）'}
          onClick={() => void api.win.toggleMaximize()}
        >
          {state.maximized ? <Square className="h-3 w-3" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button type="button" className="titlebar-btn titlebar-close" title="关闭" onClick={() => void api.win.close()}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
