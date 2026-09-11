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

/** 播放一段轻柔的双音提示（弹窗出现时使用），环境不支持时静默忽略 */
export function playChime(): void {
  const audio = getCtx()
  if (!audio) return
  try {
    const now = audio.currentTime
    const gain = audio.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    gain.connect(audio.destination)

    const tones: { freq: number; at: number }[] = [
      { freq: 880, at: 0 },
      { freq: 1174.66, at: 0.12 }
    ]
    for (const tone of tones) {
      const osc = audio.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(tone.freq, now + tone.at)
      osc.connect(gain)
      osc.start(now + tone.at)
      osc.stop(now + tone.at + 0.35)
    }
  } catch {
    /* 音频不可用时静默忽略 */
  }
}
