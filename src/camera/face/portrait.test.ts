import { describe, it, expect } from 'vitest'
import { assessFace, faceCalibration, normaliseFace, type AvatarPoint } from './portrait'
const face = (): AvatarPoint[] => {
  const points = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  for (const i of [33, 133]) points[i] = { x: 0.35, y: 0.4, z: 0 }
  for (const i of [362, 263]) points[i] = { x: 0.65, y: 0.4, z: 0 }
  points[10] = { x: 0.5, y: 0.15, z: 0 }
  points[152] = { x: 0.5, y: 0.85, z: 0 }
  points[1] = { x: 0.5, y: 0.48, z: -0.05 }
  return points
}
describe('head registration', () => {
  it('keeps the same face coordinates after translation, camera-distance change and head rotation', () => {
    const points = face(),
      reference = normaliseFace(points, 640, 640)
    const transformed = points.map((p) => {
      const x = p.x - 0.5,
        y = p.y - 0.4,
        z = p.z
      const xx = x * Math.cos(0.2) + z * Math.sin(0.2),
        zz = -x * Math.sin(0.2) + z * Math.cos(0.2)
      return {
        x: 0.55 + 0.8 * (xx * Math.cos(0.12) - y * Math.sin(0.12)),
        y: 0.45 + 0.8 * (xx * Math.sin(0.12) + y * Math.cos(0.12)),
        z: zz * 0.8,
      }
    })
    const actual = normaliseFace(transformed, 640, 640)
    for (const i of [1, 10, 33, 133, 152, 263, 362]) {
      expect(actual[i].x).toBeCloseTo(reference[i].x)
      expect(actual[i].y).toBeCloseTo(reference[i].y)
      expect(actual[i].z).toBeCloseTo(reference[i].z)
    }
  })
  it('rejects incomplete, invalid and degenerate landmarks before rendering', () => {
    expect(() => normaliseFace([], 640, 480)).toThrow()
    expect(() => normaliseFace(face(), 0, 480)).toThrow()
    expect(() =>
      normaliseFace(
        face().map((p) => ({ ...p, x: NaN })),
        640,
        480,
      ),
    ).toThrow()
    expect(() =>
      normaliseFace(
        Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
        640,
        480,
      ),
    ).toThrow()
  })
  it('bounds adjustments without modifying their source', () => {
    const input = { scale: 10, x: NaN, y: -20, skinMatch: 2, shape: 3 }
    expect(faceCalibration(input)).toEqual({ scale: 1.25, x: 0, y: -0.35, skinMatch: 1, shape: 1 })
    expect(input.scale).toBe(10)
  })
})
describe('capture guidance', () => {
  it('accepts a complete frontal face and rejects absent or clipped frames', () => {
    expect(assessFace(face(), 120).ready).toBe(true)
    expect(assessFace(undefined, 120).ready).toBe(false)
    const clipped = face()
    clipped[10].y = -0.1
    expect(assessFace(clipped, 120).ready).toBe(false)
  })
  it('rejects a sideways face, a small face and unusable lighting', () => {
    const turned = face()
    turned[33].z = turned[133].z = 0.15
    expect(assessFace(turned, 120).ready).toBe(false)
    expect(
      assessFace(
        face().map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.2, y: 0.5 + (p.y - 0.5) * 0.2, z: p.z })),
        120,
      ).ready,
    ).toBe(false)
    expect(assessFace(face(), 0).ready).toBe(false)
    expect(assessFace(face(), 255).ready).toBe(false)
  })
})
