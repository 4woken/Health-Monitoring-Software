// Sharpness of sight on a screen: tumbling E letters sized for the viewing distance, read with one
// eye at a time, and the Amsler grid. Sizes follow the logMAR scale: a letter of logMAR 0 (20/20)
// is 5 minutes of arc tall, and each line is 0.1 logMAR (about 26%) bigger than the next.

export type Direction = 'right' | 'left' | 'up' | 'down'
export const DIRECTIONS: Direction[] = ['right', 'left', 'up', 'down']
export type Eye = 'right' | 'left'

/** Near vision is tested at 40 cm, unless the screen is too coarse for the small letters there. */
export const NEAR_MM = 400
/** Letters are drawn on a 5 by 5 grid, so a letter needs at least 5 screen pixels. */
const MIN_PIXELS = 5
export const LETTERS_PER_LINE = 5

const ARCMIN = Math.PI / (180 * 60)

/** Height of a letter of this logMAR at this distance, mm. */
export const letterMm = (logMAR: number, distanceMm: number) =>
  distanceMm * Math.tan(5 * ARCMIN * 10 ** logMAR)

/** logMAR of a letter of this height at this distance. */
export const logMARof = (heightMm: number, distanceMm: number) =>
  Math.log10(Math.atan(heightMm / distanceMm) / (5 * ARCMIN))

/**
 * Viewing distance for the letters: 40 cm when the screen can draw a 20/20 letter there, farther
 * on a coarse screen, in steps of 5 cm.
 */
export function testDistanceMm(devicePxPerMm: number): number {
  const needed = MIN_PIXELS / (devicePxPerMm * Math.tan(5 * ARCMIN))
  return Math.min(1000, Math.max(NEAR_MM, Math.ceil(needed / 50) * 50))
}

export interface Line {
  /** Size of one stroke of the E, device pixels: the letter is five strokes tall. */
  unit: number
  /** logMAR of the letter as drawn at the test distance. */
  logMAR: number
}

/**
 * The lines to read, largest first, from about logMAR 1.0 down to the smallest the screen can draw.
 * Each line's size is rounded to whole pixels, and its logMAR is that of the drawn size.
 */
export function chartLines(distanceMm: number, devicePxPerMm: number): Line[] {
  const lines: Line[] = []
  for (let step = 10; step >= -3; step--) {
    const target = step / 10
    const unit = Math.round((letterMm(target, distanceMm) * devicePxPerMm) / 5)
    if (unit < 1) break
    if (lines.length && lines[lines.length - 1].unit === unit) continue
    lines.push({ unit, logMAR: Number(logMARof((unit * 5) / devicePxPerMm, distanceMm).toFixed(2)) })
  }
  return lines
}

/**
 * Score of one eye: the logMAR of the smallest line read with at least 3 of its 5 letters, less
 * 0.02 for each letter read on the line below it. Null when even the first line was missed.
 */
export function eyeScore(lines: Line[], correctByLine: number[]): number | null {
  let last = -1
  for (let i = 0; i < correctByLine.length; i++) {
    if (correctByLine[i] >= 3) last = i
    else break
  }
  if (last < 0) return null
  const extra = correctByLine[last + 1] ?? 0
  return Number((lines[last].logMAR - 0.02 * Math.min(2, extra)).toFixed(2))
}

/** True when a line is finished: all letters shown, or too many missed to pass. */
export const lineDone = (shown: number, wrong: number) => shown >= LETTERS_PER_LINE || wrong >= 3

/** "20/25" for logMAR 0.1. */
export function snellen(logMAR: number): string {
  const denominator = 20 * 10 ** logMAR
  const steps = [10, 12.5, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400]
  const nearest = steps.reduce((a, b) => (Math.abs(b - denominator) < Math.abs(a - denominator) ? b : a))
  return `20/${nearest}`
}

/** One Amsler square spans 1 degree at this distance, mm. */
export const amslerSquareMm = (distanceMm: number) => distanceMm * Math.tan(Math.PI / 180)

/** Iris diameter, mm: nearly the same in all adults, which lets the camera gauge distance (MediaPipe Iris). */
export const IRIS_MM = 11.7
/** Typical horizontal field of view of a laptop camera, degrees; the true one is not exposed to web pages. */
export const CAMERA_FOV_DEG = 63

interface Point {
  x: number
  y: number
}

/**
 * Distance from the camera to the eyes, mm, from the iris size in a face mesh with iris points
 * (478 points, coordinates normalised to the image). With one eye covered, only the other iris is
 * read. Null without iris points.
 */
export function irisDistanceMm(
  points: Point[],
  imageWidth: number,
  imageHeight: number,
  eye: Eye | 'both' = 'both',
  fovDeg = CAMERA_FOV_DEG,
) {
  if (points.length < 478) return null
  const px = (a: Point, b: Point) => Math.hypot((a.x - b.x) * imageWidth, (a.y - b.y) * imageHeight)
  // Each iris has a centre and four points on its edge. 468 to 472 are the right iris, 473 to 477
  // the left one, on the person's own sides.
  const size = { right: [469, 471, 470, 472], left: [474, 476, 475, 477] }
  const diameter = (i: number[]) => (px(points[i[0]], points[i[1]]) + px(points[i[2]], points[i[3]])) / 2
  const diameters = (eye === 'both' ? [size.right, size.left] : [size[eye]])
    .map(diameter)
    .filter((d) => d > 1)
  if (!diameters.length) return null
  const iris = diameters.reduce((s, d) => s + d, 0) / diameters.length
  const focal = imageWidth / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180)
  return (focal * IRIS_MM) / iris
}

/** The outline points of each eye in the MediaPipe face mesh. The eye is the person's own side. */
const EYE_POINTS: Record<Eye, number[]> = {
  right: [33, 133, 159, 145, 160, 144, 158, 153],
  left: [362, 263, 386, 374, 385, 380, 387, 373],
}

/**
 * Which eye a hand covers: a hand point inside the box around an eye, widened by half its size.
 * Points are normalised to the same image.
 */
export function coveredEyes(face: Point[], hands: Point[][]): Record<Eye, boolean> {
  const out: Record<Eye, boolean> = { right: false, left: false }
  if (face.length < 468) return out
  for (const eye of ['right', 'left'] as const) {
    const pts = EYE_POINTS[eye].map((i) => face[i])
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const w = Math.max(...xs) - Math.min(...xs)
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2
    const half = w * 1.1
    out[eye] = hands.some((hand) => hand.some((p) => Math.abs(p.x - cx) < half && Math.abs(p.y - cy) < half))
  }
  return out
}
