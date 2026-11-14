// Mission physiology engine. Pure functions, no React, no DOM.
//
// Inputs: gravity (share of Earth's), mission day, radiation dose rate and how much of the
// resistance-exercise programme is done. Outputs: fluid moved toward the head, hip and spine
// bone density, calf muscle volume and cumulative radiation dose.
//
// Every number below points to an entry in health/sources.ts. Where no measurement exists
// (partial gravity, long stays, the size of the exercise effect on bone), the parameter is
// marked as our own assumption and the interface says so. This is an educational model for
// showing trends, not a prediction for a real person.

/** One parameter of the model, with the source that justifies it. */
export interface Parameter {
  value: number
  unit: string
  sourceId: string
  /** True when the value is our own assumption rather than a measurement. */
  demo: boolean
  note: string
}

export const PARAMETERS = {
  /** NASA HHP: about 2 litres move from the lower to the upper body in weightlessness. */
  fluidShiftMaxL: {
    value: 2,
    unit: 'L',
    sourceId: 'FLUID_SHIFT',
    demo: false,
    note: 'Fluid that moves from the legs toward the chest and head in weightlessness.',
  },
  /** Most of the shift happens on mission day one; tau 0.5 day gives 86% after one day. */
  fluidShiftTauDays: {
    value: 0.5,
    unit: 'day',
    sourceId: 'FLUID_SHIFT_TIME',
    demo: true,
    note: 'Time constant fitted to "most of it on mission day one".',
  },
  /** Neck vein area in parabolic flight: 12 mm2 seated at 1 g, 68 at 0.25 g, 103 lying flat. */
  ijvSeated1gMm2: {
    value: 12,
    unit: 'mm2',
    sourceId: 'GRAVITY_PARTIAL',
    demo: false,
    note: 'Seated, Earth gravity.',
  },
  ijvQuarterGMm2: {
    value: 68,
    unit: 'mm2',
    sourceId: 'GRAVITY_PARTIAL',
    demo: false,
    note: 'Seated, a quarter of Earth gravity.',
  },
  ijvSupineMm2: {
    value: 103,
    unit: 'mm2',
    sourceId: 'GRAVITY_PARTIAL',
    demo: false,
    note: 'Lying flat at 1 g. Used here as the stand-in for weightlessness.',
  },
  /** Hip and spine density loss before modern resistance devices: 1 to 1.5% a month. */
  boneLossPctMonth: {
    value: 1.25,
    unit: '%/month',
    sourceId: 'BONE_LOSS',
    demo: false,
    note: 'Middle of the 1 to 1.5% a month range measured on 4 to 6 month missions.',
  },
  /** Resistance exercise gives partial protection. Its exact size at the hip is not settled. */
  boneExerciseProtection: {
    value: 0.5,
    unit: 'share',
    sourceId: 'BONE_EXERCISE',
    demo: true,
    note: 'A full programme halves the loss rate. The direction is published, the size is our choice.',
  },
  /** Calf muscle volume fell 13% over 6 months on the ISS despite the exercise programme. */
  calfLossPct6Months: {
    value: 13,
    unit: '%',
    sourceId: 'MUSCLE_ISS',
    demo: false,
    note: 'MRI of nine crew members after about 180 days, with exercise.',
  },
  /** 90-day bed rest: plantar flexors lost 29% without exercise and 15% with it. */
  calfExerciseKeeps: {
    value: 15 / 29,
    unit: 'share',
    sourceId: 'MUSCLE_BEDREST',
    demo: false,
    note: 'Loss with exercise divided by loss without: about half.',
  },
  /** Bone and muscle unloading scale linearly with missing gravity. Never measured. */
  partialGravityUnloading: {
    value: 1,
    unit: '1 - g',
    sourceId: 'GRAVITY_DEMO',
    demo: true,
    note: 'Loss rates are multiplied by (1 - gravity). No long stay in partial gravity has been measured.',
  },
  /** NASA career limit. */
  careerLimitMSv: {
    value: 600,
    unit: 'mSv',
    sourceId: 'RAD_LIMIT',
    demo: false,
    note: 'Effective dose, any age and sex.',
  },
} satisfies Record<string, Parameter>

const P = PARAMETERS
const DAYS_PER_MONTH = 30.44
const MUSCLE_STUDY_DAYS = 180

export interface PhysiologyInput {
  /** Share of Earth gravity, 0 to 1. */
  gravity: number
  /** Days since launch (can be fractional). */
  day: number
  /** Dose equivalent per day, mSv. */
  doseRateMSvDay: number
  /** Share of the resistance-exercise programme completed, 0 to 1. */
  exercise: number
}

export interface PhysiologyState {
  day: number
  /** Litres moved toward the head. */
  fluidShiftL: number
  /** Share of the full weightless shift reached, 0 to 1. */
  fluidShiftShare: number
  /** Hip and spine bone density, % of pre-flight. */
  bonePct: number
  /** Calf muscle volume, % of pre-flight. */
  musclePct: number
  /** Dose since launch, mSv. */
  doseMSv: number
  /** Share of the 600 mSv career limit used. */
  doseCareerShare: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function clean(input: PhysiologyInput): PhysiologyInput {
  const n = (v: number) => (Number.isFinite(v) ? v : 0)
  return {
    gravity: clamp(n(input.gravity), 0, 1),
    day: Math.max(0, n(input.day)),
    doseRateMSvDay: Math.max(0, n(input.doseRateMSvDay)),
    exercise: clamp(n(input.exercise), 0, 1),
  }
}

/**
 * Share of the weightless fluid shift that remains at a given gravity, 0 to 1.
 * Straight lines through three measured points of neck vein area: 1 at 0 g (lying flat as the
 * stand-in), about 0.62 at 0.25 g, 0 at 1 g seated.
 */
export function fluidShiftFactor(gravity: number): number {
  const g = clamp(Number.isFinite(gravity) ? gravity : 0, 0, 1)
  const span = P.ijvSupineMm2.value - P.ijvSeated1gMm2.value
  const quarter = (P.ijvQuarterGMm2.value - P.ijvSeated1gMm2.value) / span
  if (g <= 0.25) return 1 + (quarter - 1) * (g / 0.25)
  return quarter * (1 - (g - 0.25) / 0.75)
}

/** Loss rates scale with the share of gravity that is missing (demo assumption). */
export const unloading = (gravity: number) => 1 - clamp(gravity, 0, 1)

/** Daily first-order rate of bone loss: density falls by the same share every day. */
export function boneRatePerDay(gravity: number, exercise: number): number {
  const monthly =
    (P.boneLossPctMonth.value / 100) * (1 - P.boneExerciseProtection.value * clamp(exercise, 0, 1))
  return (-Math.log(1 - monthly) / DAYS_PER_MONTH) * unloading(gravity)
}

/**
 * Daily first-order rate of calf muscle loss. The ISS figure (13% in 6 months) was measured
 * with exercise; without it the bed-rest ratio says the loss roughly doubles.
 */
export function muscleRatePerDay(gravity: number, exercise: number): number {
  const withExercise = -Math.log(1 - P.calfLossPct6Months.value / 100) / MUSCLE_STUDY_DAYS
  const without = withExercise / P.calfExerciseKeeps.value
  return (without + (withExercise - without) * clamp(exercise, 0, 1)) * unloading(gravity)
}

export function simulate(raw: PhysiologyInput): PhysiologyState {
  const input = clean(raw)
  const { gravity, day, doseRateMSvDay, exercise } = input
  const fluidShiftShare = fluidShiftFactor(gravity) * (1 - Math.exp(-day / P.fluidShiftTauDays.value))
  const doseMSv = doseRateMSvDay * day
  return {
    day,
    fluidShiftL: P.fluidShiftMaxL.value * fluidShiftShare,
    fluidShiftShare,
    bonePct: 100 * Math.exp(-boneRatePerDay(gravity, exercise) * day),
    musclePct: 100 * Math.exp(-muscleRatePerDay(gravity, exercise) * day),
    doseMSv,
    doseCareerShare: doseMSv / P.careerLimitMSv.value,
  }
}

/** One state per day from launch to `days`, for charts. */
export function trajectory(input: Omit<PhysiologyInput, 'day'>, days: number): PhysiologyState[] {
  const last = Math.max(0, Math.floor(days))
  return Array.from({ length: last + 1 }, (_, day) => simulate({ ...input, day }))
}

/** Days until the career dose limit is reached at this rate, or null when the rate is zero. */
export function daysToCareerLimit(doseRateMSvDay: number): number | null {
  return doseRateMSvDay > 0 ? P.careerLimitMSv.value / doseRateMSvDay : null
}

/** Days until a first-order loss reaches `lossPct` percent, or null when nothing is lost. */
export function daysToLoss(ratePerDay: number, lossPct: number): number | null {
  if (ratePerDay <= 0 || lossPct <= 0 || lossPct >= 100) return null
  return -Math.log(1 - lossPct / 100) / ratePerDay
}

/** One stretch of a mission with constant gravity and dose rate. */
export interface MissionPhase {
  label: string
  days: number
  gravity: number
  doseRateMSvDay: number
}

export interface ProfilePoint extends PhysiologyState {
  /** Index of the phase this day belongs to. */
  phase: number
}

/**
 * Day-by-day simulation of a mission made of phases (for example cruise, surface, cruise).
 * Each day the fluid shift relaxes toward the level for the current gravity, and bone and
 * muscle lose the day's share. Recovery once back in Earth gravity is not modelled.
 * With a single phase it gives exactly the same numbers as simulate() on whole days.
 */
export function simulateProfile(phases: MissionPhase[], exercise: number): ProfilePoint[] {
  const e = clamp(Number.isFinite(exercise) ? exercise : 0, 0, 1)
  const relax = Math.exp(-1 / P.fluidShiftTauDays.value)
  let share = 0,
    bone = 100,
    muscle = 100,
    dose = 0,
    day = 0
  const out: ProfilePoint[] = [
    {
      day: 0,
      phase: 0,
      fluidShiftL: 0,
      fluidShiftShare: 0,
      bonePct: 100,
      musclePct: 100,
      doseMSv: 0,
      doseCareerShare: 0,
    },
  ]
  phases.forEach((ph, index) => {
    const g = clamp(Number.isFinite(ph.gravity) ? ph.gravity : 0, 0, 1)
    const rate = Math.max(0, Number.isFinite(ph.doseRateMSvDay) ? ph.doseRateMSvDay : 0)
    const target = fluidShiftFactor(g)
    const boneDay = Math.exp(-boneRatePerDay(g, e))
    const muscleDay = Math.exp(-muscleRatePerDay(g, e))
    for (let i = 0; i < Math.max(0, Math.floor(ph.days)); i++) {
      day += 1
      share = target + (share - target) * relax
      bone *= boneDay
      muscle *= muscleDay
      dose += rate
      out.push({
        day,
        phase: index,
        fluidShiftL: P.fluidShiftMaxL.value * share,
        fluidShiftShare: share,
        bonePct: bone,
        musclePct: muscle,
        doseMSv: dose,
        doseCareerShare: dose / P.careerLimitMSv.value,
      })
    }
  })
  return out
}

/** Reference missions for the projection. Rates and gravity come from sources.ts. */
export const MISSION_PROFILES = {
  iss: {
    label: 'Six months on the ISS',
    phases: [{ label: 'Station', days: 180, gravity: 0, doseRateMSvDay: 0.73 }],
  },
  mars: {
    label: 'Mars conjunction mission',
    phases: [
      { label: 'Cruise out', days: 180, gravity: 0, doseRateMSvDay: 1.8 },
      { label: 'Mars surface', days: 500, gravity: 0.38, doseRateMSvDay: 0.67 },
      { label: 'Cruise home', days: 180, gravity: 0, doseRateMSvDay: 1.8 },
    ],
  },
} satisfies Record<string, { label: string; phases: MissionPhase[] }>

/** Published total for the same Mars profile (180 + 500 + 180 days), to check the engine. */
export const MARS_PROFILE_PUBLISHED_SV = { value: 1.01, sourceId: 'MARS_MISSION_DOSE' }

/** Gravity of the places the app shows, share of Earth's. */
export const GRAVITY_PRESETS = [
  { label: 'Orbit', gravity: 0 },
  { label: 'Moon', gravity: 0.17 },
  { label: 'Mars', gravity: 0.38 },
  { label: 'Earth', gravity: 1 },
] as const
