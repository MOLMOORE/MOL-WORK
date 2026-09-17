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
        'inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1',
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
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground'
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                  active ? 'bg-primary/15 text-tint-primary' : 'bg-background/70 text-muted-foreground'
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
