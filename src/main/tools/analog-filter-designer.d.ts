/**
 * analog-filter-designer 是无依赖的开源模拟滤波器求解器（MIT）：
 * 复数导纳的改进节点方程（MNA）+ 高斯消元（部分主元），支持 R / C / L / 独立电压源 / 理想运放（nullor）。
 * 上游仓库 https://github.com/nishadsuresh/analog-filter-designer ，作者自述用 ngspice 与六个解析传递函数做过对照验证；
 * 本仓库另在 work/scratch/afd/verify*.cjs 里对 RC 一阶、Sallen-Key、双 T 陷波与阶跃响应做了独立复核
 * （RC 与 Sallen-Key 相对误差 1e-15 量级，双 T 在 f0 处 |H| = 5e-17，一阶 RC 阶跃 1τ 处误差 0.29%）。
 * 该包未提供类型声明，这里只声明本项目用到的部分。
 */
declare module 'analog-filter-designer' {
  export interface ComplexValue {
    re: number
    im: number
    add(other: ComplexValue): ComplexValue
    sub(other: ComplexValue): ComplexValue
    mul(other: ComplexValue): ComplexValue
    div(other: ComplexValue): ComplexValue
    abs(): number
  }

  export type MnaComponent =
    | { type: 'R'; nodes: [number, number]; value: number }
    | { type: 'C'; nodes: [number, number]; value: number }
    | { type: 'L'; nodes: [number, number]; value: number }
    | { type: 'V'; nodes: [number, number]; value: number }
    | { type: 'OPAMP'; nodes: [number, number, number] }

  export interface MnaNetlist {
    /** 节点编号 1..numNodes，0 恒为地 */
    numNodes: number
    components: MnaComponent[]
  }

  export function solveAC(netlist: MnaNetlist, omega: number): ComplexValue[]
  export function acSweep(netlist: MnaNetlist, freqsHz: number[]): { freqHz: number; voltages: ComplexValue[] }[]
  export function poleZeroMap(
    netlist: MnaNetlist,
    outputNode: number
  ): { poles: { re: number; im: number }[]; zeros: { re: number; im: number }[] }
  export function simulateTransient(
    netlist: MnaNetlist,
    options: { dt: number; tStop: number; inputValue: (time: number) => number }
  ): { t: number; voltages: number[] }[]
}