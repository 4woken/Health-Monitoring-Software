import type { BufferGeometry, Object3D } from 'three'

/** Keep covered triangles at the end of the existing index buffer. Changing
 * depth then only changes the draw range, for rendering and raycasting alike. */
export function crewCoverage(geometry: BufferGeometry, skinVertices?: number[]) {
  const index = geometry.getIndex()!
  let garment: Object3D | undefined
  let exposedCount = index.count
  return (outfit?: Object3D) => {
    if (outfit && outfit !== garment) {
      garment = outfit
      const ranges: [number, number][] = outfit.userData.coveredSkinVertices ?? []
      const skinMask = new Uint8Array((ranges.at(-1)?.[1] ?? -1) + 1)
      for (const [start, end] of ranges) skinMask.fill(1, start, end + 1)
      const covered = skinVertices
        ? Uint8Array.from(skinVertices, (vertex) => skinMask[vertex] ?? 0)
        : skinMask
      const ordered = index.array.slice()
      let first = 0,
        last = index.count
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i),
          b = index.getX(i + 1),
          c = index.getX(i + 2)
        const hide = covered[a] && covered[b] && covered[c]
        if (hide) last -= 3
        const target = hide ? last : first
        ordered[target] = a
        ordered[target + 1] = b
        ordered[target + 2] = c
        if (!hide) first += 3
      }
      exposedCount = first
      index.array.set(ordered)
      index.needsUpdate = true
    }
    geometry.setDrawRange(0, outfit ? exposedCount : index.count)
  }
}
