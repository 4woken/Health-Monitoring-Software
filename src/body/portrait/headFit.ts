import { Vector3 } from 'three'
import { faceCalibration, type AvatarPoint, type FaceCalibration } from '../../camera/face/portrait'

export interface HeadFrame {
  x: number
  y: number
  eyeDistance: number
  eyeZ: number
}
export interface FaceBinding {
  vertex: number
  triangle: number[]
  weights: number[]
  feather: number
  boundary: number
}
/** Per-model landmarks are registered to the real eye spacing, not an assumed human face size. */
export function registeredHeadTemplate(points: AvatarPoint[], head: HeadFrame): AvatarPoint[] {
  const mid = (a: number, b: number) => ({
    x: (points[a].x + points[b].x) / 2,
    y: (points[a].y + points[b].y) / 2,
  })
  const right = mid(33, 133),
    left = mid(362, 263),
    span = left.x - right.x
  return points.map((p) => ({
    x: ((right.x + left.x) / 2 - p.x) / span,
    y: (p.y - (right.y + ((p.x - right.x) * (left.y - right.y)) / span)) / head.eyeDistance,
    z: 0,
  }))
}

const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}
/** Bind only front-of-head vertices; neck, scalp, back and the source mesh remain intact. */
export function bindFaceToHead(
  positions: Float32Array,
  face: AvatarPoint[],
  triangles: number[],
  oval: number[],
  head: HeadFrame,
  value?: FaceCalibration,
): FaceBinding[] {
  const calibration = faceCalibration(value),
    span = head.eyeDistance * calibration.scale
  const loX = Math.min(...face.map((p) => p.x)),
    hiX = Math.max(...face.map((p) => p.x)),
    loY = Math.min(...face.map((p) => p.y)),
    hiY = Math.max(...face.map((p) => p.y))
  const cells = 24,
    buckets = new Map<number, number[]>()
  const gx = (x: number) => Math.max(0, Math.min(cells - 1, Math.floor(((x - loX) / (hiX - loX)) * cells)))
  const gy = (y: number) => Math.max(0, Math.min(cells - 1, Math.floor(((y - loY) / (hiY - loY)) * cells)))
  for (let i = 0; i < triangles.length; i += 3) {
    const t = triangles.slice(i, i + 3).map((j) => face[j])
    for (let x = gx(Math.min(...t.map((p) => p.x))); x <= gx(Math.max(...t.map((p) => p.x))); x++)
      for (let y = gy(Math.min(...t.map((p) => p.y))); y <= gy(Math.max(...t.map((p) => p.y))); y++) {
        const key = y * cells + x
        const list = buckets.get(key) ?? []
        list.push(i)
        buckets.set(key, list)
      }
  }
  const bindings: FaceBinding[] = []
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const i = vertex * 3
    if (positions[i + 2] < head.eyeZ - 0.025) continue
    const x = (positions[i] - head.x - head.eyeDistance * calibration.x) / span,
      y = (positions[i + 1] - head.y - head.eyeDistance * calibration.y) / span
    if (x < loX || x > hiX || y < loY || y > hiY) continue
    for (const start of buckets.get(gy(y) * cells + gx(x)) ?? []) {
      const triangle = triangles.slice(start, start + 3),
        [a, b, c] = triangle.map((j) => face[j])
      const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
      if (Math.abs(denominator) < 1e-9) continue
      const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator,
        wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator,
        wc = 1 - wa - wb
      if (Math.min(wa, wb, wc) < -1e-5) continue
      let distance = Infinity
      for (let j = 0; j < oval.length; j++) {
        const a = face[oval[j]],
          b = face[oval[(j + 1) % oval.length]],
          dx = b.x - a.x,
          dy = b.y - a.y,
          t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        distance = Math.min(distance, Math.hypot(x - a.x - t * dx, y - a.y - t * dy))
      }
      const frontWeight = smooth((positions[i + 2] - (head.eyeZ - 0.025)) / (head.eyeDistance * 0.3))
      const feather = smooth(distance / 0.22) * frontWeight
      bindings.push({ vertex, triangle, weights: [wa, wb, wc], feather, boundary: distance })
      break
    }
  }
  return bindings
}

export function updateFaceUV(bindings: FaceBinding[], points: AvatarPoint[], uv: Float32Array) {
  for (const b of bindings) {
    let x = 0,
      y = 0
    for (let j = 0; j < 3; j++) {
      const point = points[b.triangle[j]]
      x += point.x * b.weights[j]
      y += (1 - point.y) * b.weights[j]
    }
    uv[b.vertex * 2] = x
    uv[b.vertex * 2 + 1] = y
  }
}

/** Retarget the reference skin to the estimated personal face, feathered into the original head. */
export function fitHeadSurface(
  base: Float32Array,
  output: Float32Array,
  bindings: FaceBinding[],
  reference: AvatarPoint[],
  personal: AvatarPoint[],
  head: HeadFrame,
  value?: FaceCalibration,
  multiViewDepth = false,
) {
  output.set(base)
  const amount = faceCalibration(value).shape
  for (const binding of bindings) {
    const delta = [0, 0, 0]
    for (let j = 0; j < 3; j++) {
      const a = reference[binding.triangle[j]],
        b = personal[binding.triangle[j]],
        w = binding.weights[j]
      delta[0] += (b.x - a.x) * w
      delta[1] += (b.y - a.y) * w
      delta[2] += (b.z - a.z) * w
    }
    const edgeLimit = binding.boundary * head.eyeDistance * 0.4
    for (let axis = 0; axis < 3; axis++) {
      const maxDisplacement = multiViewDepth && axis === 2 ? head.eyeDistance * 0.3 : 0.012
      const limit = Math.min(maxDisplacement, edgeLimit)
      output[binding.vertex * 3 + axis] +=
        Math.max(-limit, Math.min(limit, delta[axis] * head.eyeDistance)) * binding.feather * amount
    }
  }
}

/** Estimate how the two atlas tangents move with the portrait, without rebuilding
 * normals from the overlapping triangles of the reference scan. Edge weights
 * are precomputed when the portrait is bound and reused on every camera frame. */
export function bindPortraitNormals(
  positions: Float32Array,
  atlasNormals: Float32Array,
  indices: ArrayLike<number>,
  bindings: FaceBinding[],
) {
  const rings = new Map(bindings.map(({ vertex }) => [vertex, new Set<number>()]))
  for (let i = 0; i < indices.length; i += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const ring = rings.get(indices[i + corner])
      if (ring) {
        ring.add(indices[i + ((corner + 1) % 3)])
        ring.add(indices[i + ((corner + 2) % 3)])
      }
    }
  }

  const edge = new Vector3()
  const frames: {
    offset: number
    tangent: Vector3
    bitangent: Vector3
    normal: Vector3
    samples: { offset: number; x: number; y: number }[]
  }[] = []
  for (const [vertex, ring] of rings) {
    const offset = 3 * vertex
    const origin = new Vector3().fromArray(positions, offset)
    const normal = new Vector3().fromArray(atlasNormals, offset).normalize()
    const tangent = Math.abs(normal.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0)
    tangent.cross(normal).normalize()
    const bitangent = new Vector3().crossVectors(normal, tangent)
    const samples = []
    let xx = 0,
      xy = 0,
      yy = 0
    for (const neighbour of ring) {
      edge.fromArray(positions, 3 * neighbour).sub(origin)
      const lengthSq = edge.lengthSq()
      if (lengthSq < 1e-10) continue
      const x = edge.dot(tangent),
        y = edge.dot(bitangent)
      // Relative weights keep long scan triangles from dominating a small eyelid.
      const weight = 1 / lengthSq
      xx += x * x * weight
      xy += x * y * weight
      yy += y * y * weight
      samples.push({ offset: 3 * neighbour, x: x * weight, y: y * weight })
    }
    const determinant = xx * yy - xy * xy
    if (determinant <= 0.0001 * (xx + yy) ** 2) continue
    for (const sample of samples) {
      const { x, y } = sample
      sample.x = (yy * x - xy * y) / determinant
      sample.y = (xx * y - xy * x) / determinant
    }
    frames.push({ offset, tangent, bitangent, normal, samples })
  }

  const centerMove = new Vector3(),
    move = new Vector3(),
    du = new Vector3(),
    dv = new Vector3()
  return (fitted: Float32Array, output: Float32Array) => {
    output.set(atlasNormals)
    for (const frame of frames) {
      const { offset, normal } = frame
      centerMove.fromArray(fitted, offset).sub(edge.fromArray(positions, offset))
      du.copy(frame.tangent)
      dv.copy(frame.bitangent)
      for (const sample of frame.samples) {
        move.fromArray(fitted, sample.offset).sub(edge.fromArray(positions, sample.offset)).sub(centerMove)
        du.addScaledVector(move, sample.x)
        dv.addScaledVector(move, sample.y)
      }
      if (du.equals(frame.tangent) && dv.equals(frame.bitangent)) continue
      move.crossVectors(du, dv)
      // Preserve the atlas shading if an edge-on or folded fit loses its orientation.
      const alongNormal = move.dot(normal)
      if (alongNormal <= 1e-6) continue
      // A noisy local landmark must not turn an otherwise smooth patch inside out.
      const tilt = edge.copy(move).addScaledVector(normal, -alongNormal).length()
      move
        .addScaledVector(normal, Math.max(0, tilt - alongNormal))
        .normalize()
        .toArray(output, offset)
    }
  }
}
