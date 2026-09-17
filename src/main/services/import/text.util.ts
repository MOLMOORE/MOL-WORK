/**
 * 导入功能的公共文本工具：编码嗅探、HTML / RTF 转 Markdown、Markdown 清理与按标题拆分。
 * 只用 Node 内置能力，不依赖任何外部软件（Pandoc / Office 都不是必需项）。
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ensp: ' ', emsp: ' ', thinsp: ' ', shy: '',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  middot: '·', bull: '•', deg: '°', plusmn: '±', times: '×', divide: '÷',
  copy: '©', reg: '®', trade: '™', sect: '§', para: '¶', dagger: '†',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  frac12: '½', frac14: '¼', sup2: '²', sup3: '³', micro: 'µ', permil: '‰',
  prime: '′', Prime: '″', euro: '€', pound: '£', yen: '¥', cent: '¢', curren: '¤',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', pi: 'π', sigma: 'σ',
  omega: 'ω', lambda: 'λ', mu: 'μ', tau: 'τ', Delta: 'Δ', Omega: 'Ω',
  infin: '∞', ne: '≠', le: '≤', ge: '≥', equiv: '≡', pm: '±',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓', cross: '✗'
}

/** 解码 HTML 实体（命名字符串 + 十进制 / 十六进制数字引用） */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,10});/g, (whole, raw: string) => {
    if (raw[0] === '#') {
      const code = raw[1] === 'x' || raw[1] === 'X' ? parseInt(raw.slice(2), 16) : parseInt(raw.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    const named = NAMED_ENTITIES[raw.toLowerCase()] ?? NAMED_ENTITIES[raw]
    return named ?? whole
  })
}

/**
 * 按字节判断编码：BOM 优先，其次严格 UTF-8，再退到 GBK（国内常见 ANSI 文本），最后宽松 UTF-8。
 * Node 与 Electron 都带完整 ICU，因此 gbk / utf16be 可直接解码。
 */
export function decodeText(buffer: Buffer): string {
  if (buffer.length === 0) return ''
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return stripBom(decodeWith(buffer, 'utf16le'))
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return stripBom(decodeWith(buffer, 'utf16be'))
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return decodeWith(buffer, 'utf8')
  // 无 BOM 的 UTF-16：ASCII 文本会呈现「字符 + 0x00」交替，用 NUL 比例判定
  const nul = Math.min(4096, buffer.length)
  let zeros = 0
  for (let i = 0; i < nul; i += 2) if (buffer[i + 1] === 0x00) zeros += 1
  if (zeros > nul / 4) return decodeWith(buffer, 'utf16le')
  if (tryDecode(buffer, 'utf8')) return decodeWith(buffer, 'utf8')
  if (tryDecode(buffer, 'gbk')) return decodeWith(buffer, 'gbk')
  return decodeWith(buffer, 'utf8')
}

function decodeWith(buffer: Buffer, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

function tryDecode(buffer: Buffer, encoding: string): boolean {
  try {
    new TextDecoder(encoding, { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** 去掉 CRLF、零宽字符与页眉页脚常见的控制符 */
function normalizeChars(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u200b-\u200f\u2028\u2029\ufeff\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

interface TableDraft {
  rows: string[][]
  cell: string
  cells: string[]
  headerEmitted: boolean
}

/**
 * HTML → Markdown：覆盖标题、段落、换行、列表、引用、代码、粗斜体、链接、图片、表格。
 * 用状态机逐 token 走一遍，不依赖 DOM，因此主进程里无需任何浏览器环境。
 */
export function htmlToMarkdown(html: string): string {
  const source = normalizeChars(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!(?:DOCTYPE|doctype)[^>]*>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .replace(/<\/?(html|body|main|article|section|nav|aside|header|footer|figure|figcaption|tbody|thead|tfoot|colgroup|center|font|span|form|fieldset|label|input|button|svg|canvas|video|audio|iframe)[^>]*>/gi, ' ')

  const out: string[] = []
  const listStack: { ordered: boolean; index: number }[] = []
  const formatStack: string[] = []
  let table: TableDraft | null = null
  let inPre = false
  let linkHref = ''
  let skipUntil: string | null = null

  const push = (text: string): void => {
    if (table) table.cell += text
    else out.push(text)
  }
  /** 行内标记内侧的空格会让 Markdown 不渲染（** 文字 **），统一挪到标记外侧 */
  const emitText = (value: string): void => {
    if (value === '' || table || formatStack.length === 0) {
      push(value)
      return
    }
    const last = out[out.length - 1]
    const marker = last === '**' || last === '*' || last === '`' || last === '~~' || last === '==' || last === '[' ? last : null
    if (!marker) {
      push(value)
      return
    }
    const lead = value.length - value.trimStart().length
    if (lead === 0) {
      push(value)
      return
    }
    out[out.length - 1] = value.slice(0, lead)
    out.push(marker)
    push(value.slice(lead))
  }
  /** 只在需要时补一个换行，避免列表项之间出现空行 */
  const ensureNewline = (): void => {
    if (table) return
    const tail = out.join('')
    if (tail !== '' && !tail.endsWith('\n')) out.push('\n')
  }
  const blockBreak = (): void => {
    if (table) return
    const tail = out.join('')
    if (tail.length > 0 && !tail.endsWith('\n\n')) out.push(tail.endsWith('\n') ? '\n' : '\n\n')
  }

  const token = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*)\/?>|([^<]+)/g
  let match: RegExpExecArray | null
  while ((match = token.exec(source)) !== null) {
    const [whole, tag, attrs, text] = match
    if (whole.startsWith('<!--')) continue
    if (skipUntil) {
      if (tag && tag.toLowerCase() === skipUntil) skipUntil = null
      continue
    }
    if (text) {
      const decoded = decodeEntities(text)
      emitText(inPre ? decoded : decoded.replace(/[ \t]+/g, ' '))
      continue
    }
    if (!tag) continue
    const name = tag.toLowerCase()
    const closing = whole[1] === '/'
    const attrMap = parseAttrs(attrs ?? '')

    if (closing) {
      switch (name) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          blockBreak(); break
        case 'p': case 'div': case 'blockquote': case 'tr':
          blockBreak(); break
        case 'li':
          if (!table) out.push('\n')
          break
        case 'ul': case 'ol':
          listStack.pop(); blockBreak(); break
        case 'pre':
          push('\n```')
          inPre = false
          blockBreak()
          break
        case 'code':
          if (!inPre) {
            const codeMarker = formatStack.pop()
            if (codeMarker) trimCloseMarker(out, codeMarker)
          }
          break
        case 'strong': case 'b': case 'em': case 'i': case 'u': case 's': case 'del':
        case 'mark': case 'ins': {
          const marker = formatStack.pop()
          if (marker) trimCloseMarker(out, marker)
          break
        }
        case 'a': {
          if (linkHref) {
            trimCloseLink(out, linkHref)
            linkHref = ''
          }
          break
        }
        case 'table':
          if (table) {
            out.push(renderTable(table.rows))
            table = null
          }
          blockBreak(); break
        case 'td': case 'th':
          if (table) {
            table.cells.push(cleanCell(table.cell))
            table.cell = ''
          }
          break
        case 'br':
          push(table ? ' ' : '\n'); break
        case 'script': case 'style':
          skipUntil = null; break
        default:
          break
      }
      continue
    }

    switch (name) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        blockBreak()
        push('#'.repeat(Number(name[1])) + ' ')
        break
      }
      case 'p': case 'div': case 'section': case 'article': case 'blockquote': {
        blockBreak()
        if (name === 'blockquote') push('> ')
        break
      }
      case 'br':
        push(inPre ? '\n' : ' ')
        break
      case 'hr':
        blockBreak(); push('---'); blockBreak(); break
      case 'ul': case 'ol': {
        blockBreak()
        listStack.push({ ordered: name === 'ol', index: Number(attrMap.start ?? 1) || 1 })
        break
      }
      case 'li': {
        ensureNewline()
        const frame = listStack[listStack.length - 1]
        const indent = '  '.repeat(Math.max(0, listStack.length - 1))
        if (frame?.ordered) {
          push(`${indent}${frame.index}. `)
          frame.index += 1
        } else {
          push(`${indent}- `)
        }
        break
      }
      case 'pre':
        blockBreak(); inPre = true; push('```\n'); break
      case 'code':
        if (!inPre) {
          push('`')
          formatStack.push('`')
        }
        break
      case 'strong': case 'b':
        push('**'); formatStack.push('**'); break
      case 'em': case 'i':
        push('*'); formatStack.push('*'); break
      case 'u': case 'ins':
        push('<u>'); formatStack.push('</u>'); break
      case 's': case 'del': case 'strike':
        push('~~'); formatStack.push('~~'); break
      case 'mark':
        push('=='); formatStack.push('=='); break
      case 'a':
        linkHref = attrMap.href ?? ''
        push('[')
        formatStack.push('link')
        break
      case 'img': {
        const src = attrMap.src ?? ''
        const alt = cleanInline(attrMap.alt ?? '')
        if (/^(https?:)?\/\//i.test(src)) push(`![${alt}](${src})`)
        else if (alt) push(`[图：${alt}]`)
        break
      }
      case 'table':
        blockBreak()
        table = { rows: [], cell: '', cells: [], headerEmitted: false }
        break
      case 'tr':
        if (table) { table.cell = ''; table.cells = [] }
        break
      case 'td': case 'th':
        if (table) { table.cell = '' }
        break
      case 'caption':
        blockBreak(); break
      case 'dl': case 'dt': case 'dd':
        blockBreak(); break
      case 'script': case 'style':
        skipUntil = name; break
      default:
        break
    }
  }

  const markdown = out.join('')
  return tidyMarkdown(markdown)
}

function parseAttrs(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  const re = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) !== null) {
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    map[match[1].toLowerCase()] = decodeEntities(value)
  }
  return map
}

/** 收尾时把标记与前后的空白对调，避免出现「** 文字 **」这种不渲染的写法 */
function trimCloseMarker(parts: string[], marker: string): void {
  const tail = parts[parts.length - 1] ?? ''
  const trailing = tail.length - tail.replace(/\s+$/, '').length
  if (trailing > 0) {
    parts[parts.length - 1] = tail.slice(0, tail.length - trailing)
    parts.push(marker, ' '.repeat(trailing))
  } else {
    parts.push(marker)
  }
}

function trimCloseLink(parts: string[], href: string): void {
  const tail = parts[parts.length - 1] ?? ''
  const trailing = tail.length - tail.replace(/\s+$/, '').length
  const label = trailing > 0 ? tail.slice(0, tail.length - trailing) : tail
  if (trailing > 0) parts[parts.length - 1] = label
  parts.push(href ? `](${href})` : ']', trailing > 0 ? ' '.repeat(trailing) : '')
}

function cleanCell(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

function cleanInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function renderTable(rows: string[][]): string {
  const filled = rows.filter((row) => row.some((cell) => cell !== ''))
  if (filled.length === 0) return ''
  const width = Math.max(...filled.map((row) => row.length))
  const normalized = filled.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')])
  const lines = [`| ${normalized[0].join(' | ')} |`, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`]
  for (const row of normalized.slice(1)) lines.push(`| ${row.join(' | ')} |`)
  return '\n\n' + lines.join('\n') + '\n\n'
}

/** 统一空行、去掉行尾空白与重复空行，保证导出的 Markdown 干净可读 */
export function tidyMarkdown(markdown: string): string {
  const text = normalizeChars(markdown)
    .replace(/[ \t]+$/gm, '')
    .replace(/\[[ \t]+/g, '[')
    .replace(/[ \t]+\]\(/g, '](')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : line))
    .join('\n')
  return text.trim() + (text.trim() === '' ? '' : '\n')
}

/**
 * RTF → 纯文本：按 RTF 语法逐 token 走一遍（组、控制字、转义符、\'hh 字节串），
 * 跳过字体表 / 样式表 / 图片数据，段落转行、表格转分隔符，\u 与 ANSI 字节都能还原。
 * 只用于老式 .rtf 笔记，不追求 100% 还原样式。
 */
export function rtfToText(rtf: string): string {
  const destinations = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'pict', 'object', 'themedata',
    'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable',
    'rsidtbl', 'mmathPr', 'wgrffmtfilter', 'nonshppict', 'bkmkstart', 'bkmkend', 'atrawout'
  ])
  const chars: Record<string, string> = {
    emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
    bullet: '•', deg: '°', tab: '\t', par: '\n', line: '\n', sect: '\n\n', page: '\n\n',
    cell: ' | ', nestcell: ' | ', row: '\n', nestrow: '\n', tilde: ' ', ndash: '–', mdash: '—'
  }
  const out: string[] = []
  const stack: boolean[] = []
  let bytes: number[] = []
  let ucSkip = 1

  const skipped = (): boolean => stack.length > 0 && stack[stack.length - 1]
  const flushBytes = (): void => {
    if (bytes.length === 0) return
    if (!skipped()) out.push(decodeText(Buffer.from(bytes)))
    bytes = []
  }
  const emit = (text: string): void => {
    if (!skipped()) out.push(text)
  }

  let index = 0
  while (index < rtf.length) {
    const char = rtf[index]
    if (char === '{') {
      index += 1
      const name = /^\\?([a-zA-Z]+)(-?\d{1,10})?/.exec(rtf.slice(index, index + 32))
      const destination = name ? name[1].toLowerCase() : ''
      const parentSkipped = stack.length > 0 && stack[stack.length - 1]
      stack.push(parentSkipped || destinations.has(destination))
      if (name && destinations.has(destination)) index += name[0].length
      continue
    }
    if (char === '}') {
      flushBytes()
      stack.pop()
      index += 1
      continue
    }
    if (char !== '\\') {
      flushBytes()
      if (!skipped() && char !== '\n' && char !== '\r') out.push(char)
      index += 1
      continue
    }
    const next = rtf[index + 1]
    if (next === undefined) break
    if (next === "'") {
      const hex = rtf.slice(index + 2, index + 4)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        index += 4
      } else index += 2
      continue
    }
    if (next === '*') {
      stack[stack.length - 1] = true
      index += 2
      continue
    }
    if (next === '\\' || next === '{' || next === '}') {
      flushBytes()
      emit(next)
      index += 2
      continue
    }
    if (next === '\n' || next === '\r') {
      index += next === '\r' && rtf[index + 2] === '\n' ? 3 : 2
      continue
    }
    if (next === '-') {
      index += 2
      continue
    }
    const word = /^\\([a-zA-Z]+)(-?\d{1,10})?([ \r\n])?/.exec(rtf.slice(index, index + 24))
    if (!word) {
      index += 2
      continue
    }
    flushBytes()
    const name = word[1].toLowerCase()
    const value = word[2] === undefined ? null : Number(word[2])
    if (name === 'uc' && value !== null) ucSkip = Math.max(0, value)
    if (name === 'u' && value !== null) {
      emit(String.fromCodePoint(value < 0 ? value + 65536 : value))
      index += word[0].length
      // 跳过 \u 后面的占位字符（通常是 ?）
      let drop = word[3] === undefined ? ucSkip : ucSkip
      while (drop > 0 && index < rtf.length && rtf[index] !== '\\' && rtf[index] !== '{' && rtf[index] !== '}') {
        index += 1
        drop -= 1
      }
      continue
    }
    if (name === 'bin') {
      index += word[0].length
      const length = value ?? 0
      index += length * 2
      continue
    }
    if (Object.prototype.hasOwnProperty.call(chars, name)) emit(chars[name])
    index += word[0].length
    continue
  }
  flushBytes()
  return tidyMarkdown(out.join(''))
}

/** 单篇笔记的正文上限：超过则截断，避免编辑器与数据库被超大文档拖慢 */
export const MAX_NOTE_CHARS = 300_000

export function truncateForNote(text: string, max = MAX_NOTE_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  const cut = text.slice(0, max)
  return { text: `${cut}\n\n> ⚠️ 文档过长，正文已在此截断，完整内容请打开源文件查看。\n`, truncated: true }
}

/**
 * 按一级标题拆分：一篇长文档可以拆成多条笔记，便于分别复习。
 * 找不到两个及以上一级标题时返回空数组，表示不拆分。
 */
export function splitByHeadings(markdown: string, level = 1): { title: string; body: string }[] {
  const marker = `${'#'.repeat(level)} `
  const lines = markdown.split('\n')
  const marks: number[] = []
  let inFence = false
  lines.forEach((line, index) => {
    if (/^```/.test(line)) inFence = !inFence
    if (!inFence && line.startsWith(marker)) marks.push(index)
  })
  if (marks.length < 2) return []
  const chunks: { title: string; body: string }[] = []
  if (marks[0] > 0) {
    const preamble = lines.slice(0, marks[0]).join('\n').trim()
    if (preamble.length > 40) chunks.push({ title: '前言', body: preamble })
  }
  marks.forEach((start, i) => {
    const end = i + 1 < marks.length ? marks[i + 1] : lines.length
    const body = lines.slice(start, end).join('\n').trim()
    const title = lines[start].slice(marker.length).trim()
    if (body !== '') chunks.push({ title: title || `第 ${i + 1} 节`, body })
  })
  return chunks
}

/** 从正文里挑一个像标题的行；没有就用文件名 */
export function guessTitle(markdown: string, fallback: string): string {
  const first = markdown.split('\n').find((line) => line.trim() !== '')
  if (!first) return fallback
  const cleaned = first.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim()
  if (cleaned.length === 0 || cleaned.length > 80) return fallback
  return cleaned
}