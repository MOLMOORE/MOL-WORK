import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const outDir = await mkdtemp(join(process.cwd(), '.dependency-check-'))
const helperOut = join(outDir, 'helpers.mjs')
const ioOut = join(outDir, 'io.mjs')

try {
  await build({
    entryPoints: ['src/main/services/dependency-download.helpers.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { '@shared': join(process.cwd(), 'src', 'shared') },
    outfile: helperOut
  })
  await build({
    entryPoints: ['src/main/services/dependency-download.io.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: ioOut
  })

  const helpers = await import(pathToFileURL(helperOut).href)
  assert.equal(
    helpers.pickArchiveMember(
      [
        'ffmpeg-8.0-essentials_build/bin/ffprobe.exe',
        'ffmpeg-8.0-essentials_build/bin/ffmpeg.exe'
      ],
      'ffmpeg.exe'
    ),
    'ffmpeg-8.0-essentials_build/bin/ffmpeg.exe'
  )
  assert.equal(helpers.pickArchiveMember(['pandoc-3.14/bin/pandoc.exe'], 'pandoc.exe'), 'pandoc-3.14/bin/pandoc.exe')
  assert.equal(helpers.pickArchiveMember(['pandoc-3.14/bin/pandoc.exe'], 'missing.exe'), null)
  assert.deepEqual(helpers.recommendedDependencyIds(), ['ffmpeg', 'yt-dlp', 'pandoc', 'playwright'])
  assert.equal(helpers.pickLatestStableVersion('<a href="25.8.7/">old</a><a href="26.8.3/">new</a>'), '26.8.3')
  assert.equal(
    helpers.pickPandocWindowsZip([
      { name: 'pandoc-3.14-linux-amd64.tar.gz' },
      { name: 'pandoc-3.14-windows-x86_64.zip' }
    ]).name,
    'pandoc-3.14-windows-x86_64.zip'
  )
  assert.equal(
    helpers.pickLibreOfficeInstaller(
      '<a href="LibreOffice_26.8.3_Win_x86-64_helppack_zh-CN.msi">help</a><a href="LibreOffice_26.8.3_Win_x86-64.msi">main</a>'
    ),
    'LibreOffice_26.8.3_Win_x86-64.msi'
  )
  assert.equal(
    helpers.parseChecksum(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  yt-dlp.exe',
      'yt-dlp.exe'
    ),
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  )

  const io = await import(pathToFileURL(ioOut).href)
  const server = createServer((request, response) => {
    if (request.url === '/slow') {
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': '4096'
      })
      response.write(Buffer.alloc(128, 1))
      setTimeout(() => response.end(Buffer.alloc(3968, 2)), 5000)
      return
    }
    const payload = Buffer.from('dependency-download-fixture')
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(payload.length)
    })
    response.end(payload)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const target = join(outDir, 'fixture.bin')
  const progress = []
  const result = await io.downloadHttpToFile({
    url: `http://127.0.0.1:${address.port}/fixture.bin`,
    target,
    onProgress: (value) => progress.push(value)
  })
  assert.equal(await readFile(target, 'utf8'), 'dependency-download-fixture')
  assert.equal(result.total, Buffer.byteLength('dependency-download-fixture'))
  assert.ok(progress.length > 0)
  assert.equal(progress.at(-1).percent, 100)

  const cancelledTarget = join(outDir, 'cancelled.bin')
  const controller = new AbortController()
  const pending = io.downloadHttpToFile({
    url: `http://127.0.0.1:${address.port}/slow`,
    target: cancelledTarget,
    signal: controller.signal
  })
  setTimeout(() => controller.abort(), 50)
  await assert.rejects(pending)
  await assert.rejects(access(cancelledTarget))
  await assert.rejects(access(`${cancelledTarget}.part`))
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))

  console.log('依赖下载辅助测试：通过')
} finally {
  await rm(outDir, { recursive: true, force: true })
}
