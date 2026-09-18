import { useEffect, useRef, useState } from 'react'
import { Copy, Maximize2, Minimize2, Square, X } from 'lucide-react'
import type { WindowStatePayload } from '@shared/types/ipc'
import appIcon from '../../assets/app-icon.png'
import { api } from '../../lib/ipc'
import { cn } from '../../lib/utils'

/**
 * 软件自绘的窗口标题栏（v1.2.4 第五轮）。
 * 原来这条是系统标题栏：写着 MOL-WORK、和主题无关、也没法软件内控制。
 * 现在改成窗口内的一行：整条随主题变色（背景、描边、按钮都用主题令牌），
 * 左边只留一个软件图标，右边是全屏 / 最小化 / 最大化还原 / 关闭。
 *
 * 快捷键对齐常见桌面软件：F11 切换全屏（全屏后整条标题栏隐藏，Esc 或再按 F11 退出），
 * 双击标题栏空白处最大化 / 还原由系统 drag 区域原生支持。
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

  // F11 全屏：与浏览器 / VS Code 一致；在输入框里也不拦截，因为 F11 不属于文本输入
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'F11') return
      event.preventDefault()
      event.stopPropagation()
      void api.win.setFullscreen().catch(() => undefined)
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
    <div className={cn('app-titlebar flex h-[34px] shrink-0 items-stretch justify-between border-b border-border bg-surface select-none')}>
      {/* 左侧：整条都是拖动区（双击最大化 / 还原） */}
      <div className="titlebar-drag flex min-w-0 flex-1 items-center gap-2 pl-2">
        <img src={appIcon} alt="" draggable={false} className="h-4 w-4 shrink-0 opacity-90" />
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="titlebar-actions flex shrink-0 items-stretch">
        <button type="button" className="titlebar-btn" title="全屏（F11）" onClick={toggleFullscreen}>
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="titlebar-btn" title="最小化" onClick={() => void api.win.minimize()}>
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="titlebar-btn"
          title={state.maximized ? '还原（双击标题栏同样有效）' : '最大化（双击标题栏同样有效）'}
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
