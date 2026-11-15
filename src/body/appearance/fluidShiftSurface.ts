import { Box2, BufferAttribute, MathUtils, Vector2, type BufferGeometry } from 'three'
import type { HeadFrame } from '../portrait/headFit'

/** Rest-space offsets, in metres, for the simulator's illustrative surface change at full shift. */
export function attachFluidShift(
  geometry: BufferGeometry,
  head: HeadFrame,
  height: number,
  skinVertices: number,
) {
  const position = geometry.getAttribute('position')
  const offsets = new Float32Array(position.count * 2)
  const calves = [new Box2(), new Box2()]
  const point = new Vector2()
  for (let i = 0; i < skinVertices; i++) {
    const y = position.getY(i) / height
    if (y < 0.17 || y > 0.22) continue
    const x = position.getX(i)
    calves[Number(x > head.x)].expandByPoint(point.set(x, position.getZ(i)))
  }
  const centers = calves.map((box) => (box.isEmpty() ? null : box.getCenter(new Vector2())))
  const { smoothstep } = MathUtils
  for (let i = 0; i < skinVertices; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i)
    const level = y / height
    if (level > 0.095 && level < 0.305) {
      const center = centers[Number(x > head.x)]
      if (!center) continue
      // Narrow each calf around its own axis, tapering before the ankle and knee.
      const weight = smoothstep(level, 0.095, 0.175) * (1 - smoothstep(level, 0.23, 0.305))
      const radial = point
        .set(center.x - x, center.y - z)
        .multiplyScalar(0.035)
        .clampLength(0, 0.003)
      offsets[i * 2] = radial.x * weight
      offsets[i * 2 + 1] = radial.y * weight
      continue
    }
    // Use the reference eye spacing for both builds. Eyes, nose, mouth and scalp
    // sit outside the two cheek patches; the appended portrait eye caps stay at zero.
    const lateral = (x - head.x) / head.eyeDistance
    const below = (head.y - y) / head.eyeDistance
    if (below <= 0.28 || below >= 0.94 || Math.abs(lateral) < 0.36 || Math.abs(lateral) > 1.2) continue
    const front = smoothstep((z - head.eyeZ) / head.eyeDistance, -0.48, -0.08)
    const radius = Math.hypot((Math.abs(lateral) - 0.78) / 0.42, (below - 0.61) / 0.33)
    const fullness = 0.0028 * front * (1 - smoothstep(radius, 0, 1))
    offsets[i * 2] = Math.sign(lateral) * 0.8 * fullness
    offsets[i * 2 + 1] = 0.6 * fullness
  }
  geometry.setAttribute('fluidOffset', new BufferAttribute(offsets, 2))
}
