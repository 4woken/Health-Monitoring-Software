// SIMULATED DATA. Nothing here is a real astronaut measurement.
//
// Published, with the source in sources.ts: the size of the in-flight red cell share rise (+11%),
// the white cell rise, the vitamin D fall over a long flight, the cabin CO2 range and the
// radiation dose rate of each destination.
// Invented: the people, their values before launch, the day-by-day curves and the storylines.

import type { Member } from '../crew/roster'
import { MISSIONS, type MissionId } from '../mission/missions'
import type { Cabin, Readings, VeinFlow } from './signals'

/** Length of the simulated mission, days. */
export const MISSION_DAYS = 90

/** A health storyline a person can live through during the mission. */
export type Story =
  /** The optic nerve sheath grows after day 40, with a vision complaint from day 75. */
  | 'eyes'
  /** Drinks too little from week 3. */
  | 'hydration'
  /** Gets headaches when cabin CO2 rises, so sleeps badly and skips workouts. */
  | 'air'
  /** Low mood late in the mission. */
  | 'mood'
  /** Eats too little from day 40. */
  | 'appetite'
  /** Slow neck vein flow from day 48. */
  | 'vein'

/** Repeatable pseudo-random number in [-1, 1]: the same inputs always give the same output. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

const seedOf = (id: string) => [...id].reduce((sum, c, i) => sum + c.charCodeAt(0) * (i + 1), 0)
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits

export function cabinOn(day: number, mission: MissionId): Cabin {
  const m = MISSIONS[mission]
  // CO2 creeps up as the scrubber ages: 2.2 mmHg at launch, about 3.4 from day 70.
  const co2 = day < 30 ? 2.2 + day * 0.01 : Math.min(3.4, 2.5 + (day - 30) * 0.0225)
  return {
    day,
    co2MmHg: round(co2 + noise(day) * 0.05),
    doseMSv: round(day * m.radiationMSvDay),
    doseRateMSvDay: m.radiationMSvDay,
    where: m.where,
    doseSourceId: m.radiationSourceId,
  }
}

export function readingsOn(member: Member, day: number, mission: MissionId): Readings {
  // Share of the weightless "fluid toward the head" effect here (1 in weightlessness).
  const shift = MISSIONS[mission].fluidShift
  const seed = seedOf(member.id)
  const n = (k: number) => noise(day * 7 + k + seed)
  const b = member.baseline
  const has = (story: Story) => member.stories.includes(story)
  const co2 = cabinOn(day, mission).co2MmHg

  // The red cell share rises about 11% over the first 10 days, then stays there.
  const redCellsPct = b.redCellsPct * (1 + 0.11 * shift * Math.min(1, day / 10)) + n(1) * 0.3
  // White cells rise in flight; lymphocytes stay about the same.
  const whiteCellsK = b.whiteCellsK * (1 + 0.2 * Math.min(1, day / 10)) + n(12) * 0.1
  const lymphocytesK = b.lymphocytesK * (1 + n(13) * 0.03)
  // Vitamin D falls about 25% over a long flight, even with supplements.
  const vitaminDNgMl = b.vitaminDNgMl * (1 - 0.25 * (day / MISSION_DAYS)) + n(14) * 0.3

  let opticNerveMm = b.opticNerveMm + n(2) * 0.04
  let sleepHours = 6.8 + n(3) * 0.3
  let urineLitres = 2.4 + n(6) * 0.2
  let resistanceSessions = 6
  let mood = 3.9 + n(7) * 0.3
  let massLoss = 0.0003 * Math.min(day, 60)
  let neckVeinFlow: VeinFlow = 'forward'
  let headache = false

  if (has('eyes')) opticNerveMm += Math.max(0, day - 40) * 0.012 * shift
  if (has('hydration') && day >= 20) urineLitres = 1.6 + n(6) * 0.1
  if (has('air') && co2 >= 2.9) {
    headache = true
    sleepHours = 5.5 + n(3) * 0.2
    resistanceSessions = 3
  }
  if (has('mood') && day >= 68) mood = 2.3 + n(7) * 0.1
  if (has('appetite')) massLoss = Math.min(0.08, Math.max(0, day - 40) * 0.0015) + 0.005
  if (has('vein') && day >= 48) neckVeinFlow = 'stagnant'

  return {
    redCellsPct: round(redCellsPct),
    opticNerveMm: round(opticNerveMm, 2),
    visionChange: has('eyes') && day >= 75,
    neckVeinFlow,
    neckVeinClot: false,
    headache,
    sleepHours: round(sleepHours),
    spo2Pct: Math.round(97 + n(4)),
    restingPulseBpm: Math.round(62 + n(5) * 4),
    urineLitres: round(urineLitres),
    resistanceSessions,
    mood: round(mood),
    temperatureC: round(36.7 + n(8) * 0.2),
    systolic: Math.round(116 + n(9) * 5),
    diastolic: Math.round(74 + n(10) * 4),
    glucoseMgDl: Math.round(92 + n(11) * 6),
    whiteCellsK: round(whiteCellsK),
    lymphocytesK: round(lymphocytesK),
    vitaminDNgMl: round(vitaminDNgMl),
    bodyMassKg: round(b.bodyMassKg * (1 - massLoss)),
  }
}
