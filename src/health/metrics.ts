// The numbers behind the signals: each metric is one value a trend line can follow.

import type { Baseline, Cabin, Readings, SignalId } from './signals'

export interface Metric {
  label: string
  unit: string
  /** How a change is said, when "unit" would read oddly (a change in % is in percentage points). */
  changeUnit?: string
  read: (r: Readings, cabin: Cabin) => number
  /** This person's value before launch, when there is one. */
  before?: (b: Baseline) => number
}

const LIST = {
  redCells: {
    label: 'Red cell share (hematocrit)',
    unit: '%',
    changeUnit: 'percentage points',
    read: (r) => r.redCellsPct,
    before: (b) => b.redCellsPct,
  },
  opticNerve: {
    label: 'Optic nerve sheath',
    unit: 'mm',
    read: (r) => r.opticNerveMm,
    before: (b) => b.opticNerveMm,
  },
  sleep: { label: 'Sleep, 7-night average', unit: 'h a night', read: (r) => r.sleepHours },
  spo2: { label: 'Blood oxygen', unit: '%', changeUnit: 'percentage points', read: (r) => r.spo2Pct },
  pulse: { label: 'Resting pulse', unit: 'bpm', read: (r) => r.restingPulseBpm },
  urine: { label: 'Urine in 24 h', unit: 'L', read: (r) => r.urineLitres },
  resistance: { label: 'Resistance sessions', unit: 'in 7 days', read: (r) => r.resistanceSessions },
  mood: { label: 'Mood, 7-day average', unit: 'out of 5', read: (r) => r.mood },
  systolic: { label: 'Systolic blood pressure', unit: 'mmHg', read: (r) => r.systolic },
  diastolic: { label: 'Diastolic blood pressure', unit: 'mmHg', read: (r) => r.diastolic },
  glucose: { label: 'Blood sugar', unit: 'mg/dL', read: (r) => r.glucoseMgDl },
  temperature: { label: 'Body temperature', unit: '°C', read: (r) => r.temperatureC },
  whiteCells: {
    label: 'White blood cells',
    unit: 'thousand/µL',
    read: (r) => r.whiteCellsK,
    before: (b) => b.whiteCellsK,
  },
  lymphocytes: {
    label: 'Lymphocytes',
    unit: 'thousand/µL',
    read: (r) => r.lymphocytesK,
    before: (b) => b.lymphocytesK,
  },
  vitaminD: { label: 'Vitamin D', unit: 'ng/mL', read: (r) => r.vitaminDNgMl, before: (b) => b.vitaminDNgMl },
  bodyMass: { label: 'Body mass', unit: 'kg', read: (r) => r.bodyMassKg, before: (b) => b.bodyMassKg },
  co2: { label: 'Cabin CO2', unit: 'mmHg', read: (_, cabin) => cabin.co2MmHg },
  dose: { label: 'Radiation dose since launch', unit: 'mSv', read: (_, cabin) => cabin.doseMSv },
} satisfies Record<string, Metric>

export type MetricId = keyof typeof LIST
export const METRICS: Record<MetricId, Metric> = LIST

/** The metrics each signal is made of, main one first. Neck vein flow is a category, not a number. */
export const SIGNAL_METRICS: Record<SignalId, MetricId[]> = {
  opticNerve: ['opticNerve'],
  headache: ['co2'],
  sleep: ['sleep'],
  mood: ['mood'],
  balance: [],
  neckVein: [],
  oxygen: ['spo2', 'pulse'],
  bodyChecks: ['systolic', 'diastolic', 'glucose', 'temperature'],
  redCells: ['redCells'],
  immunity: ['whiteCells', 'lymphocytes'],
  hydration: ['urine'],
  loading: ['resistance'],
  vitaminD: ['vitaminD'],
  bodyMass: ['bodyMass'],
  cabinAir: ['co2'],
  radiation: ['dose'],
}

/** Summary of a trend, with the value before launch kept out of the observed range. */
export function describeSeries(values: number[], before?: number) {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) return null
  const latest = values[values.length - 1]
  return {
    latest,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    change: latest - values[0],
    sinceLaunch: before === undefined ? null : latest - before,
    sinceLaunchPct:
      before === undefined || before === 0 ? null : ((latest - before) / Math.abs(before)) * 100,
  }
}

export const formatMetric = (value: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value)
export const signedMetric = (value: number) => `${value > 0 ? '+' : ''}${formatMetric(value)}`
