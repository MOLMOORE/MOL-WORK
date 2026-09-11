import type { WorkstationApi } from '@shared/types/ipc'

/**
 * 渲染层访问主进程的唯一入口。
 * 浏览器环境（如纯前端调试）下退化为报错桩，避免直接崩溃。
 */
function missingApi(): never {
  throw new Error('主进程桥接不可用：请通过 Electron 启动应用')
}

export const api: WorkstationApi = typeof window !== 'undefined' && window.api
  ? window.api
  : (new Proxy({}, { get: () => missingApi }) as WorkstationApi)

export const hasBridge = typeof window !== 'undefined' && Boolean(window.api)
