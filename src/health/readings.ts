// One person's day: what is known about them, how fresh each value is, and the signals it gives.
// Values come from a SIMULATED device feed: wearables report daily, ultrasound and blood tests
// only on their scheduled days, so some values are days old.

import type { Member } from '../crew/roster'
import { MISSIONS, missionDay, type MissionId } from '../mission/missions'
import { METRICS, type MetricId } from './metrics'
import { cabinOn, readingsOn } from './simulation'
import { assess, type Readings, type Signal, type SignalId } from './signals'

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

/** Each value as of its latest measurement. */
export function readingsFor(member: Member, day: number, mission: MissionId): Readings {
  const at = (id: SignalId) => readingsOn(member, lastTaken(id, day), mission)
  const eye = at('opticNerve')
  const vein = at('neckVein')
  const blood = at('redCells')
  const cells = at('immunity')
  return {
    ...readingsOn(member, day, mission),
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

export function dayReport(member: Member, day: number, mission: MissionId): DayReport {
  day = missionDay(mission, day)
  const readings = readingsFor(member, day, mission)
  const signals = assess(readings, member.baseline, cabinOn(day, mission))
  const fresh = Object.fromEntries(signals.map((s) => [s.id, freshness(s.id, day, MISSIONS[mission].days)]))
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
