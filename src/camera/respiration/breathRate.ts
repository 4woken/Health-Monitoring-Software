import { detrend, spectralPeak } from '../pulse/rppg'
import type { FrameFlow } from './opticalFlow'

const HZ = 10
export const MIN_SECONDS = 32
const WINDOW_SECONDS = 42

interface Sample {
  t: number
  left: number
  right: number
  head: number
}

export interface BreathingEstimate {
  rate: number | null
  seconds: number
  wave: number[]
}

function energy(values: Float64Array) {
  return values.reduce((sum, x) => sum + x * x, 0) / values.length
}

function fitFraction(signal: Float64Array, hz: number) {
  let sine = 0
  let cosine = 0
  for (let i = 0; i < signal.length; i++) {
    const phase = (2 * Math.PI * hz * i) / HZ
    sine += signal[i] * Math.sin(phase)
    cosine += signal[i] * Math.cos(phase)
  }
  return (2 * (sine * sine + cosine * cosine)) / (signal.length ** 2 * energy(signal) + 1e-12)
}

function uniform(samples: Sample[], key: 'left' | 'right' | 'head', seconds: number) {
  const out = new Float64Array(1 + Math.floor(seconds * HZ))
  let j = 1
  for (let i = 0; i < out.length; i++) {
    const t = samples[0].t + i / HZ
    while (j < samples.length - 1 && samples[j].t < t) j++
    const [a, b] = [samples[j - 1], samples[j]]
    const alpha = (t - a.t) / (b.t - a.t)
    out[i] = a[key] + alpha * (b[key] - a[key])
  }
  return detrend(out)
}

/** Integrate only consecutive valid frames. Reset after dropped video or movement.
 * Pixel displacement stays private to the session; the only outgoing number is an accepted rate.
 */
export class BreathWindow {
  private samples: Sample[] = []

  clear() {
    this.samples = []
  }

  add(t: number, flow: FrameFlow) {
    const last = this.samples.at(-1)
    if (flow.status !== 'tracking' || !Number.isFinite(t)) {
      this.clear()
      return
    }
    // First valid frame sets the zero of displacement; a stalled camera starts a new baseline.
    if (!last || t <= last.t || t - last.t > 0.5) {
      this.samples = [{ t, left: 0, right: 0, head: 0 }]
      return
    }
    this.samples.push({
      t,
      left: last.left + flow.left,
      right: last.right + flow.right,
      head: last.head + flow.reference,
    })
    while (t - this.samples[0].t > WINDOW_SECONDS) this.samples.shift()
  }

  estimate(): BreathingEstimate {
    const samples = this.samples
    if (samples.length < 2) return { rate: null, seconds: 0, wave: [] }
    const seconds = samples[samples.length - 1].t - samples[0].t
    const left = uniform(samples, 'left', seconds)
    const right = uniform(samples, 'right', seconds)
    const head = uniform(samples, 'head', seconds)
    const chest = left.map((v, i) => (v + right[i]) / 2)
    const relative = chest.map((v, i) => v - head[i])
    const wave = Array.from(relative.slice(-120))
    const result = { rate: null, seconds, wave }
    if (seconds < MIN_SECONDS || samples.length < seconds * 5) return result

    // Both chest halves must agree and move independently of the head. Common camera shake,
    // an isolated moving head and noisy clothing often still have a strong spectral peak.
    const chestPower = energy(chest)
    if (energy(head) > 0.6 * chestPower || energy(left.map((v, i) => v - right[i])) > 0.7 * chestPower)
      return result
    const peak = spectralPeak(relative, HZ, 0.06, 0.9)
    if (!peak || peak.hz < 0.097 || peak.hz > 0.603 || peak.hz * seconds < 3 || peak.snrDb < 4) return result
    // A stationary last cycle should promptly suppress an old estimate even if the older trace is strong.
    const tail = detrend(relative.slice(-Math.round(HZ * Math.max(4, 1.2 / peak.hz))))
    if (energy(relative) < 0.009 || energy(tail) < Math.max(0.005, 0.13 * energy(relative))) return result
    if (
      fitFraction(relative, peak.hz) < 0.58 ||
      fitFraction(chest, peak.hz) < 0.55 ||
      fitFraction(tail, peak.hz) < 0.35
    )
      return result
    return { rate: Math.round(peak.hz * 60), seconds, wave }
  }
}
