// 工具配图契约：每个计算工具的示意图模块实现同一个签名，由 index.tsx 按 toolId 分发。

/** 与 ToolRunnerForm 同源的当前表单值（select 存字符串，number 存数字） */
export interface DiagramProps {
  payload: Record<string, unknown>
}
