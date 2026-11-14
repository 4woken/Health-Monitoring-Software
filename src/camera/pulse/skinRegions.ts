// Skin regions sampled for the pulse, as MediaPipe face-mesh landmark indices.
// Forehead and both cheeks: thin skin with many small vessels, little hair, and they move less
// than the mouth or the eyes. Pure functions, no DOM.

import type { FacePoint } from '../face/faceMesh'

/** Each list walks around the edge of one region. */
export const REGIONS = {
  // Brow line (107, 66 / 296, 336 and 9 between the brows) up to the top of the forehead (109, 10, 338).
  forehead: [107, 66, 69, 109, 10, 338, 299, 296, 336, 9],
  // Below the eye (117, 118), beside the nose (101, 36), down the cheek (205, 187) and back (123).
  rightCheek: [117, 118, 101, 36, 205, 187, 123],
  leftCheek: [346, 347, 330, 266, 425, 411, 352],
} as const

export type RegionName = keyof typeof REGIONS
export type Polygon = [number, number][]

export const REGION_LABEL: Record<RegionName, string> = {
  forehead: 'Forehead',
  rightCheek: 'Right cheek',
  leftCheek: 'Left cheek',
}

/** Nose tip, top of the forehead, chin and both sides of the face: used to detect head movement. */
export const MOTION_POINTS = [1, 10, 152, 234, 454] as const

/** Region outlines in pixels of an image `width` by `height`. */
export function regionPolygons(
  points: readonly FacePoint[],
  width: number,
  height: number,
): Record<RegionName, Polygon> {
  const out = {} as Record<RegionName, Polygon>
  for (const name of Object.keys(REGIONS) as RegionName[])
    out[name] = REGIONS[name].map((i) => [(points[i]?.x ?? 0) * width, (points[i]?.y ?? 0) * height])
  return out
}

/** Even-odd rule point-in-polygon test. */
export function insidePolygon(x: number, y: number, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export interface SkinColour {
  r: number
  g: number
  b: number
  /** Pixels averaged. */
  count: number
}

/**
 * Mean colour of the pixels inside the polygons of an RGBA image. Very dark pixels (shadow)
 * and nearly white ones (shine) are left out. Null when fewer than `minPixels` remain.
 */
export function averageSkin(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  polygons: readonly Polygon[],
  minPixels = 20,
): SkinColour | null {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (const poly of polygons) {
    if (poly.length < 3) continue
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    const left = Math.max(0, Math.floor(x0))
    const top = Math.max(0, Math.floor(y0))
    const right = Math.min(width - 1, Math.ceil(x1))
    const bottom = Math.min(height - 1, Math.ceil(y1))
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        if (!insidePolygon(x + 0.5, y + 0.5, poly)) continue
        const i = (y * width + x) * 4
        const pr = data[i]
        const pg = data[i + 1]
        const pb = data[i + 2]
        if (Math.max(pr, pg, pb) < 25 || Math.min(pr, pg, pb) > 250) continue
        r += pr
        g += pg
        b += pb
        count++
      }
  }
  if (count < minPixels) return null
  return { r: r / count, g: g / count, b: b / count, count }
}

/** Allow a small frame-to-frame head shift before pausing the displayed reading.
 * Expressed as a fraction of the image dimensions, matching headMotion(). */
export const PULSE_MOTION_LIMIT = 0.0132

/** Mean movement of the motion points between two frames, in shares of the image size. */
export function headMotion(previous: readonly FacePoint[], current: readonly FacePoint[]): number {
  let sum = 0
  let n = 0
  for (const i of MOTION_POINTS) {
    const a = previous[i]
    const c = current[i]
    if (!a || !c) continue
    sum += Math.hypot(c.x - a.x, c.y - a.y)
    n++
  }
  return n ? sum / n : 0
}
