import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { Toaster } from '../ui/Toaster'
import { DueAlertWatcher } from '../task/DueAlertWatcher'

export function AppLayout(): JSX.Element {
  return (
    <div className="app-shell relative flex h-full w-full overflow-hidden bg-background">
      <Sidebar />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto w-full max-w-[1500px] animate-fade-in">
            {/* 各页面的时间显示已统一为可自由拖拽缩放的看板方块，此处不再重复渲染 */}
            <Outlet />
          </div>
        </main>
      </div>

      <Toaster />
      <DueAlertWatcher />
    </div>
  )
}
