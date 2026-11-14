import type { BufferGeometry } from 'three'
import type { Body } from '../body/anatomy/loadAnatomy'
import type { Build, Vec3 } from '../body/anatomy/bodyShape'
import type { BodyDimensions } from './bodyDimensions'

// Reference heights were selected where the arms are separate from the rib cage
// and waist on each atlas. Centimetres are the convex tape length at that plane.
export const TORSO_PLANES = {
  male: { waist: 0.62, chest: 0.68, waistCm: 78.55, chestCm: 89.98 },
  female: { waist: 0.64, chest: 0.7, waistCm: 93.34, chestCm: 105.3 },
} as const

function transition(a: number, b: number, t: number) {
  const s = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return s * s * (3 - 2 * s)
}

/** A smooth field with flat regions at the two measured planes. Outside the
 * torso the transformation is identity, including all portrait landmarks. */
export function torsoShape(build: Build, height: number, horizontal: number, values: BodyDimensions) {
  const ref = TORSO_PLANES[build]
  const waist = values.waistCm === undefined ? 1 : values.waistCm / (ref.waistCm * horizontal)
  const chest = values.chestCm === undefined ? 1 : values.chestCm / (ref.chestCm * horizontal)
  const band = 0.011
  const at = (y: number) => {
    const h = y / height
    if (h < ref.waist) return 1 + (waist - 1) * transition(0.48, ref.waist - band, h)
    if (h < ref.chest) return waist + (chest - waist) * transition(ref.waist + band, ref.chest - band, h)
    return chest + (1 - chest) * transition(ref.chest + band, 0.84, h)
  }
  return at
}

function transformPoint(point: Vec3, factor: (y: number) => number): Vec3 {
  const k = factor(point[1])
  return [point[0] * k, point[1], point[2] * k]
}

function transformMesh(source: BufferGeometry, factor: (y: number) => number): BufferGeometry {
  const result = source.clone()
  const p = result.getAttribute('position')
  const normals = result.getAttribute('normal')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i)
    const k = factor(y)
    if (k === 1) continue
    p.setXYZ(i, x * k, y, z * k)
    const slope = (factor(y + 0.0001) - factor(y - 0.0001)) / 0.0002
    // Inverse-transposed Jacobian preserves the atlas' smooth authored normals.
    const nx = normals.getX(i) / k,
      nz = normals.getZ(i) / k
    const ny = normals.getY(i) - slope * (nx * x + nz * z)
    const length = Math.hypot(nx, ny, nz) || 1
    normals.setXYZ(i, nx / length, ny / length, nz / length)
  }
  result.computeBoundingBox()
  result.computeBoundingSphere()
  return result
}

/** The cache stays immutable. The viewer owns only these disposable clones.
 * Raycasting, portrait placement, organ zoom and markers use these surfaces. */
export function fitTorso(reference: Body, horizontal: number, values: BodyDimensions) {
  const factor = torsoShape(reference.build, reference.height, horizontal, values)
  const skin = transformMesh(reference.skin, factor)
  const organs = reference.organs.map((o) => ({
    ...o,
    center: transformPoint(o.center, factor),
    geometry: transformMesh(o.geometry, factor),
  }))
  const anchors = Object.fromEntries(
    Object.entries(reference.anchors).map(([name, point]) => [name, transformPoint(point, factor)]),
  )
  const body: Body = { ...reference, skin, organs, anchors }
  return {
    body,
    factor,
    dispose() {
      skin.dispose()
      organs.forEach((o) => o.geometry.dispose())
    },
  }
}
