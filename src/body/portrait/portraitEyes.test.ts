import { readFileSync } from 'node:fs'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three'
import { expect, it } from 'vitest'
import { portraitEyePatches } from './portraitEyes'
import type { Build } from '../anatomy/bodyShape'

const atlas = JSON.parse(readFileSync('public/anatomy/anatomy.json', 'utf8')).bodies
const binary = readFileSync('public/anatomy/anatomy.bin')
const material = new MeshBasicMaterial({ side: DoubleSide })

function referenceSkin(build: Build) {
  const { pos, verts, idx, tris } = atlas[build].skin
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(binary.buffer, binary.byteOffset + pos, 3 * verts), 3),
  )
  geometry.setIndex(new BufferAttribute(new Uint32Array(binary.buffer, binary.byteOffset + idx, 3 * tris), 1))
  return new Mesh(geometry, material)
}

it('fills both open eyes and lets the original eyelid win at the temples and top of the eye', () => {
  const skin = referenceSkin('male')
  const patches = portraitEyePatches('male').map((geometry) => new Mesh(geometry, material))
  for (const [x, y, expectFill] of [
    [-0.0306, 1.6242, true],
    [0.0299, 1.6243, true],
    [-0.0446, 1.6262, false],
    [-0.0306, 1.6312, false],
    [0.0439, 1.6263, false],
  ] as const) {
    const ray = new Raycaster(new Vector3(x, y, 1), new Vector3(0, 0, -1))
    const nearest = ray.intersectObjects([skin, ...patches])[0]
    expect(nearest).toBeDefined()
    expect(nearest.object !== skin).toBe(expectFill)
  }
})

it('uses the continuous reference skin across the eyes of the second atlas', () => {
  const skin = referenceSkin('female')
  for (const [x, y] of [
    [-0.0413, 1.5574],
    [0.0315, 1.557],
  ]) {
    const ray = new Raycaster(new Vector3(x, y, 1), new Vector3(0, 0, -1))
    expect(ray.intersectObject(skin)[0]?.point.z).toBeGreaterThan(0.105)
  }
  expect(portraitEyePatches('female')).toHaveLength(0)
})
