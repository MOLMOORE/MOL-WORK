/**
 * 老式二进制 Office（.doc / .ppt / .xls / .wps）的兜底解析。
 * 这类格式没有可靠的纯 JS 读法，因此按顺序尝试：
 *   1. LibreOffice 无头转换（静默，若本机装了）
 *   2. PowerShell + Office COM 自动化（本机装了 Microsoft Office 时可用）
 * 都不可用时抛出带指引的错误，让用户另存为 .docx/.pptx/.xlsx 再导入。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { tempDir } from '../../utils/paths'
import { runCommand, whichCommand } from '../../utils/command'
import { logger } from '../../utils/logger'
import { decodeText, htmlToMarkdown, tidyMarkdown } from './text.util'

export interface LegacyConversion {
  content: string
  engine: string
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** PowerShell 脚本用 -EncodedCommand 传入，避免任何引号/换行转义问题 */
async function runPowerShell(
  script: string,
  timeoutMs = 180_000
): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeoutMs }
  )
}

async function findSoffice(): Promise<string | null> {
  const fromPath = await whichCommand('soffice')
  if (fromPath) return fromPath
  const candidates = [
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'LibreOffice', 'program', 'soffice.exe')
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null
}

/** LibreOffice 无头转换：目标格式为 html（保留结构）或 csv（表格） */
async function convertWithLibreOffice(filePath: string, to: 'html' | 'csv'): Promise<LegacyConversion | null> {
  const soffice = await findSoffice()
  if (!soffice) return null
  const outDir = join(tempDir(), `odf-${Date.now()}`)
  const result = await runCommand(soffice, ['--headless', '--norestore', `--convert-to=${to}`, `--outdir=${outDir}`, filePath], {
    timeoutMs: 120_000
  })
  if (!result.ok) return null
  const produced = safeRead(outDir).find((name) => name.toLowerCase() === `${basename(filePath, extname(filePath))}.${to}`)
  if (!produced) return null
  const target = join(outDir, produced)
  const raw = decodeText(readFileSync(target))
  const content = to === 'html' ? htmlToMarkdown(raw) : csvToMarkdown(raw)
  if (content.trim() === '') return null
  return { content, engine: 'LibreOffice' }
}

function safeRead(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** CSV/TSV → Markdown 表格（导入 .xls 与逗号分隔表格时用） */
export function csvToMarkdown(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) return ''
  const delimiter = (lines[0].match(/\t/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? '\t' : ','
  const rows = lines.map((line) => splitCsvLine(line, delimiter))
  const width = Math.max(...rows.map((row) => row.length))
  const padded = rows.slice(0, 400).map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')].map((cell) => cell.replace(/\|/g, '\\|')))
  const out = [`| ${padded[0].join(' | ')} |`, `| ${Array.from({ length: width }, () => '---').join(' | ')} |`]
  for (const row of padded.slice(1)) out.push(`| ${row.join(' | ')} |`)
  return tidyMarkdown(`${out.join('\n')}${rows.length > 400 ? `\n\n> 表格较大，仅显示前 400 行。` : ''}`)
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else if (char === '"') quoted = false
      else current += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === delimiter) {
      cells.push(current.trim())
      current = ''
    } else current += char
  }
  cells.push(current.trim())
  return cells
}

const WORD_SCRIPT = (src: string, dst: string): string => `
$ErrorActionPreference = 'Stop'
$src = ${psQuote(src)}
$dst = ${psQuote(dst)}
$app = New-Object -ComObject Word.Application
$app.Visible = $false
$app.DisplayAlerts = 0
try {
  $doc = $app.Documents.Open($src, $false, $true)
  try {
    $doc.SaveAs2($dst, 10)
  } catch {
    $doc.SaveAs($dst, 10)
  }
  $doc.Close($false)
} finally {
  $app.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
Write-Output 'ok'
`

const EXCEL_SCRIPT = (src: string, dst: string): string => `
$ErrorActionPreference = 'Stop'
$src = ${psQuote(src)}
$dst = ${psQuote(dst)}
$app = New-Object -ComObject Excel.Application
$app.Visible = $false
$app.DisplayAlerts = $false
$sb = New-Object System.Text.StringBuilder
try {
  $wb = $app.Workbooks.Open($src, 0, $true)
  foreach ($ws in $wb.Worksheets) {
    $used = $ws.UsedRange
    if ($null -eq $used) { continue }
    $rows = [Math]::Min([int]$used.Rows.Count, 400)
    $cols = [Math]::Min([int]$used.Columns.Count, 40)
    [void]$sb.AppendLine('## ' + $ws.Name)
    $values = $used.Value2
    for ($r = 1; $r -le $rows; $r++) {
      $cells = @()
      for ($c = 1; $c -le $cols; $c++) {
        $v = $null
        try { $v = $values.Item($r, $c) } catch { try { $v = $used.Cells.Item($r, $c).Text } catch { $v = '' } }
        $text = if ($null -eq $v) { '' } else { [string]$v }
        $cells += ($text -replace '[\\r\\n]+', ' ' -replace '\\|', '\\|')
      }
      if (-not ($cells -join '')) { continue }
      if ($r -eq 1) {
        [void]$sb.AppendLine('| ' + ($cells -join ' | ') + ' |')
        [void]$sb.AppendLine('| ' + (($cells | ForEach-Object { '---' }) -join ' | ') + ' |')
      } else {
        [void]$sb.AppendLine('| ' + ($cells -join ' | ') + ' |')
      }
    }
    [void]$sb.AppendLine('')
  }
  $wb.Close($false)
} finally {
  $app.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
[IO.File]::WriteAllText($dst, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'ok'
`

const POWERPOINT_SCRIPT = (src: string, dst: string): string => `
$ErrorActionPreference = 'Stop'
$src = ${psQuote(src)}
$dst = ${psQuote(dst)}
$app = New-Object -ComObject PowerPoint.Application
$sb = New-Object System.Text.StringBuilder
try {
  $pres = $app.Presentations.Open($src, $true, $false, $false)
  $index = 0
  foreach ($slide in $pres.Slides) {
    $index++
    [void]$sb.AppendLine('## 第 ' + $index + ' 页')
    foreach ($shape in $slide.Shapes) {
      try {
        if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
          [void]$sb.AppendLine([string]$shape.TextFrame.TextRange.Text)
          [void]$sb.AppendLine('')
        }
      } catch {}
      try {
        if ($shape.HasTable -eq -1) {
          $table = $shape.Table
          for ($r = 1; $r -le $table.Rows.Count; $r++) {
            $cells = @()
            for ($c = 1; $c -le $table.Columns.Count; $c++) {
              $t = ''
              try { $t = [string]$table.Cell($r, $c).Shape.TextFrame.TextRange.Text } catch {}
              $cells += ($t -replace '[\\r\\n]+', ' ' -replace '\\|', '\\|')
            }
            if ($r -eq 1) {
              [void]$sb.AppendLine('| ' + ($cells -join ' | ') + ' |')
              [void]$sb.AppendLine('| ' + (($cells | ForEach-Object { '---' }) -join ' | ') + ' |')
            } else {
              [void]$sb.AppendLine('| ' + ($cells -join ' | ') + ' |')
            }
          }
          [void]$sb.AppendLine('')
        }
      } catch {}
    }
    try {
      if ($slide.HasNotesPage -eq -1) {
        $notes = [string]$slide.NotesPage.Shapes.Item(2).TextFrame.TextRange.Text
        if ($notes.Trim()) {
          [void]$sb.AppendLine('**演讲者备注**：' + ($notes -replace '[\\r\\n]+', ' '))
          [void]$sb.AppendLine('')
        }
      }
    } catch {}
  }
  $pres.Close()
} finally {
  try { $app.Quit() } catch {}
}
[IO.File]::WriteAllText($dst, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'ok'
`

/** 用本机 Office 通过 COM 读取老格式 */
async function convertWithOffice(filePath: string): Promise<LegacyConversion | null> {
  const ext = extname(filePath).toLowerCase()
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const htmlPath = join(tempDir(), `office-${stamp}.htm`)
  const mdPath = join(tempDir(), `office-${stamp}.md`)
  let script: string | null = null
  let produced = mdPath
  let producedIsHtml = false
  if (ext === '.doc' || ext === '.rtf' || ext === '.wps') {
    script = WORD_SCRIPT(filePath, htmlPath)
    produced = htmlPath
    producedIsHtml = true
  } else if (ext === '.ppt' || ext === '.pps' || ext === '.pot') {
    script = POWERPOINT_SCRIPT(filePath, mdPath)
  } else if (ext === '.xls') {
    script = EXCEL_SCRIPT(filePath, mdPath)
  }
  if (!script) return null
  const result = await runPowerShell(script)
  if (!result.ok || !existsSync(produced)) {
    logger.warn(`Office COM 转换失败：${filePath} → ${(result.stderr || result.error || '').slice(0, 200)}`)
    return null
  }
  const raw = decodeText(readFileSync(produced))
  const content = producedIsHtml ? htmlToMarkdown(raw) : tidyMarkdown(raw)
  return content.trim() === '' ? null : { content, engine: 'Microsoft Office' }
}
/**
 * 转换老式二进制 Office 文档。
 * @returns 解析出的 Markdown；两条路都走不通时返回 null（由调用方给出提示）
 */
export async function convertLegacyOffice(filePath: string): Promise<LegacyConversion | null> {
  const to = extname(filePath).toLowerCase() === '.xls' ? 'csv' : 'html'
  try {
    const office = await convertWithLibreOffice(filePath, to)
    if (office) return office
  } catch (error) {
    logger.warn('LibreOffice 转换失败，改用 Office COM', error)
  }
  if (process.platform === 'win32') {
    try {
      const converted = await convertWithOffice(filePath)
      if (converted) return converted
    } catch (error) {
      logger.warn('Office COM 转换失败', error)
    }
  }
  return null
}

/** 本机是否具备读取老格式的引擎（用于设置页提示） */
export async function legacyOfficeEngine(): Promise<string | null> {
  if (await findSoffice()) return 'LibreOffice'
  if (process.platform !== 'win32') return null
  const probe = await runPowerShell(
    `try { $null = New-Object -ComObject Word.Application; Write-Output 'word' } catch { Write-Output 'none' }`,
    30_000
  )
  return probe.stdout.includes('word') ? 'Microsoft Office' : null
}