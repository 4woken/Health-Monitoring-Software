import { readFileSync } from 'node:fs'
import { BufferAttribute, BufferGeometry, Texture } from 'three'
import { expect, it, vi } from 'vitest'
import type { Body } from '../anatomy/loadAnatomy'
import { attachSkinDetail } from '../appearance/skinSurface'
import { createPersonalFace } from './skinPortrait'

it.each(['female', 'male'] as const)('fits and removes a portrait on the textured %s body', (build) => {
  const prefix = 'public/human/' + build
  const meta = JSON.parse(readFileSync(prefix + '.json', 'utf8'))
  const { verts, pos, nrm, uv, tris, idx } = meta.skin
  const bytes = Uint8Array.from(readFileSync(prefix + '.bin')).buffer
  const skin = new BufferGeometry()
  skin.setAttribute('position', new BufferAttribute(new Float32Array(bytes, pos, verts * 3), 3))
  skin.setAttribute('normal', new BufferAttribute(new Float32Array(bytes, nrm, verts * 3), 3))
  skin.setAttribute('uv', new BufferAttribute(new Float32Array(bytes, uv, verts * 2), 2))
  skin.setIndex(new BufferAttribute(new Uint16Array(bytes, idx, tris * 3), 1))
  attachSkinDetail(skin, Uint8Array.from(readFileSync(prefix + '-detail.bin')).buffer)
  const referenceHead: NonNullable<Body['referenceHead']> = JSON.parse(
    readFileSync(prefix + '-head.json', 'utf8'),
  )
  const albedo = new Texture()
  const face = createPersonalFace({
    build,
    skin,
    referenceHead,
    albedo,
    eyeSockets: meta.eyes,
    height: meta.height,
    attribution: '',
    organs: [],
    anchors: {},
  })
  vi.stubGlobal(
    'Image',
    class {
      complete = true
      naturalWidth = 128
    },
  )
  try {
    const { geometry, material } = face
    expect(material.map).toBe(albedo)
    expect(material.color.getHex()).toBe(0xffffff)
    const eye = geometry.getAttribute('portraitEye')
    const region = geometry.getAttribute('skinDetail')
    const weights = geometry.getAttribute('portraitWeight')
    const base = Float32Array.from(geometry.getAttribute('position').array)
    const camera = referenceHead.camera
    // Feed the fitted reference back as a capture to exercise binding without a camera.
    face.setPortrait({
      width: 128,
      height: 128,
      imageUrl: 'fixture',
      skinTone: [125, 96, 72],
      points: referenceHead.points.map((p) => ({
        x: (p.x - camera.left) / (camera.right - camera.left),
        y: (camera.top - p.y) / (camera.top - camera.bottom),
        z: 0,
      })),
      surface: referenceHead.normalised,
    })
    expect(face.portraitVisible).toBe(true)
    expect(material.color.r).toBeLessThan(1)
    let covered = 0
    for (let v = 0; v < eye.count; v++) {
      if (!eye.getX(v)) continue
      expect(region.getComponent(v, 2)).toBe(0)
      if (weights.getX(v) > 0.95) covered++
    }
    expect(covered).toBeGreaterThan(400)
    face.setVisible(false)
    expect(face.portraitVisible).toBe(false)
    face.setVisible(true)
    expect(face.portraitVisible).toBe(true)
    face.setPortrait(null)
    expect(face.portraitVisible).toBe(false)
    expect(material.color.getHex()).toBe(0xffffff)
    expect(geometry.getAttribute('position').array).toEqual(base)
    expect(weights.array.some((w) => w !== 0)).toBe(false)
  } finally {
    face.dispose()
    albedo.dispose()
    skin.dispose()
    vi.unstubAllGlobals()
  }
})
