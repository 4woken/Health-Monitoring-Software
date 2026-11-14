import { readFileSync } from 'node:fs'
import { BufferAttribute, BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import type { Build } from '../body/anatomy/bodyShape'
import type { Body } from '../body/anatomy/loadAnatomy'
import { mannequinScale } from './bodyDimensions'
import { fitTorso, TORSO_PLANES } from './torsoFit'

const data = readFileSync('public/anatomy/anatomy.bin')
const { bodies } = JSON.parse(readFileSync('public/anatomy/anatomy.json', 'utf8'))
type Metadata = { pos: number; verts: number; idx: number; tris: number; nrm?: number }
function loadGeometry(meta: Metadata) {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(data.buffer, data.byteOffset + meta.pos, meta.verts * 3)
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(
    new BufferAttribute(new Uint32Array(data.buffer, data.byteOffset + meta.idx, meta.tris * 3), 1),
  )
  if (meta.nrm !== undefined)
    geometry.setAttribute(
      'normal',
      new BufferAttribute(new Float32Array(data.buffer, data.byteOffset + meta.nrm, meta.verts * 3), 3),
    )
  else geometry.computeVertexNormals()
  return geometry
}

type Point = [number, number]
function turn(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/** Independently intersect each triangle with the horizontal tape plane, then
 * wrap its central cross section with a taut tape. Arms are disjoint at both
 * levels. The cutoff is tested against both source atlases at these levels. */
function tapeLength(geometry: BufferGeometry, y: number, armCutoff: number) {
  const p = geometry.getAttribute('position'),
    triangles = geometry.index!
  const section: Point[] = []
  for (let i = 0; i < triangles.count; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = triangles.getX(i + e),
        b = triangles.getX(i + ((e + 1) % 3))
      const ay = p.getY(a),
        by = p.getY(b)
      if (ay > y === by > y) continue
      const t = (y - ay) / (by - ay),
        x = p.getX(a) + t * (p.getX(b) - p.getX(a))
      if (Math.abs(x) < armCutoff) section.push([x, p.getZ(a) + t * (p.getZ(b) - p.getZ(a))])
    }
  }
  section.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  function half(points: Point[]) {
    const edge: Point[] = []
    for (const pt of points) {
      while (edge.length >= 2 && turn(edge[edge.length - 2], edge[edge.length - 1], pt) <= 0) edge.pop()
      edge.push(pt)
    }
    return edge.slice(0, -1)
  }
  const hull = [...half(section), ...half(section.reverse())]
  return (
    100 *
    hull.reduce((sum, p, i) => {
      const next = hull[(i + 1) % hull.length]
      return sum + Math.hypot(p[0] - next[0], p[1] - next[1])
    }, 0)
  )
}

describe.each(['male', 'female'] as Build[])('torso fitting on the %s atlas', (build) => {
  it('reaches both requested tape lengths on actual triangle sections, with height and weight applied', () => {
    const atlas = bodies[build],
      skin = loadGeometry(atlas.skin)
    const sourceHeart = atlas.organs.find((o: { name: string }) => o.name === 'heart')
    const heart = { name: 'heart', center: sourceHeart.center, geometry: loadGeometry(sourceHeart) }
    const source: Body = {
      build,
      height: atlas.height,
      attribution: '',
      skin,
      organs: [heart],
      anchors: { heart: sourceHeart.center, head: [0, atlas.height * 0.95, 0.055] },
    }
    const entered = { heightCm: 182, weightKg: 83, chestCm: 108, waistCm: 85 }
    const { horizontal } = mannequinScale(build, atlas.height, entered)
    const output = fitTorso(source, horizontal, entered)
    const spec = TORSO_PLANES[build]
    for (const level of ['chest', 'waist'] as const) {
      const field = level === 'chest' ? 'chestCm' : 'waistCm'
      const y = atlas.height * spec[level]
      const cutoff = build === 'male' ? (level === 'chest' ? 0.158 : 0.16) : level === 'chest' ? 0.1655 : 0.17
      expect(tapeLength(skin, y, cutoff)).toBeCloseTo(spec[field], 1)
      const actual = horizontal * tapeLength(output.body.skin, y, cutoff * output.factor(y))
      expect(Math.abs(actual - entered[field])).toBeLessThan(0.25)
    }
    expect(output.body.skin).not.toBe(skin)
    expect(output.body.organs[0].geometry).not.toBe(heart.geometry)
    expect(output.body.organs[0].center).toEqual(output.body.anchors.heart)
    expect(output.body.anchors.head).toEqual(source.anchors.head)
    output.dispose()
    skin.dispose()
    heart.geometry.dispose()
  })
})
