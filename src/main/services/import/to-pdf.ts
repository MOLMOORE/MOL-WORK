/**
 * 把文档转成 PDF「书页」渲染件：这是让 PDF / Word / PPT / Excel / OpenDocument
 * 等资料能按原版式完整显示（含图片、图表、排版）的关键一步。
 * 顺序：LibreOffice 无头转换 → 本机 Microsoft Office（Word / PowerPoint / Excel COM）。
 * 两者都没有时返回 null，调用方退回「抽取正文」的文本模式。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { tempDir } from '../../utils/paths'
import { runCommand, whichCommand } from '../../utils/command'
import { logger } from '../../utils/logger'

export interface PdfRendition {
  buffer: Buffer
  engine: string
}

/** 产物自检：开头必须是 %PDF，否则视为转换失败 */
function asPdf(buffer: Buffer | null): Buffer | null {
  if (!buffer || buffer.length < 1024) return null
  return buffer.subarray(0, 4).toString('latin1') === '%PDF' ? buffer : null
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** PowerShell 脚本走 -EncodedCommand（UTF-16LE base64），避免任何引号与换行转义问题 */
async function runPowerShell(script: string, timeoutMs = 180_000): Promise<{ ok: boolean; stdout: string; error?: string }> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const result = await runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeoutMs }
  )
  return { ok: result.ok, stdout: result.stdout ?? '', error: result.error ?? result.stderr }
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

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** 1. LibreOffice：一种命令行覆盖所有格式（含 ODF 与 RTF） */
async function pdfFromLibreOffice(filePath: string): Promise<PdfRendition | null> {
  const soffice = await findSoffice()
  if (!soffice) return null
  const outDir = join(tempDir(), `pdf-${Date.now()}`)
  mkdirSync(outDir, { recursive: true })
  const result = await runCommand(
    soffice,
    ['--headless', '--norestore', '--convert-to=pdf', `--outdir=${outDir}`, filePath],
    { timeoutMs: 180_000 }
  )
  if (!result.ok) {
    logger.warn(`LibreOffice 转 PDF 失败：${result.error ?? result.stderr ?? ''}`.slice(0, 200))
    return null
  }
  const wanted = `${basename(filePath, extname(filePath))}.pdf`
  const produced = safeList(outDir).find((name) => name.toLowerCase() === wanted.toLowerCase())
  if (!produced) return null
  const target = join(outDir, produced)
  try {
    const buffer = asPdf(readFileSync(target))
    return buffer ? { buffer, engine: 'LibreOffice' } : null
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

/** Word：SaveAs2 格式 17 = wdFormatPDF（.doc/.docx/.rtf/.wps/.odt 都归它） */
const WORD_PDF = (src: string, dst: string): string => `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject Word.Application
$app.Visible = $false
$app.DisplayAlerts = 0
try {
  $doc = $app.Documents.Open(${psQuote(src)}, $false, $true)
  try { $doc.SaveAs2(${psQuote(dst)}, 17) } catch { $doc.SaveAs(${psQuote(dst)}, 17) }
  $doc.Close($false)
} finally {
  $app.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
Write-Output 'ok'
`

/** PowerPoint：SaveAs 格式 32512 = ppSaveAsPDF（.ppt/.pptx/.odp 都归它） */
const POWERPOINT_PDF = (src: string, dst: string): string => `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open(${psQuote(src)}, $true, $false, $false)
  $done = $false
  # ppSaveAsPDF 在不同 Office 版本里是 32512 或 32，两个都试
  foreach ($fmt in 32512, 32) {
    try {
      $pres.SaveAs(${psQuote(dst)}, $fmt)
      if (Test-Path ${psQuote(dst)}) { $done = $true; break }
    } catch { }
  }
  $pres.Close()
  if (-not $done) { throw 'SaveAs PDF failed' }
} finally {
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
Write-Output 'ok'
`

/** Excel：ExportAsFixedFormat 0 = xlTypePDF，逐工作表连续排布 */
const EXCEL_PDF = (src: string, dst: string): string => `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject Excel.Application
$app.Visible = $false
$app.DisplayAlerts = $false
try {
  $wb = $app.Workbooks.Open(${psQuote(src)})
  foreach ($ws in $wb.Worksheets) {
    $ws.PageSetup.Orientation = 2
    $ws.PageSetup.FitToPagesWide = 1
    $ws.PageSetup.FitToPagesTall = $false
  }
  $wb.ExportAsFixedFormat(0, ${psQuote(dst)})
  $wb.Close($false)
} finally {
  $app.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
Write-Output 'ok'
`

const WORD_EXTS = ['.doc', '.docx', '.rtf', '.wps', '.odt', '.htm', '.html', '.xml']
const SLIDE_EXTS = ['.ppt', '.pptx', '.pps', '.ppsx', '.pot', '.potx', '.odp', '.key']
const SHEET_EXTS = ['.xls', '.xlsx', '.xlsm', '.ods']

function comScript(ext: string): { app: string; script: (src: string, dst: string) => string } | null {
  if (WORD_EXTS.includes(ext)) return { app: 'Word', script: WORD_PDF }
  if (SLIDE_EXTS.includes(ext)) return { app: 'PowerPoint', script: POWERPOINT_PDF }
  if (SHEET_EXTS.includes(ext)) return { app: 'Excel', script: EXCEL_PDF }
  return null
}

/** 2. 本机 Microsoft Office COM */
async function pdfFromOffice(filePath: string): Promise<PdfRendition | null> {
  const ext = extname(filePath).toLowerCase()
  const handler = comScript(ext)
  if (!handler) return null
  const outDir = join(tempDir(), `pdf-${Date.now()}`)
  mkdirSync(outDir, { recursive: true })
  const target = join(outDir, `${basename(filePath, ext)}.pdf`)
  try {
    const script = handler.script(filePath, target)
    const result = await runPowerShell(script)
    if (!result.ok || !existsSync(target)) {
      const detail = (result.error ?? result.stdout ?? '').replace(/\\s+/g, ' ').slice(0, 260)
      logger.warn(`${handler.app} 导出 PDF 失败：${detail}`)
      return null
    }
    const buffer = asPdf(readFileSync(target))
    if (!buffer) {
      logger.warn(`${handler.app} 产出的不是合法 PDF：${target}`)
      return null
    }
    return { buffer, engine: `Microsoft ${handler.app}` }
  } catch (error) {
    logger.warn(`${handler.app} 导出 PDF 异常`, error)
    return null
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

/** 统一入口：先试 LibreOffice，再试本机 Office */
export async function convertToPdf(filePath: string): Promise<PdfRendition | null> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') return { buffer: readFileSync(filePath), engine: '原生 PDF' }
  const fromOffice = comScript(ext)
  if (!fromOffice) return null
  const libre = await pdfFromLibreOffice(filePath)
  if (libre) return libre
  return pdfFromOffice(filePath)
}