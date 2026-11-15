import { Vector3 } from 'three'
import { expect, it } from 'vitest'
import { torsoShape } from '../crew/torsoFit'
import { createRowingRig } from './rowing'

it.each([
  {
    build: 'male' as const,
    h: 1.75,
    shoulder: [0.174, 1.422, -0.039],
    knee: [0.081, 0.497, -0.002],
    ankle: [0.08, 0.078, -0.024],
    elbow: [0.231, 1.155, -0.055],
    wrist: [0.255, 0.932, 0.003],
    knuckle: [0.283, 0.84, 0.057],
    heel: [0.083, -0.0045, -0.085],
  },
  {
    build: 'female' as const,
    h: 1.657,
    shoulder: [0.167, 1.35, -0.035],
    knee: [0.118, 0.482, -0.006],
    ankle: [0.125, 0.07, -0.024],
    elbow: [0.249, 1.093, -0.012],
    wrist: [0.357, 0.907, 0.037],
    knuckle: [0.407, 0.832, 0.057],
    heel: [0.13, 0.01, -0.076],
  },
])(
  'keeps the $build shoes planted and both grips connected through the whole stroke',
  ({ build, h, knee, ankle, shoulder, elbow, wrist, knuckle, heel }) => {
    const reference = () => 1
    for (const fit of [
      reference,
      torsoShape(build, h, 1, { chestCm: 110, waistCm: 94 }),
      torsoShape(build, h, 1, { chestCm: 35, waistCm: 240 }),
    ]) {
      const rig = createRowingRig(h, build, fit)
      const fixed = rig.sample(0).heels.map((v) => v.clone())
      let worstJointGap = 0
      for (let k = 0; k <= 116; k++) {
        const contact = rig.sample(k * 0.025)
        for (const [i, sign] of ([-1, 1] as const).entries()) {
          const rest = (p: number[]) => new Vector3(sign * p[0] * fit(p[1]), p[1], p[2] * fit(p[1]))
          const [upper, fore, hand, thigh, shin, shoe] = rig.bones.slice(6 * i, 6 * i + 6)
          for (const [a, b, p] of [
            [upper, fore, elbow],
            [fore, hand, wrist],
            [thigh, shin, knee],
            [shin, shoe, ankle],
          ] as const)
            worstJointGap = Math.max(
              worstJointGap,
              rest(p).applyMatrix4(a).distanceTo(rest(p).applyMatrix4(b)),
            )
          if (k === 0 && fit === reference) {
            const atElbow = rest(elbow).applyMatrix4(fore)
            const proximal = rest(shoulder).applyMatrix4(upper).sub(atElbow)
            const distal = rest(wrist).applyMatrix4(hand).sub(atElbow)
            expect((proximal.angleTo(distal) * 180) / Math.PI).toBeGreaterThan(150)
          }
          const grip = contact.handle.clone().add(new Vector3(sign * contact.gripHalfWidth, h * 0.0125, 0))
          expect(rest(knuckle).applyMatrix4(hand).distanceTo(grip)).toBeLessThan(1e-5)
          expect(rest(heel).applyMatrix4(shoe).distanceTo(fixed[i])).toBeLessThan(1e-5)
        }
      }
      expect(worstJointGap).toBeLessThan(0.001)
    }
  },
)

it('holds the body and the machine at the same stroke phase with reduced motion', () => {
  const rig = createRowingRig(1.75, 'male')
  const first = rig.sample(0.63, true).handle.clone()
  const pose = rig.bones.map((b) => b.clone())
  const last = rig.sample(41, true)
  expect(last.handle).toEqual(first)
  expect(rig.bones).toEqual(pose)
})
