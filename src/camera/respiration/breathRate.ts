import { detrend, spectralPeak } from '../pulse/rppg'
import type { FrameFlow } from './opticalFlow'

const HZ = 10
export const MIN_SECONDS = 12
const WINDOW_SECONDS = 26
const MAX_BREAK_SECONDS = 2.5
const MAX_FRAME_STEP = 0.5

interface Sample {
  t: number
  left: number
  right: number
  head: number
  /** Cumulative time between consecutive tracked frames. */
  tracked: number
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

/** Displacements stay local. Brief losses pause acquisition; spectral analysis retains real frame times. */
export class BreathWindow {
  private samples: Sample[] = []
  private interrupted = false
  private resumedAt = -Infinity

  clear() {
    this.samples = []
    this.interrupted = false
    this.resumedAt = -Infinity
  }

  interrupt(t: number) {
    const last = this.samples.at(-1)
    if (last && (t - last.t > MAX_BREAK_SECONDS || t < last.t)) this.clear()
    this.interrupted = true
  }

  add(t: number, flow: FrameFlow) {
    if (!Number.isFinite(t)) return
    if (flow.status !== 'tracking' || ![flow.left, flow.right, flow.reference].every(Number.isFinite)) {
      this.interrupt(t)
      return
    }
    const last = this.samples.at(-1)
    if (!last || t < last.t || t - last.t > MAX_BREAK_SECONDS) {
      this.samples = [{ t, left: 0, right: 0, head: 0, tracked: 0 }]
      this.interrupted = false
      this.resumedAt = t
      return
    }
    if (t === last.t) return
    const dt = t - last.t
    if (this.interrupted || dt > MAX_FRAME_STEP) {
      // The displacement across the break is unknown. Re-anchor at the last position,
      // without crediting the missing interval as tracked time.
      this.samples.push({ ...last, t })
      this.resumedAt = t
      this.interrupted = false
    } else {
      this.samples.push({
        t,
        left: last.left + flow.left,
        right: last.right + flow.right,
        head: last.head + flow.reference,
        tracked: last.tracked + dt,
      })
    }
    while (t - this.samples[0].t > WINDOW_SECONDS) this.samples.shift()
  }

  estimate(): BreathingEstimate {
    const samples = this.samples
    if (samples.length < 2) return { rate: null, seconds: 0, wave: [] }
    const first = samples[0]
    const last = samples[samples.length - 1]
    const span = last.t - first.t
    const seconds = last.tracked - first.tracked
    const left = uniform(samples, 'left', span)
    const right = uniform(samples, 'right', span)
    const head = uniform(samples, 'head', span)
    const chest = left.map((v, i) => (v + right[i]) / 2)
    const relative = chest.map((v, i) => v - head[i])
    const wave = Array.from(relative.slice(-120))
    const result = { rate: null, seconds, wave }
    if (
      this.interrupted ||
      last.t - this.resumedAt < 0.35 ||
      seconds < MIN_SECONDS ||
      seconds < 0.76 * span ||
      samples.length < seconds * 5
    )
      return result

    // Both chest halves must agree and move independently of the head. Common camera shake,
    // an isolated moving head and noisy clothing often still have a strong spectral peak.
    const relativePower = energy(relative)
    if (
      relativePower < 0.009 ||
      energy(head) > 3 * relativePower ||
      energy(left.map((v, i) => v - right[i])) > 0.7 * relativePower
    )
      return result
    const peak = spectralPeak(relative, HZ, 0.06, 0.9)
    if (!peak || peak.hz < 0.097 || peak.hz > 0.603 || peak.hz * seconds < 2.05 || peak.snrDb < 4)
      return result
    // Require the breathing frequency in the chest itself; moving the head alone can make
    // the relative signal oscillate. Common sway at another frequency can safely subtract out.
    const relativeFit = fitFraction(relative, peak.hz)
    if (
      relativeFit < 0.58 ||
      fitFraction(chest, peak.hz) * energy(chest) < 0.25 * relativeFit * relativePower
    )
      return result
    // Integrated frame noise sometimes resembles a slow wave. A real repeated chest rise
    // should also be visible in displacements over a short fraction of its period.
    const lag = Math.max(2, Math.round((0.08 * HZ) / peak.hz))
    const shifts = relative.slice(lag).map((v, i) => v - relative[i])
    if (fitFraction(shifts, peak.hz) < 0.4) return result
    const tail = detrend(relative.slice(-Math.round(HZ * Math.max(4, 1.2 / peak.hz))))
    if (energy(tail) < Math.max(0.005, 0.13 * relativePower) || fitFraction(tail, peak.hz) < 0.35)
      return result
    return { rate: Math.round(peak.hz * 60), seconds, wave }
  }
}
