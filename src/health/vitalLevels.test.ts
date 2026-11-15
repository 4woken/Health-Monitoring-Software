import { expect, it } from 'vitest'
import { LIMITS } from './signals'
import {
  glucoseLevel,
  oxygenLevel,
  pressureLevel,
  radiationLevel,
  restingPulseLevel,
  sleepLevel,
  temperatureLevel,
} from './vitalLevels'

it('leaves normal values white and says nothing about them', () => {
  expect(oxygenLevel(98)).toEqual({ level: 'ok', word: '' })
  expect(restingPulseLevel(64)).toEqual({ level: 'ok', word: '' })
  expect(pressureLevel(118, 76)).toEqual({ level: 'ok', word: '' })
  expect(temperatureLevel(36.8)).toEqual({ level: 'ok', word: '' })
  expect(glucoseLevel(95)).toEqual({ level: 'ok', word: '' })
  expect(sleepLevel(7.2)).toEqual({ level: 'ok', word: '' })
  expect(radiationLevel('ok')).toEqual({ level: 'ok', word: '' })
})

it('uses the limits of the signals, amber to check and red to act', () => {
  expect(oxygenLevel(LIMITS.spo2Watch - 1)).toEqual({ level: 'watch', word: 'Low' })
  expect(oxygenLevel(LIMITS.spo2Act - 1)).toEqual({ level: 'act', word: 'Low' })
  expect(restingPulseLevel(LIMITS.restingPulseMax + 1)).toEqual({ level: 'watch', word: 'High' })
  expect(pressureLevel(LIMITS.systolicHigh, 80).word).toBe('High')
  expect(pressureLevel(120, LIMITS.diastolicHigh).level).toBe('watch')
  expect(pressureLevel(LIMITS.systolicLow - 1, 60)).toEqual({ level: 'watch', word: 'Low' })
  expect(temperatureLevel(LIMITS.feverC).level).toBe('watch')
  expect(temperatureLevel(LIMITS.feverHighC).level).toBe('act')
  expect(glucoseLevel(LIMITS.glucoseLow - 1)).toEqual({ level: 'watch', word: 'Low' })
  expect(glucoseLevel(LIMITS.glucoseVeryLow - 1).level).toBe('act')
  expect(glucoseLevel(LIMITS.glucoseHigh + 1)).toEqual({ level: 'watch', word: 'High' })
  expect(sleepLevel(LIMITS.sleepMinHours - 0.5)).toEqual({ level: 'watch', word: 'Short' })
  expect(radiationLevel('act')).toEqual({ level: 'act', word: 'High' })
})
