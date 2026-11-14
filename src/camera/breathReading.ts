export interface BreathReading {
  breathsPerMinute: number
  measuredAt: number
}

export const BREATH_REPLAY_MS = 60_000

/** The animation may replay the last minute's estimate on its owner's body. */
export function recentBreath(
  reading: (BreathReading & { ownerId: string }) | null,
  ownerId: string,
  now: number,
) {
  if (
    !reading ||
    reading.ownerId !== ownerId ||
    !Number.isFinite(reading.breathsPerMinute) ||
    reading.breathsPerMinute <= 0
  )
    return null
  const age = now - reading.measuredAt
  return age >= 0 && age < BREATH_REPLAY_MS ? reading : null
}
