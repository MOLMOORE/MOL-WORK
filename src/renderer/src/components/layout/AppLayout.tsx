import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { TopClock } from './TopClock'
import { Toaster } from '../ui/Toaster'
import { DueAlertWatcher } from '../task/DueAlertWatcher'

/** 这些页面自身已有时间显示，不再展示全局时钟 */
const NO_GLOBAL_CLOCK_PATHS = ['/tasks', '/settings']

export function AppLayout(): JSX.Element {
  const location = useLocation()
  const showClock = !NO_GLOBAL_CLOCK_PATHS.includes(location.pathname)

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 aurora" />
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-[0.35]" />

      <Sidebar />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto w-full max-w-[1500px] animate-fade-in">
            {/* 全局统一时钟：置于页面内容最上方居中（任务页与设置页自身已有时间，不重复展示） */}
            {showClock ? (
              <div className="mb-5 flex justify-center">
                <TopClock />
              </div>
            ) : null}
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster />
      <DueAlertWatcher />
    </div>
  )
}
