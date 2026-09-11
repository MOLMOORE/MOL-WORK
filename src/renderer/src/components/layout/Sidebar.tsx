import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  ChevronLeft,
  Layers3,
  LayoutDashboard,
  ListChecks,
  Moon,
  NotebookPen,
  Settings,
  Sun,
  Timer,
  Wrench
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: '任务日程', icon: ListChecks },
  { to: '/pomodoro', label: '番茄钟', icon: Timer },
  { to: '/notes', label: '笔记', icon: NotebookPen },
  { to: '/tools', label: '工具', icon: Wrench },
  { to: '/stats', label: '统计', icon: BarChart3 }
]

export function Sidebar(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const overview = useAppStore((state) => state.overview)
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const pendingCount = overview?.pendingCount ?? 0
  const reviewCount = overview?.dueReviews.length ?? 0

  const badge = (key: string): number | null => {
    if (key === '/tasks' && pendingCount > 0) return pendingCount
    if (key === '/notes' && reviewCount > 0) return reviewCount
    return null
  }

  return (
    <aside
      className={cn(
        'relative z-20 flex h-full shrink-0 flex-col border-r border-border/70 bg-surface/70 backdrop-blur-2xl transition-all duration-250',
        collapsed ? 'w-[76px]' : 'w-[222px]'
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366F1] to-[#7C3AED] shadow-glow">
          <Layers3 className="h-4.5 w-4.5 text-white" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              {(settings?.userName ?? 'MOL').trim() || 'MOL'}的工作站
            </p>
            <p className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">Personal Workstation</p>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const count = badge(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-gradient-to-r from-[#6366F1]/25 to-[#7C3AED]/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#6366F1] to-[#22D3EE]" />
                  ) : null}
                  <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-[#A5B4FC]')} />
                  {!collapsed ? (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {count !== null ? (
                        <span className="rounded-full bg-primary/25 px-1.5 py-0.5 text-[10px] font-medium text-[#A5B4FC]">
                          {count}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 px-3 pb-4">
        <button
          type="button"
          onClick={() => void updateSettings({ theme: settings?.theme === 'dark' ? 'light' : 'dark' })}
          title="切换主题"
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground',
            collapsed && 'justify-center px-0'
          )}
        >
          {settings?.theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          {!collapsed ? <span>{settings?.theme === 'light' ? '切换深色' : '切换浅色'}</span> : null}
        </button>

        <NavLink
          to="/settings"
          title="设置"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
              collapsed && 'justify-center px-0',
              isActive ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed ? <span>设置</span> : null}
        </NavLink>

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground',
            collapsed && 'justify-center px-0'
          )}
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          {!collapsed ? <span>收起侧栏</span> : null}
        </button>
      </div>
    </aside>
  )
}
