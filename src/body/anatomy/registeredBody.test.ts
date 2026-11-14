import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { Build, Vec3 } from './bodyShape'

interface Mesh {
  name: string
  verts: number
  pos: number
  idx: number
  tris: number
}
interface PackedMesh extends Mesh {
  offset: Vec3
  scale: Vec3
  wide: boolean
}
const raw = (path: string) => Uint8Array.from(readFileSync(path)).buffer
const atlas = JSON.parse(readFileSync('public/anatomy/anatomy.json', 'utf8')).bodies as Record<
  Build,
  { organs: Mesh[] }
>
const atlasBytes = raw('public/anatomy/anatomy.bin')

// Neighbouring vertices must remain on the same limb through registration and
// voxel projection. Checking occupancy alone missed triangles joining wrist to hip.
it.each(['female', 'male'] as const)('keeps the %s internal meshes connected locally', (build) => {
  const base = 'public/human/' + build + '-organs'
  const bytes = raw(base + '.bin')
  const { organs } = JSON.parse(readFileSync(base + '.json', 'utf8')) as { organs: PackedMesh[] }
  const names = organs.map((o) => o.name)
  expect(names).toEqual(
    expect.arrayContaining(['heart', 'pelvis', 'arm bones', 'leg bones', 'skull', 'arteries', 'veins']),
  )
  for (const organ of organs) {
    const femalePelvis = build === 'female' && organ.name === 'pelvis'
    const source: Mesh = femalePelvis
      ? JSON.parse(readFileSync('public/anatomy/female-pelvis.json', 'utf8'))
      : atlas[build].organs.find((o) => o.name === organ.name)!
    expect(organ.verts, organ.name).toBe(source.verts)
    const before = new Float32Array(
      femalePelvis ? raw('public/anatomy/female-pelvis.bin') : atlasBytes,
      source.pos,
      source.verts * 3,
    )
    const after = new Uint16Array(bytes, organ.pos, organ.verts * 3)
    const index = new (organ.wide ? Uint32Array : Uint16Array)(bytes, organ.idx, organ.tris * 3)
    let maxExtension = 0
    for (let i = 0; i < index.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const a = index[i + j] * 3,
          b = index[i + ((j + 1) % 3)] * 3
        const len = Math.hypot(
          (after[a] - after[b]) * organ.scale[0],
          (after[a + 1] - after[b + 1]) * organ.scale[1],
          (after[a + 2] - after[b + 2]) * organ.scale[2],
        )
        const original = Math.hypot(
          before[a] - before[b],
          before[a + 1] - before[b + 1],
          before[a + 2] - before[b + 2],
        )
        maxExtension = Math.max(maxExtension, len - original)
      }
    }
    expect(maxExtension, organ.name).toBeLessThan(0.045)
  }
})

it.each(['male', 'female'] as const)(
  'ships lower-limb veins from both thighs to the feet in the %s pack',
  (build) => {
    const base = 'public/human/' + build + '-organs'
    const bytes = raw(base + '.bin')
    const { organs } = JSON.parse(readFileSync(base + '.json', 'utf8')) as { organs: PackedMesh[] }
    const legs = organs.find((o) => o.name === 'leg veins')!
    expect(legs).toBeDefined()
    const packed = new Uint16Array(bytes, legs.pos, legs.verts * 3)
    const bands = [0.06, 0.3, 0.6]
    for (const side of [-1, 1]) {
      for (const band of bands) {
        let present = false
        for (let i = 0; i < packed.length; i += 3) {
          const x = legs.offset[0] + packed[i] * legs.scale[0]
          const y = legs.offset[1] + packed[i + 1] * legs.scale[1]
          if (side * x > 0.015 && Math.abs(y - band) < 0.03) {
            present = true
            break
          }
        }
        expect(present, build + ' leg veins at ' + band + ' m on side ' + side).toBe(true)
      }
    }
  },
)
