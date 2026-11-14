import { BufferAttribute, BufferGeometry } from 'three'
import type { HeadFrame } from './headFit'

/** Give a fitted portrait more samples on the cheeks, jaw and forehead. Each
 * shared edge gets one midpoint, including at the transition into the atlas.
 * Linear subdivision keeps the unfitted surface and its silhouette intact. */
export function refinePortraitSkin(skin: BufferGeometry, head: HeadFrame): BufferGeometry {
  const position = skin.getAttribute('position')
  const normal = skin.getAttribute('normal')
  const index = skin.getIndex()!
  const count = position.count
  const inFace = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    const y = (position.getY(i) - head.y) / head.eyeDistance
    inFace[i] = Number(
      Math.abs(position.getX(i) - head.x) < head.eyeDistance * 1.45 &&
        y > -2.2 &&
        y < 1.5 &&
        position.getZ(i) > head.eyeZ - 0.032,
    )
  }

  const midpointSources: [number, number][] = []
  const midpoints = new Map<number, number>()
  const addedPositions: number[] = []
  const addedNormals: number[] = []
  const maxLengthSquared = (head.eyeDistance * 0.08) ** 2
  function midpoint(a: number, b: number): number | undefined {
    if (!inFace[a] || !inFace[b]) return
    const key = Math.min(a, b) * count + Math.max(a, b)
    const cached = midpoints.get(key)
    if (cached !== undefined) return cached
    const ax = position.getX(a),
      ay = position.getY(a),
      az = position.getZ(a)
    const bx = position.getX(b),
      by = position.getY(b),
      bz = position.getZ(b)
    if ((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2 <= maxLengthSquared) return
    const nx = normal.getX(a) + normal.getX(b)
    const ny = normal.getY(a) + normal.getY(b)
    const nz = normal.getZ(a) + normal.getZ(b)
    const length = Math.hypot(nx, ny, nz)
    const id = count + addedPositions.length / 3
    addedPositions.push((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    if (length > 1e-6) addedNormals.push(nx / length, ny / length, nz / length)
    else addedNormals.push(normal.getX(a), normal.getY(a), normal.getZ(a))
    midpointSources.push([a, b])
    midpoints.set(key, id)
    return id
  }

  const triangles: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2)
    const ab = midpoint(a, b),
      bc = midpoint(b, c),
      ca = midpoint(c, a)
    if (ab !== undefined && bc !== undefined && ca !== undefined) {
      triangles.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
    } else if (ab !== undefined && bc !== undefined) {
      triangles.push(ab, b, bc, a, ab, bc, a, bc, c)
    } else if (bc !== undefined && ca !== undefined) {
      triangles.push(bc, c, ca, b, bc, ca, b, ca, a)
    } else if (ca !== undefined && ab !== undefined) {
      triangles.push(ca, a, ab, c, ca, ab, c, ab, b)
    } else if (ab !== undefined) triangles.push(a, ab, c, ab, b, c)
    else if (bc !== undefined) triangles.push(b, bc, a, bc, c, a)
    else if (ca !== undefined) triangles.push(c, ca, b, ca, a, b)
    else triangles.push(a, b, c)
  }

  const refined = new BufferGeometry()
  for (const [attr, extra] of [
    ['position', addedPositions],
    ['normal', addedNormals],
  ] as const) {
    const source = skin.getAttribute(attr).array
    const values = new Float32Array(source.length + extra.length)
    values.set(source)
    values.set(extra, source.length)
    refined.setAttribute(attr, new BufferAttribute(values, 3))
  }
  // Keep source UV seams and baked skin-region weights on subdivided triangles.
  for (const name of ['uv', 'skinDetail']) {
    const source = skin.getAttribute(name)
    if (!source) continue
    const size = source.itemSize
    const values =
      name === 'skinDetail'
        ? new Uint8Array((count + midpointSources.length) * size)
        : new Float32Array((count + midpointSources.length) * size)
    values.set(source.array)
    midpointSources.forEach(([a, b], i) => {
      for (let c = 0; c < size; c++)
        values[(count + i) * size + c] = (source.array[a * size + c] + source.array[b * size + c]) * 0.5
    })
    refined.setAttribute(name, new BufferAttribute(values, size, source.normalized))
  }
  refined.setIndex(triangles)
  return refined
}
