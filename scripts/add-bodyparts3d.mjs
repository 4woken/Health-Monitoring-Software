// Completes the male reference body with BodyParts3D bones and vessels.
//
// Adds the skull, rib cage, shoulder girdle, arm, pelvis and leg bones, labelled arteries and veins
// (red and blue), and both internal jugular veins along the neck. The spine, the aorta and the
// organs already in public/anatomy stay as they are; the single "blood vessels" mesh is replaced.
//
// Download BodyParts3D 4.0 ("partof_BP3D_4.0_obj_99.zip", CC BY 4.0, The Database Center for Life
// Science) from https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html, unzip it, then:
//
//   node scripts/add-bodyparts3d.mjs path/to/partof_BP3D_4.0_obj_99
//
// The BodyParts3D model (millimetres, z up) is placed on the existing body (metres, y up) by
// matching the bounds of the skin, which both share. Meshes are simplified with meshoptimizer.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MeshoptSimplifier } from 'meshoptimizer'
import * as THREE from 'three'

const objDir = process.argv[2]
if (!objDir || !fs.existsSync(objDir)) {
  console.error('Usage: node scripts/add-bodyparts3d.mjs <BodyParts3D OBJ folder>')
  process.exit(1)
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ANATOMY = path.join(ROOT, 'public/anatomy')

// Mesh headers contain anatomical names such as "levator scapulae" and "iliotibial
// tract". Match complete bone names, including the named trapezium and trapezoid.
const groupsByName = {
  skull:
    /^(?:(?:left |right )?(?:frontal|parietal|occipital|temporal|sphenoid|zygomatic|nasal|lacrimal|palatine|hyoid) bone|ethmoid|vomer|(?:left |right )?(?:maxilla|inferior nasal concha)|mandible)$/i,
  'rib cage':
    /^(?:(?:left|right) (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib|body of sternum|manubrium|xiphoid process)$/i,
  'costal cartilage': /^(?:left|right) (?:first|second|third|fourth|fifth|sixth|seventh) costal cartilage$/i,
  'shoulder girdle': /^(?:left|right) (?:scapula|clavicle)$/i,
  'arm bones':
    /^(?:(?:left|right) (?:humerus|radius|ulna|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|(?:first|second|third|fourth|fifth) metacarpal bone)|(?:proximal|middle|distal) phalanx of (?:left|right) (?:thumb|(?:index|middle|ring|little) finger))$/i,
  pelvis: /^(?:right|left) hip bone$/i,
  'leg bones':
    /^(?:(?:left|right) (?:femur|patella|tibia|fibula|talus|calcaneus|cuboid bone|(?:medial|intermediate|lateral) cuneiform bone|(?:first|second|third|fourth|fifth) metatarsal bone)|navicular bone of (?:left|right) foot|(?:proximal|middle|distal) phalanx of (?:left|right) (?:big|second|third|fourth|little) toe)$/i,
}
const errors = {
  skull: 0.0007,
  'rib cage': 0.0009,
  'costal cartilage': 0.0009,
  'shoulder girdle': 0.0009,
  'arm bones': 0.0006,
  pelvis: 0.0009,
  'leg bones': 0.0008,
}
const GROUPS = [
  ...Object.entries(groupsByName).map(([name, pattern]) => ({
    name,
    test: (part) => pattern.test(part),
    error: errors[name],
  })),
  { name: 'pancreas', test: (name) => /^pancreas$/i.test(name), error: 0.0006 },
  {
    name: 'arteries',
    test: (n) =>
      /\barter(y|ies)\b|arterial arch|\b(brachiocephalic|pulmonary|celiac|thyrocervical|costocervical) trunk\b|palmar arch|plantar arch/i.test(
        n,
      ) && !/aorta|vein|nerve|lymph/i.test(n),
    error: 0.0004,
    lockBorder: true,
  },
  {
    name: 'veins',
    test: (n) =>
      /\bveins?\b|vena cava|venous arch|azygos|(sagittal|transverse|sigmoid|cavernous|straight|petrosal|coronary) sinus/i.test(
        n,
      ) && !/jugular|artery|nerve|lymph/i.test(n),
    error: 0.0004,
    lockBorder: true,
  },
  {
    name: 'right internal jugular vein',
    test: (n) => /^right internal jugular vein$/i.test(n),
    error: 0.0003,
    lockBorder: true,
  },
]
/** Meshes of the male body that the new ones replace, including their own earlier versions. */
const REPLACED = new Set(['blood vessels', 'left internal jugular vein', ...GROUPS.map((g) => g.name)])

// ---- Read the BodyParts3D parts --------------------------------------------------------------

function readObj(file) {
  const text = fs.readFileSync(file, 'utf8')
  const header = (field) => text.match(new RegExp(`^# ${field} : (.*)$`, 'm'))?.[1]?.trim() ?? ''
  const positions = []
  const indices = []
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/)
      positions.push(+x, +y, +z)
    } else if (line.startsWith('f ')) {
      const corners = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((c) => parseInt(c.split('/')[0], 10) - 1)
      for (let k = 1; k + 1 < corners.length; k++) indices.push(corners[0], corners[k], corners[k + 1])
    }
  }
  return { name: header('English name'), positions, indices }
}

const files = fs.readdirSync(objDir).filter((f) => f.endsWith('.obj'))
const parts = files.map((f) => readObj(path.join(objDir, f)))
console.log(`${parts.length} BodyParts3D parts read`)

// ---- Placement: matching skin bounds -------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(path.join(ANATOMY, 'anatomy.json'), 'utf8'))
const bin = fs.readFileSync(path.join(ANATOMY, 'anatomy.bin'))
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const male = manifest.bodies.male

function bounds(positions) {
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], positions[i + a])
      hi[a] = Math.max(hi[a], positions[i + a])
    }
  return { lo, hi }
}
/** BodyParts3D (x, y, z) in mm to this body's axes, still in mm: x stays, z is up, -y is forward. */
const axes = (x, y, z) => [x, z, -y]

const skinPart = parts.find((p) => /^skin$/i.test(p.name))
if (!skinPart) throw new Error('The BodyParts3D folder has no skin part to place the body')
const theirs = (() => {
  const mapped = []
  for (let i = 0; i < skinPart.positions.length; i += 3)
    mapped.push(...axes(skinPart.positions[i], skinPart.positions[i + 1], skinPart.positions[i + 2]))
  return bounds(mapped)
})()
const ours = bounds(new Float32Array(ab, male.skin.pos, male.skin.verts * 3))
const scale = (ours.hi[1] - ours.lo[1]) / ((theirs.hi[1] - theirs.lo[1]) / 1000)
const offset = [0, 1, 2].map(
  (a) => (ours.lo[a] + ours.hi[a]) / 2 - (scale * (theirs.lo[a] + theirs.hi[a])) / 2000,
)
offset[1] = ours.lo[1] - (scale * theirs.lo[1]) / 1000
console.log(`placement: scale ${scale.toFixed(4)}, offset ${offset.map((v) => v.toFixed(4)).join(' ')} m`)

const place = (x, y, z) => axes(x, y, z).map((v, a) => (scale * v) / 1000 + offset[a])

// ---- Build, simplify and compact each group ------------------------------------------------

await MeshoptSimplifier.ready

function buildGroup(group) {
  const chosen = parts.filter((p) => group.test(p.name))
  const positions = []
  const indices = []
  for (const p of chosen) {
    const base = positions.length / 3
    for (let i = 0; i < p.positions.length; i += 3)
      positions.push(...place(p.positions[i], p.positions[i + 1], p.positions[i + 2]))
    for (const i of p.indices) indices.push(base + i)
  }
  const pos = new Float32Array(positions)
  const idx = new Uint32Array(indices)
  const flags = ['ErrorAbsolute', ...(group.lockBorder ? ['LockBorder'] : [])]
  const [simple] = MeshoptSimplifier.simplify(
    idx,
    pos,
    3,
    Math.floor((idx.length * 0.08) / 3) * 3,
    group.error,
    flags,
  )
  const [remap, unique] = MeshoptSimplifier.compactMesh(simple)
  const outPos = new Float32Array(unique * 3)
  for (let v = 0; v < remap.length; v++) {
    const to = remap[v]
    if (to === 0xffffffff || to >= unique) continue
    outPos.set(pos.subarray(v * 3, v * 3 + 3), to * 3)
  }
  return {
    name: group.name,
    parts: chosen.length,
    trisBefore: idx.length / 3,
    positions: outPos,
    indices: simple,
  }
}

// Detect changes to the published archive or the inclusion rules before writing.
const expectedBones = {
  skull: 24,
  'rib cage': 27,
  'costal cartilage': 14,
  'shoulder girdle': 4,
  'arm bones': 60,
  pelvis: 2,
  'leg bones': 60,
}
for (const group of GROUPS.filter((g) => g.name in expectedBones)) {
  const count = parts.filter((p) => group.test(p.name)).length
  if (count !== expectedBones[group.name])
    throw new Error(group.name + ': expected ' + expectedBones[group.name] + ' source surfaces, got ' + count)
}
const built = GROUPS.map((group) => {
  if (group.name !== 'leg bones') return buildGroup(group)
  // Retain the source distinction so the female atlas can supply the thigh and
  // lower leg while its transferred BodyParts3D ankle and foot remain intact.
  const longBone = / (?:femur|patella|tibia|fibula)$/i
  const upper = buildGroup({ ...group, test: (n) => group.test(n) && longBone.test(n) })
  const foot = buildGroup({ ...group, test: (n) => group.test(n) && !longBone.test(n) })
  const footVertexStart = upper.positions.length / 3
  const positions = new Float32Array(upper.positions.length + foot.positions.length)
  positions.set(upper.positions)
  positions.set(foot.positions, upper.positions.length)
  const indices = new Uint32Array(upper.indices.length + foot.indices.length)
  indices.set(upper.indices)
  indices.set(
    foot.indices.map((i) => i + footVertexStart),
    upper.indices.length,
  )
  return {
    name: group.name,
    positions,
    indices,
    footVertexStart,
    parts: upper.parts + foot.parts,
    trisBefore: upper.trisBefore + foot.trisBefore,
  }
})

// Internal jugular veins. BodyParts3D has only a short segment of the right one, at the base of the
// neck. Each vein is drawn as a tube that starts on that segment (mirrored for the left) and runs
// beside the carotid artery of its side, as it does inside the carotid sheath, up to the jugular
// foramen at the base of the skull. A drawing that follows real landmarks, not a measured shape.
const segment = built.find((g) => g.name === 'right internal jugular vein')
if (!segment) throw new Error('No right internal jugular vein in the BodyParts3D folder')
const seg = bounds(segment.positions)
const skullBase = Math.min(
  ...['occipital bone', 'right temporal bone', 'left temporal bone'].map((name) => {
    const p = parts.find((x) => x.name.toLowerCase() === name)
    const placed = []
    for (let i = 0; i < p.positions.length; i += 3)
      placed.push(...place(p.positions[i], p.positions[i + 1], p.positions[i + 2]))
    return bounds(placed).lo[1]
  }),
)

function jugularVein(side) {
  const sign = side === 'right' ? -1 : 1
  const carotid = []
  for (const p of parts)
    if (new RegExp(`^${side} (common|internal) carotid artery$`, 'i').test(p.name))
      for (let i = 0; i < p.positions.length; i += 3)
        carotid.push(place(p.positions[i], p.positions[i + 1], p.positions[i + 2]))
  const x0 = (sign * -(seg.lo[0] + seg.hi[0])) / 2
  const z0 = (seg.lo[2] + seg.hi[2]) / 2
  const points = [new THREE.Vector3(x0, seg.lo[1], z0), new THREE.Vector3(x0, seg.hi[1], z0)]
  const top = skullBase + 0.012
  for (let y = seg.hi[1] + 0.04; y < top; y += 0.012) {
    const slice = carotid.filter((p) => Math.abs(p[1] - y) < 0.006)
    if (slice.length < 5) continue
    const mean = (a) => slice.reduce((t, p) => t + p[a], 0) / slice.length
    // Beside the artery and a little behind it, more so toward the skull.
    const rise = (y - seg.hi[1]) / (top - seg.hi[1])
    points.push(new THREE.Vector3(mean(0) + sign * 0.012, y, mean(2) - 0.002 - 0.016 * rise))
  }
  const last = points[points.length - 1]
  points.push(new THREE.Vector3(last.x - sign * 0.002, top, last.z - 0.006))
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.0055, 14, false)
  return {
    name: `${side} internal jugular vein`,
    parts: 1,
    trisBefore: segment.trisBefore,
    positions: new Float32Array(tube.attributes.position.array),
    indices: new Uint32Array(tube.index.array),
    drawn: true,
  }
}
built.splice(built.indexOf(segment), 1, jugularVein('right'), jugularVein('left'))

for (const g of built)
  console.log(
    `${g.name.padEnd(28)} ${String(g.parts).padStart(4)} parts  ${String(g.trisBefore).padStart(7)} -> ${String(g.indices.length / 3).padStart(6)} triangles${g.drawn ? '  (drawn along the carotid)' : ''}`,
  )

// ---- Write a compact anatomy.bin and its manifest ------------------------------------------

const chunks = []
let size = 0
const put = (typed) => {
  const at = size
  chunks.push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength))
  size += typed.byteLength
  return at
}
const copyRef = (ref) => {
  const next = { ...ref }
  next.pos = put(new Float32Array(ab, ref.pos, ref.verts * 3).slice())
  next.idx = put(new Uint32Array(ab, ref.idx, ref.tris * 3).slice())
  if (ref.nrm !== undefined) next.nrm = put(new Float32Array(ab, ref.nrm, ref.verts * 3).slice())
  return next
}
const centerOf = (positions) => {
  const { lo, hi } = bounds(positions)
  return lo.map((v, a) => Math.round(((v + hi[a]) / 2) * 1000) / 1000)
}

const bodies = {}
for (const [build, body] of Object.entries(manifest.bodies)) {
  const organs = body.organs.filter((o) => build !== 'male' || !REPLACED.has(o.name)).map(copyRef)
  if (build === 'male')
    for (const g of built)
      organs.push({
        name: g.name,
        pos: put(g.positions),
        verts: g.positions.length / 3,
        idx: put(g.indices),
        tris: g.indices.length / 3,
        center: centerOf(g.positions),
        ...(g.footVertexStart !== undefined && { footVertexStart: g.footVertexStart }),
      })
  bodies[build] = { ...body, skin: copyRef(body.skin), organs }
}
fs.writeFileSync(path.join(ANATOMY, 'anatomy.bin'), Buffer.concat(chunks, size))
fs.writeFileSync(path.join(ANATOMY, 'anatomy.json'), JSON.stringify({ ...manifest, bodies }))
console.log(`anatomy.bin: ${(bin.length / 1e6).toFixed(1)} MB -> ${(size / 1e6).toFixed(1)} MB`)
