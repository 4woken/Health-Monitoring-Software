import { expect, it } from 'vitest'
import anatomy from '../../../public/anatomy/anatomy.json'
import { depthOpacity, organNote } from './organs'

const layers = ['skin', 'vessels', 'organs', 'skeleton'] as const

it('shows only the selected layer at every stop', () => {
  layers.forEach((active, depth) => {
    for (const layer of layers) expect(depthOpacity(layer, depth)).toBe(Number(layer === active))
  })
})

it('crossfades only neighbouring layers when dragging', () => {
  for (let stop = 0; stop < 3; stop++) {
    expect(layers.map((layer) => depthOpacity(layer, stop + 0.25))).toEqual(
      layers.map((_, i) => (i === stop ? 0.75 : i === stop + 1 ? 0.25 : 0)),
    )
  }
})

it.each(['male', 'female'] as const)(
  'classifies the heart, aorta, spine and cord in the %s atlas',
  (build) => {
    const organs = anatomy.bodies[build].organs
    for (const [name, layer] of [
      ['heart', 'organs'],
      ['aorta', 'vessels'],
      ['vertebral column', 'skeleton'],
      ['spinal cord', 'organs'],
    ]) {
      expect(organs.find((o) => o.name === name)?.tris).toBeGreaterThan(0)
      expect(organNote(name).layer).toBe(layer)
    }
  },
)
