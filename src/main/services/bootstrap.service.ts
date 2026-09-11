import { addDaysKey, addMinutes, nowIso, todayKey } from '../utils/time'
import { createProject } from '../db/repositories/project.repo'
import { createTask } from '../db/repositories/task.repo'
import { createNote } from '../db/repositories/note.repo'
import { createReview } from '../db/repositories/review.repo'
import { createEvent } from '../db/repositories/schedule.repo'
import { closeDanglingFocus, startFocus, stopFocus } from '../db/repositories/focus.repo'
import { count } from '../db/query'
import { logger } from '../utils/logger'
import { syncToolSearchIndex } from './tool.service'
import { rebuildAllIndexes } from './search.service'
import { resetIndexForRebuild } from '../db/rebuild'
import { enqueueDueReviews } from './review.service'
import { readSettings } from './settings.service'

function seedDemoData(): boolean {
  if (count('SELECT COUNT(*) AS c FROM tasks') > 0) return false

  const today = todayKey()
  const settings = readSettings()

  const net = createProject({ name: '计算机网络', color: '#6366F1', kind: 'course', description: 'TCP/IP 协议栈、拥塞控制与抓包实验' })
  const dsa = createProject({ name: '数据结构与算法', color: '#22D3EE', kind: 'course', description: '树、图、排序与复杂度分析' })
  const thesis = createProject({ name: '毕业设计', color: '#A855F7', kind: 'project', description: '面向校园场景的智能问答系统' })
  const english = createProject({ name: '英语六级', color: '#F59E0B', kind: 'course', description: '听力精听与真题训练' })

  const t1 = createTask({
    projectId: net.id,
    title: '完成 TCP 拥塞控制章节习题',
    detail: '重点掌握慢启动、拥塞避免、快重传与快恢复的状态迁移过程。',
    status: 'doing',
    isPriority: true,
    progress: 45,
    dueAt: `${addDaysKey(today, 1)}T20:00:00`,
    estimateMinutes: 90,
    tags: ['TCP', '习题']
  })
  const t2 = createTask({
    projectId: dsa.id,
    title: '复习红黑树的插入与删除旋转',
    detail: '手推 5 组插入删除序列，整理旋转前后子树变化。',
    status: 'doing',
    isPriority: false,
    progress: 30,
    dueAt: `${today}T19:00:00`,
    estimateMinutes: 60,
    tags: ['树结构', '笔试']
  })
  const t3 = createTask({
    projectId: net.id,
    title: '整理 B+ 树索引的学习笔记',
    detail: '对比 B 树与 B+ 树的差异，补充磁盘 IO 次数推导。',
    status: 'todo',
    isPriority: true,
    progress: 0,
    dueAt: `${today}T22:00:00`,
    estimateMinutes: 45,
    tags: ['数据库', '笔记']
  })
  const t4 = createTask({
    projectId: thesis.id,
    title: '撰写开题报告第三章系统设计',
    detail: '包含总体架构图、模块划分与关键接口定义。',
    status: 'doing',
    isPriority: true,
    progress: 55,
    dueAt: `${addDaysKey(today, 3)}T18:00:00`,
    estimateMinutes: 180,
    tags: ['论文']
  })
  const t5 = createTask({
    projectId: english.id,
    title: '六级听力真题精听 2 套',
    detail: '逐句听写并标注连读、弱读现象。',
    status: 'todo',
    isPriority: false,
    progress: 0,
    dueAt: `${addDaysKey(today, 2)}T21:00:00`,
    estimateMinutes: 60,
    tags: ['听力']
  })
  createTask({
    projectId: dsa.id,
    title: '复习操作系统进程调度算法',
    detail: 'FCFS、SJF、时间片轮转与多级反馈队列的对比。',
    status: 'blocked',
    isPriority: false,
    progress: 20,
    dueAt: `${addDaysKey(today, -1)}T20:00:00`,
    estimateMinutes: 50,
    tags: ['操作系统']
  })
  createTask({
    projectId: net.id,
    title: '搭建 Wireshark 抓包分析实验环境',
    detail: '安装并配置捕获过滤器，验证三次握手与四次挥手。',
    status: 'todo',
    isPriority: false,
    progress: 0,
    estimateMinutes: 75,
    tags: ['实验']
  })
  createTask({
    projectId: thesis.id,
    title: '整理文献综述引用清单',
    detail: '补齐近三年参考文献并统一 GB/T 7714 格式。',
    status: 'todo',
    isPriority: false,
    progress: 10,
    dueAt: `${addDaysKey(today, -4)}T18:00:00`,
    estimateMinutes: 40,
    tags: ['文献']
  })

  const n1 = createNote({
    taskId: t1.id,
    title: 'TCP 拥塞控制四阶段',
    kind: 'note',
    content: [
      '## 慢启动',
      '',
      'cwnd 从 1 个 MSS 开始，每收到一个 ACK 翻倍增长，直到 ssthresh。',
      '',
      '## 拥塞避免',
      '',
      '每经过一个 RTT，cwnd 增加 1 个 MSS，线性增长。',
      '',
      '## 快重传 / 快恢复',
      '',
      '收到 3 个重复 ACK 立即重传，ssthresh 与 cwnd 减半，进入快恢复。'
    ].join('\n'),
    tags: ['TCP', '拥塞控制']
  })
  const n2 = createNote({
    taskId: t2.id,
    title: '红黑树五条性质',
    kind: 'note',
    content: [
      '1. 每个节点非红即黑',
      '2. 根节点是黑色',
      '3. 所有叶子节点（NIL）是黑色',
      '4. 红节点的子节点必须是黑色',
      '5. 任一节点到其所有叶子的路径上黑节点数量相同'
    ].join('\n'),
    tags: ['红黑树']
  })
  const n3 = createNote({
    taskId: t3.id,
    title: 'B+ 树与 B 树的核心差异',
    kind: 'note',
    content: [
      '- B+ 树只有叶子节点存储数据，非叶子节点只存索引键',
      '- 叶子节点通过链表串联，天然支持范围查询',
      '- 单次查询 IO 次数稳定为树高，适合磁盘存储'
    ].join('\n'),
    tags: ['数据库', '索引']
  })
  createNote({
    taskId: t4.id,
    title: '开题报告参考文献（GB/T 7714）',
    kind: 'material',
    content: '已收集 18 篇核心文献，待按学校模板统一格式后导出。',
    tags: ['论文', '参考文献']
  })

  const dueToday = `${today}T${String(settings.workStartHour).padStart(2, '0')}:00:00`
  createReview({ noteId: n1.id, taskId: t1.id, title: n1.title, dueAt: dueToday, stage: 0 })
  createReview({ noteId: n2.id, taskId: t2.id, title: n2.title, dueAt: dueToday, stage: 1, intervalDays: 2 })
  createReview({ noteId: n3.id, taskId: t3.id, title: n3.title, dueAt: `${today}T10:00:00`, stage: 0 })

  createEvent({
    taskId: t2.id,
    title: t2.title,
    type: 'task',
    startAt: `${today}T19:00:00`,
    endAt: `${today}T20:00:00`,
    reminderAt: addMinutes(`${today}T19:00:00`, -settings.notifyLeadMinutes),
    note: '数据结构与算法'
  })
  createEvent({
    taskId: t4.id,
    title: t4.title,
    type: 'task',
    startAt: `${addDaysKey(today, 1)}T14:00:00`,
    endAt: `${addDaysKey(today, 1)}T17:00:00`,
    reminderAt: addMinutes(`${addDaysKey(today, 1)}T14:00:00`, -settings.notifyLeadMinutes),
    note: '毕业设计'
  })
  createEvent({
    taskId: t5.id,
    title: t5.title,
    type: 'task',
    startAt: `${addDaysKey(today, 2)}T21:00:00`,
    endAt: `${addDaysKey(today, 2)}T22:00:00`,
    note: '英语六级'
  })

  enqueueDueReviews(today)

  const session1 = startFocus(t1.id, '梳理慢启动与拥塞避免的差别')
  stopFocus(session1.id)
  const session2 = startFocus(t4.id, '画系统总体架构图')
  stopFocus(session2.id)
  const session3 = startFocus(t2.id, '手推红黑树删除旋转')
  stopFocus(session3.id)

  logger.info('已写入示例数据，便于首次打开即可体验完整闭环')
  return true
}

/** 用户手动触发：仅在数据库为空时写入示例数据 */
export function seedDemo(): { created: boolean } {
  const created = seedDemoData()
  if (created) {
    resetIndexForRebuild()
    rebuildAllIndexes()
  }
  return { created }
}

export function bootstrap(): { seeded: boolean } {
  closeDanglingFocus()
  const seeded = seedDemoData()
  resetIndexForRebuild()
  rebuildAllIndexes()
  syncToolSearchIndex()
  logger.info(`启动引导完成，当前时间 ${nowIso()}`)
  return { seeded }
}
