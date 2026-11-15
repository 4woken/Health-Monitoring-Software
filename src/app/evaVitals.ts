// SIMULATED readings for a spacewalk, shown in the AR view. Pulsar has no suit sensors, so these are
// plausible values built from the person's resting pulse, not measurements.
//
// The orders of magnitude follow NASA's EVA data: Apollo lunar EVAs averaged about 234 kcal/h
// (NTRS 19760004083), and NASA estimates EVA metabolic rate from heart rate, which rises well above
// rest during suited work (NTRS 20210024317). In pure oxygen at suit pressure the blood stays well
// oxygenated, and the cooling garment keeps the core within a few tenths of a degree.

export interface EvaVitals {
  bpm: number
  breathsPerMinute: number
  spo2Pct: number
  coreTempC: number
  /** Energy spent, kcal per hour. */
  kcalPerHour: number
  /** CO2 in the suit's air, mmHg. */
  suitCo2MmHg: number
}

/** The spacewalk has been going on for this long when the view opens, seconds. */
export const EVA_START_S = 72 * 60

/**
 * Readings `seconds` into a spacewalk: the work comes in tasks of about a minute and a half, and
 * walking under gravity on the Moon or Mars costs more than moving hand over hand in weightlessness.
 */
export function evaVitals(restingBpm: number, gravity: number, seconds: number): EvaVitals {
  const work = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((2 * Math.PI * seconds) / 90))
  const surface = gravity > 0 ? 1.15 : 1
  const wobble = Math.sin(seconds / 7) * 2 + Math.sin(seconds / 2.3)
  return {
    bpm: Math.round(restingBpm + (28 + 42 * work) * surface + wobble),
    breathsPerMinute: Math.round(15 + 9 * work * surface),
    spo2Pct: work > 0.85 ? 98 : 99,
    coreTempC: Number((37 + 0.35 * Math.min(1, seconds / 3600) + 0.15 * work).toFixed(1)),
    kcalPerHour: Math.round((140 + 180 * work) * surface),
    suitCo2MmHg: Number((1.1 + 1.7 * work).toFixed(1)),
  }
}

/** "1:12:05" */
export function clockText(seconds: number) {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
