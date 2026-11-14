import { readFileSync } from 'node:fs'
import { BufferAttribute, BufferGeometry, Group, InstancedBufferGeometry, Mesh } from 'three'
import { expect, it } from 'vitest'
import type { Body } from '../anatomy/loadAnatomy'
import type { Build } from '../anatomy/bodyShape'
import { createBodyGroom } from './bodyGroom'

// Use the shipped topology. An atlas or landmark update must still leave the
// attachment strips on both eyes and limit the costly instancing to hairy skin.
function human(build: Build): Body {
  const prefix = 'public/human/' + build
  const metadata = JSON.parse(readFileSync(prefix + '.json', 'utf8'))
  const mesh = metadata.skin
  const bytes = Uint8Array.from(readFileSync(prefix + '.bin')).buffer
  const skin = new BufferGeometry()
  skin.setAttribute('position', new BufferAttribute(new Float32Array(bytes, mesh.pos, mesh.verts * 3), 3))
  skin.setAttribute('normal', new BufferAttribute(new Float32Array(bytes, mesh.nrm, mesh.verts * 3), 3))
  skin.setIndex(new BufferAttribute(new Uint16Array(bytes, mesh.idx, mesh.tris * 3), 1))
  return {
    build,
    skin,
    height: metadata.height,
    eyeSockets: metadata.eyes,
    referenceHead: JSON.parse(readFileSync(prefix + '-head.json', 'utf8')),
    anchors: {},
    organs: [],
    attribution: '',
  }
}

it.each(['male', 'female'] as const)('attaches sparse instanced hair to the %s model', (build) => {
  const body = human(build)
  const hair = createBodyGroom(body, body.skin)
  const scene = new Group().add(hair.object)
  const meshes = hair.object.children as Mesh<InstancedBufferGeometry>[]
  const names = meshes.map((mesh) => mesh.name).sort()
  expect(names).toEqual(['body', 'brow', 'lash', 'scalp'])
  const skinPositions = body.skin.getAttribute('position')
  const firstHeight = new Map<string, number>()
  for (const mesh of meshes) {
    const geometry = mesh.geometry
    expect(geometry.instanceCount).toBe(16)
    expect(geometry.index!.count).toBeGreaterThan(0)
    expect(geometry.index!.count).toBeLessThan(body.skin.index!.count / 4)
    const roots = geometry.getAttribute('position')
    firstHeight.set(mesh.name, roots.getY(0))
    if (mesh.name === 'brow' || mesh.name === 'lash') {
      geometry.computeBoundingBox()
      const bounds = geometry.boundingBox!
      expect(bounds.min.x).toBeLessThan(-0.025)
      expect(bounds.max.x).toBeGreaterThan(0.025)
      expect(bounds.min.y).toBeGreaterThan(body.eyeSockets![0].center[1] - 0.01)
    }
  }
  // Portrait deformation updates positions in place. The roots must follow
  // the current surface even after time spent on an internal anatomy layer.
  for (let i = 0; i < skinPositions.count; i++) skinPositions.setY(i, skinPositions.getY(i) + 0.0006)
  skinPositions.needsUpdate = true
  hair.object.visible = false
  hair.sync(false)
  hair.object.visible = true
  hair.sync(false)
  for (const mesh of meshes.filter((m) => m.name !== 'body'))
    expect(mesh.geometry.getAttribute('position').getY(0)).toBeCloseTo(
      firstHeight.get(mesh.name)! + 0.0006,
      6,
    )
  hair.dispose()
  expect(scene.children).toHaveLength(0)
  body.skin.dispose()
})
