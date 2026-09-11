import {
  AudioLines,
  CircuitBoard,
  Download,
  FileText,
  Image,
  Layers,
  Ruler,
  ScanText,
  Video,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import { cn } from '../../lib/utils'

/** manifest.icon 字符串 → 图标组件；新增工具只需在此登记图标名 */
const REGISTRY: Record<string, LucideIcon> = {
  Image,
  AudioLines,
  Video,
  FileText,
  Download,
  ScanText,
  Ruler,
  CircuitBoard,
  Layers,
  Wrench
}

export function toolIcon(name: string): LucideIcon {
  return REGISTRY[name] ?? Wrench
}

export interface ToolIconProps {
  name: string
  className?: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES: Record<NonNullable<ToolIconProps['size']>, string> = {
  sm: 'rounded-lg p-1.5',
  md: 'rounded-xl p-2',
  lg: 'rounded-2xl p-2.5'
}

const ICON_SIZES: Record<NonNullable<ToolIconProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5'
}

export function ToolIcon({ name, className, color, size = 'md' }: ToolIconProps): JSX.Element {
  const Icon = toolIcon(name)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', SIZES[size], className)}
      style={color ? { background: `${color}22`, color } : undefined}
    >
      <Icon className={ICON_SIZES[size]} />
    </span>
  )
}
