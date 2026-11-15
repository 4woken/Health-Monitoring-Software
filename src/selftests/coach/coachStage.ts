// A 3D coach: the sample VRM figure of the avatar lab, whole body, playing the movement a test asks
// for. Joint angles drive the humanoid bones; the hips move so the feet stay on the floor.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm'
import type { Move } from '../catalog'

/** One instant of a movement, in radians; legs bend forward at the hip and back at the knee. */
export interface Pose {
  /** Hip flexion of each leg (thigh forward). */
  hip: [number, number]
  /** Knee flexion of each leg. */
  knee: [number, number]
  /** Ankle: positive points the toes down (a heel raise). */
  ankle: [number, number]
  /** Thigh moved toward the middle (feet together or heel to toe), each leg. */
  inward: [number, number]
  /** Trunk leaning forward. */
  lean: number
  /** Head nodding down. */
  nod: number
  /** Side sway of the trunk. */
  sway: number
  /** Extra lift of the whole body (heel raises), m. */
  lift: number
  arms: 'side' | 'crossed' | 'forward' | 'hips'
  /** How far the arms are raised forward, 0 to 1 (squats). */
  reach: number
  eyesClosed: boolean
}

const still = (): Pose => ({
  hip: [0, 0],
  knee: [0, 0],
  ankle: [0, 0],
  inward: [0, 0],
  lean: 0,
  nod: 0,
  sway: 0,
  lift: 0,
  arms: 'side',
  reach: 0,
  eyesClosed: false,
})

const wave = (t: number) => (1 - Math.cos(2 * Math.PI * t)) / 2
const ease = (x: number) => x * x * (3 - 2 * x)

/** The pose of a movement at time t (s). Index 0 is the left leg, 1 the right one. */
export function poseAt(move: Move, t: number, eyesClosed = false): Pose {
  const p = still()
  p.eyesClosed = eyesClosed
  switch (move) {
    case 'squat': {
      const s = wave(t / 3)
      p.hip = [1.45 * s, 1.45 * s]
      p.knee = [1.95 * s, 1.95 * s]
      p.ankle = [-0.45 * s, -0.45 * s]
      p.lean = 0.45 * s
      p.arms = 'forward'
      p.reach = s
      break
    }
    case 'heelRaise': {
      const s = wave(t / 2.4)
      p.ankle = [0.55 * s, 0.55 * s]
      p.lift = 0.07 * s
      p.arms = 'side'
      break
    }
    case 'sitToStand': {
      const c = (t % 3.6) / 3.6
      // Seated, up, standing, down.
      const up = c < 0.25 ? 0 : c < 0.5 ? ease((c - 0.25) / 0.25) : c < 0.75 ? 1 : 1 - ease((c - 0.75) / 0.25)
      const seat = 1 - up
      p.hip = [1.55 * seat, 1.55 * seat]
      p.knee = [1.55 * seat, 1.55 * seat]
      p.lean = 0.25 * seat + 0.5 * Math.sin(Math.PI * up)
      p.arms = 'crossed'
      break
    }
    case 'together':
    case 'nod': {
      p.inward = [0.05, 0.05]
      p.sway = 0.02 * Math.sin(t * 1.3)
      p.arms = 'crossed'
      if (move === 'nod') {
        p.nod = 0.35 * Math.sin(2 * Math.PI * t * 0.5)
        p.eyesClosed = true
      }
      break
    }
    case 'tandem': {
      p.hip = [0.14, -0.14]
      p.inward = [0.07, 0.07]
      p.sway = 0.025 * Math.sin(t * 1.5)
      p.arms = 'crossed'
      break
    }
    case 'oneLeg': {
      p.hip = [0, 0.75]
      p.knee = [0, 1.35]
      p.sway = 0.03 * Math.sin(t * 1.7)
      p.arms = 'hips'
      break
    }
  }
  return p
}

type Bones = Partial<Record<VRMHumanBoneName, THREE.Object3D | null>>

export function coachStage(
  canvas: HTMLCanvasElement,
  onReady: () => void,
  onError: (message: string) => void,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 30)
  const key = new THREE.DirectionalLight(0xffede2, 2.2)
  key.position.set(-1.5, 3, 3)
  scene.add(key, new THREE.HemisphereLight(0xe3f1ff, 0x5c6b7a, 1.5))
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  const chair = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x6c7480, roughness: 0.8 })
  chair.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.42), wood))
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.04), wood)
  back.position.set(0, 0.27, -0.2)
  chair.add(back)
  chair.visible = false
  scene.add(chair)

  let model: VRM | undefined
  let bones: Bones = {}
  let rest = { hipsY: 0.9, thigh: 0.42, shin: 0.42 }
  let move: Move = 'together'
  let closed = false
  let disposed = false
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

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

  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const abort = new AbortController()
  void (async () => {
    const response = await fetch('/avatar-lab/sample.vrm', { signal: abort.signal })
    if (!response.ok) throw new Error('The 3D figure could not be loaded.')
    const gltf = await loader.parseAsync(await response.arrayBuffer(), '')
    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm || disposed) {
      VRMUtils.deepDispose(gltf.scene)
      if (!disposed) throw new Error('No humanoid figure in the file.')
      return
    }
    model = vrm
    VRMUtils.rotateVRM0(vrm)
    vrm.scene.traverse((o) => {
      o.frustumCulled = false
    })
    const names: VRMHumanBoneName[] = [
      'hips',
      'spine',
      'chest',
      'head',
      'leftUpperLeg',
      'leftLowerLeg',
      'leftFoot',
      'rightUpperLeg',
      'rightLowerLeg',
      'rightFoot',
      'leftUpperArm',
      'leftLowerArm',
      'rightUpperArm',
      'rightLowerArm',
    ]
    bones = Object.fromEntries(names.map((n) => [n, vrm.humanoid.getNormalizedBoneNode(n)]))
    scene.add(vrm.scene)
    vrm.scene.updateMatrixWorld(true)
    const at = (n: VRMHumanBoneName) => bones[n]?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3()
    const hips = at('hips')
    rest = {
      hipsY: bones.hips?.position.y ?? hips.y,
      thigh: at('leftUpperLeg').distanceTo(at('leftLowerLeg')),
      shin: at('leftLowerLeg').distanceTo(at('leftFoot')),
    }
    const head = at('head')
    // A three-quarter view, so bending forward at the hips and knees reads clearly.
    vrm.scene.rotation.y = -0.65
    const mid = (head.y + 0.1) / 2
    camera.position.set(0, mid + 0.05, (head.y + 0.25) / (2 * Math.tan((26 * Math.PI) / 360)) + 0.2)
    camera.lookAt(0, mid, 0)
    chair.position.set(0, at('leftLowerLeg').y - 0.02, 0)
    onReady()
  })().catch((cause: unknown) => {
    if (!disposed) onError(cause instanceof Error ? cause.message : 'The 3D figure could not be loaded.')
  })

  function apply(p: Pose) {
    if (!model) return
    const b = bones
    const set = (n: VRMHumanBoneName, x: number, y: number, z: number) => b[n]?.rotation.set(x, y, z)
    // Legs: hip flexion moves the thigh forward (negative x); the knee bends back (positive x).
    set('leftUpperLeg', -p.hip[0], 0, -p.inward[0])
    set('rightUpperLeg', -p.hip[1], 0, p.inward[1])
    set('leftLowerLeg', p.knee[0], 0, 0)
    set('rightLowerLeg', p.knee[1], 0, 0)
    set('leftFoot', p.ankle[0], 0, 0)
    set('rightFoot', p.ankle[1], 0, 0)
    set('spine', p.lean * 0.6, 0, p.sway)
    set('chest', p.lean * 0.4, 0, 0)
    set('head', p.nod, 0, 0)
    // Arms: down at the sides, crossed on the chest, forward, or hands on the hips.
    const arm = (side: 'left' | 'right', s: number) => {
      const upper: VRMHumanBoneName = side === 'left' ? 'leftUpperArm' : 'rightUpperArm'
      const lower: VRMHumanBoneName = side === 'left' ? 'leftLowerArm' : 'rightLowerArm'
      // A negative turn about y folds the left arm forward, towards the chest; the right arm mirrors it.
      if (p.arms === 'crossed') {
        set(upper, -0.15, s * -0.35, s * -1.45)
        set(lower, 0, s * -1.75, 0)
      } else if (p.arms === 'forward') {
        set(upper, -1.35 * p.reach, 0, s * -1.25 * (1 - p.reach * 0.9))
        set(lower, 0, 0, 0)
      } else if (p.arms === 'hips') {
        set(upper, 0, s * -0.35, s * -1.0)
        set(lower, 0, s * -1.3, 0)
      } else {
        set(upper, 0, 0, s * -1.25)
        set(lower, 0, 0, 0)
      }
    }
    arm('left', 1)
    arm('right', -1)
    // Keep the standing feet on the floor: the hips drop and move back as the legs fold.
    const legs = [0, 1].map((i) => {
      const thigh = p.hip[i]
      const shin = p.knee[i] - p.hip[i]
      return {
        height: rest.thigh * Math.cos(thigh) + rest.shin * Math.cos(shin),
        reach: rest.thigh * Math.sin(thigh) - rest.shin * Math.sin(shin),
      }
    })
    const standing = legs.reduce((a, l) => (l.height > a.height ? l : a))
    const drop = rest.thigh + rest.shin - standing.height
    if (b.hips) {
      b.hips.position.y = rest.hipsY - drop + p.lift
      b.hips.position.z = -standing.reach
    }
    const expressions = model.expressionManager
    expressions?.setValue('blink', p.eyesClosed ? 1 : 0)
  }

  let raf = 0
  let last = performance.now()
  const start = last
  const draw = (time: number) => {
    const dt = Math.min(0.1, (time - last) / 1000)
    last = time
    if (model) {
      const t = reduced ? 0.75 : (time - start) / 1000
      chair.visible = move === 'sitToStand'
      apply(poseAt(move, t, closed))
      model.update(dt)
    }
    renderer.render(scene, camera)
    raf = requestAnimationFrame(draw)
  }
  raf = requestAnimationFrame(draw)

  return {
    play(next: Move, eyesClosed = false) {
      move = next
      closed = eyesClosed
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
