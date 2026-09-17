/**
 * 笔记 / 文章导入的统一入口：按扩展名分派到各解析器，产出一份 Markdown 正文。
 * 纯 JS 解析（PDF / OOXML / EPUB / ODF / HTML / RTF / 文本）优先，
 * 老式二进制 Office 走 LibreOffice 或本机 Office，最后才回退到 Pandoc。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { join } from 'node:path'
import { ensureDir } from '../../utils/paths'
import { runCommand } from '../../utils/command'
import { resolveBinary } from '../../utils/binaries'
import { logger } from '../../utils/logger'
import { IMPORT_EXTENSIONS } from '@shared/constants'
import { decodeText, htmlToMarkdown, rtfToText, tidyMarkdown } from './text.util'
import { extractDocx, extractEpub, extractOdf, extractPptx, extractXlsx } from './ooxml'
import { extractPdf } from './pdf'
import { convertLegacyOffice, csvToMarkdown } from './legacy-office'

export { IMPORT_EXTENSIONS }

export interface ParsedDocument {
  filePath: string
  fileName: string
  /** 归一化后的格式名，如 PDF / DOCX / PPTX */
  format: string
  title: string
  content: string
  /** 解析引擎说明，用于导入结果提示 */
  engine: string
  pages: number | null
  chars: number
}

/** 单个文件的大小上限：超过则拒绝，避免把主进程卡死 */
const MAX_FILE_BYTES = 120 * 1024 * 1024

const PLAIN_EXTS = ['.md', '.markdown', '.txt', '.text', '.log', '.mdown', '.mkd']
const CODE_EXTS = ['.json', '.xml', '.yml', '.yaml', '.toml', '.ini', '.csv', '.tsv', '.sql', '.py', '.js', '.ts', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.sh', '.bat', '.ps1']
const HTML_EXTS = ['.html', '.htm', '.xhtml', '.shtml']
const LEGACY_EXTS = ['.doc', '.ppt', '.xls', '.pps', '.pot', '.wps', '.rtf']
const PANDOC_EXTS = ['.rst', '.org', '.tex', '.latex', '.opml', '.dbk', '.docbook', '.mediawiki', '.twiki', '.dokuwiki', '.creole', '.txt2tags', '.bib', '.ipynb']

export function isImportable(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return ext !== '' && IMPORT_EXTENSIONS.includes(ext)
}

function formatLabel(ext: string): string {
  return ext.replace(/^\./, '').toUpperCase()
}

function fallbackTitle(filePath: string): string {
  return basename(filePath, extname(filePath)).replace(/[_\-.]+/g, ' ').trim() || basename(filePath)
}

/** 用 Pandoc 把小众标记格式转成 GitHub Flavored Markdown */
async function convertWithPandoc(filePath: string): Promise<ParsedDocument | null> {
  const binary = await resolveBinary('pandoc')
  if (!binary) return null
  const outDir = ensureDir(join(process.env.TEMP ?? '.', 'mw-import'))
  const target = join(outDir, `${Date.now()}-${basename(filePath).replace(/[^\w.\-]/g, '_')}.md`)
  const result = await runCommand(binary.path, [filePath, '-f', 'auto', '-t', 'gfm', '--wrap=none', '-o', target], {
    timeoutMs: 120_000
  })
  if (!result.ok || !existsSync(target)) {
    logger.warn(`Pandoc 转换失败：${filePath} → ${(result.stderr || result.error || '').slice(0, 200)}`)
    return null
  }
  const content = tidyMarkdown(readFileSync(target, 'utf8'))
  return {
    filePath,
    fileName: basename(filePath),
    format: formatLabel(extname(filePath)),
    title: fallbackTitle(filePath),
    content,
    engine: 'Pandoc',
    pages: null,
    chars: content.replace(/\s/g, '').length
  }
}

/** 解析单个文件为 Markdown（抛错时由调用方记录为失败项） */
export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  if (!existsSync(filePath)) throw new Error('文件不存在或已被移动')
  const stat = statSync(filePath)
  if (stat.isDirectory()) throw new Error('不能导入文件夹，请进入文件夹选择具体文件')
  if (stat.size > MAX_FILE_BYTES) throw new Error(`文件过大（${(stat.size / 1024 / 1024).toFixed(0)} MB），上限 120 MB`)

  const ext = extname(filePath).toLowerCase()
  const fileName = basename(filePath)
  const base = { filePath, fileName, format: formatLabel(ext), title: fallbackTitle(filePath), pages: null as number | null }
  const read = (): Buffer => readFileSync(filePath)
  const finish = (content: string, engine: string, title = '', pages: number | null = null): ParsedDocument => {
    const cleaned = tidyMarkdown(content)
    if (cleaned.replace(/\s/g, '').length < 8) {
      throw new Error(`${engine} 没有读到文字内容${ext === '.pdf' ? '（可能是扫描版 PDF，图片文字需要 OCR）' : ''}`)
    }
    return {
      ...base,
      title: title.trim() !== '' ? title.trim() : base.title,
      content: cleaned,
      engine,
      pages,
      chars: cleaned.replace(/\s/g, '').length
    }
  }

  switch (ext) {
    case '.pdf': {
      const parsed = await extractPdf(read())
      return finish(parsed.content, '内置 PDF 解析', '', parsed.pages)
    }
    case '.docx': {
      const parsed = await extractDocx(read())
      return finish(parsed.content, '内置 Word 解析', parsed.title)
    }
    case '.pptx': {
      const parsed = await extractPptx(read())
      return finish(parsed.content, '内置 PPT 解析', parsed.title)
    }
    case '.xlsx':
    case '.xlsm': {
      const parsed = await extractXlsx(read())
      return finish(parsed.content, '内置 Excel 解析', parsed.title)
    }
    case '.epub': {
      const parsed = await extractEpub(read())
      return finish(parsed.content, '内置 EPUB 解析', parsed.title)
    }
    case '.odt':
    case '.ods':
    case '.odp': {
      const parsed = await extractOdf(read())
      return finish(parsed.content, '内置 OpenDocument 解析', parsed.title)
    }
    case '.md':
    case '.markdown':
    case '.mdown':
    case '.mkd':
    case '.txt':
    case '.text':
    case '.log': {
      return finish(decodeText(read()), '纯文本')
    }
    case '.csv':
    case '.tsv': {
      return finish(csvToMarkdown(decodeText(read())), '表格转换')
    }
    case '.html':
    case '.htm':
    case '.xhtml':
    case '.shtml': {
      const raw = decodeText(read())
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? ''
      return finish(htmlToMarkdown(raw), '网页解析', title.replace(/<[^>]+>/g, '').trim())
    }
    case '.json':
    case '.xml':
    case '.yml':
    case '.yaml':
    case '.toml':
    case '.ini':
    case '.sql':
    case '.py':
    case '.js':
    case '.ts':
    case '.java':
    case '.c':
    case '.cpp':
    case '.h':
    case '.go':
    case '.rs':
    case '.sh':
    case '.bat':
    case '.ps1': {
      const raw = decodeText(read())
      const language = ext.replace(/^\./, '')
      const body = ext === '.json' ? prettyJson(raw) : raw
      return finish(`\`\`\`${language}\n${body}\n\`\`\`\n`, '代码归档')
    }
    case '.doc':
    case '.ppt':
    case '.xls':
    case '.pps':
    case '.pot':
    case '.wps': {
      const converted = await convertLegacyOffice(filePath)
      if (!converted) {
        throw new Error(
          `${formatLabel(ext)} 是老式二进制格式，需要本机安装 Microsoft Office 或 LibreOffice 才能读取；也可以在原软件里另存为 ${
            ext === '.doc' ? '.docx' : ext === '.xls' ? '.xlsx' : '.pptx'
          } 后再导入`
        )
      }
      return finish(converted.content, converted.engine)
    }
    case '.rtf': {
      const text = rtfToText(decodeText(read()))
      if (text.replace(/\s/g, '').length < 8) {
        const converted = await convertLegacyOffice(filePath)
        if (!converted) throw new Error('RTF 解析失败，可先在 Word 里另存为 .docx 再导入')
        return finish(converted.content, converted.engine)
      }
      return finish(text, '内置 RTF 解析')
    }
    default: {
      if (PANDOC_EXTS.includes(ext)) {
        const converted = await convertWithPandoc(filePath)
        if (converted) return converted
        throw new Error(`${formatLabel(ext)} 需要本机安装 Pandoc 才能导入（可在「设置 → 外部工具依赖」查看）`)
      }
      const converted = await convertWithPandoc(filePath)
      if (converted) return converted
      // 未知扩展名：能按文本读出来就当纯文本
      const raw = decodeText(read())
      if (raw.replace(/\s/g, '').length < 8) throw new Error(`暂不支持 ${formatLabel(ext) || '该'} 格式`)
      return finish(raw, '按纯文本读取')
    }
  }
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}