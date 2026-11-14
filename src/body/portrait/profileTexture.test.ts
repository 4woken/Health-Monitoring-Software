import { expect, it } from 'vitest'
import { writeProfileUV } from './profileTexture'

const pt = (x: number, y: number) => ({ x, y, z: 0 })
const view = (cheek: number, height = 500) => {
  const points = Array.from({ length: 468 }, () => pt(0.5, 0.5))
  points[10] = pt(0.5, 0.15)
  points[152] = pt(0.5, 0.85)
  points[0] = pt(0.4, 0.6)
  points[1] = pt(0.4 + cheek, 0.6)
  points[2] = pt(0.4, 0.7)
  return { points, width: height, height }
}
const binding = [{ vertex: 0, triangle: [0, 1, 2], weights: [0.3, 0.3, 0.4], feather: 1, boundary: 1 }]
function blend(x: number, y: number, left: number, right: number) {
  const uv = new Float32Array(4),
    mix = new Float32Array(2)
  writeProfileUV(
    binding,
    Array.from({ length: 3 }, () => pt(x, y)),
    view(0.1),
    { left: view(left, 800), right: view(right, 310) },
    uv,
    mix,
  )
  return { uv: [...uv], mix: [...mix] }
}
it('sources the visible cheek from the oblique photo at its own coordinates, without sampling the folded side', () => {
  const { mix, uv } = blend(0.9, -0.4, 0.22, -0.04)
  expect(mix[0]).toBeGreaterThan(0.8)
  expect(mix[1]).toBe(0)
  expect(uv[0]).toBeCloseTo(0.4 + 0.3 * 0.22)
  expect(uv[1]).toBeCloseTo(0.36)
  expect(blend(0.9, -0.4, -0.04, 0.22).mix).toEqual(mix.reverse())
})
it('retains frontal details at the eyes and nose and does not confuse resolution with a better viewing angle', () => {
  expect(blend(0.5, 0, 0.22, 0.3).mix).toEqual([0, 0])
  expect(blend(0.2, -0.2, 0.22, 0.3).mix).toEqual([0, 0])
  expect(blend(0.9, -0.4, 0.1, 0.1).mix).toEqual([0, 0])
  const { mix } = blend(0.9, -0.4, 0.25, 0.26)
  expect(mix[0] + mix[1]).toBeLessThanOrEqual(1)
})
