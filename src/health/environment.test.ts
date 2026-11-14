import { describe, expect, it } from 'vitest'
import { MISSION_ORDER } from '../mission/missions'
import { environmentOf } from './environment'
import { NASA_REQUIREMENTS } from './exams'
import { SIGNAL_IDS } from './signals'

describe('NASA reference by destination', () => {
  it('cites only requirements and signals that exist', () => {
    const codes = new Set(NASA_REQUIREMENTS.map((r) => r.code))
    for (const mission of MISSION_ORDER)
      for (const f of environmentOf(mission)) {
        for (const c of f.codes) expect(codes).toContain(c)
        for (const s of f.signals) expect(SIGNAL_IDS).toContain(s)
      }
  })
  it('follows the gravity, the dose rate and the distance of each destination', () => {
    const factor = (mission: (typeof MISSION_ORDER)[number], id: string) =>
      environmentOf(mission).find((f) => f.id === id)!
    expect(factor('orbit', 'gravity').strong).toBe(true)
    expect(factor('mars', 'gravity').value).toBe("0.38 g, 38% of Earth's")
    expect(factor('orbit', 'radiation').value).toMatch(/about 822 days/)
    expect(factor('cruise', 'radiation').strong).toBe(true)
    expect(factor('moon', 'radiation').strong).toBe(false)
    expect(factor('mars', 'distance').strong).toBe(true)
    expect(factor('mars', 'light').effect).toMatch(/ozone/)
  })
})
