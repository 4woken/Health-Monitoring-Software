import { describe, expect, it } from 'vitest'
import {
  MARS_PROFILE_PUBLISHED_SV,
  MISSION_PROFILES,
  PARAMETERS,
  simulateProfile,
  boneRatePerDay,
  daysToCareerLimit,
  daysToLoss,
  fluidShiftFactor,
  muscleRatePerDay,
  simulate,
  trajectory,
} from './physiology'
import { SOURCES } from '../health/sources'

const weightless = { gravity: 0, doseRateMSvDay: 1.8, exercise: 1 }

describe('fluid shift', () => {
  it('follows the measured neck-vein points', () => {
    expect(fluidShiftFactor(0)).toBe(1)
    expect(fluidShiftFactor(0.25)).toBeCloseTo(56 / 91, 6)
    expect(fluidShiftFactor(1)).toBe(0)
  })

  it('falls as gravity rises', () => {
    const g = [0, 0.1, 0.17, 0.25, 0.38, 0.6, 1].map(fluidShiftFactor)
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeLessThan(g[i - 1])
  })

  it('reaches about 2 L in weightlessness, mostly on day one', () => {
    expect(simulate({ ...weightless, day: 0 }).fluidShiftL).toBe(0)
    expect(simulate({ ...weightless, day: 1 }).fluidShiftShare).toBeGreaterThan(0.85)
    expect(simulate({ ...weightless, day: 30 }).fluidShiftL).toBeCloseTo(2, 3)
  })

  it('is absent in Earth gravity', () => {
    expect(simulate({ ...weightless, gravity: 1, day: 100 }).fluidShiftL).toBe(0)
  })
})

describe('bone', () => {
  it('loses 1.25% a month at the old-device rate', () => {
    const month = simulate({ ...weightless, exercise: 0, day: 30.44 })
    expect(100 - month.bonePct).toBeCloseTo(1.25, 6)
  })

  it('is protected by exercise and by gravity', () => {
    expect(boneRatePerDay(0, 1)).toBeLessThan(boneRatePerDay(0, 0))
    expect(boneRatePerDay(0.38, 1)).toBeLessThan(boneRatePerDay(0, 1))
    expect(boneRatePerDay(1, 0)).toBe(0)
  })

  it('stays between 0 and 100% over very long missions', () => {
    const s = simulate({ ...weightless, exercise: 0, day: 5000 })
    expect(s.bonePct).toBeGreaterThan(0)
    expect(s.bonePct).toBeLessThan(100)
  })
})

describe('muscle', () => {
  it('reproduces the 13% calf loss after 6 months with exercise', () => {
    expect(100 - simulate({ ...weightless, day: 180 }).musclePct).toBeCloseTo(13, 6)
  })

  it('roughly doubles the loss rate without exercise', () => {
    expect(muscleRatePerDay(0, 0) / muscleRatePerDay(0, 1)).toBeCloseTo(29 / 15, 6)
  })
})

describe('radiation', () => {
  it('adds up dose day by day', () => {
    const s = simulate({ ...weightless, day: 60 })
    expect(s.doseMSv).toBeCloseTo(108, 6)
    expect(s.doseCareerShare).toBeCloseTo(0.18, 6)
  })

  it('says when the career limit is reached', () => {
    expect(daysToCareerLimit(1.8)).toBeCloseTo(333.3, 1)
    expect(daysToCareerLimit(0)).toBeNull()
  })
})

describe('mission profiles', () => {
  it('matches the single-phase model on whole days', () => {
    const phases = [{ label: 'Orbit', days: 120, gravity: 0, doseRateMSvDay: 0.73 }]
    const profile = simulateProfile(phases, 0.6)
    expect(profile).toHaveLength(121)
    for (const day of [1, 30, 120]) {
      const direct = simulate({ gravity: 0, doseRateMSvDay: 0.73, exercise: 0.6, day })
      expect(profile[day].fluidShiftShare).toBeCloseTo(direct.fluidShiftShare, 9)
      expect(profile[day].bonePct).toBeCloseTo(direct.bonePct, 9)
      expect(profile[day].musclePct).toBeCloseTo(direct.musclePct, 9)
      expect(profile[day].doseMSv).toBeCloseTo(direct.doseMSv, 9)
    }
  })

  it('lets fluid settle lower once on the Martian surface', () => {
    const p = simulateProfile(MISSION_PROFILES.mars.phases, 1)
    expect(p[180].fluidShiftShare).toBeCloseTo(1, 3)
    expect(p[200].fluidShiftShare).toBeCloseTo(fluidShiftFactor(0.38), 3)
    expect(p[200].phase).toBe(1)
    expect(p[860].fluidShiftShare).toBeCloseTo(1, 3)
  })

  it('reproduces the published Mars mission dose within 5%', () => {
    const p = simulateProfile(MISSION_PROFILES.mars.phases, 1)
    const totalSv = p[p.length - 1].doseMSv / 1000
    expect(
      Math.abs(totalSv - MARS_PROFILE_PUBLISHED_SV.value) / MARS_PROFILE_PUBLISHED_SV.value,
    ).toBeLessThan(0.05)
    expect(SOURCES[MARS_PROFILE_PUBLISHED_SV.sourceId]).toBeDefined()
  })

  it('never recovers bone or muscle within the mission', () => {
    const p = simulateProfile(MISSION_PROFILES.mars.phases, 0.5)
    for (let i = 1; i < p.length; i++) {
      expect(p[i].bonePct).toBeLessThanOrEqual(p[i - 1].bonePct)
      expect(p[i].musclePct).toBeLessThanOrEqual(p[i - 1].musclePct)
    }
  })
})

describe('inputs and helpers', () => {
  it('cleans out-of-range and missing values', () => {
    const s = simulate({ gravity: -2, day: Number.NaN, doseRateMSvDay: -1, exercise: 9 })
    expect(s.day).toBe(0)
    expect(s.doseMSv).toBe(0)
    expect(s.bonePct).toBe(100)
  })

  it('returns one state per day', () => {
    const t = trajectory(weightless, 90)
    expect(t).toHaveLength(91)
    expect(t[90].day).toBe(90)
    expect(t[90].musclePct).toBeLessThan(t[10].musclePct)
  })

  it('finds the day a loss threshold is crossed', () => {
    const rate = muscleRatePerDay(0, 1)
    expect(daysToLoss(rate, 13)).toBeCloseTo(180, 6)
    expect(daysToLoss(0, 10)).toBeNull()
  })

  it('cites a known source for every parameter', () => {
    for (const p of Object.values(PARAMETERS)) expect(SOURCES[p.sourceId], p.sourceId).toBeDefined()
  })
})
