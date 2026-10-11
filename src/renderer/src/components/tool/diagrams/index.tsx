// 计算工具配图分发器：按 toolId 找到对应 diagram 模块并套统一外框。
// 契约：各模块位于 <toolId>.diagram.tsx，导出签名 (props: DiagramProps) => JSX.Element | null 的组件；
// 无匹配的 toolId 返回 null（不渲染外框）。
import type { DiagramProps } from './types'
import { UnitConvertDiagram } from './unit-convert.diagram'
import { CircuitCalcDiagram } from './circuit-calc.diagram'
import { OpampCalcDiagram } from './opamp-calc.diagram'
import { FilterCalcDiagram } from './filter-calc.diagram'
import { FilterSimDiagram } from './filter-sim.diagram'
import { RectCalcDiagram } from './rect-calc.diagram'
import { Timer555Diagram } from './timer-555.diagram'
import { TraceCalcDiagram } from './trace-calc.diagram'
import { WaveRmsDiagram } from './wave-rms.diagram'

const DIAGRAMS: Record<string, (props: DiagramProps) => JSX.Element | null> = {
  'unit-convert': UnitConvertDiagram,
  'circuit-calc': CircuitCalcDiagram,
  'opamp-calc': OpampCalcDiagram,
  'filter-calc': FilterCalcDiagram,
  'filter-sim': FilterSimDiagram,
  'rect-calc': RectCalcDiagram,
  'timer-555': Timer555Diagram,
  'trace-calc': TraceCalcDiagram,
  'wave-rms': WaveRmsDiagram
}

export function ToolDiagram({ toolId, payload }: { toolId: string; payload: Record<string, unknown> }): JSX.Element | null {
  const Diagram = DIAGRAMS[toolId]
  if (!Diagram) return null
  return (
    <div className="rounded-xl border border-border bg-muted/25 p-3">
      <p className="text-[11px] font-semibold text-muted-foreground">电路示意</p>
      <div className="mt-1.5 flex justify-center text-foreground">
        <Diagram payload={payload} />
      </div>
    </div>
  )
}
