import type { ToolDefinition } from './types'
import { imageConvertTool } from './runners/image-convert.runner'
import { audioConvertTool } from './runners/audio-convert.runner'
import { videoConvertTool } from './runners/video-convert.runner'
import { docConvertTool } from './runners/doc-convert.runner'
import { downloadTool } from './runners/download.runner'
import { extractTool } from './runners/extract.runner'
import { unitConvertTool } from './runners/unit-convert.runner'
import { circuitCalcTool } from './runners/circuit-calc.runner'
import { filterCalcTool } from './runners/filter-calc.runner'
import { opampCalcTool } from './runners/opamp-calc.runner'
import { filterSimTool } from './runners/filter-sim.runner'

/** 工具注册表：加入此数组即出现在工具集市，表单由 manifest 自动渲染。 */
const DEFINITIONS: ToolDefinition[] = [
  imageConvertTool,
  audioConvertTool,
  videoConvertTool,
  docConvertTool,
  downloadTool,
  extractTool,
  unitConvertTool,
  circuitCalcTool,
  filterCalcTool,
  opampCalcTool,
  filterSimTool
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