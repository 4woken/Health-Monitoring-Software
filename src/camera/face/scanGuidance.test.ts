import { describe, expect, it } from 'vitest'
import { assessScanView, assembleScan } from './scanGuidance'
import type { PortraitView } from './portrait'

/** Parallel-camera projections with known yaw, roll, and unchanged facial shape. */
function photo(yaw: number, roll = 0): PortraitView {
  const face = Array.from({ length: 468 }, () => ({ x: 0, y: 0, z: 0 }))
  for (const i of [33, 133]) face[i].x = -0.17
  for (const i of [263, 362]) face[i].x = 0.17
  face[10].y = -0.23
  face[152].y = 0.27
  face[1].z = -0.08
  const r = (yaw * Math.PI) / 180
  const points = face.map((p) => {
    const x = p.x * Math.cos(r) - p.z * Math.sin(r)
    const z = p.x * Math.sin(r) + p.z * Math.cos(r)
    return {
      x: 0.5 + x * Math.cos(roll) - p.y * Math.sin(roll),
      y: 0.5 + x * Math.sin(roll) + p.y * Math.cos(roll),
      z,
    }
  })
  return { points, width: 800, height: 800, imageUrl: `fixture-${yaw}` }
}

describe('guided three-angle capture', () => {
  it('accepts the intended side and refuses the mirrored opposite, duplicate front and over-rotation', () => {
    expect(assessScanView(photo(0), 100, 'front').ready).toBe(true)
    expect(assessScanView(photo(29), 100, 'left').ready).toBe(true)
    expect(assessScanView(photo(-30), 100, 'right').ready).toBe(true)
    expect(assessScanView(photo(29), 100, 'right').ready).toBe(false)
    expect(assessScanView(photo(0), 100, 'left').ready).toBe(false)
    expect(assessScanView(photo(46), 100, 'left').ready).toBe(false)
    expect(assessScanView(photo(29), 100, 'front').ready).toBe(false)
    expect(assessScanView(photo(29), 100).ready).toBe(false)
  })
  it('still applies lighting, roll and clipping checks to oblique photos', () => {
    expect(assessScanView(photo(29), 12, 'left').ready).toBe(false)
    expect(assessScanView(photo(29, 0.4), 100, 'left').ready).toBe(false)
    const clipped = photo(29)
    clipped.points[152].y = 0.99
    expect(assessScanView(clipped, 100, 'left').ready).toBe(false)
  })
  it('retains all three photographs alongside solved coordinates and blocks incomplete or duplicate sets', () => {
    const front = photo(0),
      left = photo(30),
      right = photo(-30)
    const capture = assembleScan({ front, left, right })
    expect(capture.sideViews).toEqual({ left, right })
    expect(capture.surface).toHaveLength(468)
    expect(capture.points).toBe(front.points)
    expect(() => assembleScan({ front, left })).toThrow()
    expect(() => assembleScan({ front, left, right: left })).toThrow()
  })
})
