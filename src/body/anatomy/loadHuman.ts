import * as THREE from 'three'
import type { Build, Vec3 } from './bodyShape'
import { loadSkinDetail } from '../appearance/skinSurface'

export interface EyeSocket {
  name: string
  center: Vec3
  radius: number
}

interface SkinManifest {
  skin: {
    name: string
    verts: number
    tris: number
    pos: number
    nrm: number
    uv: number
    idx: number
    center: Vec3
  }
  pelvicSurface?: { baseVerts: number }
  eyes: EyeSocket[]
  height: number
}

export async function asset(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`)
  return response
}

export async function loadHumanSkin(build: Build) {
  const base = '/human/' + build
  const [metadata, buffer, albedo, arms] = await Promise.all([
    asset(base + '.json').then((r) => r.json() as Promise<SkinManifest>),
    asset(base + '.bin').then((r) => r.arrayBuffer()),
    new THREE.TextureLoader().loadAsync(base + '.webp'),
    asset('/human/arm-weights.bin')
      .then((r) => r.arrayBuffer())
      .catch(() => null),
  ])
  albedo.colorSpace = THREE.SRGBColorSpace
  const spec = metadata.skin
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(buffer, spec.pos, spec.verts * 3), 3),
  )
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array(buffer, spec.nrm, spec.verts * 3), 3),
  )
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buffer, spec.uv, spec.verts * 2), 2))
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(buffer, spec.idx, spec.tris * 3), 1))
  if (arms?.byteLength === (metadata.pelvicSurface?.baseVerts ?? spec.verts) * 2) {
    const weights = new Uint8Array(spec.verts * 2)
    weights.set(new Uint8Array(arms))
    geometry.setAttribute('exerciseArms', new THREE.BufferAttribute(weights, 2, true))
  }
  await loadSkinDetail(build, geometry, base + '-detail.bin')
  return {
    skin: { name: spec.name, center: spec.center, geometry },
    eyes: metadata.eyes,
    height: metadata.height,
    albedo,
  }
}
