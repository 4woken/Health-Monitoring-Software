import { describe, it, expect } from 'vitest'
import { assemblyTracker, kneeTracker, panelLayout, type Landmark } from './cameraGestures'

function hand(cursorX: number, closed: boolean, y = 0.5): Landmark[] {
  const x = 1 - cursorX
  const points = Array.from({ length: 21 }, () => ({ x, y }))
  points[0] = { x, y: y + 0.2 }
  points[4] = { x: x + (closed ? 0.018 : 0.12), y }
  points[5] = { x: x - 0.06, y: y + 0.08 }
  points[9] = { x, y: y + 0.07 }
  points[17] = { x: x + 0.07, y: y + 0.08 }
  return points
}
function leg(angle: number, visible = 1, side: 'left' | 'right' = 'left', aspect = 1): Landmark[] {
  const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }))
  const index = side === 'left' ? 23 : 24
  p[index] = { x: 0.32, y: 0.45, visibility: visible }
  p[index + 2] = { x: 0.52, y: 0.45, visibility: visible }
  p[index + 4] = {
    x: 0.52 - (0.24 * Math.cos((angle * Math.PI) / 180)) / aspect,
    y: 0.45 + 0.24 * Math.sin((angle * Math.PI) / 180),
    visibility: visible,
  }
  return p
}

describe('solar assembly', () => {
  it('accepts an observed open, pick up, continuous carry and drop only once', () => {
    const t = assemblyTracker(3, 0)
    const { from, to } = panelLayout(0, 3)
    let ms = 0
    const update = (x: number, closed: boolean) => t.update(hand(x, closed), 'Left', 1, (ms += 110))
    update(from.x, false)
    update(from.x, false)
    update(from.x, true)
    expect(update(from.x, true).carrying).toBe(true)
    update(0.45, true)
    update(0.56, true)
    update(to.x, true)
    update(to.x, false)
    expect(update(to.x, false).count).toBe(1)
    expect(update(to.x, false).count).toBe(1)
  })
  it('discards partial transfers on tracking loss, jumps, hand changes and drops outside the socket', () => {
    for (const mode of ['loss', 'jump', 'switch', 'miss']) {
      const t = assemblyTracker(3, 0)
      for (const [now, closed] of [
        [0, false],
        [120, false],
        [240, true],
        [360, true],
      ] as const)
        t.update(hand(0.3, closed), 'Left', 1, now)
      if (mode === 'loss') t.lost()
      if (mode === 'switch') t.update(hand(0.45, true), 'Right', 1, 420)
      if (mode !== 'jump') t.update(hand(0.48, true), 'Left', 1, 470)
      const release = mode === 'miss' ? 0.48 : 0.7
      t.update(hand(release, false), 'Left', 1, 620)
      expect(t.update(hand(release, false), 'Left', 1, 850).count).toBe(0)
    }
  })
})
describe('seated knee extension', () => {
  it('counts a complete held extension and return for the same visible leg at landscape aspect', () => {
    const t = kneeTracker(2)
    const at = (deg: number, now: number) => t.update(leg(deg, 1, 'left', 16 / 9), 16 / 9, now)
    at(90, 0)
    at(90, 200)
    at(123, 400)
    expect(at(130, 600).count).toBe(2)
    at(95, 700)
    expect(at(95, 900).count).toBe(3)
    expect(at(95, 1100).count).toBe(3)
  })
  it('requires a fresh observed start after low confidence, side changes or leaving the frame', () => {
    for (const mode of ['confidence', 'side', 'missing']) {
      const t = kneeTracker(0)
      t.update(leg(90), 1, 0)
      t.update(leg(90), 1, 200)
      t.update(leg(125), 1, 300)
      t.update(leg(125), 1, 500)
      const frame = mode === 'confidence' ? leg(125, 0.2) : mode === 'side' ? leg(125, 1, 'right') : []
      expect(t.update(frame, 1, 590).guide).toBeUndefined()
      t.update(leg(88), 1, 700)
      expect(t.update(leg(88), 1, 900).count).toBe(0)
    }
  })
})
