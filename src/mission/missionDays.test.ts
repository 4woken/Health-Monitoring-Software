import { expect, it } from 'vitest'
import { TEAM } from '../crew/roster'
import { planDay } from '../checkup/planner'
import { dayReport, history } from '../health/readings'
import { readingsOn } from '../health/simulation'
import { MISSIONS, MISSION_ORDER, missionDay } from './missions'

it('keeps timeline and history within each destination, including its final whole Earth day', () => {
  expect(MISSION_ORDER.map((id) => MISSIONS[id].days)).toEqual([180, 3, 203, 500])
  for (const mission of MISSION_ORDER) {
    const end = MISSIONS[mission].days
    for (const [input, expected] of [
      [NaN, 1],
      [-5, 1],
      [2.8, 2],
      [end, end],
      [end + 3, end],
    ])
      expect(missionDay(mission, input)).toBe(expected)
    const report = dayReport(TEAM[0], end + 5, mission)
    expect(report.day).toBe(end)
    const series = history(TEAM[0], 'pulse', end + 5, mission, 999)
    expect(series.values.length).toBe(end)
    expect(series.values.at(-1)).toBe(report.readings.restingPulseBpm)
    for (const f of Object.values(report.freshness)) {
      expect(f.takenDay).toBeLessThanOrEqual(end)
      expect(f.nextDay).toBeNull()
    }
    for (const t of planDay({ mission, report })) expect(t.detail).not.toContain('day null')
  }
})

it('keeps fictional long-flight eye and vitamin D curves bounded on the Mars surface', () => {
  const member = TEAM[0]
  const baseline = member.baseline
  for (const d of [180, 203, 300, 499, 500]) {
    const r = readingsOn(member, d, 'mars')
    expect(r.vitaminDNgMl).toBeGreaterThan(baseline.vitaminDNgMl * 0.74)
    expect(r.opticNerveMm).toBeLessThan(baseline.opticNerveMm + 0.65)
    expect(
      Object.values(r)
        .filter((v) => typeof v === 'number')
        .every(Number.isFinite),
    ).toBe(true)
  }
})
