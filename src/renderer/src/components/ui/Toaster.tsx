import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../lib/utils'

const TONE_MAP = {
  info: { icon: Info, ring: 'border-info/40', text: 'text-tint-info' },
  success: { icon: CheckCircle2, ring: 'border-success/40', text: 'text-tint-success' },
  warning: { icon: AlertTriangle, ring: 'border-warning/40', text: 'text-tint-warning' },
  danger: { icon: XCircle, ring: 'border-danger/40', text: 'text-tint-danger' }
} as const

export function Toaster(): JSX.Element {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] flex-col gap-2">
      {toasts.map((toast) => {
        const tone = TONE_MAP[toast.tone]
        const Icon = tone.icon
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3 shadow-pop animate-fade-in',
              tone.ring
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.text)} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => dismiss(toast.id)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
