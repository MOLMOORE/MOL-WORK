import type { WorkstationApi } from '@shared/types/ipc'

declare global {
  interface Window {
    api: WorkstationApi
    nativeFiles?: {
      /** 取拖拽进来的文件在本机的绝对路径，取不到时返回空串 */
      pathForFile: (file: File) => string
    }
    __workstationEvents: {
      reviewAutoScheduled: (callback: (payload: { date: string; count: number }) => void) => () => void
    }
  }
}

export {}
