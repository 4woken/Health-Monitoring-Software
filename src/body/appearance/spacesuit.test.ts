import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import { createSpacesuit, SUITS } from './spacesuit'
import { DEPTH_STOPS, FIRST_DEPTH } from '../anatomy/organs'

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }))
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parseAsync = parse
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  parse.mockReset()
})

it('keeps skin at zero with three independently selectable exterior stops', () => {
  expect(DEPTH_STOPS).toEqual(['EVA', 'IVA', 'Crew wear', 'Skin', 'Vessels', 'Organs', 'Skeleton'])
  expect(DEPTH_STOPS[-FIRST_DEPTH]).toBe('Skin')
})

it('discards a late EVA parse after switching to IVA, reuses the chosen suit and frees resources', async () => {
  const fetch = vi.fn(async () => new Response(new Uint8Array(4)))
  vi.stubGlobal('fetch', fetch)
  const onStatus = vi.fn()
  const suit = createSpacesuit(onStatus)
  const eva = new Group().add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
  const iva = new Group().add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
  const evaDisposed = vi.spyOn((eva.children[0] as Mesh).geometry, 'dispose')
  const ivaDisposed = vi.spyOn((iva.children[0] as Mesh).geometry, 'dispose')
  let finishEva!: (result: { scene: Group }) => void
  parse.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishEva = resolve
      }),
  )
  parse.mockResolvedValueOnce({ scene: iva })
  expect(fetch).not.toHaveBeenCalled()
  suit.show('EVA')
  await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1))
  suit.show('IVA')
  await vi.waitFor(() => expect(suit.root.children).toEqual([iva]))
  finishEva({ scene: eva })
  await vi.waitFor(() => expect(evaDisposed).toHaveBeenCalledOnce())
  expect(suit.root.children).toEqual([iva])
  suit.show(null)
  expect(suit.root.visible).toBe(false)
  suit.show('IVA')
  expect(suit.root.children).toEqual([iva])
  expect(fetch.mock.calls.map((call: unknown[]) => call[0])).toEqual([SUITS.EVA.model, SUITS.IVA.model])
  suit.dispose()
  expect(ivaDisposed).toHaveBeenCalledOnce()
})
