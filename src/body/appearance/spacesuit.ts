import { Group, Mesh, Texture, type Object3D } from 'three'

export type SuitStatus = 'idle' | 'loading' | 'ready' | 'failed'
export const SUITS = {
  EVA: { title: 'Spacewalk suit (EVA)', model: '/human/spacesuit-emu.glb', name: 'NASA EMU' },
  IVA: { title: 'Flight suit (IVA)', model: '/human/spacesuit-aces.glb', name: 'NASA ACES' },
} as const
export type SuitKind = keyof typeof SUITS

function releaseSuit(root: Object3D) {
  const textures = new Set<Texture>()
  root.traverse((part) => {
    if (!(part instanceof Mesh)) return
    part.geometry.dispose()
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value)
      material.dispose()
    }
  })
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close()
    texture.dispose()
  }
  root.removeFromParent()
}

/** Both GLBs are one unit tall, centred above their soles in the same axes as the reference body. */
export function createSpacesuit(onStatus: (status: SuitStatus) => void) {
  const root = new Group()
  root.name = 'Spacesuit'
  root.visible = false
  let wanted: SuitKind | null = null
  const models = new Map<SuitKind, Object3D>()
  let loading: AbortController | undefined

  async function load(kind: SuitKind) {
    const controller = new AbortController()
    loading = controller
    onStatus('loading')
    try {
      const [{ GLTFLoader }, response] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        fetch(SUITS[kind].model, { signal: controller.signal }),
      ])
      if (!response.ok) throw new Error('Spacesuit unavailable')
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '')
      if (controller.signal.aborted) {
        releaseSuit(gltf.scene)
        return
      }
      models.set(kind, gltf.scene)
      root.add(gltf.scene)
      root.visible = true
      onStatus('ready')
    } catch {
      if (!controller.signal.aborted) onStatus('failed')
    } finally {
      if (loading === controller) loading = undefined
    }
  }

  return {
    root,
    show(next: SuitKind | null) {
      if (next === wanted) return
      loading?.abort()
      root.clear()
      wanted = next
      const cached = next && models.get(next)
      root.visible = !!cached
      if (!next) onStatus('idle')
      else if (cached) {
        root.add(cached)
        onStatus('ready')
      } else void load(next)
    },
    retry() {
      if (wanted && !loading && !models.has(wanted)) void load(wanted)
    },
    dispose() {
      loading?.abort()
      for (const model of models.values()) releaseSuit(model)
      models.clear()
      root.removeFromParent()
    },
  }
}
