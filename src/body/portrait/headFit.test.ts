import referenceHeads from './referenceHeads.json'
import { expect, it } from 'vitest'
import {
  bindFaceToHead,
  bindPortraitNormals,
  updateFaceUV,
  fitHeadSurface,
  registeredHeadTemplate,
} from './headFit'
const face = [
  { x: -1, y: 1, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: -1, y: -1, z: 0 },
]
const head = { x: 0, y: 1.6, eyeDistance: 0.06, eyeZ: 0.05 }
const positions = new Float32Array([
  0, 1.6, 0.09, 0, 1.4, 0.09, 0, 1.6, -0.07, 0.2, 1.6, 0.09, 0.06, 1.6, 0.09,
])
const triangles = [0, 1, 2, 0, 2, 3],
  oval = [0, 1, 2, 3]
it('binds the facial front with a feathered boundary and leaves neck, back, scalp and source geometry intact', () => {
  const original = positions.slice(),
    bound = bindFaceToHead(positions, face, triangles, oval, head)
  expect(bound.map((b) => b.vertex)).toEqual([0, 4])
  expect(bound[0].feather).toBeGreaterThan(0.99)
  expect(bound[1].feather).toBeLessThan(0.001)
  expect(positions).toEqual(original)
})
it('updates texture coordinates from changing camera landmarks without moving the body', () => {
  const bindings = bindFaceToHead(positions, face, triangles, oval, head),
    uv = new Float32Array(10)
  const frame = [
    { x: 0.2, y: 0.2, z: 0 },
    { x: 0.8, y: 0.2, z: 0 },
    { x: 0.8, y: 0.8, z: 0 },
    { x: 0.2, y: 0.8, z: 0 },
  ]
  updateFaceUV(bindings, frame, uv)
  expect(uv[0]).toBeCloseTo(0.5)
  expect(uv[1]).toBeCloseTo(0.5)
  updateFaceUV(
    bindings,
    frame.map((p) => ({ ...p, x: p.x + 0.05 })),
    uv,
  )
  expect(uv[0]).toBeCloseTo(0.55)
  expect(uv[1]).toBeCloseTo(0.5)
})

it('adapts facial shape without moving the neck or back, and restores the exact reference at zero strength', () => {
  const bindings = bindFaceToHead(positions, face, triangles, oval, head),
    output = new Float32Array(positions.length),
    original = positions.slice()
  const personal = face.map((p) => ({ ...p, y: p.y - 0.2, z: 0.1 }))
  fitHeadSurface(positions, output, bindings, face, personal, head, {
    scale: 1,
    x: 0,
    y: 0,
    skinMatch: 1,
    shape: 1,
  })
  expect(output[1]).toBeCloseTo(positions[1] - 0.012)
  expect(output[2]).toBeCloseTo(positions[2] + 0.006)
  expect(output.slice(3, 12)).toEqual(positions.slice(3, 12))
  expect(output.slice(12)).toEqual(positions.slice(12))
  fitHeadSurface(positions, output, bindings, face, personal, head, {
    scale: 1,
    x: 0,
    y: 0,
    skinMatch: 1,
    shape: 0,
  })
  expect(output).toEqual(positions)
  expect(positions).toEqual(original)
})
it('bounds estimated depth so noisy monocular landmarks cannot spike the reference head', () => {
  const bindings = bindFaceToHead(positions, face, triangles, oval, head),
    output = new Float32Array(positions.length)
  fitHeadSurface(
    positions,
    output,
    bindings,
    face,
    face.map((p) => ({ ...p, z: 100 })),
    head,
  )
  expect(output[2] - positions[2]).toBeLessThanOrEqual(0.012001)
})

it.each(['male', 'female'] as const)(
  'centres both eyes on the %s head template before retargeting any portrait',
  (build) => {
    const template = registeredHeadTemplate(referenceHeads[build].points, head)
    expect(template).toHaveLength(468)
    for (const point of template) expect(Object.values(point).every(Number.isFinite)).toBe(true)
    const centre = (a: number, b: number) => ({
      x: (template[a].x + template[b].x) / 2,
      y: (template[a].y + template[b].y) / 2,
    })
    expect(centre(33, 133).x).toBeCloseTo(0.5, 6)
    expect(centre(362, 263).x).toBeCloseTo(-0.5, 6)
    expect(centre(33, 133).y).toBeCloseTo(0, 6)
    expect(centre(362, 263).y).toBeCloseTo(0, 6)
  },
)

it('admits corroborated profile depth in the centre while letting it taper into the temples and the face outline', () => {
  const skin = new Float32Array([0, 1.6, 0.09, 0, 1.6, 0.025001, 0.06, 1.6, 0.09])
  const output = skin.slice()
  const bindings = bindFaceToHead(skin, face, triangles, oval, head)
  fitHeadSurface(
    skin,
    output,
    bindings,
    face,
    face.map((p) => ({ ...p, z: 1 })),
    head,
    { scale: 1, x: 0, y: 0, skinMatch: 1, shape: 1 },
    true,
  )
  expect(output[2] - skin[2]).toBeCloseTo(0.018, 6)
  expect(output[5]).toBeCloseTo(skin[5], 7)
  expect(output[8]).toEqual(skin[8])
})

it('transports authored skin normals with the local fit even across overlapping, inconsistently wound triangles', () => {
  const base = new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0, -0.01, 0, 0, 0, -0.01, 0])
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 0, 2, 1]
  const baseNormals = new Float32Array(15)
  for (let i = 2; i < baseNormals.length; i += 3) baseNormals[i] = 1
  const bind = { vertex: 0, triangle: [0, 1, 2], weights: [1, 0, 0], feather: 1, boundary: 1 }
  const update = bindPortraitNormals(base, baseNormals, indices, [bind])
  const normals = new Float32Array(15)
  update(base, normals)
  expect(normals).toEqual(baseNormals)
  const fitted = base.slice()
  // z = 0.4 x - 0.2 y; its surface normal is proportional to (-0.4, 0.2, 1).
  for (let i = 0; i < base.length; i += 3) fitted[i + 2] = 0.4 * base[i] - 0.2 * base[i + 1]
  update(fitted, normals)
  const length = Math.hypot(-0.4, 0.2, 1)
  expect(normals[0]).toBeCloseTo(-0.4 / length)
  expect(normals[1]).toBeCloseTo(0.2 / length)
  expect(normals[2]).toBeCloseTo(1 / length)
  expect(normals.slice(3)).toEqual(baseNormals.slice(3))
  fitted[5] = 2
  update(fitted, normals)
  expect(normals[2]).toBeGreaterThanOrEqual(Math.cos(Math.PI / 4) - 1e-6)
  update(base, normals)
  expect(normals).toEqual(baseNormals)
})
