import { createFlashcard } from '../../services/note.service'
import { parseTags } from '../../db/mappers'
import type { ToolDefinition } from '../types'

export const flashcardTool: ToolDefinition = {
  manifest: {
    id: 'flashcard-maker',
    name: '学习卡片制作',
    category: 'flashcard',
    description:
      '把知识点快速做成「问题 / 答案」卡片并挂到指定任务下，创建后立即纳入遗忘曲线复习计划，卡片正文可在笔记页继续编辑。',
    icon: 'Layers',
    requires: [],
    builtin: true,
    fields: [
      {
        name: 'taskId',
        label: '归属任务',
        type: 'select',
        required: true,
        optionsSource: 'tasks',
        hint: '卡片会挂在所选任务下，并沿用该任务的项目归属'
      },
      {
        name: 'question',
        label: '问题',
        type: 'textarea',
        required: true,
        placeholder: 'TCP 三次握手的第三个 ACK 为什么可以携带数据？'
      },
      {
        name: 'answer',
        label: '答案',
        type: 'textarea',
        required: true,
        placeholder: '此时客户端已进入 ESTABLISHED，连接已建立，因此可以携带数据。'
      },
      {
        name: 'tags',
        label: '标签',
        type: 'text',
        placeholder: '多个标签用英文逗号分隔，例如：计算机网络,TCP'
      }
    ]
  },

  async run(payload, ctx) {
    const rawTaskId = ctx.getString(payload, 'taskId')
    const taskId = Number(rawTaskId)
    const question = ctx.getString(payload, 'question').trim()
    const answer = ctx.getString(payload, 'answer').trim()
    const tags = parseTags(ctx.getString(payload, 'tags'))

    if (!Number.isFinite(taskId) || taskId <= 0) {
      return { ok: false, error: '请选择卡片归属的任务（若列表为空，请先创建任务）' }
    }
    if (question === '' || answer === '') {
      return { ok: false, error: '问题与答案均为必填项' }
    }

    const note = createFlashcard({ taskId, question, answer, tags })
    return {
      ok: true,
      resultSummary: `已创建卡片「${note.title}」，已加入遗忘曲线复习计划`,
      resultPath: null,
      outputs: [
        { label: '卡片标题', value: note.title },
        { label: '归属任务', value: note.taskTitle ?? `#${taskId}` },
        { label: '首次复习', value: note.review ? note.review.dueAt.replace('T', ' ').slice(0, 16) : '待生成' },
        { label: '标签', value: note.tags.length > 0 ? note.tags.join('、') : '无' }
      ],
      preview: `Q: ${question}\n\nA: ${answer}`
    }
  }
}
