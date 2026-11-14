import { expect, it } from 'vitest'
import { demoVitals } from './demoVitals'
import type { ExerciseMotion } from './environmentExercise'

it('uses a fictional baseline and increases both rates according to the animation', () => {
  const modes: ExerciseMotion[] = ['cycle', 'row', 'ankle', 'step', 'march']
  for (const mode of modes) {
    const rest = demoVitals(mode, 0)
    const peak = demoVitals(mode, 30)
    expect(rest).toEqual({ bpm: 68, breathsPerMinute: 13 })
    expect(demoVitals(mode, -1)).toEqual(rest)
    expect(peak.bpm).toBeGreaterThan(rest.bpm)
    expect(peak.breathsPerMinute).toBeGreaterThan(rest.breathsPerMinute)
    expect(demoVitals(mode, 40)).toEqual(peak)
  }
  expect(demoVitals('row', 15).bpm).toBeGreaterThan(demoVitals('ankle', 15).bpm)
})
