import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { APP_NAME, themeSkinLabel } from '@shared/constants'
import { NAV_ITEMS } from './Sidebar'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../lib/utils'

/**
 * 皮肤专属外壳：默认主题下这些元素由 CSS 隐藏（.skin-topnav / .app-statusbar 默认 display:none），
 * 只有需要顶部导航（纸间杂志 / 粗野主义）或底部状态栏（荧光终端 / 数据驾驶舱 / 复古桌面）的皮肤会显示它们。
 */
export function SkinTopNav(): JSX.Element {
  return (
    <nav className="skin-topnav shrink-0 items-center gap-1 border-border bg-surface px-4 py-2">
      <span className="mr-4 text-[13px] font-bold uppercase tracking-[0.2em] text-foreground">{APP_NAME}</span>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'app-nav-item flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-150',
                isActive
                  ? 'is-active bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="nav-label">{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

/** 底部状态栏：终端 / 驾驶舱 / 复古桌面皮肤使用，内容与概览数据同源 */
export function AppStatusBar(): JSX.Element {
  const overview = useAppStore((state) => state.overview)
  const settings = useAppStore((state) => state.settings)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const hhmmss = now.toLocaleTimeString('zh-CN', { hour12: false })
  const cells: { label: string; value: string; strong?: boolean }[] = [
    { label: '主题', value: themeSkinLabel(settings?.themeSkin), strong: true },
    { label: '待办', value: String(overview?.pendingCount ?? 0) },
    { label: '逾期', value: String(overview?.overdueCount ?? 0) },
    { label: '待复习', value: String(overview?.dueReviews.length ?? 0) },
    { label: '今日专注', value: (overview?.todayFocusMinutes ?? 0) + ' 分钟' },
    { label: '今日完成', value: String(overview?.todayCompleted ?? 0) }
  ]
  return (
    <footer className="app-statusbar h-7 shrink-0 items-stretch border-t border-border bg-surface text-[11px] text-muted-foreground">
      {cells.map((cell) => (
        <span key={cell.label} className="flex items-center gap-1.5 border-r border-border px-3">
          <span className="uppercase tracking-wider opacity-70">{cell.label}</span>
          <span className={cn('text-foreground', cell.strong && 'font-semibold')}>{cell.value}</span>
        </span>
      ))}
      <span className="ml-auto flex items-center gap-2 border-l border-border px-3 tabular-nums text-foreground">
        {hhmmss}
      </span>
    </footer>
  )
}
