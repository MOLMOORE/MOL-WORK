import type { WorkstationApi } from '@shared/types/ipc'

declare global {
  interface Window {
    api: WorkstationApi
    __workstationEvents: {
      reviewAutoScheduled: (callback: (payload: { date: string; count: number }) => void) => () => void
    }
  }
}

export {}
