// The brief psychomotor vigilance test (PVT-B) behind NASA's Reaction Self Test: 3 minutes, random
// waits of 1 to 4 seconds, and a lapse is a response of 355 ms or more (Basner, Mollicone and
// Dinges, Acta Astronautica 2011).

import { median } from '../results'

export const PVT = {
  durationMs: 180_000,
  waitMinMs: 1000,
  waitMaxMs: 4000,
  lapseMs: 355,
  /** Faster than this, the press started before the counter: it counts as a false start. */
  falseStartMs: 100,
  /** A counter left this long without a press ends as a lapse, so a test cannot stall. */
  timeoutMs: 10_000,
} as const

export interface PvtSummary {
  /** Median response time, ms. */
  medianMs: number
  /** Responses at or above the lapse limit, timeouts included. */
  lapses: number
  falseStarts: number
  /** Counters shown. */
  trials: number
  /** Mean response speed, 1000/ms, which the PVT literature also reports. */
  speed: number
}

export function summarize(times: number[], falseStarts: number): PvtSummary {
  const valid = times.filter((t) => Number.isFinite(t) && t >= PVT.falseStartMs)
  return {
    medianMs: Math.round(median(valid)),
    lapses: valid.filter((t) => t >= PVT.lapseMs).length,
    falseStarts,
    trials: valid.length,
    speed: valid.length ? Number((valid.reduce((s, t) => s + 1000 / t, 0) / valid.length).toFixed(2)) : 0,
  }
}

/** Wait before the next counter, uniform between the limits. */
export const nextWait = (random = Math.random) => PVT.waitMinMs + (PVT.waitMaxMs - PVT.waitMinMs) * random()
