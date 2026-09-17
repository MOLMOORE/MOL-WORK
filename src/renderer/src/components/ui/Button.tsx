import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary',
  secondary: 'bg-muted text-foreground hover:bg-muted/70 border border-border',
  ghost: 'bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  outline: 'bg-transparent border border-border text-foreground hover:border-primary/60 hover:bg-primary/10',
  danger: 'bg-danger text-white hover:bg-danger/90',
  success: 'bg-success text-white hover:bg-success/90'
}

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[0.97]',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : icon}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  tone?: 'default' | 'danger'
}

export function IconButton({ label, active, tone = 'default', className, children, ...rest }: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-all duration-150',
        'hover:border-border hover:bg-muted/70 hover:text-foreground active:scale-95',
        active && 'border-primary/50 bg-primary/15 text-foreground',
        tone === 'danger' && 'hover:border-danger/50 hover:bg-danger/15 hover:text-danger',
        'disabled:pointer-events-none disabled:opacity-40',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
