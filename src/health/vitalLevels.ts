import { LIMITS as L, type Level } from './signals'

/** A vital sign judged on its own: amber to check today, red to act now, and a word that says why. */
export interface VitalLevel {
  level: Level
  /** Empty when the value is normal. */
  word: string
}

const OK: VitalLevel = { level: 'ok', word: '' }

// Each sign uses the limits of the signal it belongs to, so the number and the marker on the body
// never disagree.
export const oxygenLevel = (pct: number): VitalLevel =>
  pct < L.spo2Act ? { level: 'act', word: 'Low' } : pct < L.spo2Watch ? { level: 'watch', word: 'Low' } : OK

export const restingPulseLevel = (bpm: number): VitalLevel =>
  bpm > L.restingPulseMax ? { level: 'watch', word: 'High' } : OK

export const pressureLevel = (systolic: number, diastolic: number): VitalLevel =>
  systolic >= L.systolicHigh || diastolic >= L.diastolicHigh
    ? { level: 'watch', word: 'High' }
    : systolic < L.systolicLow
      ? { level: 'watch', word: 'Low' }
      : OK

export const temperatureLevel = (celsius: number): VitalLevel =>
  celsius >= L.feverHighC
    ? { level: 'act', word: 'Fever' }
    : celsius >= L.feverC
      ? { level: 'watch', word: 'Fever' }
      : OK

export const glucoseLevel = (mgDl: number): VitalLevel =>
  mgDl < L.glucoseVeryLow
    ? { level: 'act', word: 'Very low' }
    : mgDl < L.glucoseLow
      ? { level: 'watch', word: 'Low' }
      : mgDl > L.glucoseHigh
        ? { level: 'watch', word: 'High' }
        : OK

export const sleepLevel = (hours: number): VitalLevel =>
  hours < L.sleepMinHours ? { level: 'watch', word: 'Short' } : OK

/** The radiation reading follows the radiation signal of the day, or of the simulated minute. */
export const radiationLevel = (level: Level): VitalLevel => (level === 'ok' ? OK : { level, word: 'High' })
