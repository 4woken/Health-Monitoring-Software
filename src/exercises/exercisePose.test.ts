import { expect, it } from 'vitest'
import { exercisePose } from './exercisePose'
import type { ExerciseMotion } from './environmentExercise'

it('pedals out of phase and flexes seated ankles without moving the knees', () => {
  const pose = (mode: Exclude<ExerciseMotion, 'row'>, side: -1 | 1, time = 0.46) =>
    exercisePose(mode, time, side, false)
  expect(Math.abs(pose('cycle', 1).hip - pose('cycle', -1).hip)).toBeGreaterThan(0.6)
  expect(pose('ankle', 1, 0).knee).toBe(pose('ankle', 1).knee)
  expect(Math.abs(pose('ankle', 1, 0).ankle - pose('ankle', 1).ankle)).toBeGreaterThan(0.3)
  expect(pose('step', 1).knee).toBeGreaterThan(pose('step', -1).knee)
})

it('keeps a stable exercise posture when the visitor prefers reduced motion', () => {
  for (const motion of ['cycle', 'ankle', 'step', 'march'] as const) {
    expect(exercisePose(motion, 0, 1, true)).toEqual(exercisePose(motion, 30, 1, true))
  }
})
