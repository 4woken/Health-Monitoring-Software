export interface FaceEdge {
  start: number
  end: number
}
export interface FacePoint {
  x: number
  y: number
  z: number
}
export const FACE_VERTEX_COUNT = 468

/** Recover closed contour rings even when MediaPipe's connection list is not ordered. */
export function faceContours(edges: FaceEdge[]): number[][] {
  const neighbours = new Map<number, number[]>(),
    remaining = new Set<number>()
  for (const { start, end } of edges) {
    neighbours.set(start, [...(neighbours.get(start) ?? []), end])
    neighbours.set(end, [...(neighbours.get(end) ?? []), start])
    remaining.add(start)
    remaining.add(end)
  }
  const rings: number[][] = []
  while (remaining.size) {
    const start = remaining.values().next().value!,
      ring: number[] = []
    let current = start,
      previous = -1
    do {
      ring.push(current)
      remaining.delete(current)
      const next = neighbours.get(current)?.find((n) => n !== previous)
      if (next === undefined || ring.length > edges.length) throw new Error('Open facial contour')
      previous = current
      current = next
    } while (current !== start)
    rings.push(ring)
  }
  return rings
}

/** MediaPipe tessellation stores the three directed edges of each closed triangle. */
export function faceIndices(edges: FaceEdge[]): number[] {
  if (edges.length % 3 !== 0) throw new Error('Incomplete face topology')
  const indices: number[] = []
  for (let i = 0; i < edges.length; i += 3) {
    const [a, b, c] = edges.slice(i, i + 3)
    if (a.end !== b.start || b.end !== c.start || c.end !== a.start) throw new Error('Open face triangle')
    const triangle = [a.start, a.end, b.end]
    if (triangle.some((index) => !Number.isInteger(index) || index < 0 || index >= FACE_VERTEX_COUNT))
      throw new Error('Invalid face vertex')
    indices.push(...triangle)
  }
  return indices
}

export function writeFaceSurface(
  points: { x: number; y: number; z: number }[],
  aspect: number,
  positions: Float32Array,
  uvs: Float32Array,
) {
  if (points.length < FACE_VERTEX_COUNT || !Number.isFinite(aspect) || aspect <= 0)
    throw new Error('Invalid face frame')
  for (let i = 0; i < FACE_VERTEX_COUNT; i++) {
    positions[i * 3] = (0.5 - points[i].x) * 2 * aspect
    positions[i * 3 + 1] = (0.5 - points[i].y) * 2
    positions[i * 3 + 2] = -points[i].z * 2 * aspect
    uvs[i * 2] = points[i].x
    uvs[i * 2 + 1] = 1 - points[i].y
  }
}
