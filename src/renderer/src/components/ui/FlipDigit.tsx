import { cn } from '../../lib/utils'

/** 翻页时钟数字：字符变化时以翻页动画重新挂载 */
export function FlipDigit({ char, className }: { char: string; className?: string }): JSX.Element {
  if (!/\d/.test(char)) {
    return <span className={cn('px-0.5 text-muted-foreground', className)}>{char}</span>
  }
  return (
    <span className="inline-block [perspective:420px] [transform-style:preserve-3d]">
      <span key={char} className="inline-block origin-center animate-flip-in">
        {char}
      </span>
    </span>
  )
}
