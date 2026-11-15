// One person's day: what is known about them, how fresh each value is, and the signals it gives.
// Values come from a SIMULATED device feed: wearables report daily, ultrasound and blood tests
// only on their scheduled days, so some values are days old. The person's own self-tests are real
// measurements and are added on top: a camera pulse taken today, camera-counted resistance sets and
// a vision change found by the vision test.

import type { Member } from '../crew/roster'
import { MISSIONS, missionDay, type MissionId } from '../mission/missions'
import { latestOn, testFacts } from '../selftests/facts'
import { resultsOf } from '../selftests/results'
import { METRICS, type MetricId } from './metrics'
import { cabinOn, readingsOn } from './simulation'
import { assess, type Readings, type Signal, type SignalId } from './signals'
import { medicalRecord } from './medicalRecords'
import { exampleDosimetry, ORGANS, organExposure } from './dosimetry'
import { reviewEye } from './ocular'

interface Schedule {
  /** Where the value comes from. */
  source: string
  /** A new measurement every this many days. */
  every: number
  /** Older than this many days, the value is out of date (demo values, not a NASA schedule). */
  freshFor: number
  /** True when the value arrives by itself; false when someone has to take it. */
  automatic: boolean
}

export const SCHEDULE: Record<SignalId, Schedule> = {
  oxygen: { source: 'Wearable sensor', every: 1, freshFor: 1, automatic: true },
  sleep: { source: 'Wearable sensor', every: 1, freshFor: 1, automatic: true },
  loading: { source: 'Exercise device log', every: 1, freshFor: 1, automatic: true },
  cabinAir: { source: 'Cabin sensor', every: 1, freshFor: 1, automatic: true },
  radiation: { source: 'Dosimeter', every: 1, freshFor: 1, automatic: true },
  headache: { source: 'Told by the person', every: 1, freshFor: 1, automatic: false },
  mood: { source: 'Told by the person', every: 1, freshFor: 1, automatic: false },
  hydration: { source: 'Urine log', every: 1, freshFor: 1, automatic: false },
  bodyChecks: { source: 'Health kit', every: 1, freshFor: 1, automatic: false },
  bodyMass: { source: 'Body mass device', every: 7, freshFor: 10, automatic: false },
  opticNerve: { source: 'Eye ultrasound', every: 14, freshFor: 10, automatic: false },
  neckVein: { source: 'Neck ultrasound', every: 14, freshFor: 10, automatic: false },
  redCells: { source: 'Blood analyser', every: 30, freshFor: 21, automatic: false },
  immunity: { source: 'Blood analyser', every: 30, freshFor: 21, automatic: false },
  vitaminD: { source: 'Blood sample', every: 60, freshFor: 75, automatic: false },
  balance: { source: 'Your self-tests', every: 1, freshFor: 14, automatic: false },
}

/** Day of the latest measurement of a signal, on or before `day`. */
export const lastTaken = (id: SignalId, day: number) => day - ((day - 1) % SCHEDULE[id].every)

export interface Freshness {
  source: string
  takenDay: number
  ageDays: number
  outdated: boolean
  /** Next scheduled measurement, for values not taken every day. */
  nextDay: number | null
  automatic: boolean
  /** Nothing measured yet: only the person's own self-tests give this value. */
  never?: boolean
}

export function freshness(id: SignalId, day: number, lastDay = Infinity): Freshness {
  const s = SCHEDULE[id]
  const takenDay = lastTaken(id, day)
  return {
    source: s.source,
    takenDay,
    ageDays: day - takenDay,
    outdated: day - takenDay > s.freshFor,
    nextDay: s.every > 1 && takenDay + s.every <= lastDay ? takenDay + s.every : null,
    automatic: s.automatic,
  }
}

/** Each value as of its latest measurement, with the person's own self-tests of that day. */
export function readingsFor(member: Member, day: number, mission: MissionId): Readings {
  const at = (id: SignalId) => readingsOn(member, lastTaken(id, day), mission)
  const eye = at('opticNerve')
  const vein = at('neckVein')
  const blood = at('redCells')
  const cells = at('immunity')
  const today = readingsOn(member, day, mission)
  const tests = testFacts(member.id, day)
  return {
    ...today,
    visionChange: today.visionChange || tests.vision?.changed === true,
    restingPulseBpm: tests.measuredPulseBpm ?? today.restingPulseBpm,
    // A set counted by the camera is a resistance session; there is at most one a day.
    resistanceSessions: Math.min(7, today.resistanceSessions + tests.exerciseDays),
    opticNerveMm: eye.opticNerveMm,
    neckVeinFlow: vein.neckVeinFlow,
    neckVeinClot: vein.neckVeinClot,
    redCellsPct: blood.redCellsPct,
    whiteCellsK: cells.whiteCellsK,
    lymphocytesK: cells.lymphocytesK,
    vitaminDNgMl: at('vitaminD').vitaminDNgMl,
    bodyMassKg: at('bodyMass').bodyMassKg,
  }
}

export interface DayReport {
  member: Member
  day: number
  readings: Readings
  /** Most serious first. */
  signals: Signal[]
  freshness: Record<SignalId, Freshness>
}

/** How fresh the balance signal is: as fresh as the latest balance or hand test. */
function testFreshness(memberId: string, day: number): Freshness {
  const results = resultsOf(memberId)
  const last = [latestOn(results, 'balance', day), latestOn(results, 'dexterity', day)]
    .filter((r) => r !== undefined)
    .sort((a, b) => b.day - a.day)[0]
  const source = SCHEDULE.balance.source
  if (!last)
    return {
      source,
      takenDay: day,
      ageDays: 0,
      outdated: false,
      nextDay: null,
      automatic: false,
      never: true,
    }
  const ageDays = day - last.day
  return {
    source,
    takenDay: last.day,
    ageDays,
    outdated: ageDays > SCHEDULE.balance.freshFor,
    nextDay: null,
    automatic: false,
  }
}

export function medicalSignals(
  signals: Signal[],
  memberId: string,
  day: number,
  mission: MissionId,
): Signal[] {
  const medical = medicalRecord(memberId, mission)
  const organData = medical.dosimetry ?? exampleDosimetry(day)
  const over = ORGANS.map((o) => organExposure(organData, o, day)).filter((r) => r.exceeded)
  const radiation = signals.find((s) => s.id === 'radiation')!
  const eye = signals.find((s) => s.id === 'opticNerve')!
  radiation.sources = [...radiation.sources, 'RAD_ORGAN_MODEL', 'RAD_ORGAN_LIMITS']
  if (over.length) {
    radiation.level = 'act'
    radiation.meaning = `${over.map((r) => r.limits.name).join(', ')}: at the dose limit for this period. See the dose by organ below.`
    radiation.advice = 'Go over your exposure and the shielding with the radiation team.'
  }
  const lens = over.find((r) => r.organ === 'lens')
  if (lens) {
    eye.level = 'act'
    eye.title = 'Eye lens radiation'
    eye.value = `${lens.mission.dose.toFixed(1)} mGy-Eq at the eye lens this mission`
    eye.sources = [...eye.sources, 'RAD_ORGAN_MODEL', 'RAD_ORGAN_LIMITS']
    eye.meaning =
      'The dose at your eye lens has reached its limit. That is a radiation risk for the lens, separate from the eye syndrome of spaceflight.'
    eye.advice = 'Go over your lens dose and past exposure with the radiation team and the flight surgeon.'
  }
  if (medical.ocular) {
    const findings = [reviewEye(medical.ocular.left), reviewEye(medical.ocular.right)].flatMap(
      (r) => r.findings,
    )
    eye.sources = [...eye.sources, 'SANS_EXAM_CRITERIA']
    if (findings.length) {
      const examination = `Your last eye exam needs a second look (${[...new Set(findings)].join('; ').toLowerCase()}). That is not a diagnosis on its own.`
      if (eye.level === 'act') eye.meaning += ` ${examination}`
      else {
        eye.level = 'watch'
        eye.meaning = examination
        eye.advice = 'Show the exam to the flight surgeon.'
      }
    }
  }
  signals.sort((a, b) => ({ ok: 0, watch: 1, act: 2 })[b.level] - { ok: 0, watch: 1, act: 2 }[a.level])
  return signals
}

export function dayReport(member: Member, day: number, mission: MissionId): DayReport {
  day = missionDay(mission, day)
  const readings = readingsFor(member, day, mission)
  const signals = medicalSignals(
    assess(readings, member.baseline, cabinOn(day, mission), testFacts(member.id, day)),
    member.id,
    day,
    mission,
  )
  const fresh = Object.fromEntries(
    signals.map((s) => [
      s.id,
      s.id === 'balance' ? testFreshness(member.id, day) : freshness(s.id, day, MISSIONS[mission].days),
    ]),
  )
  return { member, day, readings, signals, freshness: fresh as Record<SignalId, Freshness> }
}

/** One metric over the last `span` days (no days before launch), with the value before launch. */
export function history(member: Member, metric: MetricId, day: number, mission: MissionId, span = 30) {
  day = missionDay(mission, day)
  const m = METRICS[metric]
  const count = Math.min(span, day)
  const values = Array.from({ length: count }, (_, i) => {
    const d = day - count + 1 + i
    return m.read(readingsFor(member, d, mission), cabinOn(d, mission))
  })
  return { values, before: m.before?.(member.baseline) }
}
