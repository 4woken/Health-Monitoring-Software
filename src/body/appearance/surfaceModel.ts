import { Group, Mesh, Texture, type Object3D } from 'three'

function releaseModel(root: Object3D) {
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

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** Each viewer owns its parsed models and GPU resources. Switching choices can
 * cancel the download even if the previous GLB is still being decoded. */
export function createSurfaceModel<K extends string>(
  name: string,
  url: (kind: K) => string,
  onStatus: (status: ModelStatus) => void,
  prepare?: (scene: Object3D) => void,
) {
  const root = new Group()
  root.name = name
  root.visible = false
  let wanted: K | null = null
  const models = new Map<K, Object3D>()
  let loading: AbortController | undefined

  async function load(kind: K) {
    const controller = new AbortController()
    loading = controller
    onStatus('loading')
    try {
      const [{ GLTFLoader }, response] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        fetch(url(kind), { signal: controller.signal }),
      ])
      if (!response.ok) throw new Error(name + ' unavailable')
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '')
      if (controller.signal.aborted) {
        releaseModel(gltf.scene)
        return
      }
      prepare?.(gltf.scene)
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
    show(next: K | null) {
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
      for (const model of models.values()) releaseModel(model)
      models.clear()
      root.removeFromParent()
    },
  }
}
