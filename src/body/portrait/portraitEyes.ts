import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Build } from '../anatomy/bodyShape'
import openings from './portraitEyeOpenings.json'

/** Fill the openings in the individual atlas behind its upper and lower lids.
 * The Blender bake records the rim relative to the centre in tenths of a millimetre. */
export function portraitEyePatches(
  build: Build,
  calibrated: Record<string, { center: number[]; rim: number[][] }> = openings[build],
): BufferGeometry[] {
  return Object.values(calibrated).map(({ center, rim }) => {
    const positions = [...center]
    const indices: number[] = []
    const rings = 5
    for (let ring = 1; ring <= rings + 1; ring++) {
      const outer = ring > rings
      const r = ring / rings
      const start = 1 + (ring - 1) * rim.length
      rim.forEach(([dx, dy, dz], i) => {
        // The last ring slips underneath the lid to close the opening when viewed obliquely.
        const scale = outer ? 1 + 45 / Math.hypot(dx, dy) : r
        // The visible aperture carries a photographed iris. A shallow cap preserves
        // its shape at an angle; the deep skirt keeps the lid overlap hidden.
        const depth = outer ? dz - 10 : Math.max(-5, dz * r * r)
        positions.push(
          center[0] + (dx * scale) / 10000,
          center[1] + (dy * scale) / 10000,
          center[2] + depth / 10000,
        )
        const index = start + i
        const next = start + ((i + 1) % rim.length)
        if (ring === 1) {
          indices.push(0, index, next)
        } else {
          indices.push(index - rim.length, index, next, index - rim.length, next, next - rim.length)
        }
      })
    }
    const patch = new BufferGeometry()
    patch.setAttribute('position', new Float32BufferAttribute(positions, 3))
    patch.setIndex(indices)
    // The photo already contains the highlight and lid shadow. Smooth front-facing
    // normals keep the hidden skirt from casting a second dark band across the iris.
    const normals = new Float32Array(positions.length)
    for (let z = 2; z < normals.length; z += 3) normals[z] = 1
    patch.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    return patch
  })
}
