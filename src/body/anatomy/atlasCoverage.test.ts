import { readFileSync } from 'node:fs'
import { Vector3 } from 'three'
import { expect, it } from 'vitest'
import male from '../../../public/human/male-organs.json'
import female from '../../../public/human/female-organs.json'

/** Signed tetrahedron sum in m³; airway trees occupy much less volume than lung surfaces. */
function enclosedVolume(buffer: Buffer, mesh: (typeof male.organs)[number]) {
  const centre = new Vector3(...mesh.center)
  const vertices = Array.from({ length: mesh.verts }, (_, i) => {
    const xyz = mesh.offset.map(
      (origin, axis) => origin + buffer.readUInt16LE(mesh.pos + (3 * i + axis) * 2) * mesh.scale[axis],
    )
    return new Vector3(...xyz).sub(centre)
  })
  const stride = mesh.wide ? 4 : 2
  const vertex = (i: number) => vertices[buffer.readUIntLE(mesh.idx + i * stride, stride)]
  let volume = 0
  const normal = new Vector3()
  for (let i = 0; i < mesh.tris * 3; i += 3) {
    volume += vertex(i).dot(normal.crossVectors(vertex(i + 1), vertex(i + 2)))
  }
  return Math.abs(volume / 6)
}

it.each([
  ['male', male],
  ['female', female],
] as const)(
  'ships lung surfaces and the length of the spinal cord in the %s viewer package',
  (build, model) => {
    const buffer = readFileSync(new URL(`../../../public/human/${build}-organs.bin`, import.meta.url))
    for (const side of ['left', 'right']) {
      const lung = model.organs.find(({ name }) => name === side + ' lung')!
      expect(lung.center[0] * (side === 'left' ? 1 : -1)).toBeGreaterThan(0)
      expect(enclosedVolume(buffer, lung)).toBeGreaterThan(0.0007)
    }
    const cord = model.organs.find(({ name }) => name === 'spinal cord')!
    expect(cord.scale[1] * 65535).toBeGreaterThan(0.35)
  },
)
