import { readFileSync } from 'node:fs'
import { BufferAttribute, BufferGeometry, Mesh, Raycaster, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { refinePortraitSkin } from '../portrait/refinePortraitSkin'
import { attachSkinDetail } from './skinSurface'

it.each(['male', 'female'])(
  'keeps %s MakeHuman UVs and nail/lip groups on the portrait geometry',
  (build) => {
    const prefix = 'public/human/' + build
    const metadata = JSON.parse(readFileSync(prefix + '.json', 'utf8'))
    const mesh = metadata.skin
    const data = Uint8Array.from(readFileSync(prefix + '.bin')).buffer
    const skin = new BufferGeometry()
    skin.setAttribute('position', new BufferAttribute(new Float32Array(data, mesh.pos, mesh.verts * 3), 3))
    skin.setAttribute('normal', new BufferAttribute(new Float32Array(data, mesh.nrm, mesh.verts * 3), 3))
    skin.setAttribute('uv', new BufferAttribute(new Float32Array(data, mesh.uv, mesh.verts * 2), 2))
    skin.setIndex(new BufferAttribute(new Uint16Array(data, mesh.idx, mesh.tris * 3), 1))
    attachSkinDetail(skin, Uint8Array.from(readFileSync(prefix + '-detail.bin')).buffer)
    const [left, right] = metadata.eyes.map((eye: { center: number[] }) => eye.center)
    const fitted = refinePortraitSkin(skin, {
      x: (left[0] + right[0]) / 2,
      y: (left[1] + right[1]) / 2,
      eyeZ: (left[2] + right[2]) / 2,
      eyeDistance: Math.abs(left[0] - right[0]),
    })
    const detail = fitted.getAttribute('skinDetail')
    expect(detail.normalized).toBe(true)
    expect(detail.count).toBe(fitted.getAttribute('position').count)
    expect(fitted.getAttribute('uv').count).toBe(detail.count)
    for (const [key, channel] of [
      ['nails', 2],
      ['lips', 1],
    ] as const) {
      const expected = new Set<number>(metadata.regions[key])
      const actual = new Set<number>()
      for (let v = 0; v < mesh.verts; v++) if (detail.getComponent(v, channel) > 0.5) actual.add(v)
      expect(actual).toEqual(expected)
    }
    expect(detail.array.subarray(mesh.verts * 4).some((n, i) => i % 4 === 1 && n > 0)).toBe(true)
  },
)

it('includes the registered outer pelvic skin in the active textured male mesh', () => {
  const { skin } = JSON.parse(readFileSync('public/human/male.json', 'utf8'))
  const bytes = Uint8Array.from(readFileSync('public/human/male.bin')).buffer
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(bytes, skin.pos, skin.verts * 3), 3))
  geometry.setIndex(new BufferAttribute(new Uint16Array(bytes, skin.idx, skin.tris * 3), 1))
  const mesh = new Mesh(geometry)
  // Reference depths in metres after registration to the suprapubic skin.
  // The smooth base alone measures about 0.04 m at all three landmarks.
  for (const [y, z] of [
    [0.805, 0.125],
    [0.825, 0.131],
    [0.845, 0.122],
  ]) {
    const ray = new Raycaster(new Vector3(0, y, 0.5), new Vector3(0, 0, -1))
    const hit = ray.intersectObject(mesh)[0]
    expect(hit, `external pelvic surface at y=${y}`).toBeDefined()
    expect(Math.abs(hit.point.z - z)).toBeLessThan(0.005)
  }
})
