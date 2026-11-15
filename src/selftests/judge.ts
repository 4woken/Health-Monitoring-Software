// How a self-test result is read: against the person's own usual result once it is set, and before
// that against a plain limit when one is defensible. Every limit here is our own assumption, said so
// in the interface: NASA does not publish action levels for these at-home versions.

import type { Level } from '../health/signals'
import { BASELINE_RUNS, baselineOf, type Detail, type TestResult } from './results'

export interface Judgement {
  level: Level
  note: string
  /** The usual score this result was compared with. */
  usual?: number
}

export interface RunValues {
  score: number
  details: Record<string, Detail>
}

/** Number read from a result's details, or NaN. */
export const detail = (r: { details: Record<string, Detail> }, key: string): number => {
  const v = r.details[key]
  return typeof v === 'number' ? v : NaN
}

export function baselineNote(earlier: TestResult[]): string {
  const done = Math.min(BASELINE_RUNS, earlier.length + 1)
  return done < BASELINE_RUNS
    ? `Run ${done} of ${BASELINE_RUNS} that set your usual result.`
    : `This run completes your usual result. Later runs are compared with it.`
}

/**
 * Compares a score with the person's usual one. `worse` says how far is too far, as a share of the
 * usual score (`ratio`) or in the score's unit (`by`). Before the usual score is set, `limit` may
 * still flag a value, otherwise the result is normal.
 */
export function judgeScore({
  score,
  earlier,
  better,
  worse,
  format,
  limit,
}: {
  score: number
  earlier: TestResult[]
  better: 'lower' | 'higher'
  worse: { ratio?: number; by?: number }
  format: (value: number) => string
  limit?: { flag: (score: number) => boolean; note: string }
}): Judgement {
  const { usual } = baselineOf(earlier)
  if (usual === undefined) {
    if (limit?.flag(score)) return { level: 'watch', note: `${limit.note} ${baselineNote(earlier)}` }
    return { level: 'ok', note: baselineNote(earlier) }
  }
  const sign = better === 'lower' ? 1 : -1
  const change = (score - usual) * sign
  const tooFar = Math.max(worse.by ?? 0, worse.ratio !== undefined ? Math.abs(usual) * worse.ratio : 0)
  if (change >= tooFar && tooFar > 0)
    return {
      level: 'watch',
      note: `Worse than your usual ${format(usual)}. Repeat it within 24 hours.`,
      usual,
    }
  if (limit?.flag(score)) return { level: 'watch', note: limit.note, usual }
  return {
    level: 'ok',
    note:
      change < 0 ? `Better than your usual ${format(usual)}.` : `In line with your usual ${format(usual)}.`,
    usual,
  }
}

/** The worse of two levels. */
export const worse = (a: Level, b: Level): Level =>
  a === 'act' || b === 'act' ? 'act' : a === 'watch' || b === 'watch' ? 'watch' : 'ok'
