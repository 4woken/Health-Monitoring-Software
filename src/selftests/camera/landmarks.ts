// Landmarks as MediaPipe gives them: x and y normalised to the camera image (not mirrored), with a
// visibility score for body points. Distances are measured in square pixels with the image aspect.

export interface Point {
  x: number
  y: number
}
export interface Landmark extends Point {
  z?: number
  visibility?: number
}

/** Body points of the MediaPipe pose model used here. Left and right are the person's own sides. */
export const BODY = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
} as const

/** Lines drawn between body points for the skeleton over the video. */
export const BODY_LINES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
]

export const HAND_LINES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
]

export const dist = (a: Point, b: Point, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)

export const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export const inFrame = (p: Landmark | undefined, margin = 0.01): p is Landmark =>
  !!p && p.x > margin && p.x < 1 - margin && p.y > margin && p.y < 1 - margin

/** In the frame and seen with at least this confidence. */
export const seen = (p: Landmark | undefined, min = 0.5): p is Landmark =>
  inFrame(p) && (p.visibility ?? 1) >= min

/** Angle at b between a and c, degrees, in the image plane. */
export function angleAt(a: Point, b: Point, c: Point, aspect: number): number {
  const ux = (a.x - b.x) * aspect
  const uy = a.y - b.y
  const vx = (c.x - b.x) * aspect
  const vy = c.y - b.y
  const n = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  if (n === 0) return 180
  return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n))) * 180) / Math.PI
}

/** The legs, one side at a time, with how well they are seen. */
export function leg(body: Landmark[], side: 'left' | 'right') {
  const [hip, knee, ankle] =
    side === 'left'
      ? [body[BODY.leftHip], body[BODY.leftKnee], body[BODY.leftAnkle]]
      : [body[BODY.rightHip], body[BODY.rightKnee], body[BODY.rightAnkle]]
  const quality = Math.min(hip?.visibility ?? 0, knee?.visibility ?? 0, ankle?.visibility ?? 0)
  return { side, hip, knee, ankle, quality, inView: inFrame(hip) && inFrame(knee) && inFrame(ankle) }
}

/** Shoulders, hips and ankles all in view: the whole body is framed. */
export function wholeBody(body: Landmark[] | null, min = 0.5): boolean {
  if (!body) return false
  const need = [
    BODY.leftShoulder,
    BODY.rightShoulder,
    BODY.leftHip,
    BODY.rightHip,
    BODY.leftKnee,
    BODY.rightKnee,
    BODY.leftAnkle,
    BODY.rightAnkle,
  ]
  return need.every((i) => seen(body[i], min))
}

/** Running average of the last few values, to calm landmark jitter. */
export class Smoother {
  private values: number[] = []
  constructor(private size = 4) {}
  push(v: number) {
    this.values.push(v)
    if (this.values.length > this.size) this.values.shift()
    return this.values.reduce((s, x) => s + x, 0) / this.values.length
  }
  reset() {
    this.values = []
  }
}
