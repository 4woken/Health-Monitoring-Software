import type { ExerciseMotion } from './environmentExercise'

/** Animation parameters only. Each demonstration starts from the same fictional resting avatar. */
const RISE: Record<ExerciseMotion, [pulse: number, breathing: number]> = {
  cycle: [36, 10],
  row: [40, 12],
  ankle: [7, 2],
  step: [20, 6],
  march: [25, 8],
}

export interface DemoPlayback {
  mode: ExerciseMotion
  gravityG: number
  startedAt: number
  pausedSeconds?: number
}

export type OnExerciseDemo = (playback: DemoPlayback | null) => void

export function demoVitals(mode: ExerciseMotion, elapsedSeconds: number) {
  const elapsed = Math.max(0, Math.min(30, elapsedSeconds))
  const ramp = 1 - Math.exp(-elapsed / 9)
  const [pulse, breathing] = RISE[mode]
  return {
    bpm: Math.round(68 + pulse * ramp),
    breathsPerMinute: Math.round(13 + breathing * ramp),
  }
}
