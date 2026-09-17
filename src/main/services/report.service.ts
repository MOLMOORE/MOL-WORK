import type { DailyReport } from '@shared/types/domain'
import { APP_NAME } from '@shared/constants'
import { procrastination, dailyStats } from './stats.service'
import { nowIso } from '../utils/time'

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}

export function dailyReport(dateKey: string): DailyReport {
  const stats = dailyStats(dateKey)
  const procrastinated = procrastination()

  const highlights: string[] = []
  if (stats.focusMinutes > 0) highlights.push(`专注投入 ${formatMinutes(stats.focusMinutes)}`)
  if (stats.tasksCompleted > 0) highlights.push(`完成 ${stats.tasksCompleted} 项任务`)
  if (stats.reviewsDone > 0) highlights.push(`完成 ${stats.reviewsDone} 条遗忘曲线复习`)
  if (stats.toolRuns > 0) highlights.push(`调用工具 ${stats.toolRuns} 次，累计耗时 ${formatMinutes(stats.toolMinutes)}`)
  if (stats.eventsCount > 0) highlights.push(`日程事件 ${stats.eventsCount} 项`)
  const topProject = [...stats.projects].sort((a, b) => b.focusMinutes - a.focusMinutes)[0]
  if (topProject && topProject.focusMinutes > 0) {
    highlights.push(`投入最多：${topProject.projectName}（${formatMinutes(topProject.focusMinutes)}）`)
  }
  if (highlights.length === 0) highlights.push('当日暂无记录，先从一个任务开始')

  const suggestions: string[] = []
  if (stats.reviewsDue > stats.reviewsDone) {
    suggestions.push(`还有 ${stats.reviewsDue - stats.reviewsDone} 条复习内容到期，建议排入今日日程`)
  }
  const high = procrastinated.filter((item) => item.severity === 'high')
  if (high.length > 0) {
    suggestions.push(`优先处理 ${high.length} 项严重拖延事项：${high.slice(0, 3).map((i) => i.task.title).join('、')}`)
  }
  if (stats.focusMinutes === 0) {
    suggestions.push('今日尚无专注记录，建议先安排一个 25 分钟专注周期')
  }
  if (stats.toolRuns === 0) {
    suggestions.push('可尝试用工具集的单位换算或网页提取工具处理手头的零散任务')
  }
  if (suggestions.length === 0) suggestions.push('节奏良好，保持当前计划即可')

  const summary =
    `${dateKey} 共投入专注 ${formatMinutes(stats.focusMinutes)}，` +
    `新增任务 ${stats.tasksCreated} 项、完成 ${stats.tasksCompleted} 项，` +
    `复习 ${stats.reviewsDone}/${stats.reviewsDue} 条，` +
    `工具调用 ${stats.toolRuns} 次。`

  return { date: dateKey, generatedAt: nowIso(), summary, highlights, suggestions, stats }
}

export function renderReportMarkdown(report: DailyReport): string {
  const lines: string[] = [
    `# ${APP_NAME}日报 · ${report.date}`,
    '',
    `> 生成时间：${report.generatedAt.replace('T', ' ')}`,
    '',
    '## 概览',
    '',
    report.summary,
    '',
    '## 今日亮点',
    '',
    ...report.highlights.map((item) => `- ${item}`),
    '',
    '## 时间投入分布',
    '',
    '| 项目/课程 | 投入时长 | 新增任务 | 完成任务 |',
    '| --- | ---: | ---: | ---: |',
    ...report.stats.projects.map(
      (project) =>
        `| ${project.projectName} | ${formatMinutes(project.focusMinutes)} | ${project.taskCount} | ${project.doneCount} |`
    ),
    '',
    '## 时间线',
    '',
    ...(report.stats.timeline.length > 0
      ? report.stats.timeline
          .slice(0, 30)
          .map((entry) => `- ${entry.at.replace('T', ' ').slice(0, 16)} · [${entry.kind}] ${entry.title}（${entry.detail}）`)
      : ['- 暂无记录']),
    '',
    '## 复盘建议',
    '',
    ...report.suggestions.map((item) => `- ${item}`),
    ''
  ]
  return lines.join('\n')
}
