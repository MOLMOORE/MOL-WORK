import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { APP_NAME, themeSkinLabel } from '@shared/constants'
import { NAV_ITEMS, SETTINGS_NAV } from './Sidebar'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../lib/utils'

/**
 * 皮肤专属外壳：默认主题下这些元素由 CSS 隐藏（.skin-topnav / .app-statusbar 默认 display:none），
 * 只有需要顶部导航（纸间杂志 / 粗野主义）或底部状态栏（荧光终端 / 数据驾驶舱 / 复古桌面）的皮肤会显示它们。
 *
 * 纸间杂志 / 粗野主义会整条隐藏侧栏，因此顶部导航必须自带「设置」与「明暗切换」，
 * 否则这两个入口在界面上就彻底消失了（v1.2.4 修复）。
 */
export function SkinTopNav(): JSX.Element {
  const overview = useAppStore((state) => state.overview)
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const dark = settings?.theme !== 'light'

  const badge = (key: string): number | null => {
    if (key === '/tasks' && (overview?.pendingCount ?? 0) > 0) return overview?.pendingCount ?? 0
    if (key === '/notes' && (overview?.dueReviews.length ?? 0) > 0) return overview?.dueReviews.length ?? 0
    return null
  }

  const SettingsIcon = SETTINGS_NAV.icon
  const itemClass = ({ isActive }: { isActive: boolean }): string =>
    cn(
      'app-nav-item flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-150',
      isActive ? 'is-active bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    )

  return (
    <nav className="skin-topnav shrink-0 flex-wrap items-center gap-1 border-border bg-surface px-4 py-2">
      <span className="mr-4 text-[13px] font-bold uppercase tracking-[0.2em] text-foreground">{APP_NAME}</span>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const count = badge(item.to)
        return (
          <NavLink key={item.to} to={item.to} end={item.end} title={item.label} className={itemClass}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="nav-label">{item.label}</span>
            {count !== null ? (
              <span className="nav-label rounded-full bg-primary/25 px-1.5 py-0.5 text-[10px] font-medium text-tint-primary">{count}</span>
            ) : null}
          </NavLink>
        )
      })}

      {/* 右端常驻区：明暗切换 + 设置。窄窗口时整条导航换行，保证入口永远可见 */}
      <div className="skin-topnav-tail ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => void updateSettings({ theme: dark ? 'light' : 'dark' })}
          title={dark ? '切换浅色' : '切换深色'}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-all duration-150 hover:bg-muted/60 hover:text-foreground"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="nav-label">{dark ? '浅色' : '深色'}</span>
        </button>
        <NavLink to={SETTINGS_NAV.to} title={SETTINGS_NAV.label} className={itemClass}>
          <SettingsIcon className="h-4 w-4 shrink-0" />
          <span className="nav-label">{SETTINGS_NAV.label}</span>
        </NavLink>
      </div>
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
