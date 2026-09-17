import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

type BadgeTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const BADGE_TONES: Record<BadgeTone, string> = {
  default: 'bg-muted text-muted-foreground border-border',
  primary: 'bg-primary/15 text-tint-primary border-primary/40',
  success: 'bg-success/15 text-tint-success border-success/40',
  warning: 'bg-warning/15 text-tint-warning border-warning/40',
  danger: 'bg-danger/15 text-tint-danger border-danger/40',
  info: 'bg-info/15 text-tint-info border-info/40'
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  dot?: boolean
}

export function Badge({ tone = 'default', children, className, dot }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        BADGE_TONES[tone],
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

export interface ProgressProps {
  value: number
  className?: string
  tone?: 'primary' | 'success' | 'warning'
}

const PROGRESS_TONES: Record<NonNullable<ProgressProps['tone']>, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning'
}

export function Progress({ value, className, tone = 'primary' }: ProgressProps): JSX.Element {
  const safe = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-300', PROGRESS_TONES[tone])}
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon ? <div className="rounded-2xl border border-border bg-muted/40 p-3 text-muted-foreground">{icon}</div> : null}
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Spinner({ className }: { className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary',
        className
      )}
    />
  )
}

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-lg bg-[linear-gradient(90deg,hsl(var(--muted))_0%,hsl(var(--border))_50%,hsl(var(--muted))_100%)] bg-[length:1000px_100%]',
        className
      )}
    />
  )
}
