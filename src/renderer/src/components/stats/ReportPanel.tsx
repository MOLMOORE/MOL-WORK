import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Download, Eye, FileText, FolderOpen, ListChecks, TriangleAlert } from 'lucide-react'
import type { DailyReport } from '@shared/types/domain'
import { Card, SectionHeader } from '../ui/Card'
import { Badge, EmptyState } from '../ui/Feedback'
import { Button, IconButton } from '../ui/Button'
import { Input } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { ToolIcon } from '../tool/ToolIcon'
import { useAppStore } from '../../stores/appStore'
import { api } from '../../lib/ipc'

export interface ReportPanelProps {
  report: DailyReport | null
  anchor: string
  onAnchorChange: (anchor: string) => void
}

export function ReportPanel({ report, anchor, onAnchorChange }: ReportPanelProps): JSX.Element {
  const pushToast = useAppStore((state) => state.pushToast)
  const [view, setView] = useState<'summary' | 'markdown'>('summary')
  const [markdown, setMarkdown] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportedPath, setExportedPath] = useState('')

  useEffect(() => {
    if (view !== 'markdown') return
    let cancelled = false
    void api.stats.reportMarkdown(anchor).then((content) => {
      if (!cancelled) setMarkdown(content)
    })
    return () => {
      cancelled = true
    }
  }, [view, anchor])

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    try {
      const result = await api.app.exportReport(anchor)
      setExportedPath(result.path)
      await api.app.showItemInFolder(result.path)
      pushToast({ title: '日报已导出', description: result.path, tone: 'success' })
    } catch (error) {
      pushToast({ title: '导出失败', description: (error as Error).message, tone: 'danger' })
    } finally {
      setExporting(false)
    }
  }

  const openReportsDir = (): void => {
    void api.app.getDataDir().then((dir) => api.app.openPath(`${dir}/reports`))
  }

  return (
    <Card className="flex h-full flex-col">
      <SectionHeader
        className="mb-3"
        title="日报复盘"
        description={report ? `生成时间 ${report.generatedAt.replace('T', ' ').slice(0, 16)}` : '正在生成…'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={anchor}
              className="w-36"
              onChange={(event) => event.target.value && onAnchorChange(event.target.value)}
            />
            <Tabs
              size="sm"
              value={view}
              onChange={(key) => setView(key as 'summary' | 'markdown')}
              items={[
                { key: 'summary', label: '结构化', icon: <ListChecks className="h-3 w-3" /> },
                { key: 'markdown', label: 'Markdown', icon: <Eye className="h-3 w-3" /> }
              ]}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              onClick={openReportsDir}
            >
              报告目录
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={exporting}
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => void handleExport()}
            >
              导出日报
            </Button>
          </div>
        }
      />

      {exportedPath ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2">
          <FileText className="h-3.5 w-3.5 text-success" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{exportedPath}</span>
          <IconButton label="打开文件" onClick={() => void api.app.openPath(exportedPath)}>
            <FolderOpen className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      {!report ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="暂无可复盘数据" description="先记录一次专注、复习或工具调用" />
      ) : view === 'summary' ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs leading-relaxed text-muted-foreground">{report.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {report.highlights.map((item) => (
                <Badge key={item} tone="primary">
                  {item}
                </Badge>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-tint-warning">
                <TriangleAlert className="h-3 w-3" />
                复盘建议
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {report.suggestions.map((item) => (
                  <li key={item} className="text-[11px] leading-relaxed text-muted-foreground">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/25 p-4">
            <p className="text-xs font-medium text-foreground">当日时间线</p>
            <div className="mt-3 flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1">
              {report.stats.timeline.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">暂无记录</p>
              ) : (
                report.stats.timeline.slice(0, 16).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2">
                    <ToolIcon
                      name="Wrench"
                      size="sm"
                      color={
                        entry.kind === 'focus'
                          ? '#22C55E'
                          : entry.kind === 'tool'
                            ? '#F59E0B'
                            : entry.kind === 'memory'
                              ? '#C084FC'
                              : '#6366F1'
                      }
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-foreground">{entry.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {entry.at.replace('T', ' ').slice(5, 16)} · {entry.detail}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-xl border border-border bg-background/50 p-4 pr-2">
          <div
            className={[
              'text-xs leading-relaxed text-muted-foreground',
              '[&_h1]:mb-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-foreground',
              '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:text-foreground',
              '[&_ul]:my-1 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-0.5 [&_li]:list-none',
              '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3',
              '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[11px]',
              '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-foreground',
              '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
              '[&_strong]:text-foreground'
            ].join(' ')}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        </div>
      )}
      </div>
    </Card>
  )
}
