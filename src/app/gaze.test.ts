import { describe, expect, it } from 'vitest'
import { clockText, evaVitals } from './evaVitals'
import {
  blinking,
  DOTS,
  dwell,
  fitGaze,
  gazeFeatures,
  oneEuro,
  pickTarget,
  predictGaze,
  steady,
  type FaceReading,
  type Features,
  type Point,
  type Sample,
} from './gaze'

/** A repeatable random sequence, so that the tests do not change from one run to the next. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A face in a 640×480 image, looking at the camera, with the irises moved by `look` and `down`
 * (fractions of the image) and the whole face tilted by `roll` radians.
 */
function face({ look = 0, down = 0, roll = 0, matrix = null as number[] | null } = {}): FaceReading {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
  // The right eye is on the image's left, the left eye on its right.
  points[33] = { x: 0.4, y: 0.4 }
  points[133] = { x: 0.46, y: 0.4 }
  points[159] = { x: 0.43, y: 0.39 }
  points[145] = { x: 0.43, y: 0.41 }
  points[468] = { x: 0.43 + look, y: 0.4 + down }
  points[362] = { x: 0.54, y: 0.4 }
  points[263] = { x: 0.6, y: 0.4 }
  points[386] = { x: 0.57, y: 0.39 }
  points[374] = { x: 0.57, y: 0.41 }
  points[473] = { x: 0.57 + look, y: 0.4 + down }
  points[1] = { x: 0.5, y: 0.47 }
  // The tilt turns the face in pixels, about the middle of the eyes.
  const c = Math.cos(roll)
  const s = Math.sin(roll)
  const turned = points.map((p) => {
    const x = (p.x - 0.5) * 640
    const y = (p.y - 0.4) * 480
    return { x: (x * c - y * s) / 640 + 0.5, y: (x * s + y * c) / 480 + 0.4 }
  })
  return { points: turned, shapes: {}, matrix, width: 640, height: 480 }
}

/**
 * A simulated person: the features of a frame when they look at `target` with the head turned by
 * `yaw` and `pitch`. The eyes make up what the head does not turn, as they do.
 */
function person(seed: number) {
  const rand = random(seed)
  const n = (size: number) => (rand() - 0.5) * size
  return (target: Point, yaw = 0, pitch = 0): Features => {
    const ex = target.x - 0.5 - 0.9 * yaw
    const ey = target.y - 0.5 - 0.9 * pitch
    const along = 0.28 * ex + n(0.006)
    const across = 0.14 * ey + n(0.006)
    return [
      along,
      across,
      0.3 - 0.06 * ey + n(0.004),
      1.1 * ex + n(0.03),
      -0.9 * ey + n(0.03),
      yaw + n(0.004),
      pitch + n(0.004),
      1 + n(0.2),
      -2 + n(0.2),
      -55 + n(0.6),
      along * along,
      across * across,
      along * across,
    ]
  }
}

/** Nine dots of twenty frames each, the head held a little differently on each dot. */
function calibration(look: ReturnType<typeof person>, seed = 1): Sample[] {
  const rand = random(seed)
  const samples: Sample[] = []
  DOTS.forEach((target, group) => {
    const yaw = (rand() - 0.5) * 0.16
    const pitch = (rand() - 0.5) * 0.12
    for (let i = 0; i < 20; i++) samples.push({ features: look(target, yaw, pitch), target, group })
  })
  return samples
}

const SCREEN = { width: 1600, height: 900 }

describe('gaze features from the face model', () => {
  it('measures each iris along and across its own eye, in eye widths', () => {
    const rest = gazeFeatures(face())!
    expect(rest[0]).toBeCloseTo(0, 6)
    expect(rest[1]).toBeCloseTo(0, 6)
    // Irises 1% of the image to the right: 6.4 px for an eye 38.4 px wide.
    expect(gazeFeatures(face({ look: 0.01 }))![0]).toBeCloseTo(6.4 / 38.4, 6)
    // Irises 0.5% of the image down: 2.4 px, in the same eye widths.
    expect(gazeFeatures(face({ down: 0.005 }))![1]).toBeCloseTo(2.4 / 38.4, 6)
  })

  it('reads the same eyes when the head tilts', () => {
    const straight = gazeFeatures(face({ look: 0.01, down: 0.004 }))!
    const tilted = gazeFeatures(face({ look: 0.01, down: 0.004, roll: 0.3 }))!
    for (const j of [0, 1, 2]) expect(tilted[j]).toBeCloseTo(straight[j], 9)
  })

  it('takes the direction and position of the head from the pose matrix', () => {
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0.2, -0.1, 0.97, 0, 3, -2, -55, 1]
    const head = gazeFeatures(face({ matrix: m }))!.slice(5, 10)
    const n = Math.hypot(0.2, -0.1, 0.97)
    expect(head[0]).toBeCloseTo(0.2 / n, 9)
    expect(head[1]).toBeCloseTo(-0.1 / n, 9)
    expect(head.slice(2)).toEqual([3, -2, -55])
  })

  it('needs the iris points', () => {
    const f = face()
    expect(gazeFeatures({ ...f, points: f.points.slice(0, 468) })).toBeNull()
  })

  it('leaves out blinks, not a look down', () => {
    expect(blinking({ eyeBlinkLeft: 0.92, eyeBlinkRight: 0.88 })).toBe(true)
    expect(blinking({ eyeBlinkLeft: 0.48, eyeBlinkRight: 0.44 })).toBe(false)
    expect(blinking({})).toBe(false)
  })
})

describe('calibration', () => {
  it('learns where a person looks from nine dots', () => {
    const look = person(7)
    const model = fitGaze(calibration(look), SCREEN)!
    expect(model).not.toBeNull()
    for (const target of [
      { x: 0.3, y: 0.7 },
      { x: 0.7, y: 0.3 },
      { x: 0.62, y: 0.84 },
    ]) {
      const p = predictGaze(model, look(target))
      expect(Math.abs(p.x - target.x)).toBeLessThan(0.03)
      expect(Math.abs(p.y - target.y)).toBeLessThan(0.04)
    }
    // The error measured on dots left out, which has to reach the edges from the others, stays small.
    expect(model.errorPx).toBeLessThan(60)
  })

  it('follows the head as well as the eyes', () => {
    const look = person(11)
    const model = fitGaze(calibration(look, 5), SCREEN)!
    const target = { x: 0.35, y: 0.66 }
    // The same point, looked at with the head turned one way, then the other.
    const a = predictGaze(model, look(target, 0.07, -0.05))
    const b = predictGaze(model, look(target, -0.07, 0.05))
    expect(Math.hypot((a.x - b.x) * 1600, (a.y - b.y) * 900)).toBeLessThan(45)
    expect(Math.abs(a.x - target.x)).toBeLessThan(0.035)
  })

  it('needs four dots at least', () => {
    const samples = calibration(person(3)).filter((s) => s.group < 3)
    expect(fitGaze(samples, SCREEN)).toBeNull()
  })

  it('keeps the steady samples of a dot', () => {
    const rand = random(9)
    const still = Array.from({ length: 20 }, () => [(rand() - 0.5) * 0.01, (rand() - 0.5) * 0.01, 0, 0, 0])
    const glances = [
      [0.2, 0.15, 0, 0, 0],
      [-0.25, 0.1, 0, 0, 0],
      [0.18, -0.2, 0, 0, 0],
    ]
    const kept = steady([...still, ...glances])
    for (const g of glances) expect(kept).not.toContain(g)
    expect(kept.length).toBeGreaterThanOrEqual(18)
  })

  it('places the dots on the screen, the middle first', () => {
    expect(DOTS).toHaveLength(9)
    expect(DOTS[0]).toEqual({ x: 0.5, y: 0.5 })
    for (const d of DOTS) {
      expect(d.x).toBeGreaterThan(0)
      expect(d.x).toBeLessThan(1)
      expect(d.y).toBeGreaterThan(0)
      expect(d.y).toBeLessThan(1)
    }
  })
})

describe('cursor and buttons', () => {
  it('calms a gaze at rest and follows a jump quickly', () => {
    const rand = random(4)
    const f = oneEuro()
    const raw: number[] = []
    const out: number[] = []
    let t = 0
    for (let i = 0; i < 120; i++, t += 33) {
      const v = 500 + (rand() - 0.5) * 60
      const y = f.filter(v, t)
      if (i >= 30) {
        raw.push(v)
        out.push(y)
      }
    }
    const sd = (v: number[]) => {
      const m = v.reduce((a, b) => a + b, 0) / v.length
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)
    }
    expect(sd(out)).toBeLessThan(0.45 * sd(raw))
    // A jump of 600 px is mostly followed within three frames, a tenth of a second.
    let y = 0
    for (let i = 0; i < 3; i++) y = f.filter(1100, (t += 33))
    expect(y).toBeGreaterThan(1040)
  })

  it('picks the button under the gaze or the nearest one within reach', () => {
    const targets = [
      { id: 'a', rect: { left: 100, top: 800, right: 220, bottom: 848 } },
      { id: 'b', rect: { left: 240, top: 800, right: 360, bottom: 848 } },
    ]
    expect(pickTarget({ x: 150, y: 820 }, targets, null, 120)).toBe('a')
    expect(pickTarget({ x: 300, y: 700 }, targets, null, 120)).toBe('b')
    expect(pickTarget({ x: 300, y: 500 }, targets, null, 120)).toBeNull()
  })

  it('keeps the button it holds until the gaze is clearly on another', () => {
    const targets = [
      { id: 'a', rect: { left: 100, top: 800, right: 220, bottom: 848 } },
      { id: 'b', rect: { left: 240, top: 800, right: 360, bottom: 848 } },
    ]
    expect(pickTarget({ x: 245, y: 820 }, targets, 'a', 120)).toBe('a')
    expect(pickTarget({ x: 300, y: 820 }, targets, 'a', 120)).toBe('b')
  })

  it('presses a button held under the gaze for a second, once', () => {
    const d = dwell(1000)
    expect(d.update('hud', 0).press).toBe(false)
    expect(d.update('hud', 600).progress).toBeCloseTo(0.6)
    expect(d.update('hud', 1000).press).toBe(true)
    // Still looked at: no second press, so a toggle does not flip back.
    expect(d.update('hud', 2600).press).toBe(false)
    expect(d.update(null, 2700).progress).toBe(0)
    d.update('hud', 2800)
    expect(d.update('hud', 3800).press).toBe(true)
  })

  it('starts again when the gaze leaves the button', () => {
    const d = dwell(1000)
    d.update('hud', 0)
    d.update(null, 500)
    expect(d.update('hud', 900).progress).toBe(0)
    expect(d.update('other', 1200).progress).toBe(0)
  })
})

describe('spacewalk readings', () => {
  it('raises the pulse well above rest, more when walking under gravity', () => {
    for (let t = 0; t < 600; t += 13) {
      const orbit = evaVitals(62, 0, t)
      expect(orbit.bpm).toBeGreaterThan(62 + 20)
      expect(orbit.bpm).toBeLessThan(150)
      expect(evaVitals(62, 0.38, t).bpm).toBeGreaterThanOrEqual(orbit.bpm)
      expect(orbit.kcalPerHour).toBeGreaterThanOrEqual(140)
      expect(orbit.kcalPerHour).toBeLessThanOrEqual(330)
      expect([98, 99]).toContain(orbit.spo2Pct)
    }
  })

  it('writes the elapsed time as a clock', () => {
    expect(clockText(72 * 60 + 5)).toBe('1:12:05')
  })
})
