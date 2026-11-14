import type { AvatarCapture, AvatarPoint } from './portrait'
import { faceCamera, intrinsicPoints } from './faceFrame'

type View = Pick<AvatarCapture, 'points' | 'width' | 'height'>
type Camera = ReturnType<typeof faceCamera>

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const degrees = 180 / Math.PI

/** Positive when the nose points right in the raw (unmirrored) camera image. */
export function faceYawDegrees(view: View): number {
  const { points, width, height } = view
  if (points.length < 468 || width <= 0 || height <= 0) return NaN
  const [a, b, c, d] = [33, 133, 362, 263].map((i) => points[i])
  const x = c.x + d.x - a.x - b.x
  const y = ((c.y + d.y - a.y - b.y) * height) / width
  const z = c.z + d.z - a.z - b.z
  const projected = Math.hypot(x, y)
  return projected > 1e-4 ? Math.atan2(z, projected) * degrees : NaN
}

interface Ray {
  origin: AvatarPoint
  direction: AvatarPoint
}

// Orthographic backprojection into eye-centred face coordinates. Only the pose
// anchors depend on estimated landmark Z. The observed rays use the image XY.
function observation(camera: Camera, index: number): Ray {
  const { x, y } = camera.samples[index]
  return {
    origin: {
      x: camera.x.x * x + camera.x.y * y,
      y: camera.y.x * x + camera.y.y * y,
      z: camera.z.x * x + camera.z.y * y,
    },
    direction: { x: camera.x.z, y: camera.y.z, z: camera.z.z },
  }
}

// A point on the front ray preserves the frontal photograph exactly. Its depth is
// the weighted least-squares closest approach to both side-view rays.
function depthAlong(front: Ray, side: Ray) {
  const a = front.direction,
    b = side.direction
  const cosine = a.x * b.x + a.y * b.y + a.z * b.z
  const px = a.x - cosine * b.x,
    py = a.y - cosine * b.y,
    pz = a.z - cosine * b.z
  const baseline = px * px + py * py + pz * pz
  const dx = side.origin.x - front.origin.x,
    dy = side.origin.y - front.origin.y,
    dz = side.origin.z - front.origin.z
  const depth = (dx * px + dy * py + dz * pz) / baseline
  const rx = depth * a.x - dx,
    ry = depth * a.y - dy,
    rz = depth * a.z - dz
  const along = rx * b.x + ry * b.y + rz * b.z
  const error = Math.hypot(rx - along * b.x, ry - along * b.y, rz - along * b.z)
  return { depth, baseline, error }
}

function median(values: number[]) {
  return values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
}

/** Estimate a front surface from three matched images using weak perspective.
 * Coordinates are expressed in eye spans, ready for fitHeadSurface on either body. */
export function reconstructFace(front: View, left: View, right: View): AvatarPoint[] | null {
  const views = [front, left, right]
  const [frontYaw, leftYaw, rightYaw] = views.map(faceYawDegrees)
  if (
    ![frontYaw, leftYaw, rightYaw].every(Number.isFinite) ||
    Math.abs(frontYaw) > 12 ||
    leftYaw < 18 ||
    leftYaw > 48 ||
    rightYaw > -18 ||
    rightYaw < -48 ||
    Math.min(leftYaw - frontYaw, frontYaw - rightYaw) < 13
  )
    return null

  let cameras: Camera[]
  try {
    cameras = views.map((view) => faceCamera(view.points, view.width, view.height))
  } catch {
    return null
  }

  const prior = intrinsicPoints(cameras[0])
  const errors: number[] = [],
    disagreements: number[] = []
  const reconstructed = prior.map((point, i) => {
    const frontRay = observation(cameras[0], i)
    const first = depthAlong(frontRay, observation(cameras[1], i))
    const second = depthAlong(frontRay, observation(cameras[2], i))
    const disagreement = Math.abs(first.depth - second.depth)
    disagreements.push(disagreement)
    errors.push(Math.max(first.error, second.error))

    // A disagreement between sides often means an occluded landmark or a changed
    // expression. In such regions favour the frontal prediction.
    const reliability = (error: number) => 1 / (1 + (error / 0.045) ** 2)
    const w1 = first.baseline * reliability(first.error),
      w2 = second.baseline * reliability(second.error)
    const estimated = (w1 * first.depth + w2 * second.depth) / (w1 + w2)
    const trust =
      Math.sqrt(reliability(first.error) * reliability(second.error)) / (1 + (disagreement / 0.13) ** 2)
    const depthChange = clamp(estimated - cameras[0].samples[i].z, -0.32, 0.32) * trust
    return {
      x: point.x + depthChange * frontRay.direction.x,
      y: point.y + depthChange * frontRay.direction.y,
      z: point.z + depthChange * frontRay.direction.z,
    }
  })
  return median(errors) <= 0.085 &&
    median(disagreements) <= 0.22 &&
    reconstructed.every((point) => [point.x, point.y, point.z].every(Number.isFinite))
    ? reconstructed
    : null
}
