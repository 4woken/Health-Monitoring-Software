import { BufferAttribute, BufferGeometry, Mesh, type WebGLProgramParametersWithUniforms } from 'three'
import { fitSurface } from '../../crew/torsoFit'
import type { Build } from '../anatomy/bodyShape'
import { createSurfaceModel, type ModelStatus } from './surfaceModel'

const natural: (y: number) => number = () => 1

/** Accessories share the skin's rest coordinates, torso fit and exercise motion. */
export function createFittedModel(
  kind: 'hair' | 'crew-wear',
  patch: (shader: WebGLProgramParametersWithUniforms) => void,
  onStatus?: (status: ModelStatus) => void,
) {
  const rest = new WeakMap<BufferGeometry, BufferGeometry>()
  let factor = natural

  function fit() {
    model.root.traverse((part) => {
      if (!(part instanceof Mesh)) return
      const geometry: BufferGeometry = part.geometry
      let source = rest.get(geometry)
      if (!source) {
        if (factor === natural) return
        source = new BufferGeometry()
        for (const name of ['position', 'normal'])
          source.setAttribute(name, geometry.getAttribute(name).clone())
        rest.set(geometry, source)
      }
      fitSurface(source, geometry, factor)
    })
  }

  const model = createSurfaceModel<Build>(
    kind === 'hair' ? 'Hairstyle' : 'Crew wear',
    (build) => '/human/' + kind + '/' + build + '.glb',
    (status) => {
      if (status === 'ready') fit()
      onStatus?.(status)
    },
    (scene) => {
      scene.traverse((part) => {
        if (!(part instanceof Mesh)) return
        // Clothing carries authored shoulder and elbow weights. Long hair beside
        // the upper arms stays attached to the head throughout a rowing stroke.
        const weights = part.geometry.getAttribute('_exercisearms')
        const count = part.geometry.getAttribute('position').count
        part.geometry.setAttribute(
          'exerciseArms',
          weights ?? new BufferAttribute(new Uint8Array(count * 2), 2),
        )
        if (kind === 'crew-wear') part.userData.organ = 'skin'
        part.renderOrder = 3
        for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
          material.alphaToCoverage = material.alphaTest > 0
          material.onBeforeCompile = patch
          const trainers = kind === 'crew-wear' && part.name === 'trainers'
          if (kind === 'hair') material.defines = { ...material.defines, ROW_HAIR: 1 }
          if (trainers) material.defines = { ...material.defines, ROW_TRAINERS: 1 }
          material.customProgramCacheKey = () => (trainers ? 'pulsar-row-trainers' : 'pulsar-fitted-' + kind)
        }
      })
    },
  )

  return {
    ...model,
    setFit(next = natural) {
      if (next === factor) return
      factor = next
      fit()
    },
  }
}
