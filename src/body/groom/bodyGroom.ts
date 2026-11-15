import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import type { Build } from '../anatomy/bodyShape'
import type { Body } from '../anatomy/loadAnatomy'
import type { HeadFrame } from '../portrait/headFit'
import { registeredHeadTemplate } from '../portrait/headFit'
import referenceHeads from '../portrait/referenceHeads.json'
import { crewCoverage } from '../appearance/crewCoverage'
import { attachStrandShader, type GroomKind } from './strandShader'

type Weights = { indices: [number, number, number]; weights: [number, number, number] }
type Vertex = { point: Vector3; normal: Vector3; mask: number; source: Weights; ribbon?: [number, number] }
type ShellRegion = { kind: GroomKind; vertices: Vertex[]; triangles: number[] }
const SHELLS = 16
const ramp = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function headFrame(body: Body): HeadFrame {
  const eyes = (body.eyeSockets ?? body.organs.filter((o) => o.name.endsWith('eyeball'))).map((o) => o.center)
  if (eyes.length !== 2) return { x: 0, y: body.height * 0.928, eyeDistance: 0.064, eyeZ: 0.06 }
  return {
    x: (eyes[0][0] + eyes[1][0]) / 2,
    y: (eyes[0][1] + eyes[1][1]) / 2,
    eyeZ: (eyes[0][2] + eyes[1][2]) / 2,
    eyeDistance: Math.abs(eyes[0][0] - eyes[1][0]),
  }
}

/** Hairline measured in eye spacings. The nape is lower than the temples;
 * only a short sideburn crosses the raised arc around the ear. */
function scalpMask(p: Vector3, n: Vector3, head: HeadFrame, height: number) {
  const span = head.eyeDistance
  const headDepth = span * 1.45
  const ratio = (p.y - head.y) / (height - head.y)
  if (ratio < -0.25 || Math.abs(p.x - head.x) > span * 1.65) return 0
  const side = Math.abs((p.x - head.x) / span)
  const angle = Math.atan2(Math.abs(p.x - head.x), p.z - (head.eyeZ - headDepth * 0.88))
  const top = 0.6 - 0.2 * ramp(0.1, 0.92, angle) + 0.06 * Math.exp(-((angle - 0.69) ** 2) / 0.045)
  const sideburn = 0.31 * Math.exp(-((angle - 1.15) ** 2) / 0.017)
  const hairline = top - sideburn - 0.51 * ramp(1.72, 2.63, angle)
  return (
    ramp(hairline - 0.062, hairline + 0.13, ratio) * ramp(-0.35, 0.06, n.y) * (1 - ramp(1.55, 1.65, side))
  )
}

function bodyHairMask(p: Vector3, n: Vector3, height: number, build: Build) {
  const y = p.y / height,
    x = Math.abs(p.x / height),
    z = p.z / height
  const leg = ramp(0.065, 0.104, y) * (1 - ramp(0.28, 0.387, y)) * (1 - ramp(0.085, 0.102, x))
  const wristToElbow = ramp(0.48, 0.522, y) * (1 - ramp(0.615, 0.654, y))
  const arm = wristToElbow * ramp(0.108, 0.13, x) * ramp(-0.6, -0.05, n.x * Math.sign(p.x))
  const chest =
    ramp(0.642, 0.689, y) *
    (1 - ramp(0.743, 0.796, y)) *
    (1 - ramp(0.049, 0.089, x)) *
    ramp(0.021, 0.043, z) *
    ramp(0.2, 0.62, n.z)
  const abdomen =
    ramp(0.48, 0.53, y) * (1 - ramp(0.6, 0.68, y)) * (1 - ramp(0.009, 0.032, x)) * ramp(0.25, 0.72, n.z)
  const finer = build === 'female'
  return Math.max(
    leg * (finer ? 0.42 : 0.83),
    arm * (finer ? 0.47 : 0.86),
    chest * (finer ? 0 : 1),
    abdomen * (finer ? 0 : 0.72),
  )
}

function makeRegions(body: Body, skin: BufferGeometry) {
  const head = headFrame(body)
  const positions = skin.getAttribute('position'),
    normals = skin.getAttribute('normal'),
    index = skin.getIndex()!
  const eyePatch = skin.getAttribute('portraitEye')
  const regions: Record<GroomKind, ShellRegion> = {
    scalp: { kind: 'scalp', vertices: [], triangles: [] },
    body: { kind: 'body', vertices: [], triangles: [] },
    brow: { kind: 'brow', vertices: [], triangles: [] },
    lash: { kind: 'lash', vertices: [], triangles: [] },
  }
  const scalp = new Float32Array(positions.count),
    bodyHair = new Float32Array(positions.count)
  const p = new Vector3(),
    n = new Vector3()
  for (let v = 0; v < positions.count; v++) {
    p.fromBufferAttribute(positions, v)
    n.fromBufferAttribute(normals, v)
    scalp[v] = scalpMask(p, n, head, body.height)
    bodyHair[v] = bodyHairMask(p, n, body.height, body.build)
  }
  const scalpMap = new Map<number, number>(),
    bodyMap = new Map<number, number>()
  function addFace(
    region: ShellRegion,
    map: Map<number, number>,
    mask: Float32Array,
    a: number,
    b: number,
    c: number,
  ) {
    if (Math.max(mask[a], mask[b], mask[c]) < 0.01) return
    for (const v of [a, b, c]) {
      let j = map.get(v)
      if (j === undefined) {
        j = region.vertices.length
        map.set(v, j)
        region.vertices.push({
          point: new Vector3().fromBufferAttribute(positions, v),
          normal: new Vector3().fromBufferAttribute(normals, v),
          mask: mask[v],
          source: { indices: [v, v, v], weights: [1, 0, 0] },
        })
      }
      region.triangles.push(j)
    }
  }
  // Keep a small set of triangles above the eyes for front projection of the
  // strips. Eyelash roots belong to the skin, never to a portrait's eye insert.
  const eyeFaces: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2)
    addFace(regions.scalp, scalpMap, scalp, a, b, c)
    addFace(regions.body, bodyMap, bodyHair, a, b, c)
    if (eyePatch && (eyePatch.getX(a) > 0.5 || eyePatch.getX(b) > 0.5 || eyePatch.getX(c) > 0.5)) continue
    if (
      Math.max(positions.getY(a), positions.getY(b), positions.getY(c)) < head.y - 0.02 ||
      Math.min(positions.getY(a), positions.getY(b), positions.getY(c)) > head.y + 0.047 ||
      Math.max(positions.getZ(a), positions.getZ(b), positions.getZ(c)) < head.eyeZ - 0.018
    )
      continue
    eyeFaces.push(a, b, c)
  }

  function sample(x: number, y: number): Vertex | undefined {
    let result: Vertex | undefined,
      best = head.eyeZ - 0.018
    for (let i = 0; i < eyeFaces.length; i += 3) {
      const a = eyeFaces[i],
        b = eyeFaces[i + 1],
        c = eyeFaces[i + 2]
      const ax = positions.getX(a),
        ay = positions.getY(a)
      const ux = positions.getX(b) - ax,
        uy = positions.getY(b) - ay
      const vx = positions.getX(c) - ax,
        vy = positions.getY(c) - ay
      const det = ux * vy - uy * vx
      if (Math.abs(det) < 1e-11) continue
      const wb = ((x - ax) * vy - (y - ay) * vx) / det,
        wc = (ux * (y - ay) - uy * (x - ax)) / det,
        wa = 1 - wb - wc
      if (Math.min(wa, wb, wc) < -1e-6) continue
      const z = wa * positions.getZ(a) + wb * positions.getZ(b) + wc * positions.getZ(c)
      if (z <= best) continue
      best = z
      const normal = new Vector3()
        .fromBufferAttribute(normals, a)
        .multiplyScalar(wa)
        .addScaledVector(n.fromBufferAttribute(normals, b), wb)
        .addScaledVector(n.fromBufferAttribute(normals, c), wc)
        .normalize()
      result = {
        point: new Vector3(x, y, z),
        normal,
        mask: 1,
        source: { indices: [a, b, c], weights: [wa, wb, wc] },
      }
    }
    return result
  }

  const face = registeredHeadTemplate(body.referenceHead?.points ?? referenceHeads[body.build].points, head)
  // MediaPipe's upper/lower brow contours and upper eyelid rim follow both
  // templates. Dense root strips avoid thick eyebrows on low-resolution faces.
  const browPairs = [
    [
      [107, 66, 105, 63, 70],
      [55, 65, 52, 53, 46],
    ],
    [
      [336, 296, 334, 293, 300],
      [285, 295, 282, 283, 276],
    ],
  ]
  const lids = [
    [133, 173, 157, 158, 159, 160, 161, 246, 33],
    [362, 398, 384, 385, 386, 387, 388, 466, 263],
  ]
  const pointAt = (curve: number[], t: number) => {
    const scaled = t * (curve.length - 1),
      i = Math.min(Math.floor(scaled), curve.length - 2),
      k = scaled - i
    const a = face[curve[i]],
      b = face[curve[i + 1]]
    return {
      x: head.x + (a.x + (b.x - a.x) * k) * head.eyeDistance,
      y: head.y + (a.y + (b.y - a.y) * k) * head.eyeDistance,
    }
  }
  for (let eye = 0; eye < 2; eye++) {
    // A measured opening supplies the real lid margin. Projected landmarks
    // alone can put the roots several millimetres onto the skin above the lid.
    const opening = body.referenceHead?.eyeOpenings?.[eye === 0 ? 'right eyeball' : 'left eyeball']
    const margin = opening?.rim
      .filter((p) => p[1] >= 0)
      .sort((a, b) => (eye === 0 ? b[0] - a[0] : a[0] - b[0]))
    for (const kind of ['brow', 'lash'] as const) {
      const region = regions[kind]
      let previous: number[] = []
      const columns = kind === 'brow' ? 29 : 33
      for (let ix = 0; ix < columns; ix++) {
        const t = ix / (columns - 1),
          rows: number[] = []
        const top = pointAt(browPairs[eye][0], t),
          base = pointAt(browPairs[eye][1], t),
          lid = pointAt(lids[eye], t)
        if (kind === 'lash' && opening && margin && margin.length > 1) {
          const start = margin[0][0],
            end = margin[margin.length - 1][0]
          const x = start + (end - start) * (0.03 + 0.94 * t)
          const i = margin.findIndex((p) => (eye === 0 ? p[0] <= x : p[0] >= x))
          const a = margin[Math.max(0, i - 1)],
            b = margin[Math.max(0, i)]
          const weight = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0])
          lid.x = opening.center[0] + x / 10000
          lid.y = opening.center[1] + (a[1] + (b[1] - a[1]) * weight) / 10000
        }
        for (let iy = 0; iy < 3; iy++) {
          const k = iy / 2
          const x = kind === 'brow' ? base.x + (top.x - base.x) * (0.23 + 0.64 * k) : lid.x
          let y =
            kind === 'brow' ? base.y + (top.y - base.y) * (0.23 + 0.64 * k) : lid.y + 0.00012 + 0.00068 * k
          let v = sample(x, y)
          // A real open eye can put a landmark just below its upper lid.
          // Search upwards by less than the height of a lid, then skip empty columns.
          if (kind === 'lash') for (let j = 0; !v && j < 6; j++) v = sample(x, (y += 0.00045))
          if (!v) {
            rows.push(-1)
            continue
          }
          v.mask = ramp(0, 0.09, t) * (1 - ramp(0.8, 1, t))
          v.ribbon = [t, k]
          rows.push(region.vertices.length)
          region.vertices.push(v)
        }
        if (previous.length)
          for (let r = 0; r < 2; r++) {
            const quad = [previous[r], rows[r], rows[r + 1], previous[r + 1]]
            if (quad.every((v) => v >= 0)) {
              const [a, b, c, d] = quad
              // Both eye strips face forward, regardless of the direction their anchors traverse.
              if (region.vertices[b].point.x >= region.vertices[a].point.x)
                region.triangles.push(a, b, c, a, c, d)
              else region.triangles.push(a, c, b, a, d, c)
            }
          }
        previous = rows
      }
    }
  }
  return { regions, head }
}

type Patch = (shader: WebGLProgramParametersWithUniforms) => void

/** Instanced shells use one compact set of surface triangles per region. Brows
 * and lashes use barycentric skin roots so they move with the live portrait. */
export function createBodyGroom(body: Body, skin: BufferGeometry, patch?: Patch) {
  const { regions, head } = makeRegions(body, skin)
  const object = new Group()
  object.name = 'Surface hair'
  const positions = skin.getAttribute('position'),
    normals = skin.getAttribute('normal')
  const shellHeights = Float32Array.from({ length: SHELLS }, (_, i) => (i + 0.4) / SHELLS)
  const detail = { value: 1 }
  const colors: Record<GroomKind, number> = {
    scalp: 0x36291f,
    brow: 0x655043,
    lash: 0x46352d,
    body: 0x88684f,
  }
  const bindings: { roots: Vertex[]; positions: BufferAttribute; normals: BufferAttribute }[] = []
  let coverBodyHair: ReturnType<typeof crewCoverage> | undefined
  for (const r of Object.values(regions)) {
    if (!r.triangles.length) continue
    const geometry = new InstancedBufferGeometry()
    const rest = new Float32Array(r.vertices.length * 3),
      dirs = new Float32Array(rest.length),
      masks = new Float32Array(r.vertices.length)
    r.vertices.forEach((v, i) => {
      v.point.toArray(rest, i * 3)
      v.normal.toArray(dirs, i * 3)
      masks[i] = v.mask
    })
    const moveWithPortrait = r.kind === 'brow' || r.kind === 'lash' || r.kind === 'scalp'
    const pos = new BufferAttribute(moveWithPortrait ? rest.slice() : rest, 3)
    const norm = new BufferAttribute(dirs, 3)
    if (moveWithPortrait) {
      pos.setUsage(DynamicDrawUsage)
      norm.setUsage(DynamicDrawUsage)
      bindings.push({ roots: r.vertices, positions: pos, normals: norm })
    }
    geometry.setAttribute('position', pos)
    geometry.setAttribute('normal', norm)
    geometry.setAttribute('groomRest', new BufferAttribute(rest, 3))
    geometry.setAttribute('groomMask', new BufferAttribute(masks, 1))
    // Interpolating the same per-skin-vertex motion keeps the hair roots attached.
    for (const name of ['exerciseArms', 'fluidOffset']) {
      const sourceAttribute = skin.getAttribute(name)
      if (!sourceAttribute) continue
      const weights = new Float32Array(r.vertices.length * 2)
      r.vertices.forEach(({ source }, i) => {
        for (let j = 0; j < 3; j++) {
          weights[i * 2] += sourceAttribute.getX(source.indices[j]) * source.weights[j]
          weights[i * 2 + 1] += sourceAttribute.getY(source.indices[j]) * source.weights[j]
        }
      })
      geometry.setAttribute(name, new BufferAttribute(weights, 2))
    }
    if (r.kind === 'brow' || r.kind === 'lash') {
      geometry.setAttribute(
        'groomRibbon',
        new BufferAttribute(new Float32Array(r.vertices.flatMap((v) => v.ribbon!)), 2),
      )
    }
    geometry.setAttribute('shellHeight', new InstancedBufferAttribute(shellHeights, 1))
    geometry.setIndex(r.triangles)
    if (r.kind === 'body')
      coverBodyHair = crewCoverage(
        geometry,
        r.vertices.map((v) => v.source.indices[0]),
      )
    geometry.instanceCount = SHELLS
    geometry.computeBoundingSphere()
    geometry.boundingSphere!.radius += 0.025
    const material = new MeshStandardMaterial({
      color: new Color(colors[r.kind]),
      roughness: 0.85,
      alphaTest: 0.28,
    })
    material.alphaToCoverage = true
    attachStrandShader(material, r.kind, head, body.height, detail, patch)
    const mesh = new Mesh(geometry, material)
    mesh.name = r.kind
    mesh.renderOrder = 3
    object.add(mesh)
  }
  const scalp = object.getObjectByName('scalp')
  let lastVersion = (positions as BufferAttribute).version
  return {
    object,
    sync(portraitActive: boolean, haircutReady = false, outfit?: Object3D) {
      if (!object.visible) return
      coverBodyHair?.(outfit)
      if (scalp) scalp.visible = !haircutReady
      detail.value = portraitActive ? 0 : 1
      const version = (positions as BufferAttribute).version
      if (version === lastVersion) return
      lastVersion = version
      for (const data of bindings) {
        data.roots.forEach(({ source }, i) => {
          const [a, b, c] = source.indices,
            [wa, wb, wc] = source.weights
          data.positions.setXYZ(
            i,
            wa * positions.getX(a) + wb * positions.getX(b) + wc * positions.getX(c),
            wa * positions.getY(a) + wb * positions.getY(b) + wc * positions.getY(c),
            wa * positions.getZ(a) + wb * positions.getZ(b) + wc * positions.getZ(c),
          )
          data.normals.setXYZ(
            i,
            wa * normals.getX(a) + wb * normals.getX(b) + wc * normals.getX(c),
            wa * normals.getY(a) + wb * normals.getY(b) + wc * normals.getY(c),
            wa * normals.getZ(a) + wb * normals.getZ(b) + wc * normals.getZ(c),
          )
        })
        data.positions.needsUpdate = true
        data.normals.needsUpdate = true
      }
    },
    dispose() {
      object.removeFromParent()
      for (const child of object.children) {
        const mesh = child as Mesh<InstancedBufferGeometry, MeshStandardMaterial>
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    },
  }
}
