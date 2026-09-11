import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, CalendarPlus, FolderKanban, Plus, Timer } from 'lucide-react'
import { Button, IconButton } from '../ui/Button'
import { GlobalSearch } from './GlobalSearch'
import { TaskForm } from '../task/TaskForm'
import { ProjectManager } from '../task/ProjectManager'
import { useAppStore } from '../../stores/appStore'
import { useTaskStore } from '../../stores/taskStore'
import { usePomodoroStore, PHASE_META } from '../../stores/pomodoroStore'
import { cn } from '../../lib/utils'

function clock(seconds: number): string {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: '仪表盘', subtitle: '今日任务、待复习内容与使用概览' },
  '/tasks': { title: '任务日程', subtitle: '任务与日程合一，可跨日期拖拽排期与日内排序' },
  '/pomodoro': { title: '番茄钟', subtitle: '专注计时、休息循环与专注记录' },
  '/notes': { title: '笔记与资料', subtitle: '按遗忘曲线自动安排复习计划' },
  '/tools': { title: '可插拔工具集', subtitle: '工具使用自动回流到统计层' },
  '/stats': { title: '统计与复盘', subtitle: '投入时间、项目分布与拖延识别' },
  '/settings': { title: '设置', subtitle: '主题、字号、外部依赖与数据维护' }
}

export function TopBar(): JSX.Element {
  const location = useLocation()
  const [formOpen, setFormOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const reminders = useAppStore((state) => state.reminders)
  const clearReminders = useAppStore((state) => state.clearReminders)
  const projectCount = useTaskStore((state) => state.projects.length)
  const pomodoroSeconds = usePomodoroStore((state) => state.secondsLeft)
  const pomodoroRunning = usePomodoroStore((state) => state.running)
  const pomodoroPhase = usePomodoroStore((state) => state.phase)
  const bellRef = useRef<HTMLDivElement>(null)

  const meta = TITLES[location.pathname] ?? TITLES['/']

  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (!bellRef.current?.contains(event.target as Node)) setBellOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-border/70 bg-surface/60 px-5 backdrop-blur-2xl">
      <div className="min-w-[190px] max-w-[260px] shrink-0">
        <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{meta.title}</h1>
        <p className="truncate text-[11px] text-muted-foreground">{meta.subtitle}</p>
      </div>

      <div className="flex flex-1 justify-center">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/pomodoro'
          }}
          title="番茄钟"
          className={cn(
            'hidden items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors xl:flex',
            pomodoroRunning
              ? 'border-primary/50 bg-primary/15 text-foreground'
              : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground'
          )}
        >
          <Timer className="h-3 w-3 text-[#A5B4FC]" />
          <span className="tabular-nums">{clock(pomodoroSeconds)}</span>
          <span className="text-muted-foreground">{PHASE_META[pomodoroPhase].label}</span>
        </button>

        <button
          type="button"
          onClick={() => setProjectsOpen(true)}
          title="管理项目与课程（可新增、编辑、删除）"
          className="hidden items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground xl:flex"
        >
          <FolderKanban className="h-3 w-3 text-[#A5B4FC]" />
          {projectCount} 个项目
        </button>

        <div ref={bellRef} className="relative">
          <IconButton label="提醒通知" active={bellOpen} onClick={() => setBellOpen((value) => !value)}>
            <Bell className="h-4 w-4" />
            {reminders.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white">
                {reminders.length > 9 ? '9+' : reminders.length}
              </span>
            ) : null}
          </IconButton>

          {bellOpen ? (
            <div className="absolute right-0 top-10 z-40 w-[320px] overflow-hidden rounded-2xl border border-border/80 bg-surface/95 shadow-2xl backdrop-blur-2xl animate-scale-in">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
                <p className="text-xs font-semibold text-foreground">到点提醒</p>
                {reminders.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearReminders}
                    className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    全部已读
                  </button>
                ) : null}
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2">
                {reminders.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">暂无新提醒，日程到点后会在此弹出</p>
                ) : (
                  reminders.map((item) => (
                    <div key={`${item.eventId}-${item.startAt}`} className="rounded-xl px-3 py-2 hover:bg-muted/60">
                      <p className="text-xs font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{item.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="sm"
          icon={<CalendarPlus className="h-3.5 w-3.5" />}
          onClick={() => {
            window.location.hash = '#/tasks'
          }}
          className={cn('hidden lg:inline-flex')}
        >
          排日程
        </Button>

        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFormOpen(true)}>
          快速新建任务
        </Button>
      </div>

      <TaskForm open={formOpen} onClose={() => setFormOpen(false)} />
      <ProjectManager open={projectsOpen} onClose={() => setProjectsOpen(false)} />
    </header>
  )
}
