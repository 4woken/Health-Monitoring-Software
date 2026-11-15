// The Ruffier test (Ruffier, 1950), a French field test of how the heart answers a set effort: the
// pulse at rest (P0), 30 squats in 45 seconds, the pulse straight after (P1) and after one minute of
// rest (P2). It stands in for NASA's cycle test (MEDB N3.07), which needs an ergometer.

import { median } from '../results'

export const SQUATS = 30
export const SQUAT_SECONDS = 45
/** One squat on each beep. */
export const BEAT_MS = (SQUAT_SECONDS * 1000) / SQUATS

/** Ruffier index: (P0 + P1 + P2 − 200) / 10. Lower is better. */
export const ruffierIndex = (p0: number, p1: number, p2: number) =>
  Number(((p0 + p1 + p2 - 200) / 10).toFixed(1))

/** Ruffier-Dickson index: ((P1 − 70) + 2 (P2 − P0)) / 10, less sensitive to the resting pulse. */
export const dicksonIndex = (p0: number, p1: number, p2: number) =>
  Number(((p1 - 70 + 2 * (p2 - p0)) / 10).toFixed(1))

/** The usual bands of the Ruffier index. */
export function ruffierBand(index: number): string {
  if (index < 0) return 'excellent'
  if (index < 5) return 'very good'
  if (index < 10) return 'good'
  if (index < 15) return 'average'
  return 'weak'
}

/** Pulse readings over time, to take the median of a window. */
export class PulseTrace {
  private points: { t: number; bpm: number }[] = []
  push(t: number, bpm: number) {
    if (Number.isFinite(bpm) && bpm > 30 && bpm < 230) this.points.push({ t, bpm })
  }
  /** Median between two times, ms, with at least `min` readings; null otherwise. */
  between(from: number, to: number, min = 3): number | null {
    const values = this.points.filter((p) => p.t >= from && p.t <= to).map((p) => p.bpm)
    return values.length >= min ? Math.round(median(values)) : null
  }
  /** Time of the first reading at or after `from`. */
  firstAfter(from: number): number | null {
    return this.points.find((p) => p.t >= from)?.t ?? null
  }
  clear() {
    this.points = []
  }
}
