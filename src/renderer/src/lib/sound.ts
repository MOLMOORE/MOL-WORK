let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** 模拟机械门铃的「叮咚」两声：叮（高频长衰减）+ 咚（低频短促） */
export function playDoorbell(): void {
  const audio = getCtx()
  if (!audio) return
  try {
    const now = audio.currentTime
    const master = audio.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)
    master.connect(audio.destination)

    const ring = (freq: number, at: number, dur: number, peak: number): void => {
      // 基频 + 弱二倍频，模拟金属敲击的明亮音色
      const fundamental = audio.createOscillator()
      fundamental.type = 'sine'
      fundamental.frequency.setValueAtTime(freq, now + at)
      const partial = audio.createOscillator()
      partial.type = 'sine'
      partial.frequency.setValueAtTime(freq * 2.01, now + at)
      const partialGain = audio.createGain()
      partialGain.gain.setValueAtTime(peak, now + at)
      partialGain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur)
      const env = audio.createGain()
      env.gain.setValueAtTime(peak, now + at)
      env.gain.exponentialRampToValueAtTime(0.0001, now + at + dur)
      fundamental.connect(env)
      partial.connect(partialGain)
      partialGain.connect(env)
      env.connect(master)
      fundamental.start(now + at)
      fundamental.stop(now + at + dur + 0.05)
      partial.start(now + at)
      partial.stop(now + at + dur + 0.05)
    }

    ring(1318.51, 0, 0.55, 0.9) // 叮（E6）
    ring(1046.5, 0.28, 0.65, 0.8) // 咚（C6）
  } catch {
    /* 音频不可用时静默忽略 */
  }
}

let lastTickAt = 0

/** 转盘指针拨动时的「咔哒」声：极短促的轻击，内部节流避免拖动时过密 */
export function playTick(): void {
  const audio = getCtx()
  if (!audio) return
  const now = performance.now()
  if (now - lastTickAt < 35) return
  lastTickAt = now
  try {
    const at = audio.currentTime
    const osc = audio.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(2600, at)
    const gain = audio.createGain()
    gain.gain.setValueAtTime(0.045, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(at)
    osc.stop(at + 0.035)
  } catch {
    /* 音频不可用时静默忽略 */
  }
}
