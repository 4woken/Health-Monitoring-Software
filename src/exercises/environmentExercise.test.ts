import { expect, it } from 'vitest'
import { environmentMotion } from './environmentExercise'

it('selects equipment by cabin in microgravity and surface movement by the selected gravity', () => {
  expect(environmentMotion('station', 0)).toBe('cycle')
  expect(environmentMotion('spacecraft', 0)).toBe('row')
  expect(environmentMotion('base', 0.17)).toBe('step')
  expect(environmentMotion('planet', 0.38)).toBe('march')
  expect(environmentMotion('base', 0)).toBe('ankle')
  expect(environmentMotion('base', 0.38)).toBe('march')
  for (const g of [0, 0.17, 0.38]) expect(environmentMotion('rover', g)).toBe('ankle')
})
