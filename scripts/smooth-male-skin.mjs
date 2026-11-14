// Smooths the genitals of the male reference skin into a plain surface, as on a mannequin.
//
// Optional, and not applied: the published male body keeps the BodyParts3D skin as it is.
//
// A smooth surface is fitted to the skin around the genitals: the front of the body as a height
// z = f(x, y), from a thin-plate spline on the surrounding skin. Every skin vertex of the zone that
// stands in front of that surface is pressed back onto it, fading out toward the edge of the zone,
// and takes the surface's normal. Folded parts then lie on one surface with one lighting, so they do
// not show. The vessels that ran inside the genitals, now in front of the skin, are removed.
// Run scripts/fit-female-body.mjs afterwards: the female vessels are fitted from the male ones.
//
//   node scripts/smooth-male-skin.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ANATOMY = path.join(ROOT, 'public/anatomy')
const manifest = JSON.parse(fs.readFileSync(path.join(ANATOMY, 'anatomy.json'), 'utf8'))
const bin = fs.readFileSync(path.join(ANATOMY, 'anatomy.bin'))
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const skin = manifest.bodies.male.skin
if (skin.nrm === undefined) throw new Error('The male skin has no stored normals')
if (skin.mannequin) {
  console.log('The male skin is already smoothed')
  process.exit(0)
}
const pos = new Float32Array(ab, skin.pos, skin.verts * 3)
const nrm = new Float32Array(ab, skin.nrm, skin.verts * 3)

/** The zone: an ellipsoid on the front of the pelvis, between the thighs (metres). */
const ZONE = { centre: [0, 0.835, 0.07], radii: [0.058, 0.095, 0.08] }
const zoneDistance = (i, grow = 1) => {
  let d = 0
  for (let a = 0; a < 3; a++) d += ((pos[i * 3 + a] - ZONE.centre[a]) / (ZONE.radii[a] * grow)) ** 2
  return Math.sqrt(d)
}

// Skin around the zone that faces forward: the points the smooth surface must go through.
const ring = []
for (let i = 0; i < skin.verts; i++) {
  const d = zoneDistance(i)
  if (d >= 1.05 && d < 1.6 && nrm[i * 3 + 2] > 0.35) ring.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])
}
const step = Math.max(1, Math.floor(ring.length / 220))
const points = ring.filter((_, k) => k % step === 0)
console.log(`surface fitted on ${points.length} skin points around the zone`)

// Thin-plate spline in two dimensions: z = a0 + a1 x + a2 y + sum w_i r^2 log r.
function solve(A, b) {
  const n = b.length
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    ;[b[c], b[p]] = [b[p], b[c]]
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c]
      if (!f) continue
      for (let j = c; j < n; j++) A[r][j] -= f * A[c][j]
      b[r] -= f * b[c]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]
    x[r] = s / A[r][r]
  }
  return x
}
const kernel = (r) => (r < 1e-9 ? 0 : r * r * Math.log(r))
const n = points.length
const A = Array.from({ length: n + 3 }, () => new Array(n + 3).fill(0))
const b = new Array(n + 3).fill(0)
for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++)
    A[i][j] =
      (i === j ? 1e-4 : 0) + kernel(Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]))
  A[i][n] = A[n][i] = 1
  A[i][n + 1] = A[n + 1][i] = points[i][0]
  A[i][n + 2] = A[n + 2][i] = points[i][1]
  b[i] = points[i][2]
}
const w = solve(A, b)
const height = (x, y) => {
  let z = w[n] + w[n + 1] * x + w[n + 2] * y
  for (let i = 0; i < n; i++) z += w[i] * kernel(Math.hypot(x - points[i][0], y - points[i][1]))
  return z
}

// Press the zone back onto the surface, fading out over the outer part of the zone.
const E = 1e-4
let pressed = 0
for (let i = 0; i < skin.verts; i++) {
  const d = zoneDistance(i)
  if (d >= 1) continue
  const x = pos[i * 3],
    y = pos[i * 3 + 1],
    z = pos[i * 3 + 2]
  const target = height(x, y)
  if (z <= target) continue
  const t = Math.min(1, Math.max(0, (1 - d) / 0.35))
  const weight = t * t * (3 - 2 * t)
  pos[i * 3 + 2] = z + (target - z) * weight
  const gx = (height(x + E, y) - height(x - E, y)) / (2 * E)
  const gy = (height(x, y + E) - height(x, y - E)) / (2 * E)
  const surface = [-gx, -gy, 1]
  const s = Math.hypot(...surface)
  const mixed = [0, 1, 2].map((a) => nrm[i * 3 + a] * (1 - weight) + (surface[a] / s) * weight)
  const m = Math.hypot(...mixed) || 1
  for (let a = 0; a < 3; a++) nrm[i * 3 + a] = mixed[a] / m
  pressed++
}

console.log(`male skin: ${pressed} vertices pressed onto the fitted surface`)

// Vessels of the genitals: triangles near the zone that now stand in front of the new surface.
const VESSELS = new Set(['arteries', 'veins'])
let dropped = 0
const trimmed = new Map()
for (const ref of manifest.bodies.male.organs) {
  if (!VESSELS.has(ref.name)) continue
  const p = new Float32Array(ab, ref.pos, ref.verts * 3)
  const tri = new Uint32Array(ab, ref.idx, ref.tris * 3)
  const kept = []
  for (let t = 0; t < tri.length; t += 3) {
    const c = [0, 1, 2].map((a) => (p[tri[t] * 3 + a] + p[tri[t + 1] * 3 + a] + p[tri[t + 2] * 3 + a]) / 3)
    let d = 0
    for (let a = 0; a < 3; a++) d += ((c[a] - ZONE.centre[a]) / (ZONE.radii[a] * 1.3)) ** 2
    if (d < 1 && c[2] > height(c[0], c[1]) - 0.004) dropped++
    else kept.push(tri[t], tri[t + 1], tri[t + 2])
  }
  trimmed.set(ref.name, new Uint32Array(kept))
}
console.log(`removed ${dropped} vessel triangles in front of the new surface`)

const chunks = []
let size = 0
const put = (typed) => {
  const at = size
  chunks.push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength))
  size += typed.byteLength
  return at
}
const copyRef = (ref, indices) => {
  const next = { ...ref }
  next.pos = put(new Float32Array(ab, ref.pos, ref.verts * 3).slice())
  const idx = indices ?? new Uint32Array(ab, ref.idx, ref.tris * 3).slice()
  next.idx = put(idx)
  next.tris = idx.length / 3
  if (ref.nrm !== undefined) next.nrm = put(new Float32Array(ab, ref.nrm, ref.verts * 3).slice())
  return next
}
const bodies = {}
for (const [build, body] of Object.entries(manifest.bodies)) {
  const organs = body.organs.map((o) => copyRef(o, build === 'male' ? trimmed.get(o.name) : undefined))
  bodies[build] = {
    ...body,
    skin: { ...copyRef(body.skin), ...(build === 'male' ? { mannequin: true } : {}) },
    organs,
  }
}
fs.writeFileSync(path.join(ANATOMY, 'anatomy.bin'), Buffer.concat(chunks, size))
fs.writeFileSync(path.join(ANATOMY, 'anatomy.json'), JSON.stringify({ ...manifest, bodies }))
