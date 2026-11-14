import { expect, it } from 'vitest'
import { orientTriangles } from './orientTriangles'

it('corrects reversed faces against outward normals without mutating the source', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
  const source = new Uint32Array([0, 2, 1])
  expect([...orientTriangles(positions, normals, source)]).toEqual([0, 1, 2])
  expect([...source]).toEqual([0, 2, 1])
})

it('preserves already oriented faces', () => {
  expect([
    ...orientTriangles(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      new Uint32Array([0, 1, 2]),
    ),
  ]).toEqual([0, 1, 2])
})
