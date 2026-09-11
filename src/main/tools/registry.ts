import type { ToolDefinition } from './types'
import { convertTool } from './runners/convert.runner'
import { downloadTool } from './runners/download.runner'
import { extractTool } from './runners/extract.runner'
import { unitConvertTool } from './runners/unit-convert.runner'
import { circuitCalcTool } from './runners/circuit-calc.runner'
import { flashcardTool } from './runners/flashcard.runner'

/**
 * 工具注册表：新增工具只需把 runner 加入此数组，UI 会根据 manifest 自动渲染表单，
 * 无需改动任何核心代码。
 */
const DEFINITIONS: ToolDefinition[] = [
  convertTool,
  downloadTool,
  extractTool,
  unitConvertTool,
  circuitCalcTool,
  flashcardTool
]

const INDEX = new Map<string, ToolDefinition>(DEFINITIONS.map((item) => [item.manifest.id, item]))

export function allDefinitions(): ToolDefinition[] {
  return DEFINITIONS
}

export function getDefinition(id: string): ToolDefinition | undefined {
  return INDEX.get(id)
}

export function toolIds(): string[] {
  return DEFINITIONS.map((item) => item.manifest.id)
}
