/** NASA-TM-20220006594 §2.2 / TARIS: weighting AFTER transport to an organ.
 * This module is not a radiation transport solver and never converts ambient mSv into organ mGy.
 */
export const RBE = {
  proton: 1.5,
  heavyIon: 2.5,
  neutronBelow1MeV: 5,
  neutron1To5MeV: 6,
  neutronAbove5MeV: 3.5,
} as const
export type Particle = keyof typeof RBE
export type AbsorbedDose = Record<Particle, number>
export const ORGAN_LIMITS = {
  lens: { name: 'Eye lens', month: 1000, year: 2000, career: 4000 },
  skin: { name: 'Skin', month: 1500, year: 3000, career: 6000 },
  marrow: { name: 'Blood-forming organs', month: 250, year: 500, career: null },
  circulatory: { name: 'Heart & arteries', month: 250, year: 500, career: 1000 },
} as const
export type Organ = keyof typeof ORGAN_LIMITS
export const ORGANS = Object.keys(ORGAN_LIMITS) as Organ[]
export const DOSIMETRY_SOURCE =
  'https://ntrs.nasa.gov/api/citations/20220006594/downloads/NASA-TM-20220006594.pdf'
export const ORGAN_LIMIT_SOURCE = 'https://www.nasa.gov/reference/4-0-human-performance/'
export interface DoseInterval {
  id: string
  organ: Organ
  /** Elapsed Earth days since launch, half-open interval [startDay, endDay). */
  startDay: number
  endDay: number
  /** Organ-averaged absorbed dose IN THIS INTERVAL, in mGy, for each particle class. */
  absorbedMGy: AbsorbedDose
}
export interface DoseDataset {
  schema: 'pulsar.organ-dose.v1'
  origin: 'simulated' | 'transport-model' | 'instrument'
  source: string
  /** Prior history is independently supplied in mGy-Eq; null means unknown, never zero. */
  priorCareerMGyEq: Record<Organ, number | null>
  intervals: DoseInterval[]
}
const validNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

export function validateDosimetry(value: unknown): DoseDataset {
  const d = value as DoseDataset
  if (
    !d ||
    d.schema !== 'pulsar.organ-dose.v1' ||
    !['simulated', 'transport-model', 'instrument'].includes(d.origin) ||
    typeof d.source !== 'string' ||
    !d.source.trim() ||
    !Array.isArray(d.intervals) ||
    d.intervals.length > 20000
  )
    throw new Error('Use a pulsar.organ-dose.v1 dataset with a source and organ absorbed doses in mGy.')
  for (const organ of ORGANS)
    if (d.priorCareerMGyEq?.[organ] !== null && !validNumber(d.priorCareerMGyEq?.[organ]))
      throw new Error('Supply each prior career dose, or null when unknown.')
  const ids = new Set<string>()
  const ends: Partial<Record<Organ, number>> = {}
  const sorted = [...d.intervals].sort((a, b) => a.startDay - b.startDay)
  for (const r of sorted) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !r.id ||
      ids.has(r.id) ||
      !ORGANS.includes(r.organ) ||
      !validNumber(r.startDay) ||
      !validNumber(r.endDay) ||
      r.endDay <= r.startDay ||
      Object.keys(RBE).some((p) => !validNumber(r.absorbedMGy?.[p as Particle]))
    )
      throw new Error(
        'Dose intervals require unique IDs, valid organs, positive durations and finite non-negative mGy values in every particle bin.',
      )
    if ((ends[r.organ] ?? 0) > r.startDay)
      throw new Error('Overlapping intervals would double-count this organ dose.')
    ids.add(r.id)
    ends[r.organ] = r.endDay
  }
  return { ...d, intervals: sorted }
}
export function grayEquivalent(dose: AbsorbedDose): number {
  return (Object.keys(RBE) as Particle[]).reduce((total, p) => {
    if (!validNumber(dose[p])) throw new Error('Absorbed organ dose must be finite and non-negative')
    return total + dose[p] * RBE[p]
  }, 0)
}
export function organExposure(dataset: DoseDataset, organ: Organ, asOfDay: number) {
  if (!validNumber(asOfDay)) throw new Error('Invalid exposure time')
  const records = dataset.intervals.filter((r) => r.organ === organ)
  const window = (days: number) => {
    const from = Math.max(0, asOfDay - days)
    let dose = 0,
      coverage = 0
    for (const r of records) {
      const overlap = Math.max(0, Math.min(asOfDay, r.endDay) - Math.max(from, r.startDay))
      // Piecewise constant dose rate within each supplied interval. Short intervals give finer windows.
      dose += (grayEquivalent(r.absorbedMGy) * overlap) / (r.endDay - r.startDay)
      coverage += overlap
    }
    return {
      dose,
      coveredDays: coverage,
      requestedDays: Number.isFinite(days) ? days : asOfDay,
      // Prior-career totals cannot fill a missing prelaunch 30/365-day time series.
      complete: Math.abs(coverage - (Number.isFinite(days) ? days : asOfDay)) < 1e-8,
    }
  }
  const mission = window(Infinity),
    month = window(30),
    year = window(365)
  const prior = dataset.priorCareerMGyEq[organ]
  const career = prior === null || !mission.complete ? null : prior + mission.dose
  const careerLowerBound = (prior ?? 0) + mission.dose
  const limits = ORGAN_LIMITS[organ]
  const exceeded =
    month.dose >= limits.month ||
    year.dose >= limits.year ||
    (limits.career !== null && careerLowerBound >= limits.career)
  return { organ, month, year, mission, career, careerLowerBound, exceeded, limits }
}

/** Deliberately synthetic reference field, independent of destination; no invented shielding/organ factors. */
export function exampleDosimetry(day: number): DoseDataset {
  const duration = Math.max(1, day)
  const daily: AbsorbedDose = {
    proton: 0.12,
    heavyIon: 0.015,
    neutronBelow1MeV: 0.008,
    neutron1To5MeV: 0.004,
    neutronAbove5MeV: 0.003,
  }
  return {
    schema: 'pulsar.organ-dose.v1',
    origin: 'simulated',
    source:
      'Synthetic uniform organ field for demonstrating NASA RBE arithmetic. Not a Mars/ISS measurement or transport prediction.',
    priorCareerMGyEq: { lens: null, skin: null, marrow: null, circulatory: null },
    intervals: ORGANS.map((organ) => ({
      id: `example-${organ}`,
      organ,
      startDay: 0,
      endDay: duration,
      absorbedMGy: Object.fromEntries(
        Object.entries(daily).map(([p, n]) => [p, n * duration]),
      ) as AbsorbedDose,
    })),
  }
}
