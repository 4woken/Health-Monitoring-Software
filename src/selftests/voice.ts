// Spoken guidance and beeps, for tests done standing a few metres from the screen. Only voices that
// run on this device are used: a network voice would send the words to a server. Speech can be
// turned off; the same words always show on screen.

import { useSyncExternalStore } from 'react'

const KEY = 'pulsar.voice.v1'
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
})()
const listeners = new Set<() => void>()

const synth = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

/** An English voice that runs on this device, if there is one. */
export function localVoice(): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? []
  const local = voices.filter((v) => v.localService)
  return (
    local.find((v) => v.lang === 'en-US' && v.default) ??
    local.find((v) => v.lang.startsWith('en-')) ??
    local.find((v) => v.lang.startsWith('en')) ??
    null
  )
}

export const voiceAvailable = () => synth() !== null && localVoice() !== null

export function setVoice(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Kept for this visit.
  }
  if (!on) synth()?.cancel()
  for (const l of listeners) l()
}

export function useVoiceSetting(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      // Voices load late in some browsers.
      synth()?.addEventListener?.('voiceschanged', l)
      return () => {
        listeners.delete(l)
        synth()?.removeEventListener?.('voiceschanged', l)
      }
    },
    () => enabled && voiceAvailable(),
  )
}

/**
 * Says something, replacing what is being said. `volume` is 0 to 1. Resolves when it is said, or at
 * once when speech is off or unavailable.
 */
export function say(
  text: string,
  { volume = 1, force = false, rate = 1 }: { volume?: number; force?: boolean; rate?: number } = {},
) {
  const s = synth()
  const voice = localVoice()
  if (!s || !voice || (!enabled && !force)) return Promise.resolve()
  s.cancel()
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.volume = volume
    u.rate = rate
    const end = () => resolve()
    u.onend = end
    u.onerror = end
    // Some browsers never fire the end event; do not wait forever.
    setTimeout(end, 1500 + text.length * 120)
    s.speak(u)
  })
}

export const hush = () => synth()?.cancel()

let audio: AudioContext | null = null
/** The audio context, created on first use (after a click, as browsers require). */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  audio ??= new AudioContext()
  if (audio.state === 'suspended') void audio.resume()
  return audio
}

/** A short beep. Beeps follow the voice setting, unless `force` (a test that needs sound). */
export function beep(frequency = 880, ms = 120, volume = 0.18, force = false) {
  if (!enabled && !force) return
  const ctx = audioContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + ms / 1000)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + ms / 1000 + 0.02)
}

/** "3, 2, 1, go": spoken and beeped, one second apart. Resolves on "go". */
export async function countdown(
  from = 3,
  onTick?: (n: number) => void,
  cancelled: () => boolean = () => false,
) {
  for (let n = from; n > 0; n--) {
    if (cancelled()) return false
    onTick?.(n)
    beep(660, 90)
    void say(String(n))
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (cancelled()) return false
  onTick?.(0)
  beep(990, 220)
  void say('Go')
  return true
}
