import { describe, expect, it } from 'vitest'
import {
  checkStance,
  CONDITIONS,
  holdTracker,
  judgeBalance,
  totalHeld,
  balanceDetails,
} from './balance/balance'
import type { Landmark } from './camera/landmarks'
import { layout, pinchTracker, targetExtent } from './dexterity/pinch'
import { heelRaiseTracker, sitToStandTracker, squatTracker } from './movement/movement'
import { sideOn, standing } from './testing'
import {
  chartLines,
  coveredEyes,
  eyeScore,
  irisDistanceMm,
  letterMm,
  logMARof,
  snellen,
  testDistanceMm,
} from './vision/acuity'

const WIDE = 16 / 9

describe('vision', () => {
  it('sizes letters on the logMAR scale', () => {
    // 20/20 at 40 cm is about 0.58 mm tall.
    expect(letterMm(0, 400)).toBeCloseTo(0.582, 2)
    expect(logMARof(letterMm(0.3, 650), 650)).toBeCloseTo(0.3, 6)
    expect(snellen(0)).toBe('20/20')
    expect(snellen(0.3)).toBe('20/40')
  })

  it('tests at 40 cm on a fine screen and farther on a coarse one', () => {
    expect(testDistanceMm(10)).toBe(400)
    expect(testDistanceMm(4)).toBeGreaterThan(400)
    const lines = chartLines(testDistanceMm(4), 4)
    expect(lines[0].logMAR).toBeGreaterThan(0.9)
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].logMAR).toBeLessThan(lines[i - 1].logMAR)
      expect(lines[i].unit).toBeLessThan(lines[i - 1].unit)
    }
    expect(lines[lines.length - 1].logMAR).toBeLessThanOrEqual(0.05)
  })

  it('scores an eye on the smallest line passed, with credit for letters below it', () => {
    const lines = [0.5, 0.4, 0.3, 0.2].map((logMAR, i) => ({ unit: 10 - i, logMAR }))
    expect(eyeScore(lines, [5, 4, 3, 1])).toBe(0.28)
    expect(eyeScore(lines, [2])).toBeNull()
    expect(eyeScore(lines, [5, 5, 5, 5])).toBe(0.2)
  })

  it('gauges distance from the iris size', () => {
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
    // An iris 20 px wide in a 640 px image.
    const iris = (centre: number, x: number) => {
      points[centre] = { x, y: 0.5 }
      points[centre + 1] = { x: x + 10 / 640, y: 0.5 }
      points[centre + 3] = { x: x - 10 / 640, y: 0.5 }
      points[centre + 2] = { x, y: 0.5 - 10 / 480 }
      points[centre + 4] = { x, y: 0.5 + 10 / 480 }
    }
    iris(468, 0.45)
    iris(473, 0.55)
    const focal = 320 / Math.tan((31.5 * Math.PI) / 180)
    expect(irisDistanceMm(points, 640, 480)).toBeCloseTo((focal * 11.7) / 20, 0)
    expect(irisDistanceMm(points.slice(0, 468), 640, 480)).toBeNull()
  })

  it('sees which eye a hand covers', () => {
    const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
    for (const i of [33, 133, 159, 145, 160, 144, 158, 153]) face[i] = { x: 0.42 + (i % 3) * 0.01, y: 0.4 }
    for (const i of [362, 263, 386, 374, 385, 380, 387, 373]) face[i] = { x: 0.56 + (i % 3) * 0.01, y: 0.4 }
    const palm = [{ x: 0.57, y: 0.41 }]
    expect(coveredEyes(face, [palm])).toEqual({ right: false, left: true })
    expect(coveredEyes(face, [])).toEqual({ right: false, left: false })
  })
})

/** Frames every 66 ms for `seconds`, from a body that may change with time. */
function feed(
  tracker: ReturnType<typeof holdTracker>,
  start: number,
  seconds: number,
  body: (t: number) => Landmark[] | null,
  eyes: (t: number) => boolean | null = () => null,
) {
  for (let t = 0; t <= seconds * 1000; t += 66) {
    const r = tracker.update({ now: start + t, aspect: WIDE, body: body(t), eyesClosed: eyes(t) })
    if (r.done) return r.done
  }
  return null
}

describe('balance', () => {
  it('checks each stance', () => {
    expect(checkStance(standing(), 'together', WIDE).ok).toBe(true)
    expect(checkStance(standing({ 27: { x: 0.57 }, 28: { x: 0.43 } }), 'together', WIDE).ok).toBe(false)
    expect(checkStance(standing({ 27: { x: 0.505 }, 28: { x: 0.495, y: 0.875 } }), 'tandem', WIDE).ok).toBe(
      true,
    )
    expect(checkStance(standing({ 28: { y: 0.8 } }), 'leftLeg', WIDE).ok).toBe(true)
    expect(checkStance(standing(), 'leftLeg', WIDE).ok).toBe(false)
    expect(checkStance(null, 'together', WIDE).hint).toMatch(/whole body/)
  })

  it('holds a stance for its full time and measures the sway', () => {
    const c = CONDITIONS[0]
    const hold = feed(holdTracker(c, 0), 0, c.seconds + 1, (t) =>
      standing({ 11: { x: 0.56 + 0.002 * Math.sin(t / 300) }, 12: { x: 0.44 + 0.002 * Math.sin(t / 300) } }),
    )
    expect(hold?.completed).toBe(true)
    expect(hold?.heldS).toBe(c.seconds)
    expect(hold?.swayCm).toBeGreaterThan(0)
  })

  it('stops when a foot moves, or when closed eyes open', () => {
    const together = CONDITIONS[0]
    const moved = feed(holdTracker(together, 0), 0, 25, (t) =>
      t < 8000 ? standing() : standing({ 27: { x: 0.56 } }),
    )
    expect(moved?.completed).toBe(false)
    expect(moved?.heldS).toBeCloseTo(8, 0)
    expect(moved?.reason).toMatch(/foot/)

    const closed = CONDITIONS.find((c) => c.id === 'togetherClosed')!
    const opened = feed(
      holdTracker(closed, 0),
      0,
      25,
      () => standing(),
      (t) => t < 5000,
    )
    expect(opened?.reason).toMatch(/eyes/)
    expect(opened?.heldS).toBeCloseTo(5, 0)
    expect(opened?.eyesChecked).toBe(true)
  })

  it('stops a one-leg stance when the raised foot touches down', () => {
    const left = CONDITIONS.find((c) => c.id === 'leftLeg')!
    const hold = feed(holdTracker(left, 0), 0, 20, (t) => standing({ 28: { y: t < 6000 ? 0.8 : 0.86 } }))
    expect(hold?.reason).toMatch(/touched down/)
    expect(hold?.heldS).toBeCloseTo(6, 0)
  })

  it('tells a lost camera view apart from a lost balance', () => {
    const hold = feed(holdTracker(CONDITIONS[0], 0), 0, 25, (t) => (t < 3000 ? standing() : null))
    expect(hold?.interrupted).toBe(true)
  })
  it('does not award the final seconds if tracking or the stance was lost before the deadline', () => {
    const c = CONDITIONS[0]
    const end = c.seconds * 1000
    const lost = feed(holdTracker(c, 0), 0, c.seconds + 2, (t) => (t < end - 800 ? standing() : null))
    expect(lost?.interrupted).toBe(true)
    expect(lost?.heldS).toBeLessThan(c.seconds)
    const moved = feed(holdTracker(c, 0), 0, c.seconds + 2, (t) =>
      t < end - 200 ? standing() : standing({ 28: { x: 0.56 } }),
    )
    expect(moved?.completed).toBe(false)
    expect(moved?.reason).toMatch(/foot/)
  })

  it('flags a one-leg stance under 15 seconds before the usual result is set', () => {
    const holds = CONDITIONS.map((c) => ({
      id: c.id,
      heldS: c.id === 'leftLeg' ? 9 : c.seconds,
      targetS: c.seconds,
      completed: c.id !== 'leftLeg',
      swayCm: 1,
      eyesChecked: true,
      nods: 0,
    }))
    const details = balanceDetails(holds, 'camera')
    expect(judgeBalance(totalHeld(holds), details, []).level).toBe('watch')
  })
})

describe('legs', () => {
  const seated = sideOn([0.45, 0.55], [0.6, 0.56], [0.6, 0.8])
  const up = sideOn([0.58, 0.4], [0.6, 0.6], [0.6, 0.8])

  it('requires the seated start at go and a fresh observed sit after losing the leg', () => {
    const t = sitToStandTracker(1)
    t.update(seated, WIDE, 0)
    expect(t.update(seated, WIDE, 1000).phase).toBe('ready')
    expect(t.update(up, WIDE, 1100).phase).toBe('seat')
    t.go(1200)
    expect(t.update(up, WIDE, 1300).phase).toBe('seat')
    t.update(seated, WIDE, 1400)
    t.update(seated, WIDE, 2400)
    t.go(2400)
    t.update(null, WIDE, 2500)
    expect(t.update(up, WIDE, 2700).stands).toBe(0)
    t.update(seated, WIDE, 2900)
    expect(t.update(up, WIDE, 3400).timeS).toBe(1)
  })

  it('discards partially observed squats and heel raises', () => {
    const squat = squatTracker()
    squat.update(up, WIDE)
    squat.update(sideOn([0.45, 0.6], [0.6, 0.62], [0.57, 0.82]), WIDE)
    squat.update(null, WIDE)
    expect(squat.update(up, WIDE).reps).toBe(0)
    const heel = heelRaiseTracker()
    const toes = sideOn([0.6, 0.38], [0.6, 0.58], [0.6, 0.775])
    heel.update(up, WIDE)
    heel.update(toes, WIDE)
    heel.update(null, WIDE)
    expect(heel.update(up, WIDE).reps).toBe(0)
  })

  it('times five stands from go to the fifth time up', () => {
    const t = sitToStandTracker(5)
    let now = 0
    for (; now < 1000; now += 66) t.update(seated, 4 / 3, now)
    expect(t.update(seated, 4 / 3, now).phase).toBe('ready')
    t.go(now)
    const goAt = now
    let view = t.update(seated, 4 / 3, now)
    for (let i = 0; i < 5; i++) {
      for (let k = 0; k < 8; k++) view = t.update(up, 4 / 3, (now += 66))
      if (i < 4) for (let k = 0; k < 8; k++) view = t.update(seated, 4 / 3, (now += 66))
    }
    expect(view.phase).toBe('done')
    expect(view.stands).toBe(5)
    expect(view.timeS).toBeCloseTo((now - goAt - 7 * 66) / 1000, 1)
  })

  it('counts squats and marks shallow ones', () => {
    const t = squatTracker()
    const stand = sideOn([0.58, 0.4], [0.6, 0.6], [0.6, 0.8])
    const deep = sideOn([0.45, 0.6], [0.6, 0.62], [0.57, 0.82])
    let view = t.update(stand, 4 / 3)
    for (let i = 0; i < 3; i++) {
      view = t.update(deep, 4 / 3)
      view = t.update(stand, 4 / 3)
    }
    expect(view.reps).toBe(3)
    expect(view.shallow).toBe(0)
  })

  it('counts heel raises with straight knees', () => {
    const t = heelRaiseTracker()
    const flat = sideOn([0.6, 0.4], [0.6, 0.6], [0.6, 0.8])
    const toes = sideOn([0.6, 0.38], [0.6, 0.58], [0.6, 0.775])
    let view = t.update(flat, 4 / 3)
    for (let i = 0; i < 4; i++) {
      view = t.update(toes, 4 / 3)
      view = t.update(flat, 4 / 3)
    }
    expect(view.reps).toBe(4)
  })
})

describe('hand dexterity', () => {
  /** A hand whose index tip is at (x, y) in the camera image, open or pinched. */
  function hand(x: number, y: number, pinched: boolean): Landmark[] {
    const p: Landmark[] = Array.from({ length: 21 }, () => ({ x, y: y + 0.05 }))
    p[0] = { x, y: y + 0.2 }
    p[9] = { x, y: y + 0.1 }
    p[5] = { x: x - 0.03, y: y + 0.1 }
    p[17] = { x: x + 0.03, y: y + 0.1 }
    p[8] = { x, y }
    p[4] = pinched ? { x: x + 0.01, y: y + 0.01 } : { x: x + 0.08, y: y + 0.05 }
    return p
  }

  it('counts a cell carried to its socket, and a cell dropped on the way', () => {
    const t = pinchTracker(8)
    const { from, to } = layout(0)
    // The preview is mirrored: a cursor at x comes from an index tip at 1 - x.
    let now = 0
    const step = (x: number, y: number, pinched: boolean, frames = 4) => {
      let v = t.update(hand(1 - x, y, pinched), 'Right', 4 / 3, now)
      for (let i = 0; i < frames; i++) v = t.update(hand(1 - x, y, pinched), 'Right', 4 / 3, (now += 40))
      return v
    }
    step(from.x, from.y, false)
    expect(step(from.x, from.y, true).carrying).toBe(true)
    for (let x = from.x; x <= to.x; x += 0.04)
      step(x, from.y + ((to.y - from.y) * (x - from.x)) / (to.x - from.x), true, 1)
    const placed = step(to.x, to.y, false)
    expect(placed.count).toBe(1)

    const next = layout(1)
    step(next.from.x, next.from.y, false)
    step(next.from.x, next.from.y, true)
    const dropped = step(next.from.x, next.from.y, false)
    expect(dropped.drops).toBe(1)
    expect(dropped.count).toBe(1)
  })
  it('matches the full drawn socket on landscape and portrait cameras', () => {
    for (const aspect of [16 / 9, 9 / 16]) {
      const t = pinchTracker(1)
      const { from, to, radius } = layout(0)
      const ext = targetExtent(radius, aspect)
      expect(ext.x * aspect).toBeCloseTo(ext.y)
      let now = 0
      const frame = (x: number, y: number, closed: boolean) =>
        t.update(hand(1 - x, y, closed), 'Right', aspect, (now += 100))
      frame(from.x, from.y, false)
      frame(from.x, from.y, false)
      frame(from.x, from.y, true)
      expect(frame(from.x, from.y, true).carrying).toBe(true)
      expect(frame(0.5, from.y, true).carrying).toBe(true)
      const x = to.x + ext.x * 0.8,
        y = to.y + ext.y * 0.8
      frame(x, y, false)
      expect(frame(x, y, false).count).toBe(1)
    }
  })
})
