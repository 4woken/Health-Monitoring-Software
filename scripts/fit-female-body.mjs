// Gives the female reference body a skeleton and full vessels, fitted from the male ones.
//
// The female body (HuBMAP HRA, Visible Human female) has organs but no bones, and vessels in the
// torso only. This script takes the male bones, spine, arteries, veins and jugular veins (from
// BodyParts3D, see add-bodyparts3d.mjs) and bends them into the female body with a thin-plate
// spline warp. The warp is fitted on points matched between the two bodies: organ centres, the
// line of the spine, the width of the torso, and the centre lines of the arms and legs measured on
// the skin. Run add-bodyparts3d.mjs first, then:
//
//   node scripts/fit-female-body.mjs
//
// The result is an approximation to show where the bones and vessels are in a body of this shape,
// not a female skeleton: the female pelvis, for example, keeps the male shape, only widened.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ANATOMY = path.join(ROOT, 'public/anatomy')
const DRY = process.argv.includes('--dry')

const FITTED = [
  'skull',
  'vertebral column',
  'rib cage',
  'shoulder girdle',
  'arm bones',
  'pelvis',
  'leg bones',
  'arteries',
  'veins',
  'right internal jugular vein',
  'left internal jugular vein',
]
/** Female meshes the fitted ones replace: the torso-only vessels, and earlier runs of this script. */
const REPLACED = new Set(['blood vessels', ...FITTED])

const manifest = JSON.parse(fs.readFileSync(path.join(ANATOMY, 'anatomy.json'), 'utf8'))
const bin = fs.readFileSync(path.join(ANATOMY, 'anatomy.bin'))
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const positionsOf = (ref) => new Float32Array(ab, ref.pos, ref.verts * 3)
const mesh = (build, name) => {
  const body = manifest.bodies[build]
  const ref = name === 'skin' ? body.skin : body.organs.find((o) => o.name === name)
  if (!ref) throw new Error(`${build} body has no ${name}`)
  return positionsOf(ref)
}

// ---- Measuring a body ------------------------------------------------------------------------

function boxCentre(p) {
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p[i + a])
      hi[a] = Math.max(hi[a], p[i + a])
    }
  return lo.map((v, a) => (v + hi[a]) / 2)
}
/** Median of the vertices: unlike the box centre, one stray vertex does not move it. */
function medianCentre(p) {
  const axis = (a) => {
    const v = []
    for (let i = a; i < p.length; i += 3) v.push(p[i])
    v.sort((x, y) => x - y)
    return v[v.length >> 1]
  }
  return [axis(0), axis(1), axis(2)]
}
const mergeCentre = (...arrays) => medianCentre(Float32Array.from(arrays.flatMap((a) => [...a])))

/** The separate pieces of skin cut by a horizontal plane: legs, arms, torso. */
function pieces(skin, y, half = 0.006) {
  const pts = []
  for (let i = 0; i < skin.length; i += 3)
    if (Math.abs(skin[i + 1] - y) < half) pts.push([skin[i], skin[i + 2]])
  pts.sort((a, b) => a[0] - b[0])
  const out = []
  for (const [x, z] of pts) {
    const last = out[out.length - 1]
    if (last && x - last.hi < 0.02) {
      last.hi = x
      last.xs.push(x)
      last.zs.push(z)
    } else out.push({ lo: x, hi: x, xs: [x], zs: [z] })
  }
  return out
    .filter((q) => q.xs.length >= 6)
    .map((q) => ({
      lo: q.lo,
      hi: q.hi,
      x: q.xs.reduce((s, v) => s + v, 0) / q.xs.length,
      z: (Math.min(...q.zs) + Math.max(...q.zs)) / 2,
      front: Math.max(...q.zs),
      back: Math.min(...q.zs),
    }))
}
const holdsMidline = (q) => q.lo < 0 && q.hi > 0

function measure(build) {
  const skin = mesh(build, 'skin')
  const height = manifest.bodies[build].height
  // Crotch: the lowest height where one piece crosses the midline.
  let crotch = 0.3
  while (!pieces(skin, crotch).some(holdsMidline)) crotch += 0.005
  // Armpit: the highest height, below the shoulders, where the arms are still apart from the torso.
  let armpit = crotch + 0.2
  for (let y = crotch + 0.2; y < height * 0.85; y += 0.005) {
    const cut = pieces(skin, y)
    const torso = cut.find(holdsMidline)
    if (torso && cut.some((q) => q.lo > torso.hi) && cut.some((q) => q.hi < torso.lo)) armpit = y
  }
  // Fingertips: the lowest height where an arm piece is still beside the torso.
  let fingertips = armpit
  for (let y = armpit; y > crotch * 0.7; y -= 0.005) {
    const cut = pieces(skin, y)
    const torso = cut.find(holdsMidline) ?? { lo: -0.2, hi: 0.2 }
    const hands = cut.filter((q) => q.lo > torso.hi + 0.01 || q.hi < torso.lo - 0.01)
    if (hands.length >= 2) fingertips = y
  }
  // Arm roots: the widest cut just above the armpit, where the arms join the torso. Neck: the
  // narrowest cut above it.
  let shoulder = { y: armpit, width: 0 }
  for (let y = armpit; y < height * 0.9; y += 0.005) {
    const t = pieces(skin, y).find(holdsMidline)
    if (t && t.hi - t.lo > shoulder.width) shoulder = { y, width: t.hi - t.lo, piece: t }
  }
  let neck = { y: shoulder.y, width: Infinity }
  for (let y = shoulder.y + 0.03; y < height * 0.93; y += 0.005) {
    const t = pieces(skin, y).find(holdsMidline)
    if (t && t.hi - t.lo < neck.width) neck = { y, width: t.hi - t.lo, piece: t }
  }
  return { skin, height, crotch, armpit, fingertips, shoulder, neck }
}

// ---- Matched points between the two bodies ----------------------------------------------------

const male = measure('male')
const female = measure('female')
const pairs = []
const add = (label, m, f) => m && f && pairs.push({ label, m, f })

for (const name of [
  'brain',
  'left eyeball',
  'right eyeball',
  'heart',
  'liver',
  'left kidney',
  'right kidney',
  'urinary bladder',
])
  add(name, medianCentre(mesh('male', name)), medianCentre(mesh('female', name)))
add(
  'lungs',
  mergeCentre(mesh('male', 'right lung'), mesh('male', 'left lung')),
  medianCentre(mesh('female', 'lungs')),
)

const topOf = (b) => {
  let best = [0, -Infinity, 0]
  for (let i = 0; i < b.skin.length; i += 3)
    if (b.skin[i + 1] > best[1]) best = [b.skin[i], b.skin[i + 1], b.skin[i + 2]]
  return best
}
add('top of head', topOf(male), topOf(female))
for (const [label, key] of [
  ['neck', 'neck'],
  ['arm roots', 'shoulder'],
]) {
  const m = male[key],
    f = female[key]
  add(
    `${label} centre`,
    [(m.piece.lo + m.piece.hi) / 2, m.y, m.piece.z],
    [(f.piece.lo + f.piece.hi) / 2, f.y, f.piece.z],
  )
  add(`${label} right`, [m.piece.lo, m.y, m.piece.z], [f.piece.lo, f.y, f.piece.z])
  add(`${label} left`, [m.piece.hi, m.y, m.piece.z], [f.piece.hi, f.y, f.piece.z])
}

// Torso: centre and sides at matching shares of the height from crotch to armpit.
for (let t = 0.1; t <= 0.95; t += 0.17) {
  const cut = (b) => {
    const y = b.crotch + t * (b.armpit - b.crotch)
    return { y, q: pieces(b.skin, y).find(holdsMidline) }
  }
  const m = cut(male),
    f = cut(female)
  if (!m.q || !f.q) continue
  add(`torso ${t.toFixed(2)}`, [m.q.x, m.y, m.q.z], [f.q.x, f.y, f.q.z])
  add(`torso right ${t.toFixed(2)}`, [m.q.lo + 0.015, m.y, m.q.z], [f.q.lo + 0.015, f.y, f.q.z])
  add(`torso left ${t.toFixed(2)}`, [m.q.hi - 0.015, m.y, m.q.z], [f.q.hi - 0.015, f.y, f.q.z])
}

/** Four points just under the skin of one cut: both sides, the front and the back. */
function edges(label, m, my, f, fy, inset) {
  add(`${label} side a`, [m.lo + inset, my, m.z], [f.lo + inset, fy, f.z])
  add(`${label} side b`, [m.hi - inset, my, m.z], [f.hi - inset, fy, f.z])
  add(`${label} front`, [(m.lo + m.hi) / 2, my, m.front - inset], [(f.lo + f.hi) / 2, fy, f.front - inset])
  add(`${label} back`, [(m.lo + m.hi) / 2, my, m.back + inset], [(f.lo + f.hi) / 2, fy, f.back + inset])
}

// Head: its sides, front and back at the eyes and at the middle of the brain.
for (const organ of ['left eyeball', 'brain']) {
  const my = medianCentre(mesh('male', organ))[1]
  const fy = medianCentre(mesh('female', organ))[1]
  const m = pieces(male.skin, my).find(holdsMidline)
  const f = pieces(female.skin, fy).find(holdsMidline)
  if (m && f) edges(`head at ${organ}`, m, my, f, fy, 0.012)
}

// Legs: the centre of each leg, from the ankle to just below the crotch.
for (let t = 0.04; t <= 0.92; t += 0.11) {
  const legs = (b) => {
    const y = t * b.crotch
    const cut = pieces(b.skin, y).filter((q) => !holdsMidline(q))
    return {
      y,
      right: cut
        .filter((q) => q.x < 0)
        .sort((a, c) => a.x - c.x)
        .pop(),
      left: cut.filter((q) => q.x > 0).sort((a, c) => a.x - c.x)[0],
    }
  }
  const m = legs(male),
    f = legs(female)
  for (const side of ['right', 'left'])
    if (m[side] && f[side]) {
      add(`${side} leg ${t.toFixed(2)}`, [m[side].x, m.y, m[side].z], [f[side].x, f.y, f[side].z])
      edges(`${side} leg ${t.toFixed(2)}`, m[side], m.y, f[side], f.y, 0.008)
    }
}
// Feet: the toes, as the most forward skin point of each foot.
const toes = (b, sign) => {
  let best = null
  for (let i = 0; i < b.skin.length; i += 3)
    if (b.skin[i + 1] < 0.03 && Math.sign(b.skin[i]) === sign && (!best || b.skin[i + 2] > best[2]))
      best = [b.skin[i], b.skin[i + 1], b.skin[i + 2]]
  return best
}
add('right toes', toes(male, -1), toes(female, -1))
add('left toes', toes(male, 1), toes(female, 1))

// Arms: the centre of each arm, from the fingertips to the armpit.
for (let t = 0.03; t <= 0.97; t += 0.094) {
  const arms = (b) => {
    const y = b.fingertips + t * (b.armpit - b.fingertips)
    const cut = pieces(b.skin, y)
    const torso = cut.find(holdsMidline) ?? { lo: -0.18, hi: 0.18 }
    return {
      y,
      right: cut.filter((q) => q.hi < torso.lo).sort((a, c) => a.x - c.x)[0],
      left: cut.filter((q) => q.lo > torso.hi).sort((a, c) => c.x - a.x)[0],
    }
  }
  const m = arms(male),
    f = arms(female)
  for (const side of ['right', 'left'])
    if (m[side] && f[side]) {
      add(`${side} arm ${t.toFixed(2)}`, [m[side].x, m.y, m[side].z], [f[side].x, f.y, f[side].z])
      if (t > 0.25) edges(`${side} arm ${t.toFixed(2)}`, m[side], m.y, f[side], f.y, 0.006)
    }
}

// Spine: the male spinal canal, just behind the centre of the vertebrae, on the female spinal cord.
const centreLine = (p, y, half = 0.02) => {
  let x = 0,
    z = 0,
    n = 0
  for (let i = 0; i < p.length; i += 3)
    if (Math.abs(p[i + 1] - y) < half) {
      x += p[i]
      z += p[i + 2]
      n++
    }
  return n >= 10 ? [x / n, y, z / n] : null
}
const maleColumn = mesh('male', 'vertebral column')
const femaleCord = mesh('female', 'spinal cord')
const cordBox = (() => {
  let lo = Infinity,
    hi = -Infinity
  for (let i = 1; i < femaleCord.length; i += 3) {
    lo = Math.min(lo, femaleCord[i])
    hi = Math.max(hi, femaleCord[i])
  }
  return { lo, hi }
})()
for (let t = 0.12; t <= 0.9; t += 0.13) {
  // Matched by share of the height between crotch and neck.
  const my = male.crotch + 0.12 + t * (male.neck.y - male.crotch - 0.12)
  const fy = female.crotch + 0.12 + t * (female.neck.y - female.crotch - 0.12)
  if (fy < cordBox.lo + 0.02 || fy > cordBox.hi - 0.02) continue
  const m = centreLine(maleColumn, my),
    f = centreLine(femaleCord, fy, 0.012)
  if (m && f) add(`spine ${t.toFixed(2)}`, [m[0], my, m[2] - 0.012], [f[0], fy, f[2]])
}

console.log(
  `male: crotch ${male.crotch.toFixed(3)}, fingertips ${male.fingertips.toFixed(3)}, armpit ${male.armpit.toFixed(3)}, shoulders ${male.shoulder.y.toFixed(3)}, neck ${male.neck.y.toFixed(3)}`,
)
console.log(
  `female: crotch ${female.crotch.toFixed(3)}, fingertips ${female.fingertips.toFixed(3)}, armpit ${female.armpit.toFixed(3)}, shoulders ${female.shoulder.y.toFixed(3)}, neck ${female.neck.y.toFixed(3)}`,
)
console.log(`${pairs.length} matched points`)
if (DRY) {
  for (const p of pairs)
    console.log(
      `  ${p.label.padEnd(20)} ${p.m.map((v) => v.toFixed(3)).join(' ')}  ->  ${p.f.map((v) => v.toFixed(3)).join(' ')}`,
    )
  process.exit(0)
}

// ---- Thin-plate spline: a smooth map that takes every male point onto its female match ----------

function solve(A, B) {
  // Gaussian elimination with partial pivoting; A is n x n, B is n x k.
  const n = A.length,
    k = B[0].length
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    ;[B[c], B[p]] = [B[p], B[c]]
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c]
      if (!f) continue
      for (let j = c; j < n; j++) A[r][j] -= f * A[c][j]
      for (let j = 0; j < k; j++) B[r][j] -= f * B[c][j]
    }
  }
  const X = Array.from({ length: n }, () => new Array(k).fill(0))
  for (let r = n - 1; r >= 0; r--)
    for (let j = 0; j < k; j++) {
      let s = B[r][j]
      for (let c = r + 1; c < n; c++) s -= A[r][c] * X[c][j]
      X[r][j] = s / A[r][r]
    }
  return X
}

function thinPlate(src, dst, smoothing = 0.002) {
  const n = src.length
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const A = Array.from({ length: n + 4 }, () => new Array(n + 4).fill(0))
  const B = Array.from({ length: n + 4 }, () => [0, 0, 0])
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = i === j ? smoothing : dist(src[i], src[j])
    A[i][n] = A[n][i] = 1
    for (let a = 0; a < 3; a++) A[i][n + 1 + a] = A[n + 1 + a][i] = src[i][a]
    B[i] = [...dst[i]]
  }
  const X = solve(A, B)
  return (p) => {
    const out = [X[n][0], X[n][1], X[n][2]]
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) out[c] += X[n + 1 + a][c] * p[a]
    for (let i = 0; i < n; i++) {
      const r = dist(p, src[i])
      for (let c = 0; c < 3; c++) out[c] += X[i][c] * r
    }
    return out
  }
}

const warp = thinPlate(
  pairs.map((p) => p.m),
  pairs.map((p) => p.f),
)
const worst = pairs
  .map((p) => ({ label: p.label, off: Math.hypot(...warp(p.m).map((v, a) => v - p.f[a])) }))
  .sort((a, b) => b.off - a.off)[0]
console.log(`largest miss on a matched point: ${(worst.off * 1000).toFixed(1)} mm (${worst.label})`)

// ---- Bend the male meshes into the female body and write the files ---------------------------

const maleBody = manifest.bodies.male
// ---- Keep everything inside the skin ----------------------------------------------------------
// The female skin is turned into 4 mm voxels: its surface, then everything a flood fill from the
// outside cannot reach is the inside. A fitted vertex outside it goes to the nearest inside voxel.

const VOXEL = 0.004
const fskin = female.skin
const box = (() => {
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < fskin.length; i += 3)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], fskin[i + a] - 0.02)
      hi[a] = Math.max(hi[a], fskin[i + a] + 0.02)
    }
  return { lo, dims: hi.map((v, a) => Math.ceil((v - lo[a]) / VOXEL) + 1) }
})()
const [NX, NY, NZ] = box.dims
const cell = (x, y, z) => {
  const i = Math.floor((x - box.lo[0]) / VOXEL),
    j = Math.floor((y - box.lo[1]) / VOXEL),
    k = Math.floor((z - box.lo[2]) / VOXEL)
  return i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ ? -1 : (k * NY + j) * NX + i
}
const SURFACE = 1,
  OUTSIDE = 2
const grid = new Uint8Array(NX * NY * NZ)
{
  const ref = manifest.bodies.female.skin
  const tri = new Uint32Array(ab, ref.idx, ref.tris * 3)
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t] * 3, tri[t + 1] * 3, tri[t + 2] * 3]
    const span = Math.max(
      Math.hypot(fskin[a] - fskin[b], fskin[a + 1] - fskin[b + 1], fskin[a + 2] - fskin[b + 2]),
      Math.hypot(fskin[a] - fskin[c], fskin[a + 1] - fskin[c + 1], fskin[a + 2] - fskin[c + 2]),
    )
    const n = Math.max(1, Math.ceil(span / (VOXEL / 3)))
    for (let u = 0; u <= n; u++)
      for (let v = 0; v <= n - u; v++) {
        const w = 1 - u / n - v / n
        const id = cell(
          w * fskin[a] + (u / n) * fskin[b] + (v / n) * fskin[c],
          w * fskin[a + 1] + (u / n) * fskin[b + 1] + (v / n) * fskin[c + 1],
          w * fskin[a + 2] + (u / n) * fskin[b + 2] + (v / n) * fskin[c + 2],
        )
        if (id >= 0) grid[id] = SURFACE
      }
  }
  // Flood fill from a corner through everything that is not skin.
  const queue = new Int32Array(NX * NY * NZ)
  let head = 0,
    tail = 0
  queue[tail++] = 0
  grid[0] = OUTSIDE
  while (head < tail) {
    const id = queue[head++]
    const i = id % NX,
      j = Math.floor(id / NX) % NY,
      k = Math.floor(id / (NX * NY))
    for (const [di, dj, dk] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const a = i + di,
        b = j + dj,
        c = k + dk
      if (a < 0 || b < 0 || c < 0 || a >= NX || b >= NY || c >= NZ) continue
      const next = (c * NY + b) * NX + a
      if (grid[next] === 0) {
        grid[next] = OUTSIDE
        queue[tail++] = next
      }
    }
  }
}
// Deep inside: an inside voxel none of whose six neighbours is skin, so a triangle between two such
// vertices cannot cut through a curved or thin stretch of skin.
const DEEP = 3
for (let k = 1; k < NZ - 1; k++)
  for (let j = 1; j < NY - 1; j++)
    for (let i = 1; i < NX - 1; i++) {
      const id = (k * NY + j) * NX + i
      if (grid[id] !== 0) continue
      const near = [id + 1, id - 1, id + NX, id - NX, id + NX * NY, id - NX * NY]
      if (near.every((n) => grid[n] !== SURFACE)) grid[id] = DEEP
    }
let moved = 0,
  lost = 0
function nearest(p, wanted, radius) {
  const i0 = Math.floor((p[0] - box.lo[0]) / VOXEL),
    j0 = Math.floor((p[1] - box.lo[1]) / VOXEL),
    k0 = Math.floor((p[2] - box.lo[2]) / VOXEL)
  for (let r = 1; r <= radius; r++) {
    let best = null,
      bestD = Infinity
    for (let di = -r; di <= r; di++)
      for (let dj = -r; dj <= r; dj++)
        for (let dk = -r; dk <= r; dk++) {
          if (Math.max(Math.abs(di), Math.abs(dj), Math.abs(dk)) !== r) continue
          const a = i0 + di,
            b = j0 + dj,
            c = k0 + dk
          if (a < 0 || b < 0 || c < 0 || a >= NX || b >= NY || c >= NZ) continue
          if (!wanted(grid[(c * NY + b) * NX + a])) continue
          const q = [
            box.lo[0] + (a + 0.5) * VOXEL,
            box.lo[1] + (b + 0.5) * VOXEL,
            box.lo[2] + (c + 0.5) * VOXEL,
          ]
          const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
          if (d < bestD) {
            bestD = d
            best = q
          }
        }
    if (best) return best
  }
  return null
}
function keepInside(p) {
  const id = cell(p[0], p[1], p[2])
  if (id >= 0 && grid[id] === DEEP) return p
  // Deep inside if there is room nearby; otherwise (thin fingers) anywhere inside.
  const q =
    nearest(p, (g) => g === DEEP, 6) ?? (id >= 0 && grid[id] === 0 ? p : nearest(p, (g) => g === 0, 12))
  if (!q) {
    lost++
    return p
  }
  if (q !== p) moved++
  return q
}

let stretched = 0
const fitted = FITTED.map((name) => {
  const ref = maleBody.organs.find((o) => o.name === name)
  if (!ref) throw new Error(`male body has no ${name}: run add-bodyparts3d.mjs first`)
  const src = positionsOf(ref)
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) out.set(keepInside(warp([src[i], src[i + 1], src[i + 2]])), i)
  // A triangle whose corners were pulled into two different fingers would stretch across the gap
  // between them, outside the skin: such triangles are dropped.
  const tri = new Uint32Array(ab, ref.idx, ref.tris * 3)
  const longest = (P, a, b, c) =>
    Math.max(
      Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]),
      Math.hypot(P[b] - P[c], P[b + 1] - P[c + 1], P[b + 2] - P[c + 2]),
      Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]),
    )
  const kept = []
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t] * 3, tri[t + 1] * 3, tri[t + 2] * 3]
    const centre = cell(
      (out[a] + out[b] + out[c]) / 3,
      (out[a + 1] + out[b + 1] + out[c + 1]) / 3,
      (out[a + 2] + out[b + 2] + out[c + 2]) / 3,
    )
    const within = centre >= 0 && grid[centre] !== OUTSIDE
    if (within && longest(out, a, b, c) <= 1.6 * longest(src, a, b, c) + 0.002)
      kept.push(tri[t], tri[t + 1], tri[t + 2])
    else stretched++
  }
  return { name, positions: out, indices: new Uint32Array(kept) }
})

console.log(
  `kept inside the skin: ${moved} vertices moved in, ${lost} too far to move, ${stretched} stretched triangles dropped`,
)

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
const bodies = {}
for (const [build, body] of Object.entries(manifest.bodies)) {
  const organs = body.organs.filter((o) => build !== 'female' || !REPLACED.has(o.name)).map(copyRef)
  const anchors = { ...body.anchors }
  if (build === 'female') {
    for (const g of fitted)
      organs.push({
        name: g.name,
        pos: put(g.positions),
        verts: g.positions.length / 3,
        idx: put(g.indices),
        tris: g.indices.length / 3,
        center: boxCentre(g.positions).map((v) => Math.round(v * 1000) / 1000),
      })
    // The marker now sits on the fitted left jugular vein.
    delete anchors.neckVein
  }
  const credit =
    '; bones and vessels fitted from BodyParts3D, © The Database Center for Life Science, CC BY 4.0'
  const attribution =
    build === 'female' && !body.attribution.includes('BodyParts3D')
      ? body.attribution + credit
      : body.attribution
  bodies[build] = { ...body, attribution, anchors, skin: copyRef(body.skin), organs }
}
fs.writeFileSync(path.join(ANATOMY, 'anatomy.bin'), Buffer.concat(chunks, size))
fs.writeFileSync(path.join(ANATOMY, 'anatomy.json'), JSON.stringify({ ...manifest, bodies }))
console.log(
  `female body: ${fitted.length} meshes fitted. anatomy.bin: ${(bin.length / 1e6).toFixed(1)} MB -> ${(size / 1e6).toFixed(1)} MB`,
)
