import { describe, expect, it } from 'vitest'
import {
  PULSE_MOTION_LIMIT,
  REGIONS,
  averageSkin,
  headMotion,
  insidePolygon,
  regionPolygons,
  type Polygon,
} from './skinRegions'
import type { FacePoint } from '../face/faceMesh'

const square: Polygon = [
  [2, 2],
  [8, 2],
  [8, 8],
  [2, 8],
]

describe('skin regions', () => {
  it('uses valid, distinct face-mesh landmarks', () => {
    const all = Object.values(REGIONS).flat()
    expect(new Set(all).size).toBe(all.length)
    for (const i of all) expect(i >= 0 && i < 468).toBe(true)
  })

  it('tests points against a polygon', () => {
    expect(insidePolygon(5, 5, square)).toBe(true)
    expect(insidePolygon(9, 5, square)).toBe(false)
    expect(insidePolygon(5, 1, square)).toBe(false)
  })

  it('converts landmarks to pixel outlines', () => {
    const points: FacePoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.25, z: 0 }))
    const polys = regionPolygons(points, 160, 120)
    expect(polys.forehead).toHaveLength(REGIONS.forehead.length)
    expect(polys.leftCheek[0]).toEqual([80, 30])
  })

  it('averages only the skin inside the outlines and skips shadow and shine', () => {
    const w = 10
    const h = 10
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const inside = x >= 2 && x < 8 && y >= 2 && y < 8
        data.set(inside ? [180, 120, 100, 255] : [10, 200, 10, 255], i)
      }
    // One shiny pixel and one dark pixel inside the square must be ignored.
    data.set([255, 255, 255, 255], (4 * w + 4) * 4)
    data.set([5, 5, 5, 255], (5 * w + 5) * 4)
    const skin = averageSkin(data, w, h, [square], 5)!
    expect(skin.count).toBe(34)
    expect(skin.r).toBe(180)
    expect(skin.g).toBe(120)
    expect(skin.b).toBe(100)
  })

  it('returns null when a region is too small or off the image', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(128)
    expect(averageSkin(data, 10, 10, [square], 1000)).toBeNull()
    const off: Polygon = [
      [20, 20],
      [30, 20],
      [30, 30],
    ]
    expect(averageSkin(data, 10, 10, [off], 1)).toBeNull()
  })

  it('measures head movement between frames', () => {
    const a: FacePoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
    const b = a.map((p) => ({ ...p, x: p.x + 0.03 }))
    expect(headMotion(a, a)).toBe(0)
    expect(headMotion(a, b)).toBeCloseTo(0.03, 9)
    const smallShift = a.map((p) => ({ ...p, x: p.x + 0.0128 }))
    expect(headMotion(a, smallShift)).toBeLessThan(PULSE_MOTION_LIMIT)
    expect(headMotion(a, b)).toBeGreaterThan(PULSE_MOTION_LIMIT)
  })
})
