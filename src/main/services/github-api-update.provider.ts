import { load } from 'js-yaml'
import { Provider, type AppUpdater, type UpdateInfo, type UpdateFileInfo } from 'electron-updater'
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider'

const USER_AGENT = 'MOL-WORK-Updater'
const API_VERSION = '2022-11-28'

interface GitHubAsset {
  name: string
  url: string
  size: number
}

interface GitHubRelease {
  tag_name: string
  name: string | null
  published_at: string
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

interface GitHubApiUpdateInfo extends UpdateInfo {
  assets: GitHubAsset[]
}

interface GitHubApiProviderOptions {
  owner: string
  repo: string
}

function apiHeaders(accept: string): Record<string, string> {
  return {
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': USER_AGENT
  }
}

function fileList(info: UpdateInfo): UpdateFileInfo[] {
  if (info.files?.length) return info.files
  if (info.path && info.sha512) {
    return [{ url: info.path, sha512: info.sha512 }]
  }
  throw new Error('latest.yml 没有提供任何更新文件')
}

/**
 * electron-updater 默认的 GitHub provider 会访问 github.com/releases.atom。
 * 在部分网络环境中该域名会被重置，而 api.github.com 仍可访问，因此改走 REST API。
 */
export class GitHubApiUpdateProvider extends Provider<GitHubApiUpdateInfo> {
  private readonly owner: string
  private readonly repo: string

  constructor(options: GitHubApiProviderOptions, _updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super(runtimeOptions)
    this.owner = options.owner
    this.repo = options.repo
  }

  async getLatestVersion(): Promise<GitHubApiUpdateInfo> {
    const releaseUrl = new URL(`https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`)
    const rawRelease = await this.httpRequest(releaseUrl, apiHeaders('application/vnd.github+json'))
    if (!rawRelease) throw new Error('GitHub Releases API 没有返回数据')

    const release = JSON.parse(rawRelease) as GitHubRelease
    if (!release || release.draft || release.prerelease || !release.tag_name) {
      throw new Error('GitHub 上没有可用的正式 Release')
    }

    const latestYml = release.assets.find((asset) => asset.name === 'latest.yml')
    if (!latestYml) {
      throw new Error(`Release ${release.tag_name} 缺少 latest.yml，暂时无法自动更新`)
    }

    const rawUpdateInfo = await this.httpRequest(
      new URL(latestYml.url),
      apiHeaders('application/octet-stream')
    )
    if (!rawUpdateInfo) throw new Error(`无法读取 Release ${release.tag_name} 的 latest.yml`)

    const info = load(rawUpdateInfo) as UpdateInfo
    return {
      ...info,
      releaseName: info.releaseName ?? release.name ?? release.tag_name,
      releaseDate: info.releaseDate || release.published_at,
      assets: release.assets
    }
  }

  resolveFiles(updateInfo: GitHubApiUpdateInfo) {
    return fileList(updateInfo).map((file) => {
      const name = decodeURIComponent(file.url.split('/').pop() ?? file.url).replaceAll(' ', '-')
      const asset = updateInfo.assets.find((candidate) => candidate.name === name)
      if (!asset) {
        throw new Error(`Release 中缺少更新资产：${name}`)
      }
      return { url: new URL(asset.url), info: file }
    })
  }

  get fileExtraDownloadHeaders(): Record<string, string> {
    return apiHeaders('application/octet-stream')
  }
}
