import { basename } from 'node:path'
import { writeFileSync } from 'node:fs'
import { ensureDir, outputsDir, resolveUserPath, sanitizeFileName, uniquePath } from '../../utils/paths'
import type { ToolDefinition } from '../types'

interface ExtractResult {
  title: string
  text: string
  url: string
  images: number
}

export const extractTool: ToolDefinition = {
  manifest: {
    id: 'web-extract',
    name: '网页与截图提取',
    category: 'extract',
    description:
      '使用 Playwright 无头浏览器渲染页面，可提取正文为 Markdown 笔记，或对可视区/整页截图保存为 PNG，用于资料归档与快速摘录。',
    icon: 'ScanText',
    requires: ['playwright'],
    builtin: true,
    fields: [
      {
        name: 'url',
        label: '网页地址',
        type: 'text',
        required: true,
        placeholder: 'https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API'
      },
      {
        name: 'mode',
        label: '提取方式',
        type: 'select',
        defaultValue: 'article',
        options: [
          { label: '正文转 Markdown 笔记', value: 'article' },
          { label: '可视区截图（PNG）', value: 'screenshot' },
          { label: '整页长截图（PNG）', value: 'fullpage' }
        ]
      },
      {
        name: 'outputDir',
        label: '保存目录',
        type: 'path',
        pathKind: 'directory',
        placeholder: '留空则保存到工作站 outputs 目录'
      }
    ]
  },

  async run(payload, ctx) {
    const url = ctx.getString(payload, 'url').trim()
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: '请填写以 http:// 或 https:// 开头的网页地址' }
    }
    const mode = ctx.getString(payload, 'mode', 'article')
    const outDir = payload.outputDir ? ensureDir(resolveUserPath(ctx.getString(payload, 'outputDir'))) : outputsDir()

    let chromium: typeof import('playwright').chromium
    try {
      const playwright = (await import('playwright')) as typeof import('playwright')
      chromium = playwright.chromium
    } catch (error) {
      return {
        ok: false,
        error: `Playwright 未就绪，请执行 npm i playwright 与 npx playwright install chromium。\n${(error as Error).message}`
      }
    }

    let browser: import('playwright').Browser | null = null
    let result: ExtractResult
    let savedPath: string
    let host = url
    try {
      host = new URL(url).hostname
    } catch {
      host = 'page'
    }
    const base = sanitizeFileName(host, 'page')

    try {
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1200)

      if (mode === 'article') {
        result = (await page.evaluate(`(() => {
          const pick = document.querySelector('article')
            || document.querySelector('main')
            || document.querySelector('[role="main"]')
            || document.body
          const heading = document.querySelector('h1')
          const nodes = Array.from(pick.querySelectorAll('h1,h2,h3,h4,p,li,pre,blockquote'))
          const lines = []
          for (let i = 0; i < nodes.length; i += 1) {
            const el = nodes[i]
            const tag = el.tagName.toLowerCase()
            const text = (el.textContent || '').replace(/\\s+/g, ' ').trim()
            if (!text) continue
            if (tag === 'h1') lines.push('# ' + text)
            else if (tag === 'h2') lines.push('## ' + text)
            else if (tag === 'h3') lines.push('### ' + text)
            else if (tag === 'h4') lines.push('#### ' + text)
            else if (tag === 'li') lines.push('- ' + text)
            else if (tag === 'pre') lines.push('\`\`\`\\n' + text + '\\n\`\`\`')
            else if (tag === 'blockquote') lines.push('> ' + text)
            else lines.push(text)
          }
          return {
            title: ((heading && heading.textContent) || document.title || 'untitled').trim(),
            text: lines.join('\\n\\n'),
            url: location.href,
            images: document.images.length
          }
        })()`)) as ExtractResult

        const markdown = [
          `# ${result.title}`,
          '',
          `> 来源：${url}`,
          `> 提取时间：${new Date().toLocaleString()}`,
          '',
          result.text
        ].join('\n')
        savedPath = uniquePath(outDir, base, '.md')
        writeFileSync(savedPath, markdown, 'utf8')
      } else {
        savedPath = uniquePath(outDir, `${base}-${mode === 'fullpage' ? 'full' : 'view'}`, '.png')
        await page.screenshot({ path: savedPath, fullPage: mode === 'fullpage' })
        const title = await page.title()
        result = { title, text: `页面截图：${title}`, url, images: 0 }
      }

      return {
        ok: true,
        resultPath: savedPath,
        resultSummary: `${mode === 'article' ? '正文提取' : '页面截图'}：${result.title || basename(savedPath)}`,
        outputs: [
          { label: '提取方式', value: mode === 'article' ? '正文 Markdown' : mode === 'fullpage' ? '整页截图' : '可视区截图' },
          { label: '页面标题', value: result.title || '(无标题)' },
          { label: '页面图片数', value: String(result.images) },
          { label: '保存位置', value: savedPath }
        ],
        preview: result.text.slice(0, 800)
      }
    } catch (error) {
      return {
        ok: false,
        error: `页面提取失败：${(error as Error).message}\n可尝试在工具集市执行「重新检测」确认 Playwright Chromium 是否就绪。`
      }
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined)
      }
    }
  }
}
