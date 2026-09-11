import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface TabItem {
  key: string
  label: string
  count?: number
  icon?: ReactNode
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  className?: string
  size?: 'sm' | 'md'
}

export function Tabs({ items, value, onChange, className, size = 'md' }: TabsProps): JSX.Element {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1',
        className
      )}
    >
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.97]',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs',
              active
                ? 'bg-gradient-to-r from-[#6366F1] to-[#7C3AED] text-white shadow-[0_8px_20px_-12px_rgba(99,102,241,0.9)]'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                  active ? 'bg-white/25 text-white' : 'bg-background/70 text-muted-foreground'
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
