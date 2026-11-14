import { describe, expect, it } from 'vitest'
import { BREATH_REPLAY_MS, recentBreath } from './breathReading'

describe('breathing on the crew body', () => {
  const reading = { ownerId: 'C1', measuredAt: 100, breathsPerMinute: 15 }
  it('only uses a recent estimate from this crew member', () => {
    expect(recentBreath(reading, 'C1', 101)).toBe(reading)
    expect(recentBreath(reading, 'C2', 101)).toBeNull()
    expect(recentBreath(reading, 'C1', reading.measuredAt + BREATH_REPLAY_MS)).toBeNull()
    expect(recentBreath(reading, 'C1', 0)).toBeNull()
    expect(recentBreath({ ...reading, breathsPerMinute: NaN }, 'C1', 101)).toBeNull()
  })
})
