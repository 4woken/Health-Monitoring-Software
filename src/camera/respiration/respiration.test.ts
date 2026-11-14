import { describe, it, expect } from 'vitest'
import { chestFlow, torsoRegions, type FrameFlow } from './opticalFlow'
import { BreathWindow } from './breathRate'

const width = 118
const height = 90
const regions = { face: { x: 38, y: 6, w: 39, h: 22 }, chest: { x: 15, y: 40, w: 88, h: 43 } }

function scene(chestShift: number, cameraShift = 0, illumination = 0) {
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const v = y - cameraShift - (y > 32 ? chestShift : 0)
    for (let x = 0; x < width; x++) {
      pixels[x + y * width] = Math.round(
        122 +
          24 * Math.sin(0.45 * v + 0.13 * x) +
          24 * Math.cos(0.27 * v - 0.43 * x) +
          14 * Math.cos(0.77 * v + 0.26 * x) +
          illumination,
      )
    }
  }
  return pixels
}

const track = (left: number, right = left, reference = 0): FrameFlow => ({
  status: 'tracking',
  left,
  right,
  reference,
})

function periodic(rate: number, seconds = 40, mode = 'chest') {
  const signal = new BreathWindow()
  let t = 0,
    prior = 0
  for (let i = 0; t < seconds; i++) {
    t += (1 + 0.32 * Math.sin(i * 0.47)) / 13
    const position = 0.84 * Math.sin(((t * rate) / 60) * 2 * Math.PI)
    const step = position - prior
    const l = mode === 'head' ? 0 : step
    signal.add(t, track(l, mode === 'oneSide' ? 0 : l, mode === 'head' || mode === 'camera' ? step : 0))
    prior = position
  }
  return { signal, t }
}

describe('webcam chest optical flow', () => {
  it('recovers subpixel chest displacement despite a change in brightness and common camera motion', () => {
    const flow = chestFlow(scene(0), scene(0.35, 0.2, 9), width, regions)
    expect(flow.status).toBe('tracking')
    if (flow.status === 'tracking') {
      expect(flow.left - flow.reference).toBeCloseTo(0.35, 1)
      expect(flow.right - flow.reference).toBeCloseTo(0.35, 1)
    }
  })
  it('rejects frames without trackable texture, obvious motion, no face, multiple faces and a cropped torso', () => {
    const blank = new Uint8Array(width * height)
    expect(chestFlow(blank, blank, width, regions).status).toBe('texture')
    expect(chestFlow(scene(0), scene(3.3), width, regions).status).not.toBe('tracking')
    const face = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.33 }))
    face[10] = { x: 0.5, y: 0.1 }
    face[152] = { x: 0.5, y: 0.42 }
    face[234] = { x: 0.4, y: 0.23 }
    face[454] = { x: 0.6, y: 0.23 }
    expect(torsoRegions([face], width, height)?.chest.y).toBeGreaterThan(0.42 * height)
    expect(torsoRegions([], width, height)).toBeNull()
    expect(torsoRegions([face, face], width, height)).toBeNull()
    face[152].y = 0.76
    expect(torsoRegions([face], width, height)).toBeNull()
  })
  it('measures 17 breaths/min directly from a rendered grayscale chest sequence', () => {
    const signal = new BreathWindow()
    let previous = scene(0)
    for (let i = 1; i <= 390; i++) {
      const t = i / 10
      const current = scene(
        0.72 * Math.sin(((t * 17) / 60) * 2 * Math.PI),
        0.12 * Math.sin(1.4 * t),
        5 * Math.sin(0.8 * t),
      )
      signal.add(t, chestFlow(previous, current, width, regions))
      previous = current
    }
    expect(signal.estimate().rate).toBe(17)
  })
})

describe('breathing estimate quality checks', () => {
  it.each([6, 12, 18, 26, 36])('recovers %i breaths per minute at irregular frame times', (rate) => {
    expect(periodic(rate).signal.estimate().rate).toBe(rate)
  })
  it.each(['head', 'camera', 'oneSide'])('rejects %s motion as a breathing signal', (mode) => {
    expect(periodic(16, 40, mode).signal.estimate().rate).toBeNull()
  })
  it('suppresses frozen, out-of-band, interrupted, and short captures', () => {
    for (const rate of [0, 3, 49]) expect(periodic(rate).signal.estimate().rate).toBeNull()
    expect(periodic(16, 20).signal.estimate().rate).toBeNull()
    for (const status of ['texture', 'motion'] as const) {
      const { signal, t } = periodic(16)
      signal.add(t + 0.08, { status })
      expect(signal.estimate()).toEqual({ rate: null, seconds: 0, wave: [] })
    }
    const { signal, t } = periodic(16)
    signal.add(t + 0.95, track(0))
    expect(signal.estimate().rate).toBeNull()
  })
  it('withdraws a previous estimate when motion stops', () => {
    const { signal, t } = periodic(16)
    for (let i = 1; i <= 62; i++) signal.add(t + i / 10, track(0))
    expect(signal.estimate().rate).toBeNull()
  })
})
