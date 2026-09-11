import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react'
import { cn } from '../../lib/utils'

export interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}

export function Field({ label, hint, error, required, className, children }: FieldProps): JSX.Element {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {label}
          {required ? <span className="text-danger">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="text-[11px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[11px] leading-relaxed text-muted-foreground/80">{hint}</span>
      ) : null}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className={cn('field-base', className)} {...rest} />
}

export function Textarea({ className, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea rows={rows} className={cn('field-base resize-y leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return (
    <div className="relative">
      <select className={cn('field-base cursor-pointer appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
        ▼
      </span>
    </div>
  )
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
}

export function Checkbox({ label, className, ...rest }: CheckboxProps): JSX.Element {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2 text-xs text-muted-foreground', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-border bg-input transition-all checked:border-primary checked:bg-primary focus-visible:ring-2 focus-visible:ring-primary/40"
        {...rest}
      />
      <span className="leading-relaxed">{label}</span>
    </label>
  )
}

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps): JSX.Element {
  return (
    <label className={cn('flex items-center gap-2', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ?? '开关'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-primary bg-primary/80' : 'border-border bg-muted'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </button>
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
    </label>
  )
}
