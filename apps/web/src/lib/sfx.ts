/**
 * 应用内的提示音（Web Audio）
 *
 * 不加载任何音频文件：几段很短的合成音就够了，离线、换设备都不会丢。
 * 浏览器要求「先有一次用户手势」才允许出声，所以 `unlockSfx` 会在第一次
 * 点击 / 按键时把 AudioContext 唤醒；在那之前收到消息会安静地跳过。
 */
import { useUIStore } from '@/store/useUIStore'

export type SfxName = 'hisMessage' | 'myMessage' | 'hisPat' | 'myPat'
export type CallRingKind = 'incoming' | 'outgoing'

let ctx: AudioContext | null = null
let ringTimer: number | undefined

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

/** 第一次触摸 / 按键时调用：把被浏览器挂起的 AudioContext 唤醒 */
export function unlockSfx() {
  const c = audioContext()
  if (c && c.state === 'suspended') void c.resume()
}

function tone(
  c: AudioContext,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  volume = 0.035,
) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  // 用很小的音量 + 软起软落，避免「叮」得像系统警报
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.04, dur))
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(at)
  osc.stop(at + dur + 0.03)
}

function allowed(name: SfxName | CallRingKind): boolean {
  const p = useUIStore.getState()
  if (!p.sfxMaster) return false
  if (name === 'incoming') return p.sfxIncomingCall
  if (name === 'outgoing') return p.sfxOutgoingCall
  if (name === 'hisMessage') return p.sfxHisMessage
  if (name === 'myMessage') return p.sfxMyMessage
  if (name === 'hisPat') return p.sfxHisPat
  return p.sfxMyPat
}

function playPattern(c: AudioContext, name: SfxName | CallRingKind) {
  const t = c.currentTime + 0.01
  if (name === 'hisMessage') {
    // 两声很轻的「叮咚」
    tone(c, t, 880, 0.1, 'sine', 0.032)
    tone(c, t + 0.09, 1174.7, 0.15, 'sine', 0.03)
    return
  }
  if (name === 'myMessage') {
    tone(c, t, 659.3, 0.08, 'sine', 0.022)
    return
  }
  if (name === 'hisPat') {
    tone(c, t, 392, 0.09, 'triangle', 0.03)
    tone(c, t + 0.07, 523.3, 0.12, 'triangle', 0.026)
    return
  }
  if (name === 'myPat') {
    tone(c, t, 523.3, 0.08, 'triangle', 0.022)
    return
  }
  if (name === 'incoming') {
    // 他打来：两段上行铃声，然后停一会儿（外面用 interval 循环）
    for (const offset of [0, 0.22]) {
      tone(c, t + offset, 784, 0.18, 'sine', 0.04)
      tone(c, t + offset + 0.02, 1046.5, 0.2, 'sine', 0.028)
    }
    return
  }
  // 我打给他：标准回铃，低低的「嘟——」
  tone(c, t, 425, 0.75, 'sine', 0.022)
}

/** 播一次短提示音 */
export function playSfx(name: SfxName) {
  if (!allowed(name)) return
  const c = audioContext()
  if (!c) return
  if (c.state === 'suspended') {
    void c.resume().then(() => {
      if (allowed(name)) playPattern(c, name)
    })
    return
  }
  playPattern(c, name)
}

/** 开始循环铃声（来电 / 回铃）；返回停止函数 */
export function startCallRing(kind: CallRingKind): () => void {
  stopCallRing()
  const play = () => {
    if (!allowed(kind)) return
    const c = audioContext()
    if (!c) return
    if (c.state === 'suspended') {
      void c.resume()
      return
    }
    playPattern(c, kind)
  }
  play()
  ringTimer = window.setInterval(play, kind === 'incoming' ? 2600 : 3000)
  return stopCallRing
}

export function stopCallRing() {
  if (ringTimer !== undefined) {
    window.clearInterval(ringTimer)
    ringTimer = undefined
  }
}

/** 设置里「试听」用：响一小段就停，不一直循环 */
export function previewCallRing(kind: CallRingKind) {
  startCallRing(kind)
  window.setTimeout(stopCallRing, kind === 'incoming' ? 2400 : 2200)
}
