import { describe, expect, it } from 'vitest'
import { TEAM, newMember } from '../crew/roster'
import { dayReport, freshness, lastTaken, readingsFor } from './readings'
import { readingsOn } from './simulation'

const [lucas, enzo, nassim, youssef] = TEAM
const levelOf = (member = lucas, day: number, id: string, mission: 'orbit' | 'cruise' = 'cruise') =>
  dayReport(member, day, mission).signals.find((s) => s.id === id)?.level

describe('measurement schedule', () => {
  it('blood tests come every 30 days and go out of date after 21', () => {
    expect(lastTaken('redCells', 45)).toBe(31)
    expect(freshness('redCells', 45)).toMatchObject({
      takenDay: 31,
      ageDays: 14,
      outdated: false,
      nextDay: 61,
    })
    expect(freshness('redCells', 55).outdated).toBe(true)
    expect(freshness('oxygen', 55)).toMatchObject({ ageDays: 0, automatic: true, nextDay: null })
  })
  it('keeps the last exam result between two exams', () => {
    expect(readingsFor(lucas, 45, 'cruise').redCellsPct).toBe(readingsOn(lucas, 31, 'cruise').redCellsPct)
  })
})

describe('storylines', () => {
  it("Lucas's optic nerve and hydration change through the mission", () => {
    expect(levelOf(lucas, 10, 'opticNerve')).toBe('ok')
    expect(levelOf(lucas, 85, 'opticNerve')).toBe('watch')
    expect(levelOf(lucas, 30, 'hydration')).toBe('watch')
  })
  it('Enzo gets headaches once the cabin air turns stale', () => {
    expect(levelOf(enzo, 10, 'headache')).toBeUndefined()
    expect(levelOf(enzo, 80, 'headache')).toBe('watch')
    expect(levelOf(enzo, 80, 'loading')).toBe('watch')
  })
  it("Nassim's mood drops late in the mission, Youssef's neck vein slows", () => {
    expect(levelOf(nassim, 50, 'mood')).toBe('ok')
    expect(levelOf(nassim, 75, 'mood')).toBe('watch')
    expect(levelOf(youssef, 40, 'neckVein')).toBe('ok')
    expect(levelOf(youssef, 60, 'neckVein')).toBe('watch')
  })
  it('someone added has no storyline: their own signals stay clear', () => {
    const guest = newMember('Ada Lovelace', 'Scientist', 'female', [])
    const own = dayReport(guest, 60, 'orbit').signals.filter(
      (s) => s.id !== 'cabinAir' && s.id !== 'radiation',
    )
    expect(own.every((s) => s.level === 'ok')).toBe(true)
  })
})
