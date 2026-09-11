import type { ToolField, ToolManifest, ToolRunOutput } from '@shared/types/domain'

export interface ToolFieldOptions {
  label: string
  value: string
}

export interface ToolDefinition {
  /** 清单（不含运行时字段 enabled / installed / dependencyStatus） */
  manifest: Omit<ToolManifest, 'enabled' | 'installed' | 'dependencyStatus'>
  run: (payload: Record<string, unknown>, ctx: ToolContext) => Promise<ToolExecutionResult>
}

export interface ToolContext {
  /** 默认输出目录（用户可在表单中覆盖） */
  outputRoot: string
  /** 只读读取其它工具字段的辅助函数 */
  getString: (payload: Record<string, unknown>, key: string, fallback?: string) => string
  getNumber: (payload: Record<string, unknown>, key: string, fallback?: number) => number
  getBoolean: (payload: Record<string, unknown>, key: string, fallback?: boolean) => boolean
}

export interface ToolExecutionResult {
  ok: boolean
  outputs?: ToolRunOutput[]
  preview?: string
  resultPath?: string | null
  resultSummary?: string
  error?: string
}

export interface ResolvedToolField extends ToolField {
  options?: { label: string; value: string }[]
}
