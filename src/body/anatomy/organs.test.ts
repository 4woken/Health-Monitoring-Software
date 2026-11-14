import { expect, it } from 'vitest'
import anatomy from '../../../public/anatomy/anatomy.json'
import { anatomyChoices, matchesAnatomySelection, depthOpacity, organNote } from './organs'

const layers = ['skin', 'vessels', 'organs', 'skeleton'] as const

it('keeps internal context faint and the active anatomy opaque', () => {
  expect(layers.map((layer) => depthOpacity(layer, 0))).toEqual([1, 0, 0, 0])
  for (let stop = 1; stop <= 3; stop++) {
    for (const layer of layers) {
      const opacity = depthOpacity(layer, stop)
      if (layer === layers[stop]) expect(opacity).toBe(1)
      else {
        expect(opacity).toBeGreaterThan(0)
        expect(opacity).toBeLessThan(0.2)
      }
    }
    expect(depthOpacity(layers[stop], stop - 0.25)).toBeGreaterThan(
      depthOpacity(layers[stop - 1], stop - 0.25),
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

it('offers paired and individual lungs and lists only structures supplied by the active body', () => {
  const names = ['heart', 'right lung', 'left lung', 'veins', 'leg veins', 'rib cage']
  expect(anatomyChoices(names, 'organs')).toEqual(['heart', 'left lung', 'lungs', 'right lung'])
  expect(names.filter((name) => matchesAnatomySelection(name, 'lungs'))).toEqual(['right lung', 'left lung'])
  expect(anatomyChoices(['lungs', 'skull'], 'organs')).toEqual(['lungs'])
  expect(anatomyChoices(names, 'vessels')).toEqual(['leg veins', 'veins'])
  expect(anatomyChoices(names, 'skeleton')).toEqual(['rib cage'])
  expect(
    ['veins', 'leg veins', 'left internal jugular vein', 'aorta'].filter((n) =>
      matchesAnatomySelection(n, 'veins'),
    ),
  ).toEqual(['veins', 'leg veins', 'left internal jugular vein'])
  expect(matchesAnatomySelection('aorta', 'arteries')).toBe(true)
})
