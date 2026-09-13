import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  padded?: boolean
}

export function Card({ interactive, padded = true, className, children, ...rest }: CardProps): JSX.Element {
  return (
    <div
      className={cn(interactive ? 'glass-card-hover cursor-pointer' : 'glass-card', padded && 'p-5', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export interface SectionHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, description, action, className }: SectionHeaderProps): JSX.Element {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

export interface StatCardProps {
  label: string
  value: string
  hint?: string
  tone?: 'primary' | 'info' | 'success' | 'warning'
  icon?: ReactNode
  onClick?: () => void
  className?: string
  /** 是否显示可点击的提示样式 */
  clickable?: boolean
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  primary: 'from-[#6366F1]/25 to-[#7C3AED]/10 text-[#A5B4FC]',
  info: 'from-[#22D3EE]/25 to-[#6366F1]/10 text-[#67E8F9]',
  success: 'from-[#22C55E]/25 to-[#22D3EE]/10 text-[#86EFAC]',
  warning: 'from-[#F59E0B]/25 to-[#EF4444]/10 text-[#FCD34D]'
}

export function StatCard({ label, value, hint, tone = 'primary', icon, onClick, className, clickable }: StatCardProps): JSX.Element {
  const interactive = onClick !== undefined || clickable
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'glass-card group relative flex h-full w-full flex-col justify-center overflow-hidden p-4 text-left transition-all duration-200',
        // 悬停不再描边（线条）：反馈统一交给看板模块的磨砂蒙层
        interactive
          ? 'hover:-translate-y-0.5 hover:shadow-glow'
          : 'cursor-default hover:translate-y-0 hover:shadow-card',
        className
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-70 transition-opacity group-hover:opacity-100', TONES[tone])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn('shrink-0 rounded-xl bg-background/60 p-2 transition-transform group-hover:scale-105', TONES[tone])}>
            {icon}
          </div>
        ) : null}
      </div>
      {interactive ? (
        <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          点击查看明细
        </span>
      ) : null}
    </button>
  )
}
