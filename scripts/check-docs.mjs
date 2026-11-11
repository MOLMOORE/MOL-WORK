import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const FIX = process.argv.includes('--fix')
const SKIP_DIRS = new Set(['.git', '.deepseek-harness', 'node_modules', 'out', 'release', 'work'])
const decoder = new TextDecoder('utf-8', { fatal: true })
const errors = []
const warnings = []

const LIMITS = [
  { test: (file) => file === 'AGENTS.md', lines: 180, bytes: 18_000 },
  { test: (file) => file === 'README.md', lines: 260, bytes: 24_000 },
  { test: (file) => file === 'CHANGELOG.md', lines: 420, bytes: 48_000 },
  { test: (file) => file === 'docs/feature-index.md', lines: 130, bytes: 20_000 },
  {
    test: (file) => file.startsWith('docs/modifications/by-feature/'),
    lines: 180,
    bytes: 26_000
  },
  {
    test: (file) => file.startsWith('docs/modifications/by-version/'),
    lines: 120,
    bytes: 14_000
  },
  { test: () => true, lines: 220, bytes: 24_000 }
]

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(full)
  }
  return files
}

function addError(file, message) {
  errors.push(`${file}: ${message}`)
}

function addWarning(file, message) {
  warnings.push(`${file}: ${message}`)
}

function checkLinks(file, text) {
  const base = dirname(file)
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '')
    if (/^(https?:|mailto:|codex:|#)/i.test(target)) continue
    target = decodeURIComponent(target.split('#')[0])
    if (!target) continue
    try {
      readFileSync(resolve(base, target))
    } catch {
      addError(relative(ROOT, file), `本地链接不存在：${target}`)
    }
  }
}

function checkFeatureOrder(file, text, rel) {
  if (!rel.startsWith('docs/modifications/by-feature/')) return
  const sections = [...text.matchAll(/^## (\d{4}-\d{2}-\d{2}) · v(\d+\.\d+\.\d+) 第 (\d+) 轮/gm)].map(
    (match) => ({
      date: match[1],
      version: match[2],
      round: Number(match[3])
    })
  )
  for (let index = 1; index < sections.length; index += 1) {
    const newer = sections[index - 1]
    const older = sections[index]
    if (newer.date < older.date) {
      addError(rel, `功能记录必须最新优先：${newer.date} 出现在 ${older.date} 之前`)
    } else if (newer.date === older.date && newer.version === older.version && newer.round < older.round) {
      addError(rel, `同一日期的轮次必须从新到旧：第 ${newer.round} 轮出现在第 ${older.round} 轮之前`)
    }
  }
}

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/')
  const bytes = readFileSync(file)
  let text
  try {
    text = decoder.decode(bytes)
  } catch {
    addError(rel, '不是严格 UTF-8')
    continue
  }

  if (FIX) {
    const normalized = `${text.replace(/^\uFEFF/, '').replace(/\r?\n/g, '\r\n').replace(/(?:\r\n)+$/, '')}\r\n`
    if (normalized !== text) {
      writeFileSync(file, normalized, 'utf8')
      text = normalized
    }
  }

  if (!FIX && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    addError(rel, '包含 UTF-8 BOM')
  }

  const bareLf = (text.match(/(?<!\r)\n/g) ?? []).length
  if (bareLf > 0) addError(rel, `存在 ${bareLf} 个 LF 换行，项目 Markdown 必须使用 CRLF`)
  if (!text.endsWith('\r\n')) addWarning(rel, '文件末尾缺少 CRLF')

  const lines = text.split(/\r\n|\n/).length
  const limit = LIMITS.find((rule) => rule.test(rel))
  if (bytes.length > limit.bytes) {
    addError(rel, `体积 ${bytes.length} B 超过上限 ${limit.bytes} B`)
  } else if (bytes.length > limit.bytes * 0.8) {
    addWarning(rel, `体积 ${bytes.length} B 已超过上限的 80%`)
  }
  if (lines > limit.lines) {
    addError(rel, `行数 ${lines} 超过上限 ${limit.lines}`)
  }

  if (/\\n\s*\|/.test(text)) {
    addError(rel, '检测到字面量 \\n|，疑似把换行误写进表格')
  }

  checkLinks(file, text)
  checkFeatureOrder(file, text, rel)
}

for (const warning of warnings) console.warn(`WARN ${warning}`)
for (const error of errors) console.error(`FAIL ${error}`)

if (errors.length > 0) {
  console.error(`\n文档检查失败：${errors.length} 个错误，${warnings.length} 个警告`)
  process.exit(1)
}

console.log(`文档检查通过：${warnings.length} 个警告${FIX ? '（已先修复换行与 BOM）' : ''}`)
