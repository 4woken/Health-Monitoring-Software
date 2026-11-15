import { describe, expect, it } from 'vitest'
import { planDay } from '../checkup/planner'
import { TEAM } from '../crew/roster'
import { dayReport } from '../health/readings'
import type { Signal } from '../health/signals'
import type { MissionId } from '../mission/missions'
import { personOf, simulate } from './engine'
import { cabinCo2Of, latestWarning, liveReport, tasksAt, visorReadings } from './live'
import { at, SCENARIOS } from './scenarios'

function day(mission: MissionId, number = 1) {
  const report = dayReport(TEAM[0], number, mission)
  const sim = simulate(
    SCENARIOS[mission],
    personOf(report.readings),
    planDay({ report, mission }),
    cabinCo2Of(report, mission),
  )
  const level = (t: string, id: string) =>
    liveReport(report, sim, mission, at(t)).signals.find((s) => s.id === id) as Signal
  return { report, sim, level }
}

describe('the dashboard during the simulation', () => {
  it('lights the dosimeter during the solar storm, and lets it go after the all-clear', () => {
    const { level } = day('cruise', 97)
    expect(level('09:00', 'radiation').level).toBe('ok')
    const storm = level('12:30', 'radiation')
    expect(storm.level).toBe('act')
    expect(storm.advice).toMatch(/shelter/)
    expect(level('20:00', 'radiation').level).toBe('ok')
  })

  it('starts from the day’s own cabin CO2', () => {
    const { report, sim } = day('cruise', 97)
    expect(sim.samples[0].co2MmHg).toBeCloseTo(cabinCo2Of(report, 'cruise'), 1)
  })

  it('follows the stopped scrubber on the station: the air, then a headache, then clean air', () => {
    const { level } = day('orbit')
    expect(level('08:00', 'cabinAir').level).toBe('ok')
    expect(level('10:40', 'cabinAir').level).not.toBe('ok')
    expect(level('11:00', 'headache').level).toBe('watch')
    // The headache signal is there only while there is a headache.
    expect(level('14:00', 'headache')).toBeUndefined()
  })

  it('reads the suit’s air on a moonwalk, and the heart on the climb', () => {
    const { level } = day('moon')
    expect(level('13:00', 'cabinAir').level).not.toBe('ok')
    expect(level('09:00', 'cabinAir').level).toBe('ok')
    const climb = ['10:50', '10:55', '11:00', '11:05', '11:10'].map((t) => level(t, 'oxygen').level)
    expect(climb).toContain('watch')
  })

  it('warms the core on the treadmill and says so', () => {
    const { level } = day('orbit')
    const run = ['14:50', '15:00', '15:10'].map((t) => level(t, 'bodyChecks'))
    expect(run.some((s) => s.level === 'watch' && s.value.startsWith('Core temperature'))).toBe(true)
  })

  it('keeps the most serious signals first', () => {
    const { report, sim } = day('cruise', 97)
    const signals = liveReport(report, sim, 'cruise', at('12:30')).signals
    expect(signals[0].level).toBe('act')
  })

  it('hands the helmet the minute, the next drink and the newest warning', () => {
    const { sim } = day('moon')
    const v = visorReadings(sim, at('12:45'))
    expect(v.clock).toBe('12:45')
    expect(v.nextDrinkMin).toBeGreaterThan(0)
    expect(v.alert?.level).toBe('act')
    expect(latestWarning(sim, at('08:00'))).toBeUndefined()
  })

  it('shows the tasks added by an alert only from the minute they appear', () => {
    const { sim } = day('orbit')
    const before = tasksAt(sim, at('10:00')).some((x) => x.id === 'monitor:headache')
    const after = tasksAt(sim, at('10:30')).find((x) => x.id === 'monitor:headache')
    expect(before).toBe(false)
    expect(after?.state).toBe('done')
  })
})
