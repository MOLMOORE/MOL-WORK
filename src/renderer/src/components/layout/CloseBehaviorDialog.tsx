import { useEffect, useState } from 'react'
import { DoorOpen, MoonStar } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Overlay'
import { Switch } from '../ui/Field'
import { api } from '../../lib/ipc'
import { APP_NAME } from '@shared/constants'
import { useAppStore } from '../../stores/appStore'

/** 点击窗口右上角“X”后的行为选择弹窗：进入后台或真正关闭，可勾选“不再提醒”记住选择 */
export function CloseBehaviorDialog(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const pushToast = useAppStore((state) => state.pushToast)

  useEffect(() => {
    const off = api.onCloseRequest(() => setOpen(true))
    return off
  }, [])

  const choose = async (action: 'background' | 'exit'): Promise<void> => {
    setBusy(true)
    try {
      if (remember) {
        await api.app.updateSettings({ closeAction: action })
        pushToast({
          title: '已记住关闭行为',
          description: action === 'background' ? '以后点击 X 将直接进入后台，可在设置中更改' : '以后点击 X 将直接退出，可在设置中更改',
          tone: 'success'
        })
      }
      setOpen(false)
      if (action === 'background') {
        await api.app.hideWindow()
      } else {
        await api.app.quitApp()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={`关闭 ${APP_NAME}`}
      description="选择窗口关闭后的行为：后台运行会保留在系统托盘，提醒依然有效"
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('background')}
          className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
        >
          <MoonStar className="mt-0.5 h-5 w-5 shrink-0 text-tint-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">进入后台运行（推荐）</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              窗口隐藏到系统托盘，截止提醒、复习提醒依然生效，双击托盘图标即可回到软件
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('exit')}
          className="flex items-start gap-3 rounded-xl border border-border bg-muted/25 p-4 text-left transition-all hover:border-danger/50 hover:bg-danger/5 disabled:opacity-50"
        >
          <DoorOpen className="mt-0.5 h-5 w-5 shrink-0 text-tint-danger" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">真正关闭软件</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              完全退出应用，关闭后不会收到任何截止与日程提醒
            </span>
          </span>
        </button>

        <div className="rounded-xl border border-border bg-muted/25 p-3">
          <Switch checked={remember} onChange={setRemember} label="不再提醒（以后一直按此次选择执行，可在设置中更改）" />
        </div>
      </div>
    </Modal>
  )
}
