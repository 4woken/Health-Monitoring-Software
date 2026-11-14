import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import { neutralRig, type Rig } from './retarget'

export function vrmStage(canvas: HTMLCanvasElement, onReady: () => void, onError: (message: string) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 30)
  const key = new THREE.DirectionalLight(0xffede2, 2.15)
  key.position.set(-1, 2, 3)
  scene.add(key, new THREE.HemisphereLight(0xe3f1ff, 0x8194a7, 1.45))
  const observer = new ResizeObserver(resize)
  function resize() {
    const { width, height } = canvas.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  resize()
  observer.observe(canvas)
  let model: VRM | undefined
  let disposed = false
  let pose = neutralRig()
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const abort = new AbortController()
  const load = async () => {
    const response = await fetch('/avatar-lab/sample.vrm', { signal: abort.signal })
    if (!response.ok) throw new Error('The sample VRM could not be loaded.')
    const gltf = await loader.parseAsync(await response.arrayBuffer(), '')
    const candidate = gltf.userData.vrm as VRM | undefined
    if (!candidate || disposed) {
      VRMUtils.deepDispose(gltf.scene)
      if (!disposed) throw new Error('The sample contains no humanoid VRM.')
      return
    }
    model = candidate
    VRMUtils.rotateVRM0(model)
    model.scene.traverse((obj) => {
      obj.frustumCulled = false
    })
    // Relax the arms from the authored T-pose for a shoulder-up portrait.
    const leftArm = model.humanoid.getNormalizedBoneNode('leftUpperArm')
    const rightArm = model.humanoid.getNormalizedBoneNode('rightUpperArm')
    if (leftArm) leftArm.rotation.z = -1.15
    if (rightArm) rightArm.rotation.z = 1.15
    scene.add(model.scene)
    const mid = model.humanoid.getNormalizedBoneNode('head')!.getWorldPosition(new THREE.Vector3())
    // Frame the face and shoulders independently of the avatar's origin.
    camera.position.set(mid.x, mid.y + 0.025, mid.z + 0.97)
    camera.lookAt(mid.x, mid.y + 0.015, mid.z)
    onReady()
  }
  void load().catch((cause: unknown) => {
    if (!disposed) onError(cause instanceof Error ? cause.message : 'Could not read the sample avatar.')
  })
  let raf = 0
  let last = performance.now()
  const draw = (time: number) => {
    const dt = Math.min(0.1, (time - last) / 1000)
    last = time
    if (model) {
      const alpha = 1 - Math.exp(-16 * dt)
      model.humanoid.getNormalizedBoneNode('head')!.quaternion.slerp(pose.head, alpha)
      const manager = model.expressionManager
      if (manager) {
        for (const [name, value] of Object.entries(pose.expressions)) {
          const current = manager.getValue(name)
          if (current !== null) manager.setValue(name, THREE.MathUtils.lerp(current, value, alpha))
        }
      }
      model.update(dt)
    }
    renderer.render(scene, camera)
    raf = requestAnimationFrame(draw)
  }
  raf = requestAnimationFrame(draw)
  return {
    setPose(next: Rig) {
      pose = next
    },
    dispose() {
      disposed = true
      abort.abort()
      cancelAnimationFrame(raf)
      observer.disconnect()
      if (model) VRMUtils.deepDispose(model.scene)
      renderer.dispose()
    },
  }
}
