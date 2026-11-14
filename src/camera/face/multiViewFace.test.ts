import { expect, it } from 'vitest'
import type { AvatarPoint } from './portrait'
import { normaliseFace } from './portrait'
import templates from '../../body/portrait/referenceHeads.json'
import { faceYawDegrees, reconstructFace } from './multiViewFace'

function image(
  shape: AvatarPoint[],
  yaw: number,
  roll: number,
  width: number,
  height: number,
  scale: number,
) {
  const angle = (yaw * Math.PI) / 180
  const points = shape.map((p) => {
    // Forward model independent of the backprojection, with arbitrary frame translation and pixel scale.
    const x = Math.cos(angle) * p.x - Math.sin(angle) * p.z
    const z = Math.sin(angle) * p.x + Math.cos(angle) * p.z
    return {
      x: 0.48 - ((Math.cos(roll) * x - Math.sin(roll) * p.y) * scale) / width,
      y: 0.43 - ((Math.sin(roll) * x + Math.cos(roll) * p.y) * scale) / height,
      z: -(z * scale) / width,
    }
  })
  return { points, width, height }
}

it.each(['male', 'female'] as const)(
  'recovers asymmetric depth on the %s head from parallax in XY',
  (build) => {
    const shape = templates[build].normalised.map((p, i) => ({ ...p, z: p.z + (i === 1 ? 0.13 : 0) }))
    const front = image(shape, 0, 0.08, 900, 580, 105)
    const left = image(shape, 32, -0.05, 640, 600, 84)
    const right = image(shape, -29, 0.09, 1280, 720, 145)
    // Corrupt the individual network depth prediction in all three images. Only XY supports the true result.
    for (const view of [front, left, right]) view.points[1].z += 0.018
    expect(faceYawDegrees(left)).toBeCloseTo(32, 3)
    expect(faceYawDegrees(right)).toBeCloseTo(-29, 3)
    const baseline = normaliseFace(front.points, front.width, front.height)
    expect(Math.abs(baseline[1].z - shape[1].z)).toBeGreaterThan(0.1)
    const surface = reconstructFace(front, left, right)!
    expect(surface).toHaveLength(468)
    for (const i of [1, 33, 133, 263, 362, 152, 280])
      for (const axis of ['x', 'y', 'z'] as const) expect(surface[i][axis]).toBeCloseTo(shape[i][axis], 4)
  },
)

it('keeps local depth close to the frontal estimate where a side landmark is mistracked', () => {
  const shape = templates.female.normalised
  const front = image(shape, 0, 0, 900, 600, 110)
  const left = image(shape, 32, 0, 640, 600, 90)
  const right = image(shape, -33, 0, 1280, 720, 140)
  left.points[50].x += 0.07
  left.points[50].y -= 0.06
  const surface = reconstructFace(front, left, right)!
  expect(surface[50].z).toBeCloseTo(shape[50].z, 3)
})

it('rejects insufficient baselines, invalid inputs and three images with incompatible projections', () => {
  const shape = templates.male.normalised
  const front = image(shape, 0, 0, 700, 500, 95)
  const left = image(shape, 30, 0, 700, 500, 95)
  const right = image(shape, -30, 0, 700, 500, 95)
  expect(reconstructFace(front, left, left)).toBeNull()
  expect(reconstructFace(front, front, right)).toBeNull()
  expect(reconstructFace(front, left, { ...right, points: [] })).toBeNull()
  for (const [i, point] of left.points.entries())
    if (![10, 33, 133, 152, 263, 362].includes(i)) point.y += (i % 2 === 0 ? 1 : -1) * 0.09
  expect(reconstructFace(front, left, right)).toBeNull()
})
