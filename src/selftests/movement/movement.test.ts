import { describe, expect, it } from 'vitest'
import { type Landmark } from '../camera/landmarks'
import { bestLeg, heelRaiseTracker, sitToStandTracker, squatTracker } from './movement'

// A planted foot and two rigid segments viewed by a level camera. Project the same
// 3D movement from the front, three quarters or side with a small image oscillation.
const aspect = 16 / 9
function legFrame(bend: number, yaw: number, now: number, thighShare = 0.72, lift = 0) {
  const radians = Math.PI / 180
  const shank = bend * (1 - thighShare) * radians
  const thigh = bend * thighShare * radians
  const kneeY = -0.43 * Math.cos(shank),
    kneeZ = 0.43 * Math.sin(shank)
  const points: [number, number][] = [
    [kneeY - 0.44 * Math.cos(thigh), kneeZ - 0.44 * Math.sin(thigh)],
    [kneeY, kneeZ],
    [0, 0],
    [0.055, 0.15],
  ]
  const body: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
  const world: Landmark[] = []
  points.forEach(([baseY, forward], i) => {
    const index = [23, 25, 27, 31][i]
    const y = i === 3 ? baseY : baseY - lift
    const x = forward * Math.sin(yaw * radians)
    const z = forward * Math.cos(yaw * radians)
    world[index] = { x, y, z }
    body[index] = {
      x: 0.5 + (x * 0.68) / aspect + 0.001 * Math.cos(now / 87 + i),
      y: 0.9 + y * 0.68 + 0.0015 * Math.sin(now / 95 + i),
      visibility: 0.92,
    }
  })
  return { body, world }
}

describe('movement seen by the webcam', () => {
  it.each([0, 40, 90])(
    'counts three squats from a %i-degree view despite shallow depth and brief occlusion',
    (yaw) => {
      const tracker = squatTracker()
      let now = 0,
        reps = 0
      function frames(bends: number[], partlyHidden = false) {
        bends.forEach((bend, i) => {
          now += 67
          const frame = legFrame(bend, yaw, now)
          if (partlyHidden && i === 3) frame.body[27].visibility = 0.25
          reps = tracker.update(frame.body, aspect, now, frame.world).reps
        })
      }
      const top = 24 // The estimated standing knee angle is 156°, short of a fixed 160° lockout.
      frames([top, top, top, top])
      for (const bottom of [76, 58, 90]) {
        const before = reps
        const half = (bottom + top) / 2
        frames([half, bottom, bottom, bottom, bottom, bottom], true)
        expect(reps).toBe(before)
        frames([half, top + 3, top, top, top])
        expect(reps).toBe(before + 1)
      }
      expect(reps).toBe(3)
    },
  )

  it('keeps an upright or already crouched person at zero and ignores a one-frame jump', () => {
    const tracker = squatTracker()
    let now = 0
    const bends = [...Array(12).fill(75), ...Array(10).fill(15), 85, ...Array(12).fill(15)]
    for (const bend of bends) {
      now += 67
      const f = legFrame(bend, 5, now)
      expect(tracker.update(f.body, aspect, now, f.world).reps).toBe(0)
    }
  })

  it('distinguishes reaching down for a weight from a shallow squat with comparable knee flexion', () => {
    const tracker = squatTracker()
    let now = 0
    function frame(bend: number, fold: number) {
      now += 67
      const f = legFrame(bend, 65, now)
      const hip = f.body[23]
      f.body[11] = { x: hip.x - 0.4 * fold, y: hip.y - (0.29 - fold), visibility: 0.97 }
      return tracker.update(f.body, aspect, now, f.world)
    }
    for (let i = 0; i < 6; i++) frame(20, 0)
    for (let i = 0; i < 6; i++) frame(56, 0.16)
    // The shoulder estimate recovers first while the knees are still bent.
    for (let i = 0; i < 6; i++) frame(56, 0.015)
    for (let i = 0; i < 6; i++) expect(frame(20, 0).reps).toBe(0)
    for (let i = 0; i < 6; i++) frame(56, 0.02)
    for (let i = 0; i < 6; i++) frame(20, 0)
    expect(frame(20, 0).reps).toBe(1)
  })

  it.each([8, 12, 15, 24])('keeps the squat when a single ankle jumps at extension at %i Hz', (hz) => {
    const tracker = squatTracker()
    let now = 0
    let sample = 0
    function next(bend: number, misplacedAnkle = false) {
      now += (1000 / hz) * (1 + 0.18 * Math.sin(sample++))
      const f = legFrame(bend, 60, now)
      if (misplacedAnkle) f.body[27].x -= 0.15
      return tracker.update(f.body, aspect, now, f.world).reps
    }
    for (let i = 0; i < 5; i++) next(15)
    for (let i = 0; i < 7; i++) next(84)
    next(18)
    expect(next(15, true)).toBe(0)
    for (let i = 0; i < 5; i++) next(15)
    expect(next(15)).toBe(1)
  })

  it.each([true, false])(
    'requires a visible leg during a brief mid-rise occlusion (other leg visible: %s)',
    (otherVisible) => {
      const tracker = squatTracker()
      let now = 0
      function next(bend: number, clipped = false) {
        now += 100
        const f = legFrame(bend, 40, now)
        if (otherVisible) {
          for (const index of [23, 25, 27, 31]) {
            f.body[index + 1] = { ...f.body[index], x: f.body[index].x + 0.12, visibility: 0.8 }
            f.world[index + 1] = { ...f.world[index] }
          }
        }
        if (clipped) f.body[27].y = 1.015
        return tracker.update(f.body, aspect, now, f.world).reps
      }
      for (let i = 0; i < 5; i++) next(15)
      for (let i = 0; i < 7; i++) next(84)
      for (const bend of [70, 53, 38]) next(bend, true)
      for (let i = 0; i < 5; i++) next(15)
      expect(next(15)).toBe(otherVisible ? 1 : 0)
    },
  )

  it('keeps a visible ankle at the edge of the image and rejects hips-only framing', () => {
    const tracker = squatTracker()
    let now = 0,
      reps = 0
    for (const bend of [18, 18, 18, 70, 70, 70, 18, 18, 18]) {
      now += 67
      const f = legFrame(bend, 35, now)
      const offset = 0.995 - f.body[27].y
      for (const p of f.body) p.y += offset
      reps = tracker.update(f.body, aspect, now, f.world).reps
    }
    expect(reps).toBe(1)
    for (const bend of [75, 75, 75, 15, 15, 15]) {
      now += 67
      const f = legFrame(bend, 35, now)
      f.body[25].y = 1.1
      f.body[27].y = 1.3
      const view = tracker.update(f.body, aspect, now, f.world)
      expect(view.reps).toBe(1)
      expect(view.message).toMatch(/hip, knee and ankle/)
    }
  })

  it('uses actual 3D flexion if the flat image looks straight, with an image fallback for side views', () => {
    const front = legFrame(86, 0, 0),
      side = legFrame(86, 90, 0)
    expect(bestLeg(front.body, aspect)?.angle).toBeGreaterThan(170)
    expect(bestLeg(front.body, aspect, undefined, front.world)?.angle).toBeCloseTo(94)
    expect(bestLeg(side.body, aspect)?.angle).toBeCloseTo(94, 0)
    const tracker = squatTracker()
    let reps = 0,
      now = 0
    for (const bend of [15, 15, 15, 85, 85, 85, 15, 15, 15]) {
      now += 67
      const f = legFrame(bend, 90, now)
      reps = tracker.update(f.body, aspect, now).reps
    }
    expect(reps).toBe(1)
  })

  it('sees the horizontal thigh on a chair from the front and stops after five complete stands', () => {
    const tracker = sitToStandTracker(5)
    let now = 0
    const frame = (bend: number) => {
      now += 66
      const f = legFrame(bend, 3, now, 1)
      return tracker.update(f.body, aspect, now, f.world)
    }
    for (let i = 0; i < 17; i++) frame(90)
    expect(frame(90).phase).toBe('ready')
    tracker.go(now)
    for (let n = 1; n <= 5; n++) {
      for (const bend of [70, 50, 35, 18, 18, 18]) frame(bend)
      expect(frame(18).stands).toBe(n)
      for (const bend of [42, 60, 90, 90, 90]) frame(bend)
    }
    expect(frame(18).phase).toBe('done')
  })

  it('counts heel rise relative to a planted toe and ignores moving the camera and single-frame jitter', () => {
    const tracker = heelRaiseTracker()
    let now = 0,
      reps = 0
    const frame = (lift: number, offset = 0) => {
      now += 67
      const f = legFrame(7, 55, now, 0.72, lift)
      f.body.forEach((p) => {
        p.y += offset
      })
      reps = tracker.update(f.body, aspect, now, f.world).reps
    }
    for (let i = 0; i < 5; i++) frame(0)
    for (let i = 0; i < 5; i++) frame(0, -0.04)
    frame(0.035)
    for (let i = 0; i < 4; i++) frame(0)
    expect(reps).toBe(0)
    for (let rep = 1; rep <= 4; rep++) {
      for (let i = 0; i < 4; i++) frame(0.035)
      for (let i = 0; i < 5; i++) frame(0)
      expect(reps).toBe(rep)
    }
  })
})
