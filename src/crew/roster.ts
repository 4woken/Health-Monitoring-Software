// The crew: the four people of the team, and anyone added in this browser.
// Mission health trends are simulated. A user-entered pulse is stored separately.

import type { Build } from '../body/anatomy/bodyShape'
import type { Baseline } from '../health/signals'
import type { Story } from '../health/simulation'

/** Jobs on board. A role never changes what someone can see: every profile is open to everyone. */
export const ROLES = [
  'Commander',
  'Pilot',
  'Flight engineer',
  'Mission specialist',
  'Scientist',
  'Medic',
] as const
export type Role = (typeof ROLES)[number]

export interface ProfileDetails {
  callSign?: string
  specialty?: string
  previousFlights?: number
  previousDaysInSpace?: number
  preflightRestingPulseBpm?: number
  rememberPreflightPulse?: boolean
}

export const PROFILE_LIMITS = { callSign: 20, specialty: 60 } as const
export const PULSE_INPUT_RANGE = { min: 1, max: 300 } as const

export function validRestingPulse(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= PULSE_INPUT_RANGE.min &&
    value <= PULSE_INPUT_RANGE.max
  )
}

const validFlights = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const validDays = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER

export function flightHistoryError({ previousFlights, previousDaysInSpace }: ProfileDetails) {
  if (previousFlights !== undefined && !validFlights(previousFlights))
    return 'Enter a whole number of completed flights, zero or more.'
  if (previousDaysInSpace !== undefined && !validDays(previousDaysInSpace))
    return 'Enter zero or more days in space.'
  if (previousFlights === 0 && previousDaysInSpace !== undefined && previousDaysInSpace > 0)
    return 'A crew member with zero completed flights has zero prior days in space.'
  return undefined
}

/** Accept older profiles without these fields and trim text from form or storage. */
export function readProfileDetails(profile: ProfileDetails): ProfileDetails {
  const text = (value: unknown, max: number) =>
    typeof value === 'string'
      ? value.trim().replace(/\s+/g, ' ').slice(0, max).trimEnd() || undefined
      : undefined
  return {
    callSign: text(profile.callSign, PROFILE_LIMITS.callSign),
    specialty: text(profile.specialty, PROFILE_LIMITS.specialty),
    preflightRestingPulseBpm: validRestingPulse(profile.preflightRestingPulseBpm)
      ? profile.preflightRestingPulseBpm
      : undefined,
    rememberPreflightPulse:
      validRestingPulse(profile.preflightRestingPulseBpm) && profile.rememberPreflightPulse === true
        ? true
        : undefined,
    previousFlights: validFlights(profile.previousFlights) ? profile.previousFlights : undefined,
    previousDaysInSpace:
      validDays(profile.previousDaysInSpace) &&
      !(profile.previousFlights === 0 && profile.previousDaysInSpace > 0)
        ? profile.previousDaysInSpace
        : undefined,
  }
}

/** Apply the same opt-in to every member whenever the roster is saved or restored. */
export function memberForStorage(member: Member): Member {
  const { preflightRestingPulseBpm, rememberPreflightPulse, ...publicProfile } = member
  if (rememberPreflightPulse === true && validRestingPulse(preflightRestingPulseBpm)) {
    return { ...publicProfile, preflightRestingPulseBpm, rememberPreflightPulse }
  }
  return publicProfile
}

export interface Member extends ProfileDetails {
  id: string
  /** Unique to this creation of an added profile, even when its name and slug are reused. */
  portraitKey?: string
  /** Full name. */
  name: string
  /** What the interface calls them, usually the first name. */
  short: string
  role: Role
  /** Reference anatomy used for the 3D body. */
  build: Build
  /** Values before launch, the yardstick for change in flight. Invented. */
  baseline: Baseline
  /** Simulated health storylines over the mission. */
  stories: Story[]
  /** True for people added in this browser. */
  added?: boolean
}

export const TEAM: Member[] = [
  {
    id: 'lucas',
    name: 'Lucas Baurianne',
    short: 'Lucas',
    role: 'Commander',
    build: 'male',
    stories: ['eyes', 'hydration'],
    baseline: {
      redCellsPct: 45.1,
      redCellsRange: [38.5, 50],
      opticNerveMm: 6.1,
      whiteCellsK: 7.6,
      lymphocytesK: 2.4,
      vitaminDNgMl: 40,
      bodyMassKg: 74,
    },
  },
  {
    id: 'enzo',
    name: 'Enzo Baurianne',
    short: 'Enzo',
    role: 'Pilot',
    build: 'male',
    stories: ['air'],
    baseline: {
      redCellsPct: 43.8,
      redCellsRange: [38.5, 50],
      opticNerveMm: 5.3,
      whiteCellsK: 6.2,
      lymphocytesK: 2.1,
      vitaminDNgMl: 38,
      bodyMassKg: 71,
    },
  },
  {
    id: 'nassim',
    name: 'Nassim Arifette',
    short: 'Nassim',
    role: 'Flight engineer',
    build: 'male',
    stories: ['mood'],
    baseline: {
      redCellsPct: 44.5,
      redCellsRange: [38.5, 50],
      opticNerveMm: 5.2,
      whiteCellsK: 7.0,
      lymphocytesK: 2.7,
      vitaminDNgMl: 31,
      bodyMassKg: 78,
    },
  },
  {
    id: 'youssef',
    name: 'Youssef Mir',
    short: 'Youssef',
    role: 'Mission specialist',
    build: 'male',
    stories: ['appetite', 'vein'],
    baseline: {
      redCellsPct: 47.2,
      redCellsRange: [38.5, 50],
      opticNerveMm: 5.6,
      whiteCellsK: 8.9,
      lymphocytesK: 2.9,
      vitaminDNgMl: 45,
      bodyMassKg: 84,
    },
  },
]

/** Pre-flight values for someone added without any: the middle of the usual adult ranges. */
export const TYPICAL_BASELINE: Record<Build, Baseline> = {
  male: {
    redCellsPct: 44,
    redCellsRange: [38.5, 50],
    opticNerveMm: 5.4,
    whiteCellsK: 7,
    lymphocytesK: 2.4,
    vitaminDNgMl: 40,
    bodyMassKg: 76,
  },
  female: {
    redCellsPct: 40,
    redCellsRange: [35, 45],
    opticNerveMm: 5.2,
    whiteCellsK: 7,
    lymphocytesK: 2.4,
    vitaminDNgMl: 40,
    bodyMassKg: 64,
  },
}

/** A person added in this browser, with a unique id and typical pre-flight values. */
export function newMember(
  name: string,
  role: Role,
  build: Build,
  takenIds: string[],
  profile: ProfileDetails = {},
): Member {
  const clean = name.trim().replace(/\s+/g, ' ')
  const details = readProfileDetails(profile)
  const slug =
    clean
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'member'
  let id = slug
  for (let n = 2; takenIds.includes(id); n++) id = `${slug}-${n}`
  return {
    id,
    portraitKey: `member:${crypto.getRandomValues(new Uint32Array(4)).join('-')}`,
    name: clean,
    short: details.callSign ?? clean.split(' ')[0],
    ...details,
    role,
    build,
    baseline: TYPICAL_BASELINE[build],
    stories: [],
    added: true,
  }
}

/** Up to two capital letters for an avatar: "Lucas Baurianne" gives "LB". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('')
