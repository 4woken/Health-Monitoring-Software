import type { AvatarPoint, PortraitView } from '../../camera/face/portrait'
import type { FaceBinding } from './headFit'

type Observation = Pick<PortraitView, 'points' | 'width' | 'height'>
type SideViews = { left: Observation; right: Observation }
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Divide out resolution, crop and camera distance. The signed area tells us when a
// landmark triangle turns away or collapses behind the nose in the oblique photo.
function projection(view: Observation) {
  const { points, width, height } = view
  const distance = Math.hypot((points[10].x - points[152].x) * width, (points[10].y - points[152].y) * height)
  const scale = (width * height) / (distance * distance || 1)
  return ([i, j, k]: number[]) => {
    const a = points[i],
      b = points[j],
      c = points[k]
    return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * scale
  }
}

/** Keep the front portrait at the eyes, mouth and nose; take cheek detail from the
 * photo that sees more of that particular triangle. Never sample a folded triangle. */
export function writeProfileUV(
  bindings: FaceBinding[],
  template: AvatarPoint[],
  front: Observation,
  sides: SideViews,
  uv: Float32Array,
  mix: Float32Array,
) {
  mix.fill(0)
  const views = [sides.left, sides.right] as const
  const areas = [projection(front), projection(sides.left), projection(sides.right)]
  const quality = new Map<number, [number, number]>()
  for (const { vertex, triangle, weights } of bindings) {
    const key = (triangle[0] * 468 + triangle[1]) * 468 + triangle[2]
    let scores = quality.get(key)
    if (!scores) {
      const base = areas[0](triangle)
      const score = (v: number) => (Math.abs(base) < 1e-6 ? 0 : smooth(1.04, 1.55, areas[v](triangle) / base))
      scores = [score(1), score(2)]
      quality.set(key, scores)
    }
    let x = 0,
      y = 0
    for (let n = 0; n < 3; n++) {
      x += weights[n] * template[triangle[n]].x
      y += weights[n] * template[triangle[n]].y
    }
    // Protect lids from blinking between captures and the centre from double features.
    const outer = smooth(0.32, 0.85, Math.abs(x))
    const eye = (1 - smooth(0.19, 0.33, Math.abs(Math.abs(x) - 0.5))) * (1 - smooth(0.12, 0.26, Math.abs(y)))
    const amount = 0.88 * outer * (1 - eye)
    const total = Math.max(1, scores[0] + scores[1])
    for (let view = 0; view < 2; view++) {
      let u = 0,
        v = 0
      for (let n = 0; n < 3; n++) {
        const p = views[view].points[triangle[n]]
        u += weights[n] * p.x
        v += weights[n] * (1 - p.y)
      }
      uv[vertex * 4 + view * 2] = u
      uv[vertex * 4 + view * 2 + 1] = v
      if (u >= 0 && v >= 0 && u <= 1 && v <= 1) mix[vertex * 2 + view] = (amount * scores[view]) / total
    }
  }
}
