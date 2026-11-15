// Rough gaze from a webcam, for pressing buttons in the AR view by looking at them. A laptop camera
// cannot track the eyes precisely, so the direction combines where the head points (the nose against
// the eyes) and where the irises sit between the eye corners, measured against a moment of looking at
// the centre. It is good enough for large buttons, held under the gaze for a second.

export interface Point {
  x: number
  y: number
}

export interface GazeSample {
  /** Nose against the middle of the eyes, in eye spacings: where the head points. */
  headX: number
  headY: number
  /** Iris between the eye corners and between the lids, 0 to 1: where the eyes point in the head. */
  eyeX: number
  eyeY: number
}

/** Face mesh points used here, on the person's own sides (478-point mesh with irises). */
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

const ratio = (v: number, a: number, b: number) => (b === a ? 0.5 : (v - a) / (b - a))

/** The gaze measures of one face, in image coordinates; null without the iris points. */
export function gazeSample(points: Point[]): GazeSample | null {
  if (points.length < 478) return null
  const p = (i: number) => points[i]
  const mid = { x: (p(P.rightOuter).x + p(P.leftOuter).x) / 2, y: (p(P.rightOuter).y + p(P.leftOuter).y) / 2 }
  const spacing = Math.hypot(p(P.leftOuter).x - p(P.rightOuter).x, p(P.leftOuter).y - p(P.rightOuter).y)
  if (spacing < 1e-4) return null
  // The right eye is on the left of the image: its outer corner comes first along x.
  const eyeX =
    (ratio(p(P.rightIris).x, p(P.rightOuter).x, p(P.rightInner).x) +
      ratio(p(P.leftIris).x, p(P.leftInner).x, p(P.leftOuter).x)) /
    2
  const eyeY =
    (ratio(p(P.rightIris).y, p(P.rightUpper).y, p(P.rightLower).y) +
      ratio(p(P.leftIris).y, p(P.leftUpper).y, p(P.leftLower).y)) /
    2
  return { headX: (p(P.nose).x - mid.x) / spacing, headY: (p(P.nose).y - mid.y) / spacing, eyeX, eyeY }
}

/** How far the cursor moves for a change of head or eye position, in screen widths and heights. */
export const GAINS = { headX: 2.2, eyeX: 3, headY: 2.6, eyeY: 1.5 }

/**
 * Where on the screen the person looks, 0 to 1 from the top left, against the sample taken while
 * they looked at the centre. Turning to the right moves the nose and the irises to the left of the
 * unmirrored image, so x is reversed.
 */
export function gazePoint(sample: GazeSample, centre: GazeSample, gains = GAINS): Point {
  const x = 0.5 - (gains.headX * (sample.headX - centre.headX) + gains.eyeX * (sample.eyeX - centre.eyeX))
  const y = 0.5 + (gains.headY * (sample.headY - centre.headY) + gains.eyeY * (sample.eyeY - centre.eyeY))
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}

/** The mean of the samples taken while looking at the centre. */
export function centreOf(samples: GazeSample[]): GazeSample | null {
  if (!samples.length) return null
  const mean = (k: keyof GazeSample) => samples.reduce((s, v) => s + v[k], 0) / samples.length
  return { headX: mean('headX'), headY: mean('headY'), eyeX: mean('eyeX'), eyeY: mean('eyeY') }
}

/** Calms the cursor: each new point moves it part of the way. */
export function smooth(previous: Point | null, next: Point, share = 0.25): Point {
  if (!previous) return next
  return { x: previous.x + (next.x - previous.x) * share, y: previous.y + (next.y - previous.y) * share }
}

/** A press by looking: the same target held under the gaze for `holdMs`, then a pause before the next. */
export function dwell(holdMs = 1000, restMs = 900) {
  let target: string | null = null
  let since = 0
  let quietUntil = 0
  return {
    update(next: string | null, now: number): { progress: number; press: boolean } {
      if (now < quietUntil) return { progress: 0, press: false }
      if (next !== target) {
        target = next
        since = now
      }
      if (!target) return { progress: 0, press: false }
      const progress = Math.min(1, (now - since) / holdMs)
      if (progress < 1) return { progress, press: false }
      quietUntil = now + restMs
      target = null
      return { progress: 1, press: true }
    },
  }
}
