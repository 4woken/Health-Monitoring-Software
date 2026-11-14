import { describe, expect, it } from 'vitest'
import {
  TEAM,
  TYPICAL_BASELINE,
  flightHistoryError,
  initialsOf,
  memberForStorage,
  newMember,
  readProfileDetails,
  validRestingPulse,
} from './roster'

describe('crew roster', () => {
  it('starts with the four people of the team, each with a distinct id', () => {
    expect(TEAM.map((m) => m.short)).toEqual(['Lucas', 'Enzo', 'Nassim', 'Youssef'])
    expect(new Set(TEAM.map((m) => m.id)).size).toBe(4)
  })
  it('gives someone added a clean, unique id and typical values for their reference body', () => {
    const a = newMember('  Élise   Martin ', 'Medic', 'female', [])
    expect(a).toMatchObject({
      id: 'elise-martin',
      name: 'Élise Martin',
      short: 'Élise',
      added: true,
      stories: [],
    })
    expect(a.baseline).toEqual(TYPICAL_BASELINE.female)
    expect(newMember('Élise Martin', 'Pilot', 'male', ['elise-martin']).id).toBe('elise-martin-2')
  })
  it('writes initials from the name', () => {
    expect(initialsOf('Lucas Baurianne')).toBe('LB')
    expect(initialsOf('Youssef')).toBe('Y')
  })
  it('keeps the stable member identity while using the optional call sign in the crew interface', () => {
    const member = newMember('Élise Martin', 'Scientist', 'female', [], {
      callSign: '  Echo  7 ',
      specialty: ' Plant   ecology ',
    })
    expect(member).toMatchObject({
      id: 'elise-martin',
      short: 'Echo 7',
      callSign: 'Echo 7',
      specialty: 'Plant ecology',
    })
    expect(readProfileDetails({ specialty: '  ' }).specialty).toBeUndefined()
    expect(newMember('Élise Martin', 'Scientist', 'female', [], { callSign: '  ' }).short).toBe('Élise')
  })
  it('distinguishes a first flight from missing history and keeps sub-day flights', () => {
    const first = { previousFlights: 0, previousDaysInSpace: 0 }
    const shortFlight = { previousFlights: 1, previousDaysInSpace: 0.25 }
    expect(flightHistoryError(first)).toBeUndefined()
    expect(readProfileDetails(first)).toMatchObject(first)
    expect(flightHistoryError(shortFlight)).toBeUndefined()
    expect(readProfileDetails(shortFlight)).toMatchObject(shortFlight)
    expect(readProfileDetails({}).previousDaysInSpace).toBeUndefined()
    expect(readProfileDetails({ previousDaysInSpace: 12 }).previousFlights).toBeUndefined()
    for (const invalid of [
      { previousFlights: 0.5 },
      { previousDaysInSpace: -1 },
      { previousFlights: 0, previousDaysInSpace: 1 },
    ])
      expect(flightHistoryError(invalid)).toBeTruthy()
    expect(readProfileDetails({ previousDaysInSpace: NaN }).previousDaysInSpace).toBeUndefined()
  })
  it('keeps a personal pulse in memory and writes only readings with an explicit opt-in', () => {
    const session = newMember('Session pulse', 'Medic', 'female', [], { preflightRestingPulseBpm: 61.5 })
    const saved = newMember('Saved pulse', 'Medic', 'female', [], {
      preflightRestingPulseBpm: 72,
      rememberPreflightPulse: true,
    })
    const serialized = JSON.parse(JSON.stringify([session, saved].map(memberForStorage)))
    expect(serialized[0]).not.toHaveProperty('preflightRestingPulseBpm')
    expect(serialized[1]).toMatchObject({ preflightRestingPulseBpm: 72, rememberPreflightPulse: true })
    expect(session.preflightRestingPulseBpm).toBe(61.5)
    expect(memberForStorage({ ...saved, rememberPreflightPulse: false })).not.toHaveProperty(
      'preflightRestingPulseBpm',
    )
    expect(memberForStorage({ ...saved, preflightRestingPulseBpm: -1 })).not.toHaveProperty(
      'rememberPreflightPulse',
    )
  })
  it('leaves the personal reference empty until a value within the input range is supplied', () => {
    for (const value of [undefined, 0, 301, NaN, Infinity]) {
      expect(validRestingPulse(value)).toBe(false)
      expect(
        readProfileDetails({ preflightRestingPulseBpm: value, rememberPreflightPulse: true })
          .preflightRestingPulseBpm,
      ).toBeUndefined()
    }
    expect(validRestingPulse(1)).toBe(true)
    expect(validRestingPulse(300)).toBe(true)
    expect(TEAM.every((member) => member.preflightRestingPulseBpm === undefined)).toBe(true)
  })
})
