import { readFileSync } from 'node:fs'
import {
  Box3,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { torsoShape } from '../../crew/torsoFit'
import { createExercisePose } from '../../exercises/exercisePose'
import { createFittedModel } from './fittedModel'

const fetchBlob = globalThis.fetch
const asset = (path: string) => new Response(Uint8Array.from(readFileSync('public' + path)))

async function checkTexture(material: MeshStandardMaterial) {
  const image = material.map!.image as Blob
  expect(image.type).toBe('image/webp')
  expect(await image.slice(8, 12).text()).toBe('WEBP')
}

beforeEach(() => {
  // Use the real GLTFLoader and embedded texture. Only the browser image decoder
  // is absent in Node, so keep the original image bytes on the Three texture.
  vi.stubGlobal('self', { URL })
  vi.stubGlobal('createImageBitmap', async (image: Blob) => image)
  vi.stubGlobal('fetch', async (path: string) => {
    if (path.startsWith('blob:')) return fetchBlob(path)
    if (!/^\/human\/(hair|crew-wear)\/(male|female)\.glb$/.test(path)) throw Error(path)
    return asset(path)
  })
})

afterEach(() => vi.unstubAllGlobals())

it.each(['male', 'female'] as const)(
  'fits the offline %s haircut around the skull and leaves the eyes clear',
  async (build) => {
    const { height, eyes } = JSON.parse(readFileSync('public/human/' + build + '.json', 'utf8'))
    const hair = createFittedModel('hair', () => {})
    hair.show(build)
    await vi.waitFor(() => expect(hair.root.visible).toBe(true))
    const bounds = new Box3().setFromObject(hair.root, true)
    expect(Math.abs(bounds.max.y - height)).toBeLessThan(0.035)
    expect(bounds.min.x).toBeLessThan(eyes[0].center[0])
    expect(bounds.max.x).toBeGreaterThan(eyes[1].center[0])
    if (build === 'male') expect(bounds.min.y).toBeGreaterThan(height * 0.85)
    else expect(bounds.min.y).toBeLessThan(height * 0.75)
    for (const eye of eyes) {
      const eyeCentre = new Vector3().fromArray(eye.center)
      const camera = eyeCentre.clone().add(new Vector3(0, 0, 1))
      const ray = new Raycaster(camera, new Vector3(0, 0, -1), 0, 1 - eye.radius)
      expect(ray.intersectObject(hair.root)).toHaveLength(0)
    }
    const cards = hair.root.getObjectByProperty('isMesh', true) as Mesh
    expect(cards.geometry.getAttribute('uv').count).toBe(cards.geometry.getAttribute('position').count)
    const material = cards.material as MeshStandardMaterial
    expect(material.side).toBe(DoubleSide)
    expect(material.alphaTest).toBeGreaterThan(0)
    expect(material.alphaToCoverage).toBe(true)
    await checkTexture(material)
    hair.dispose()
  },
)

it('fits long hair to the chest from rest, including when dimensions arrive before the mesh', async () => {
  const { height } = JSON.parse(readFileSync('public/human/female.json', 'utf8'))
  const { torsoCalibration } = JSON.parse(readFileSync('public/human/female-organs.json', 'utf8'))
  const factor = torsoShape(
    'female',
    height,
    1,
    { heightCm: 165, weightKg: 60, chestCm: 120 },
    torsoCalibration,
  )
  const hair = createFittedModel('hair', () => {})
  hair.setFit(factor)
  hair.show('female')
  await vi.waitFor(() => expect(hair.root.visible).toBe(true))
  const cards = hair.root.getObjectByProperty('isMesh', true) as Mesh
  const positions = cards.geometry.getAttribute('position')
  const fitted = positions.clone()
  hair.setFit()
  let chestVertices = 0
  let fixedRoots = 0
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i)
    const k = factor(y)
    if (k > 1.02 && Math.abs(positions.getX(i)) > 0.01) chestVertices++
    if (y > height * 0.95) fixedRoots++
    expect(fitted.getX(i)).toBeCloseTo(positions.getX(i) * k, 5)
    expect(fitted.getY(i)).toBe(y)
    expect(fitted.getZ(i)).toBeCloseTo(positions.getZ(i) * k, 5)
  }
  expect(chestVertices).toBeGreaterThan(0)
  expect(fixedRoots).toBeGreaterThan(0)
  hair.setFit(factor)
  expect(positions.array).toEqual(fitted.array)
  hair.dispose()
})

it.each(['male', 'female'] as const)(
  'loads the %s crew wear with weighted sleeves and covered skin',
  async (build) => {
    const prefix = 'public/human/' + build
    const { skin, height } = JSON.parse(readFileSync(prefix + '.json', 'utf8'))
    const body = Uint8Array.from(readFileSync(prefix + '.bin')).buffer
    const positions = new Float32Array(body, skin.pos, skin.verts * 3)
    const pose = createExercisePose()
    pose.setBody(height, build)
    pose.update('row', 0.8, false)
    const outfit = createFittedModel('crew-wear', (shader) => pose.patch(shader, true))
    outfit.show(build)
    await vi.waitFor(() => expect(outfit.root.visible).toBe(true))
    const scene = outfit.root.children[0]
    const covered = new Uint8Array(skin.verts)
    const ranges: [number, number][] = scene.userData.coveredSkinVertices
    for (const [start, end] of ranges) {
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeGreaterThanOrEqual(start)
      expect(end).toBeLessThan(skin.verts)
      covered.fill(1, start, end + 1)
    }
    // Test the mapping against the shipped skin including its UV seam duplicates.
    // The T-shirt, trousers and shoes cover the chest, shins and feet, leaving
    // the head and hands exposed.
    let coveredSamples = 0
    let exposedSamples = 0
    let mismatches = 0
    for (let i = 0; i < skin.verts; i++) {
      const x = Math.abs(positions[i * 3])
      const h = positions[i * 3 + 1] / height
      if ((h > 0.68 && h < 0.75 && x < 0.11) || (h > 0.24 && h < 0.4 && x < 0.13) || h < 0.04) {
        coveredSamples++
        if (!covered[i]) mismatches++
      }
      if (h > 0.9 || (h > 0.4 && h < 0.5 && x > 0.21)) {
        exposedSamples++
        if (covered[i]) mismatches++
      }
    }
    expect(Math.min(coveredSamples, exposedSamples)).toBeGreaterThan(0)
    expect(mismatches).toBe(0)

    const meshes: Mesh[] = []
    scene.traverse((part) => {
      if (part instanceof Mesh) meshes.push(part)
    })
    const sleeves = new Set<number>()
    let movingElbows = false
    for (const mesh of meshes) {
      expect(mesh.userData.organ).toBe('skin')
      const geometry = mesh.geometry
      const weights = geometry.getAttribute('exerciseArms')
      expect(weights).toBe(geometry.getAttribute('_exercisearms'))
      const p = geometry.getAttribute('position')
      expect(weights.count).toBe(p.count)
      expect(weights.itemSize).toBe(2)
      const material = mesh.material as MeshStandardMaterial
      await checkTexture(material)
      const shader = {
        uniforms: {},
        vertexShader: '#include <project_vertex>',
      } as WebGLProgramParametersWithUniforms
      material.onBeforeCompile(shader, {} as WebGLRenderer)
      expect(shader.vertexShader).toContain('transformed.yz = exercisePosition')
      expect(shader.uniforms.uExerciseActive.value).toBe(true)
      const arms = shader.uniforms.uExerciseArms.value
      let valid = true
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i)
        const shoulder = weights.getX(i),
          elbow = weights.getY(i)
        const side = arms[x < 0 ? 0 : 1]
        if (!Number.isFinite(x + y + z + shoulder * side.x + elbow * side.y)) valid = false
        if (Math.min(shoulder, elbow) < 0 || Math.max(shoulder, elbow) > 1) valid = false
        if (y < height * 0.4 && (shoulder !== 0 || elbow !== 0)) valid = false
        if (shoulder > 0.5) sleeves.add(Math.sign(x))
        if (elbow > 0.01) movingElbows = true
      }
      expect(valid).toBe(true)
    }
    expect(sleeves).toEqual(new Set([-1, 1]))
    expect(movingElbows).toBe(true)
    outfit.dispose()
  },
)

it('keeps the selected haircut when a previous profile finishes loading late', async () => {
  const serve = globalThis.fetch
  let finish!: (response: Response) => void
  vi.stubGlobal('fetch', async (path: string) => {
    if (path === '/human/hair/male.glb')
      return new Promise<Response>((resolve) => {
        finish = resolve
      })
    return serve(path)
  })
  const hair = createFittedModel('hair', () => {})
  hair.show('male')
  expect(hair.root.visible).toBe(false)
  hair.show('female')
  await vi.waitFor(() => expect(hair.root.visible).toBe(true))
  const female = hair.root.children[0]
  // Resolve the cancelled request after the female model is already on screen.
  // Its image decoding finishing proves the stale model reached GLTFLoader.
  const decode = vi.fn(async (blob: Blob) => blob)
  vi.stubGlobal('createImageBitmap', decode)
  finish(asset('/human/hair/male.glb'))
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce())
  expect(hair.root.children).toEqual([female])
  hair.show(null)
  expect(hair.root.visible).toBe(false)
  hair.show('female')
  expect(hair.root.children).toEqual([female])
  hair.dispose()
})
