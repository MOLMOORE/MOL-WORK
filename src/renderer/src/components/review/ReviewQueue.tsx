import { CalendarClock, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react'
import type { ReviewItem, ReviewRating } from '@shared/types/domain'
import { Badge } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { cn, formatDateTime, isOverdue } from '../../lib/utils'

const RATINGS: { rating: ReviewRating; label: string; hint: string; className: string }[] = [
  { rating: 0, label: '重来', hint: '10 分钟后重新复习', className: 'hover:border-danger/60 hover:bg-danger/15 hover:text-danger' },
  { rating: 1, label: '困难', hint: '明天再复习', className: 'hover:border-warning/60 hover:bg-warning/15 hover:text-warning' },
  { rating: 2, label: '一般', hint: '按曲线正常间隔', className: 'hover:border-primary/60 hover:bg-primary/15 hover:text-tint-primary' },
  { rating: 3, label: '简单', hint: '间隔延长 30%', className: 'hover:border-success/60 hover:bg-success/15 hover:text-success' }
]

export interface ReviewQueueProps {
  items: ReviewItem[]
  onGrade: (id: number, rating: ReviewRating) => void | Promise<void>
  onPlanTomorrow?: (id: number) => void | Promise<void>
  compact?: boolean
  emptyHint?: string
}

export function ReviewQueue({ items, onGrade, onPlanTomorrow, compact, emptyHint }: ReviewQueueProps): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <p className="text-xs text-muted-foreground">{emptyHint ?? '今天没有到期复习内容，保持节奏即可'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const overdue = isOverdue(item.dueAt)
        return (
          <div
            key={item.id}
            className="group rounded-xl border border-border bg-muted/25 p-3 transition-all duration-150 hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={overdue ? 'danger' : 'info'} dot>
                    {overdue ? '已逾期' : '待复习'}
                  </Badge>
                  <Badge tone="default">第 {item.stage + 1} 阶段</Badge>
                  <Badge tone="default">间隔 {item.intervalDays} 天</Badge>
                  <Badge tone="default">EF {item.ease.toFixed(2)}</Badge>
                  {item.projectName ? <Badge tone="primary">{item.projectName}</Badge> : null}
                </div>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(item.dueAt)}</span>
            </div>

            <div className={cn('mt-2.5 flex items-center gap-1.5', compact && 'flex-wrap')}>
              {RATINGS.map((option) => (
                <button
                  key={option.rating}
                  type="button"
                  title={option.hint}
                  onClick={() => void onGrade(item.id, option.rating)}
                  className={cn(
                    'rounded-lg border border-border bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all duration-150 active:scale-95',
                    option.className
                  )}
                >
                  {option.label}
                </button>
              ))}
              {onPlanTomorrow ? (
                <button
                  type="button"
                  onClick={() => void onPlanTomorrow(item.id)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-all hover:border-info/50 hover:text-info active:scale-95"
                >
                  <CalendarClock className="h-3 w-3" />
                  排入明日
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ReviewSummary({ mastered, due, averageEase }: { mastered: number; due: number; averageEase: number }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Sparkles className="h-3 w-3 text-tint-primary" />
        待复习 {due}
      </span>
      <span>·</span>
      <span>已掌握 {mastered}</span>
      <span>·</span>
      <span>平均难度系数 {averageEase.toFixed(2)}</span>
      <Button variant="ghost" size="xs" icon={<RotateCcw className="h-3 w-3" />} className="ml-auto">
        遗忘曲线
      </Button>
    </div>
  )
}
