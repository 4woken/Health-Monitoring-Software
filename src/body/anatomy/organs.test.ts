import { expect, it } from 'vitest'
import anatomy from '../../../public/anatomy/anatomy.json'
import { organNote, organOpacity } from './organs'

it.each(['male', 'female'] as const)('keeps the %s heart visible through the organ stop', (build) => {
  const model = anatomy.bodies[build]
  const heart = model.organs.find((mesh) => mesh.name === 'heart')
  expect(heart?.tris).toBeGreaterThan(0)
  const layer = organNote(heart!.name).layer
  expect([1, 2, 2.5, 3].map((depth) => organOpacity(layer, depth))).toEqual([1, 1, 0.5, 0])
  expect(organOpacity(organNote('aorta').layer, 2)).toBe(0)
})
