import { describe, expect, it } from 'vitest'
import { TEAM, newMember } from '../crew/roster'
import { planDay } from '../checkup/planner'
import { advise } from './advice'
import { NASA_REQUIREMENTS, dueOn, isDue, nextDue, requirementsFor } from './exams'
import { dayReport } from './readings'
import { SIGNAL_IDS } from './signals'

const [, enzo] = TEAM

describe('recommendations on the body', () => {
  it('turns each signal that needs attention into one short action', () => {
    const report = dayReport(enzo, 80, 'cruise')
    const advice = advise(report, 'cruise')
    expect(advice.map((a) => a.kind)).toEqual(expect.arrayContaining(['fatigue', 'exercise', 'air']))
    for (const s of report.signals.filter((x) => x.level !== 'ok'))
      expect(advice.find((a) => a.signal === s.id)?.level).toBe(s.level)
  })
  it('asks to stretch the back in the first weeks of weightlessness only', () => {
    const guest = newMember('Sam Doe', 'Pilot', 'male', [])
    expect(advise(dayReport(guest, 5, 'orbit'), 'orbit').map((a) => a.kind)).toContain('stretch')
    expect(advise(dayReport(guest, 40, 'orbit'), 'orbit').map((a) => a.kind)).not.toContain('stretch')
    expect(advise(dayReport(guest, 5, 'mars'), 'mars').map((a) => a.kind)).not.toContain('stretch')
  })
  it('puts the most urgent first', () => {
    const advice = advise(dayReport(enzo, 80, 'cruise'), 'cruise')
    const ranks = advice.map((a) => (a.level === 'act' ? 1 : 0))
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks)
  })
})

describe('NASA reference', () => {
  it('ties every requirement to signals that exist, and has a unique code for each', () => {
    for (const r of NASA_REQUIREMENTS) for (const s of r.signals) expect(SIGNAL_IDS).toContain(s)
    expect(new Set(NASA_REQUIREMENTS.map((r) => r.code)).size).toBe(NASA_REQUIREMENTS.length)
  })
  it('lists what is done in flight first', () => {
    const eyes = requirementsFor('opticNerve')
    expect(eyes[0].code).toBe('MEDB 1.10')
    expect(eyes.map((r) => r.phase)).toEqual(['flight', 'ground', 'career'])
    expect(requirementsFor('hydration')[0].code).toBe('MR054L')
  })
  it('follows the in-flight schedule of the ISS documents', () => {
    const eyes = NASA_REQUIREMENTS.find((r) => r.code === 'MEDB 1.10')!
    expect([29, 30, 31, 90].map((d) => isDue(eyes, d))).toEqual([false, true, false, true])
    const calf = NASA_REQUIREMENTS.find((r) => r.code === 'MEDB 5.4')!
    expect(nextDue(calf, 15)).toBe(28)
    expect(dueOn(60).map((r) => r.code)).toEqual(['MEDB 1.12', 'MEDB 1.13', 'MEDB 7.4'])
  })
  it('puts the NASA tasks of the day in the check-up', () => {
    const tasks = planDay({ report: dayReport(enzo, 30, 'orbit'), mission: 'orbit' })
    expect(tasks.find((t) => t.id === 'nasa:MEDB 1.10')?.title).toBe('Eye examination')
    expect(tasks.find((t) => t.id === 'nasa:MEDB 1.12')?.kind).toBe('exam')
  })
})
