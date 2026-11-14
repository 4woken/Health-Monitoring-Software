import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  EMPTY_SIZE,
  loadSize,
  mannequinScale,
  parseDimensions,
  readDimensions,
  saveSize,
} from './bodyDimensions'

const { bodies } = JSON.parse(readFileSync('public/anatomy/anatomy.json', 'utf8'))
afterEach(() => vi.unstubAllGlobals())

describe('optional mannequin measurements', () => {
  it('keeps both original reference bodies unchanged when the profile has no measurements', () => {
    for (const build of ['male', 'female'] as const) {
      expect(mannequinScale(build, bodies[build].height, {})).toEqual({ vertical: 1, horizontal: 1 })
    }
  })
  it('scales the entire reference exactly to the entered height and keeps a similar shape without weight', () => {
    const height = bodies.female.height
    const scale = mannequinScale('female', height, { heightCm: 181.5 })
    expect(height * scale.vertical).toBeCloseTo(1.815, 10)
    expect(scale.horizontal).toBe(scale.vertical)
  })
  it('adjusts width with weight at fixed height, with bounded proportions and unchanged height', () => {
    const height = bodies.male.height
    const scales = [10, 65, 76, 92, 400].map((weightKg) => mannequinScale('male', height, { weightKg }))
    expect(scales.map((s) => s.horizontal)).toEqual(
      [...scales.map((s) => s.horizontal)].sort((a, b) => a - b),
    )
    expect(scales.map((s) => s.vertical)).toEqual([1, 1, 1, 1, 1])
    expect(scales[2].horizontal).toBe(1)
    expect(scales[0].horizontal).toBe(0.74)
    expect(scales[4].horizontal).toBe(1.35)
  })
  it('supports partial and omitted dimensions and rejects invalid units or corrupt fields', () => {
    expect(parseDimensions('', '').valid).toBe(true)
    expect(parseDimensions('180,5', '').values).toEqual({ heightCm: 180.5 })
    expect(parseDimensions('180', '55').valid).toBe(true)
    expect(parseDimensions('180', '-1').valid).toBe(false)
    expect(parseDimensions('1.8', '80').valid).toBe(false)
    expect(parseDimensions('', 'Infinity').valid).toBe(false)
    expect(readDimensions({ heightCm: 165, weightKg: 'bad' })).toEqual({ heightCm: 165 })
    expect(readDimensions(null)).toEqual({})
  })
  it('allows a single tape measurement and validates each value independently', () => {
    expect(parseDimensions('', '', '', '77,8')).toMatchObject({ valid: true, values: { waistCm: 77.8 } })
    expect(parseDimensions('', '', '110', '').values).toEqual({ chestCm: 110 })
    expect(parseDimensions('', '', '12', '999').invalid).toEqual(['chestCm', 'waistCm'])
    expect(readDimensions({ heightCm: 172, chestCm: 'missing', waistCm: 84 })).toEqual({
      heightCm: 172,
      waistCm: 84,
    })
  })
  it('remembers by profile on request only, forgets old saved values, and tolerates invalid old storage', () => {
    const map = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    })
    expect(loadSize('crew')).toEqual(EMPTY_SIZE)
    saveSize('crew', { heightCm: 165, weightKg: 62 }, true)
    expect(loadSize('crew')).toEqual({ values: { heightCm: 165, weightKg: 62 }, remembered: true })
    expect(loadSize('other')).toEqual(EMPTY_SIZE)
    saveSize('other', { waistCm: 82 }, true)
    expect(loadSize('other')).toEqual({ values: { waistCm: 82 }, remembered: true })
    saveSize('crew', { heightCm: 169 }, false)
    expect(loadSize('crew')).toEqual(EMPTY_SIZE)
    map.set('pulsar.crew.dimensions.crew', 'unexpected')
    expect(loadSize('crew')).toEqual(EMPTY_SIZE)
    vi.stubGlobal('localStorage', {
      setItem() {
        throw new Error('Quota')
      },
    })
    expect(saveSize('crew', { weightKg: 70 }, true)).toEqual({ values: { weightKg: 70 }, remembered: false })
  })
})
