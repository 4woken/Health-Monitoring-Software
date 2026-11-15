import { Mesh, Raycaster, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { createRowingRig } from './rowing'
import { createRowingDevice } from './rowingDevice'

it.each([
  ['male', 1.75],
  ['female', 1.657],
] as const)('keeps the %s rig on the seat, grips and footplates through a full stroke', (build, height) => {
  const rig = createRowingRig(height, build)
  const machine = createRowingDevice()
  const samples = Array.from({ length: 17 }, (_, i) => (2.9 * i) / 16)
  const footNormal = new Vector3()
  const ray = new Raycaster()
  const point = new Vector3()
  const vertical = new Vector3(0, 1, 0)
  const cable = machine.root.getObjectByName('Cable') as Mesh
  const seat = machine.root.getObjectByName('Rowing seat')!
  for (const time of samples) {
    const pose = rig.sample(time)
    machine.update(pose)
    machine.root.updateMatrixWorld()
    expect(seat.getWorldPosition(point).distanceTo(pose.seat)).toBeLessThan(1e-6)
    const cableOutlet = cable.localToWorld(point.set(0, -0.5, 0))
    expect(cableOutlet.z - pose.handle.z).toBeGreaterThan(0.02 * height)
    const handleEnd = cable.localToWorld(point.set(0, 0.5, 0))
    expect(handleEnd.distanceTo(pose.handle)).toBeCloseTo((0.035 * height) / 1.75, 5)
    for (const [i, side] of ['left', 'right'].entries()) {
      const contact = pose.handle.clone()
      contact.x += (i ? 1 : -1) * pose.gripHalfWidth
      const grip = machine.root.getObjectByName('Grip ' + side)!
      ray.set(contact.clone().addScaledVector(vertical, 0.05), new Vector3(0, -1, 0))
      const [rubber] = ray.intersectObject(grip)
      expect(rubber.point.distanceTo(contact)).toBeLessThan(0.018)
      const plate = machine.root.getObjectByName('Footplate ' + side)!
      expect(plate.getWorldPosition(point).distanceTo(pose.heels[i])).toBeLessThan(1e-6)
      footNormal.set(0, Math.cos(pose.footAngle), -Math.sin(pose.footAngle))
      const sole = plate.localToWorld(point.set(0, 0, 0.065))
      ray.set(sole.clone().addScaledVector(footNormal, 0.018), footNormal.clone().negate())
      expect(ray.intersectObject(plate)[0].distance).toBeLessThan(0.025)
    }
  }
  machine.dispose()
})

it('lets the free webbing sag with cabin gravity while its buckle and length stay fixed', () => {
  const contacts = createRowingRig(1.75, 'male').sample(0.4)
  const device = createRowingDevice()
  const tab = device.root.getObjectByName('Free strap right') as Mesh
  const geometry = tab.geometry
  function center(row: number) {
    const position = geometry.getAttribute('position')
    const right = new Vector3().fromBufferAttribute(position, row * 4 + 3)
    return new Vector3().fromBufferAttribute(position, row * 4).lerp(right, 0.5)
  }
  function sample(g: number, time: number, reduce = false) {
    device.update(contacts, g, time, reduce)
    return center(12)
  }

  const float = sample(0, 0)
  const buckle = tab.position.clone()
  expect(center(0).length()).toBeLessThan(1e-6)
  const drift = [0.8, 1.6, 2.4, 3.2, 4].map((time) => float.distanceTo(sample(0, time)))
  expect(Math.max(...drift)).toBeGreaterThan(0.025)
  expect(sample(0, 1.3)).toEqual(sample(0, 1.3))
  expect(sample(0, 0, true)).toEqual(sample(0, 10, true))
  const [moon, mars, earth] = [0.16, 0.38, 1].map((g) => sample(g, 0))
  expect(float.y).toBeGreaterThan(moon.y + 0.04)
  expect(moon.y).toBeGreaterThan(mars.y + 0.03)
  expect(mars.y).toBeGreaterThan(earth.y + 0.015)
  expect(earth.y).toBeLessThan(-0.15)
  expect(tab.position).toEqual(buckle)
  for (const g of [0, 0.16, 0.38, 1]) {
    sample(g, 2.3)
    let length = 0
    for (let i = 1; i <= 12; i++) length += center(i).distanceTo(center(i - 1))
    expect(length).toBeCloseTo(0.23, 5)
  }
  device.dispose()
})
