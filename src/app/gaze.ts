// Gaze from a webcam, to press buttons in the AR view by looking at them.
//
// The method is the one shared by the open-source webcam eye trackers. WebGazer (brownhci/WebGazer)
// maps features of the eyes to the screen with ridge regression and keeps learning from clicks;
// WebEyeTrack (RedForestAI/WebEyeTrack) adds the pose of the head and calibrates on nine points;
// both leave blinks out and filter the result. Here the features come from MediaPipe's face model,
// which the self-tests already use: where each iris sits between the corners of its eye, how open the
// eyes are, the model's own eye-direction scores, and the direction and position of the head. Nine
// dots teach the mapping for this face, seat and screen, and each mouse click teaches it a little
// more. Buttons attract a gaze that lands close by, since a webcam cannot tell a few millimetres.
//
// Everything here is pure, so it can be tested without a camera.

export interface Point {
  x: number
  y: number
}

/** What the face model gives for one camera frame. Points are fractions of the image, as MediaPipe gives them. */
export interface FaceReading {
  points: Point[]
  /** Blendshape scores by name, 0 to 1. */
  shapes: Record<string, number>
  /** The head pose, a 4×4 matrix in column order with the position in centimetres; null when not given. */
  matrix: number[] | null
  /** The camera image, in pixels. */
  width: number
  height: number
}

/** The numbers the gaze is computed from, for one frame. */
export type Features = number[]

/** Face mesh points used here, on the person's own sides (the 478-point mesh with the irises). */
const P = {
  nose: 1,
  rightOuter: 33,
  rightInner: 133,
  rightUpper: 159,
  rightLower: 145,
  rightIris: 468,
  leftInner: 362,
  leftOuter: 263,
  leftUpper: 386,
  leftLower: 374,
  leftIris: 473,
} as const

/**
 * One eye in its own frame, from its corners `a` (on the image's left) and `b`: the iris along and
 * across the line between the corners, and the opening between the lids, all in eye widths. Measured
 * this way, a tilt or a move of the head changes them little.
 */
function eye(p: (i: number) => Point, a: number, b: number, upper: number, lower: number, iris: number) {
  const A = p(a)
  const B = p(b)
  const width = Math.hypot(B.x - A.x, B.y - A.y)
  if (width < 1) return null
  const ux = (B.x - A.x) / width
  const uy = (B.y - A.y) / width
  const cx = (A.x + B.x) / 2
  const cy = (A.y + B.y) / 2
  const I = p(iris)
  const U = p(upper)
  const L = p(lower)
  return {
    along: ((I.x - cx) * ux + (I.y - cy) * uy) / width,
    across: ((I.y - cy) * ux - (I.x - cx) * uy) / width,
    open: ((L.y - U.y) * ux - (L.x - U.x) * uy) / width,
  }
}

/** Where the head points (sideways and up, as sines) and where it is (sideways, up, and how far). */
function headPose(face: FaceReading, p: (i: number) => Point): number[] {
  const m = face.matrix
  if (m && m.length === 16) {
    // The third column is the direction the face looks in; the fourth is its position.
    const n = Math.hypot(m[8], m[9], m[10]) || 1
    return [m[8] / n, m[9] / n, m[12], m[13], m[14]]
  }
  // Without the pose: the nose against the middle of the eyes, that middle in the image, and the eye
  // spacing, which grows as the head comes closer.
  const a = p(P.rightOuter)
  const b = p(P.leftOuter)
  const nose = p(P.nose)
  const spacing = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return [
    (nose.x - mid.x) / spacing,
    (nose.y - mid.y) / spacing,
    mid.x / face.width,
    mid.y / face.height,
    spacing / face.width,
  ]
}

/** The features of one face, or null without the iris points. */
export function gazeFeatures(face: FaceReading): Features | null {
  const { points, width, height } = face
  if (points.length < 478 || !width || !height) return null
  // In pixels, so that a distance means the same across and down the image.
  const p = (i: number) => ({ x: points[i].x * width, y: points[i].y * height })
  const right = eye(p, P.rightOuter, P.rightInner, P.rightUpper, P.rightLower, P.rightIris)
  const left = eye(p, P.leftInner, P.leftOuter, P.leftUpper, P.leftLower, P.leftIris)
  if (!right || !left) return null
  const along = (right.along + left.along) / 2
  const across = (right.across + left.across) / 2
  const open = (right.open + left.open) / 2
  const s = (name: string) => face.shapes[name] ?? 0
  // Looking aside turns one eye towards the nose and the other away from it.
  const lookSide = s('eyeLookInLeft') - s('eyeLookOutLeft') - (s('eyeLookInRight') - s('eyeLookOutRight'))
  const lookUp = (s('eyeLookUpLeft') + s('eyeLookUpRight') - s('eyeLookDownLeft') - s('eyeLookDownRight')) / 2
  return [
    along,
    across,
    open,
    lookSide,
    lookUp,
    ...headPose(face, p),
    // The iris moves less for the same turn of the eye towards the sides: curved terms follow that.
    along * along,
    across * across,
    along * across,
  ]
}

/** The features that say where the eyes point in the head, used to find the steady samples of a dot. */
const EYE_FEATURES = [0, 1, 3, 4]

/** Both eyes closed: a blink, to leave out. Looking down lowers the lids too, so the bar is high. */
export const blinking = (shapes: Record<string, number>) =>
  Math.min(shapes.eyeBlinkLeft ?? 0, shapes.eyeBlinkRight ?? 0) > 0.6

export function median(values: number[]): number {
  if (!values.length) return 0
  const v = [...values].sort((a, b) => a - b)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * The steady part of the samples taken on one dot. The eyes wander off a dot at times, so the samples
 * farthest from the median, in the eye features, are left out.
 */
export function steady(samples: Features[], keep = 0.8): Features[] {
  if (samples.length < 5) return samples
  const centre = EYE_FEATURES.map((j) => median(samples.map((f) => f[j])))
  const spread = EYE_FEATURES.map((j, k) => median(samples.map((f) => Math.abs(f[j] - centre[k]))) || 1e-9)
  const far = (f: Features) =>
    EYE_FEATURES.reduce((sum, j, k) => sum + ((f[j] - centre[k]) / spread[k]) ** 2, 0)
  return [...samples].sort((a, b) => far(a) - far(b)).slice(0, Math.max(5, Math.round(samples.length * keep)))
}

/** One frame whose gaze point is known: a calibration dot, or the place of a click. */
export interface Sample {
  features: Features
  /** Where the person looked, 0 to 1 from the top left of the screen. */
  target: Point
  /** The samples of one dot or one click share a group, and are left out together to measure the error. */
  group: number
}

export interface GazeModel {
  mean: number[]
  scale: number[]
  wx: number[]
  wy: number[]
  x0: number
  y0: number
  /** How strongly the weights are held towards zero. */
  lambda: number
  /** The mean distance between the gaze and a dot left out of the fit, in pixels of this screen. */
  errorPx: number
}

/** Solves A w = b, A square and positive definite here, by Gaussian elimination. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const m = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r
    ;[m[c], m[pivot]] = [m[pivot], m[c]]
    const d = m[c][c] || 1e-12
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / d
      if (f) for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]
    }
  }
  const w = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let v = m[r][n]
    for (let k = r + 1; k < n; k++) v -= m[r][k] * w[k]
    w[r] = v / (m[r][r] || 1e-12)
  }
  return w
}

/** Ridge regression from the standardised features to the screen, one set of weights for x and one for y. */
function ridge(samples: Sample[], lambda: number): Omit<GazeModel, 'errorPx'> {
  const n = samples.length
  const d = samples[0].features.length
  const mean = new Array<number>(d).fill(0)
  const scale = new Array<number>(d).fill(0)
  let x0 = 0
  let y0 = 0
  for (const s of samples) {
    for (let j = 0; j < d; j++) mean[j] += s.features[j] / n
    x0 += s.target.x / n
    y0 += s.target.y / n
  }
  for (const s of samples) for (let j = 0; j < d; j++) scale[j] += (s.features[j] - mean[j]) ** 2 / n
  for (let j = 0; j < d; j++) scale[j] = Math.sqrt(scale[j]) > 1e-9 ? Math.sqrt(scale[j]) : 1
  const A = Array.from({ length: d }, () => new Array<number>(d).fill(0))
  const bx = new Array<number>(d).fill(0)
  const by = new Array<number>(d).fill(0)
  const z = new Array<number>(d)
  for (const s of samples) {
    for (let j = 0; j < d; j++) z[j] = (s.features[j] - mean[j]) / scale[j]
    for (let i = 0; i < d; i++) {
      bx[i] += z[i] * (s.target.x - x0)
      by[i] += z[i] * (s.target.y - y0)
      for (let j = i; j < d; j++) A[i][j] += z[i] * z[j]
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < i; j++) A[i][j] = A[j][i]
    A[i][i] += lambda * n
  }
  return { mean, scale, x0, y0, wx: solve(A, bx), wy: solve(A, by), lambda }
}

/** Where the person looks, 0 to 1 from the top left of the screen; it can fall a little outside. */
export function predictGaze(model: Omit<GazeModel, 'errorPx'>, features: Features): Point {
  let x = model.x0
  let y = model.y0
  for (let j = 0; j < features.length; j++) {
    const z = (features[j] - model.mean[j]) / model.scale[j]
    x += model.wx[j] * z
    y += model.wy[j] * z
  }
  return { x, y }
}

/** The strengths tried, from almost none to strong. */
export const LAMBDAS = [0.001, 0.01, 0.03, 0.1, 0.3, 1]

/**
 * Fits the mapping on the samples. Each strength is tried by leaving out one dot or click at a time
 * and measuring how far its samples fall from it; the best one is kept, and that distance is the
 * error the person can expect. Needs four groups at least.
 */
export function fitGaze(
  samples: Sample[],
  screen: { width: number; height: number },
  lambdas = LAMBDAS,
): GazeModel | null {
  const groups = [...new Set(samples.map((s) => s.group))]
  if (groups.length < 4 || samples.length < 20) return null
  let best = { lambda: lambdas[0], error: Infinity }
  for (const lambda of lambdas) {
    let sum = 0
    for (const g of groups) {
      const fit = ridge(
        samples.filter((s) => s.group !== g),
        lambda,
      )
      for (const s of samples) {
        if (s.group !== g) continue
        const p = predictGaze(fit, s.features)
        sum += Math.hypot((p.x - s.target.x) * screen.width, (p.y - s.target.y) * screen.height)
      }
    }
    const error = sum / samples.length
    if (error < best.error) best = { lambda, error }
  }
  return { ...ridge(samples, best.lambda), errorPx: best.error }
}

/** The nine calibration dots, 0 to 1 from the top left: the middle first, then round the edges. */
export const DOTS: Point[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.08, y: 0.1 },
  { x: 0.5, y: 0.1 },
  { x: 0.92, y: 0.1 },
  { x: 0.92, y: 0.5 },
  { x: 0.92, y: 0.88 },
  { x: 0.5, y: 0.88 },
  { x: 0.08, y: 0.88 },
  { x: 0.08, y: 0.5 },
]

/**
 * The 1€ filter (Casiez, Roussel and Vogel, CHI 2012): strong smoothing while the gaze rests, little
 * while it jumps, so the cursor is calm on a button and still quick to follow the eyes.
 */
export function oneEuro({ minCutoff = 0.6, beta = 0.0025, dCutoff = 1 } = {}) {
  let last: { t: number; x: number; dx: number } | null = null
  const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
  return {
    /** The filtered value of `x`, read at `t` milliseconds. */
    filter(x: number, t: number): number {
      if (!last) {
        last = { t, x, dx: 0 }
        return x
      }
      const dt = Math.max(1e-3, (t - last.t) / 1000)
      const dx = last.dx + alpha(dCutoff, dt) * ((x - last.x) / dt - last.dx)
      const value = last.x + alpha(minCutoff + beta * Math.abs(dx), dt) * (x - last.x)
      last = { t, x: value, dx }
      return value
    },
    reset() {
      last = null
    },
  }
}

export interface Target {
  id: string
  rect: { left: number; top: number; right: number; bottom: number }
}

/**
 * The button the gaze is on, as with a bubble cursor (Grossman and Balakrishnan, CHI 2005): the one
 * under the gaze or the nearest within `reach` pixels. The current one stays until the gaze is
 * `stick` pixels nearer another, or past its reach, so a shaky gaze does not flicker between two.
 */
export function pickTarget(
  p: Point,
  targets: Target[],
  current: string | null,
  reach: number,
  stick = 30,
): string | null {
  let best: { id: string; d: number } | null = null
  let held: number | null = null
  for (const t of targets) {
    const dx = Math.max(t.rect.left - p.x, 0, p.x - t.rect.right)
    const dy = Math.max(t.rect.top - p.y, 0, p.y - t.rect.bottom)
    const d = Math.hypot(dx, dy)
    if (t.id === current) held = d
    if (!best || d < best.d) best = { id: t.id, d }
  }
  if (current && held !== null && held <= reach + stick && (!best || best.d > held - stick)) return current
  return best && best.d <= reach ? best.id : null
}

/**
 * A press by looking: the same button held under the gaze for `holdMs`. A button pressed this way
 * waits for the gaze to leave it before it can be pressed again, so a toggle does not flip back.
 */
export function dwell(holdMs = 1000) {
  let target: string | null = null
  let since = 0
  let spent = false
  return {
    update(next: string | null, now: number): { progress: number; press: boolean } {
      if (next !== target) {
        target = next
        since = now
        spent = false
      }
      if (!target || spent) return { progress: 0, press: false }
      const progress = Math.min(1, (now - since) / holdMs)
      if (progress < 1) return { progress, press: false }
      spent = true
      return { progress: 1, press: true }
    },
  }
}
