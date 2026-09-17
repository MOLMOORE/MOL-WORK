import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { Toaster } from '../ui/Toaster'
import { DueAlertWatcher } from '../task/DueAlertWatcher'
import { AppStatusBar, SkinTopNav } from './SkinChrome'

export function AppLayout(): JSX.Element {
  return (
    <div className="app-shell relative flex h-full w-full overflow-hidden bg-background">
      <Sidebar />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* 皮肤专属外壳：默认主题下由 CSS 隐藏，纸间杂志 / 粗野主义会显示顶部导航 */}
        <SkinTopNav />
        <TopBar />
        <main className="app-main flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto w-full max-w-[1500px] animate-fade-in">
            {/* 各页面的时间显示已统一为可自由拖拽缩放的看板方块，此处不再重复渲染 */}
            <Outlet />
          </div>
        </main>
        {/* 终端 / 驾驶舱 / 复古桌面皮肤会显示底部状态栏 */}
        <AppStatusBar />
      </div>

      <Toaster />
      <DueAlertWatcher />
    </div>
  )
}
