/**
 * Esc 键归属（v1.2.5）。
 * 全屏时按 Esc 退出全屏是全局行为，由自绘标题栏兜底；
 * 但阅读界面开着侧栏 / 注释框 / 对比与提取浮层时，Esc 应该先关这些，
 * 而不是一把退出全屏。谁占用了 Esc 就 block 一下，全局处理会跳过。
 */
let blocked = 0

export function blockEscapeFullscreen(): () => void {
  blocked += 1
  let released = false
  return () => {
    if (released) return
    released = true
    blocked = Math.max(0, blocked - 1)
  }
}

export function isEscapeFullscreenBlocked(): boolean {
  return blocked > 0
}
