import type { AvatarPoint } from './portrait'

export const midpoint = (a: AvatarPoint, b: AvatarPoint): AvatarPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
})
const sub = (a: AvatarPoint, b: AvatarPoint): AvatarPoint => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: AvatarPoint, b: AvatarPoint) => a.x * b.x + a.y * b.y + a.z * b.z
const unit = (a: AvatarPoint) => {
  const d = Math.hypot(a.x, a.y, a.z)
  if (d < 1e-6) throw new Error('Face landmarks are degenerate')
  return { x: a.x / d, y: a.y / d, z: a.z / d }
}

/** Mirrored camera coordinates in units of the estimated 3D eye span.
 * The three axes map the intrinsic face basis to the camera's right, up and forward directions. */
export function faceCamera(points: AvatarPoint[], width: number, height: number) {
  if (
    points.length < 468 ||
    !Number.isFinite(width / height) ||
    width <= 0 ||
    height <= 0 ||
    points.slice(0, 468).some((p) => ![p.x, p.y, p.z].every(Number.isFinite))
  )
    throw new Error('Invalid face capture')
  const aspect = width / height
  const local = points.slice(0, 468).map((p) => ({ x: -p.x * aspect, y: -p.y, z: -p.z * aspect }))
  const right = midpoint(local[33], local[133]),
    left = midpoint(local[362], local[263]),
    center = midpoint(right, left)
  const span = sub(right, left),
    distance = Math.hypot(span.x, span.y, span.z)
  if (distance < 0.025) throw new Error('Move closer so your face can be fitted')
  const x = unit(span),
    up = sub(local[10], local[152]),
    along = dot(up, x)
  const y = unit({ x: up.x - x.x * along, y: up.y - x.y * along, z: up.z - x.z * along })
  const z = { x: x.y * y.z - x.z * y.y, y: x.z * y.x - x.x * y.z, z: x.x * y.y - x.y * y.x }
  const samples = local.map((p) => {
    const d = sub(p, center)
    return { x: d.x / distance, y: d.y / distance, z: d.z / distance }
  })
  return { x, y, z, samples }
}

export function intrinsicPoints(camera: ReturnType<typeof faceCamera>): AvatarPoint[] {
  return camera.samples.map((p) => ({ x: dot(p, camera.x), y: dot(p, camera.y), z: dot(p, camera.z) }))
}
