// Loads the real body surfaces and organ meshes.
//   Male:   BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0.
//   Female: HRA 3D Reference Organs (Visible Human female), HuBMAP Consortium, CC BY 4.0.
// Each is ONE reference person, simplified for the web. They are not scans of the crew.

import * as THREE from 'three'
import type { Build, Vec3 } from './bodyShape'
import type referenceHeads from '../portrait/referenceHeads.json'
import { loadSkinDetail } from '../appearance/skinSurface'
import type { TorsoCalibration } from '../../crew/torsoFit'
import { asset, loadHumanSkin, type EyeSocket } from './loadHuman'
import { orientTriangles } from './orientTriangles'

type ReferenceHead = typeof referenceHeads.male & {
  eyeOpenings?: Record<string, { center: number[]; rim: number[][] }>
}

export interface Organ {
  name: string
  geometry: THREE.BufferGeometry
  center: Vec3
}

export interface Body {
  build: Build
  attribution: string
  height: number
  skin: THREE.BufferGeometry
  albedo?: THREE.Texture
  eyeSockets?: EyeSocket[]
  referenceHead?: ReferenceHead
  torsoCalibration?: TorsoCalibration
  organs: Organ[]
  /** Marker position for each signal. */
  anchors: Record<string, Vec3>
}

interface MeshRef {
  name: string
  pos: number
  verts: number
  idx: number
  tris: number
  center: Vec3
  /** Offset of ready-made smooth normals, when the file has them. */
  nrm?: number
}
interface Manifest {
  bodies: Record<
    Build,
    { attribution: string; height: number; skin: MeshRef; organs: MeshRef[]; anchors: Record<string, Vec3> }
  >
}

/** Which signals each organ shows. */
export const ORGAN_SIGNALS: Record<string, string[]> = {
  brain: ['headache', 'sleep', 'mood'],
  'right eyeball': ['opticNerve'],
  'left eyeball': ['opticNerve'],
  heart: ['oxygen'],
  'right lung': ['oxygen'],
  'left lung': ['oxygen'],
  lungs: ['oxygen'],
  aorta: ['redCells'],
  'blood vessels': ['redCells'],
  arteries: ['redCells'],
  'left internal jugular vein': ['neckVein'],
  'left kidney': ['hydration'],
  'right kidney': ['hydration'],
  'urinary bladder': ['hydration'],
  'vertebral column': ['loading'],
  pelvis: ['loading'],
  'leg bones': ['loading'],
}

function signalAnchors(organs: Organ[], height: number, source: Record<string, Vec3>) {
  const at = (name: string, dx = 0, dy = 0, dz = 0): Vec3 | undefined => {
    const o = organs.find((x) => x.name === name)?.center
    return o ? [o[0] + dx, o[1] + dy, o[2] + dz] : undefined
  }
  const found: Record<string, Vec3 | undefined> = {
    opticNerve: at('left eyeball', 0, 0, 0.02),
    headache: at('brain', -0.03, 0.05, 0.07),
    sleep: at('brain', 0.03, 0.03, -0.06),
    neckVein: at('left internal jugular vein'),
    oxygen: at('heart', 0, 0, 0.05),
    redCells: at('aorta', 0, -0.1, 0),
    hydration: at('left kidney'),
    mood: at('brain', 0, -0.02, 0.02),
    immunity: at('heart', -0.02, 0.1, 0.05),
    vitaminD: [0.1, height * 0.5, 0.03],
    bodyMass: at('small intestine', 0, 0.04, 0.06),
    bodyChecks: at('heart', 0.09, 0.07, 0.04),
    loading: [-0.1, height * 0.52, 0.02],
    // The air comes in at the mouth; the personal dosimeter is worn on the chest.
    cabinAir: at('left eyeball', -0.034, -0.075, 0.03),
    radiation: at('heart', -0.1, 0.1, 0.04),
  }
  const anchors: Record<string, Vec3> = { ...source }
  for (const [k, v] of Object.entries(found)) if (v && !(k in anchors)) anchors[k] = v
  return anchors
}

interface PackedOrgan extends MeshRef {
  wide: boolean
  offset: Vec3
  scale: Vec3
}
interface OrganPack {
  organs: PackedOrgan[]
  anchors: Record<string, Vec3>
  torsoCalibration: TorsoCalibration
}

function unpackOrgan(buffer: ArrayBuffer, mesh: PackedOrgan): Organ {
  const packed = new Uint16Array(buffer, mesh.pos, mesh.verts * 3)
  const positions = new Float32Array(packed.length)
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++)
      positions[i + axis] = mesh.offset[axis] + packed[i + axis] * mesh.scale[axis]
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const indices = mesh.wide ? Uint32Array : Uint16Array
  geometry.setIndex(new THREE.BufferAttribute(new indices(buffer, mesh.idx, mesh.tris * 3), 1))
  geometry.computeVertexNormals()
  return { name: mesh.name, geometry, center: mesh.center }
}

async function loadRegisteredBody(build: Build): Promise<Body> {
  const prefix = '/human/' + build
  const [human, pack, buffer, referenceHead] = await Promise.all([
    loadHumanSkin(build),
    asset(prefix + '-organs.json').then((r) => r.json() as Promise<OrganPack>),
    asset(prefix + '-organs.bin').then((r) => r.arrayBuffer()),
    asset(prefix + '-head.json').then((r) => r.json() as Promise<ReferenceHead>),
  ])
  if (referenceHead.points.length !== 468 || referenceHead.normalised.length < 468)
    throw new Error('Incomplete reference head')
  const organs = pack.organs.map((mesh) => unpackOrgan(buffer, mesh))
  return {
    build,
    skin: human.skin.geometry,
    albedo: human.albedo,
    height: human.height,
    eyeSockets: human.eyes,
    referenceHead,
    organs,
    torsoCalibration: pack.torsoCalibration,
    attribution:
      'Skin: MakeHuman Community and Margaret Toigo (CC0). Anatomy: ' +
      (build === 'male'
        ? 'BodyParts3D, © DBCLS (CC BY 4.0).'
        : 'HuBMAP Human Reference Atlas and BodyParts3D, © DBCLS (CC BY 4.0).'),
    anchors: signalAnchors(organs, human.height, pack.anchors),
  }
}

async function loadLegacyBody(build: Build): Promise<Body> {
  const manifest = await asset('/anatomy/anatomy.json').then((r) => r.json() as Promise<Manifest>)
  const b = manifest.bodies[build]
  const meshes = [b.skin, ...b.organs]
  const first = Math.min(...meshes.map((m) => Math.min(m.pos, m.idx, m.nrm ?? Infinity)))
  const end = Math.max(
    ...meshes.map((m) =>
      Math.max(m.pos + m.verts * 12, m.idx + m.tris * 12, (m.nrm ?? -Infinity) + m.verts * 12),
    ),
  )
  const response = await asset('/anatomy/anatomy.bin', {
    headers: { Range: 'bytes=' + first + '-' + (end - 1) },
  })
  const offset = response.status === 206 ? first : 0
  const buffer = await response.arrayBuffer()
  const geometry = (m: MeshRef) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(buffer, m.pos - offset, m.verts * 3), 3),
    )
    const indices = new Uint32Array(buffer, m.idx - offset, m.tris * 3)
    if (m.nrm !== undefined) {
      g.setAttribute(
        'normal',
        new THREE.BufferAttribute(new Float32Array(buffer, m.nrm - offset, m.verts * 3), 3),
      )
      g.setIndex(
        new THREE.BufferAttribute(
          orientTriangles(
            g.attributes.position.array as Float32Array,
            g.attributes.normal.array as Float32Array,
            indices,
          ),
          1,
        ),
      )
    } else {
      g.setIndex(new THREE.BufferAttribute(indices, 1))
      g.computeVertexNormals()
    }
    return g
  }
  const organs = b.organs.map((o) => ({ name: o.name, geometry: geometry(o), center: o.center }))
  const skin = geometry(b.skin)
  await loadSkinDetail(build, skin)
  return {
    build,
    attribution: b.attribution,
    height: b.height,
    skin,
    organs,
    anchors: signalAnchors(organs, b.height, b.anchors),
  }
}

// Each body owns immutable shared geometry and textures. Only load the chosen body.
const pending = new Map<Build, Promise<Body | null>>()
export function loadBody(build: Build): Promise<Body | null> {
  const existing = pending.get(build)
  if (existing) return existing
  const job = loadRegisteredBody(build)
    .catch(() => {
      // Revisit the realistic model on a later selection after a temporary asset failure.
      return loadLegacyBody(build).finally(() => pending.delete(build))
    })
    .catch(() => {
      pending.delete(build)
      return null
    })
  pending.set(build, job)
  return job
}

export async function loadAnatomy(): Promise<Record<Build, Body> | null> {
  const [male, female] = await Promise.all([loadBody('male'), loadBody('female')])
  return male && female ? { male, female } : null
}
