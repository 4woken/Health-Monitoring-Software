import { describe, expect, it } from 'vitest'
import { TEAM, newMember } from '../crew/roster'
import { dayReport } from '../health/readings'
import { planDay, rulesPlanner } from './planner'

const [lucas, enzo] = TEAM

describe('daily check-up', () => {
  it('follows up every signal that needs attention, with its advice', () => {
    const report = dayReport(enzo, 80, 'cruise')
    const tasks = planDay({ report, mission: 'cruise' })
    for (const s of report.signals.filter((x) => x.level !== 'ok'))
      expect(tasks.find((t) => t.id === `follow:${s.id}`)?.title).toBe(s.advice)
  })
  it('puts scheduled and out-of-date exams first, one blood test for two signals', () => {
    const tasks = planDay({ report: dayReport(lucas, 61, 'cruise'), mission: 'cruise' })
    expect(tasks[0].kind).toBe('exam')
    expect(tasks.filter((t) => t.id === 'exam:Blood test')).toHaveLength(1)
    expect(tasks.find((t) => t.id === 'exam:Blood test')?.title).toMatch(/scheduled today/)
  })
  it('always has the daily routine, including the camera pulse', () => {
    const tasks = planDay({
      report: dayReport(newMember('Sam Doe', 'Pilot', 'male', []), 5, 'orbit'),
      mission: 'orbit',
    })
    expect(tasks.filter((t) => t.kind === 'routine').map((t) => t.id)).toContain('routine:pulse')
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length)
  })
  it('works through the planner interface, so another planner can replace it', async () => {
    const report = dayReport(lucas, 61, 'cruise')
    await expect(rulesPlanner.plan({ report, mission: 'cruise' })).resolves.toEqual(
      planDay({ report, mission: 'cruise' }),
    )
  })
})
