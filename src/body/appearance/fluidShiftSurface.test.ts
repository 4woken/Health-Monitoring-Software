import { readFileSync } from 'node:fs'
import { BufferAttribute, BufferGeometry } from 'three'
import { expect, it } from 'vitest'
import { attachFluidShift } from './fluidShiftSurface'

it.each(['male', 'female'])('keeps the %s face landmarks and feet fixed at maximum fluid shift', (build) => {
  const prefix = 'public/human/' + build
  const model = JSON.parse(readFileSync(prefix + '.json', 'utf8'))
  const { verts, pos } = model.skin
  const raw = Uint8Array.from(readFileSync(prefix + '.bin')).buffer
  const coordinates = new Float32Array((verts + 1) * 3)
  coordinates.set(new Float32Array(raw, pos, verts * 3))
  const [right, left] = model.eyes.map((eye: { center: number[] }) => eye.center)
  const head = {
    x: (left[0] + right[0]) / 2,
    y: (left[1] + right[1]) / 2,
    eyeZ: (left[2] + right[2]) / 2,
    eyeDistance: Math.abs(left[0] - right[0]),
  }
  // A merged portrait is allowed to append vertices after the reference skin.
  coordinates.set([head.x + 0.78 * head.eyeDistance, head.y - 0.61 * head.eyeDistance, head.eyeZ], verts * 3)
  const geometry = new BufferGeometry()
  const position = new BufferAttribute(coordinates, 3)
  geometry.setAttribute('position', position)
  attachFluidShift(geometry, head, model.height, verts)
  const offsets = geometry.getAttribute('fluidOffset')
  const lips = new Set<number>(model.regions.lips)
  const cheeks = [0, 0],
    calves = [0, 0]
  let protectedDisplacement = 0
  for (let i = 0; i < verts; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i)
    const magnitude = Math.hypot(offsets.getX(i), offsets.getY(i))
    const leg = Number(x > head.x)
    const level = y / model.height
    if (level > 0.82) cheeks[leg] = Math.max(cheeks[leg], magnitude)
    else calves[leg] = Math.max(calves[leg], magnitude)
    const nearEye = model.eyes.some(
      ({ center, radius }: { center: number[]; radius: number }) =>
        Math.hypot(x - center[0], y - center[1], z - center[2]) <= radius + 0.003,
    )
    if (
      nearEye ||
      lips.has(i) ||
      (level > 0.82 && Math.abs(x - head.x) < 0.33 * head.eyeDistance) ||
      level < 0.095 ||
      (level >= 0.305 && level < 0.82)
    )
      protectedDisplacement = Math.max(protectedDisplacement, magnitude)
  }
  expect(protectedDisplacement).toBe(0)
  for (const peak of cheeks) {
    expect(peak).toBeGreaterThan(0.002)
    expect(peak).toBeLessThanOrEqual(0.002801)
  }
  for (const peak of calves) {
    expect(peak).toBeGreaterThan(0.0015)
    expect(peak).toBeLessThanOrEqual(0.003001)
  }
  expect([offsets.getX(verts), offsets.getY(verts)]).toEqual([0, 0])
})
