import { describe, expect, it } from 'vitest'
import { clockText, evaVitals } from './evaVitals'
import { centreOf, dwell, gazePoint, gazeSample, type Point } from './gaze'

/** A face looking at the camera, with the nose turned by `turn` and the irises moved by `look`, in image units. */
function face(turn = 0, look = 0): Point[] {
  const p: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
  // Right eye on the image's left, left eye on its right.
  p[33] = { x: 0.4, y: 0.4 }
  p[133] = { x: 0.46, y: 0.4 }
  p[159] = { x: 0.43, y: 0.39 }
  p[145] = { x: 0.43, y: 0.41 }
  p[468] = { x: 0.43 + look, y: 0.4 }
  p[362] = { x: 0.54, y: 0.4 }
  p[263] = { x: 0.6, y: 0.4 }
  p[386] = { x: 0.57, y: 0.39 }
  p[374] = { x: 0.57, y: 0.41 }
  p[473] = { x: 0.57 + look, y: 0.4 }
  p[1] = { x: 0.5 + turn, y: 0.47 }
  return p
}

describe('gaze from the webcam', () => {
  const centre = centreOf([gazeSample(face())!])!

  it('looks at the centre at rest', () => {
    expect(gazePoint(gazeSample(face())!, centre)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('moves right when the head turns right or the eyes look right', () => {
    // Turning to the person's right moves the nose and the irises to the left of the image.
    expect(gazePoint(gazeSample(face(-0.02))!, centre).x).toBeGreaterThan(0.5)
    expect(gazePoint(gazeSample(face(0, -0.01))!, centre).x).toBeGreaterThan(0.5)
    expect(gazePoint(gazeSample(face(0.02))!, centre).x).toBeLessThan(0.5)
  })

  it('needs the iris points', () => {
    expect(gazeSample(face().slice(0, 468))).toBeNull()
  })

  it('presses a button held under the gaze for a second, once', () => {
    const d = dwell(1000, 900)
    expect(d.update('hud', 0).press).toBe(false)
    expect(d.update('hud', 600).progress).toBeCloseTo(0.6)
    expect(d.update('hud', 1000).press).toBe(true)
    expect(d.update('hud', 1200).press).toBe(false)
    expect(d.update('other', 1950).progress).toBe(0)
  })

  it('starts again when the gaze leaves the button', () => {
    const d = dwell(1000)
    d.update('hud', 0)
    d.update(null, 500)
    expect(d.update('hud', 900).progress).toBe(0)
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
