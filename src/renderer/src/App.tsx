import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { CloseBehaviorDialog } from './components/layout/CloseBehaviorDialog'
import { DashboardPage } from './pages/DashboardPage'
import { TasksPage } from './pages/TasksPage'
import { PomodoroPage } from './pages/PomodoroPage'
import { NotesPage } from './pages/NotesPage'
import { ToolsPage } from './pages/ToolsPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAppStore } from './stores/appStore'
import { useTaskStore } from './stores/taskStore'
import { Spinner } from './components/ui/Feedback'

export default function App(): JSX.Element {
  const ready = useAppStore((state) => state.ready)
  const init = useAppStore((state) => state.init)
  const userName = useAppStore((state) => state.settings?.userName)
  const loadProjects = useTaskStore((state) => state.loadProjects)

  useEffect(() => {
    void init()
    void loadProjects()
  }, [init, loadProjects])

  // 软件名 = 「XX的工作站」：窗口标题与文档标题随称呼实时变化
  const appName = `${(userName ?? 'MOL').trim() || 'MOL'}的工作站`
  useEffect(() => {
    document.title = appName
  }, [appName])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-3 bg-background text-muted-foreground">
        <Spinner className="h-5 w-5" />
        <span className="text-sm">正在加载{appName}…</span>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/calendar" element={<Navigate to="/tasks" replace />} />
          <Route path="/pomodoro" element={<PomodoroPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {/* 点击窗口 X 后的进入后台/真正关闭选择弹窗 */}
      <CloseBehaviorDialog />
    </>
  )
}
