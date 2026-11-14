import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { refinePortraitSkin } from './refinePortraitSkin'

it('shares the split edge with the neck and preserves the surface and winding on both sides', () => {
  const skin = new BufferGeometry()
  // One triangle lies in the face, its neighbour extends beyond the jaw.
  const xyz = [-0.01, 1.5, 0.08, 0.01, 1.5, 0.08, 0, 1.53, 0.08, 0, 1.42, 0.08]
  skin.setAttribute('position', new Float32BufferAttribute(xyz, 3))
  skin.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  skin.setIndex([0, 1, 2, 1, 0, 3])
  const refined = refinePortraitSkin(skin, { x: 0, y: 1.6, eyeDistance: 0.06, eyeZ: 0.05 })
  const pos = refined.getAttribute('position')
  const indices = refined.getIndex()!
  expect(pos.count).toBe(7)
  expect(indices.count).toBe(18)
  const edgeUse = new Map<string, number>()
  let area = 0
  for (let i = 0; i < indices.count; i += 3) {
    const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
    const [a, b, c] = ids.map((v) => new Vector3().fromBufferAttribute(pos, v))
    const cross = b.sub(a).cross(c.sub(a))
    expect(cross.z).toBeGreaterThan(0)
    area += cross.z / 2
    for (let j = 0; j < 3; j++) {
      const edge = [ids[j], ids[(j + 1) % 3]].sort((a, b) => a - b).join('/')
      edgeUse.set(edge, (edgeUse.get(edge) ?? 0) + 1)
    }
  }
  expect(area).toBeCloseTo((0.02 * (0.03 + 0.08)) / 2, 8)
  // Both sides follow the same new vertex when the fitted jaw moves.
  const seam = Array.from({ length: pos.count }, (_, i) => i).find(
    (i) => pos.getX(i) === 0 && pos.getY(i) === pos.getY(0),
  )
  expect(seam).toBeDefined()
  expect(edgeUse.has('0/1')).toBe(false)
  expect(edgeUse.get(`0/${seam}`)).toBe(2)
  expect(edgeUse.get(`1/${seam}`)).toBe(2)
  expect(skin.getAttribute('position').count).toBe(4)
})
