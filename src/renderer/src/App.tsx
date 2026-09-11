import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { TasksPage } from './pages/TasksPage'
import { CalendarPage } from './pages/CalendarPage'
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
  const loadProjects = useTaskStore((state) => state.loadProjects)

  useEffect(() => {
    void init()
    void loadProjects()
  }, [init, loadProjects])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-3 bg-background text-muted-foreground">
        <Spinner className="h-5 w-5" />
        <span className="text-sm">正在加载个人工作站…</span>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
