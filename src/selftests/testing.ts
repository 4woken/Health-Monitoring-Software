// Helpers for the self-test unit tests: results and body landmarks made by hand.

import type { Level } from '../health/signals'
import type { Landmark } from './camera/landmarks'
import type { SelfTestId } from './ids'
import type { Detail, TestResult } from './results'

let n = 0
export function result(
  test: SelfTestId,
  day: number,
  score: number,
  level: Level = 'ok',
  details: Record<string, Detail> = {},
): TestResult {
  n++
  return {
    id: `r${n}`,
    test,
    memberId: 'test',
    mission: 'orbit',
    day,
    at: 1_000_000 + n * 1000,
    score,
    details,
    level,
    note: '',
  }
}

/**
 * A person standing facing the camera, centred, in normalised image coordinates. The person's left
 * side is on the right of the image. `move` changes points by index.
 */
export function standing(move: Partial<Record<number, Partial<Landmark>>> = {}): Landmark[] {
  const p: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  const put = (i: number, x: number, y: number) => (p[i] = { x, y, visibility: 1 })
  put(0, 0.5, 0.15)
  put(2, 0.51, 0.13)
  put(5, 0.49, 0.13)
  put(7, 0.53, 0.14)
  put(8, 0.47, 0.14)
  put(11, 0.56, 0.25)
  put(12, 0.44, 0.25)
  put(13, 0.58, 0.36)
  put(14, 0.42, 0.36)
  put(15, 0.58, 0.46)
  put(16, 0.42, 0.46)
  put(23, 0.54, 0.5)
  put(24, 0.46, 0.5)
  put(25, 0.53, 0.68)
  put(26, 0.47, 0.68)
  put(27, 0.52, 0.86)
  put(28, 0.48, 0.86)
  put(29, 0.52, 0.88)
  put(30, 0.48, 0.88)
  put(31, 0.52, 0.89)
  put(32, 0.48, 0.89)
  for (const [i, change] of Object.entries(move)) p[Number(i)] = { ...p[Number(i)], ...change }
  return p
}

/** A person seen side-on: the left hip, knee and ankle, with the right leg hidden. */
export function sideOn(hip: [number, number], knee: [number, number], ankle: [number, number]): Landmark[] {
  const p = standing()
  p[23] = { x: hip[0], y: hip[1], visibility: 1 }
  p[25] = { x: knee[0], y: knee[1], visibility: 1 }
  p[27] = { x: ankle[0], y: ankle[1], visibility: 1 }
  for (const i of [24, 26, 28]) p[i] = { ...p[i], visibility: 0 }
  return p
}
