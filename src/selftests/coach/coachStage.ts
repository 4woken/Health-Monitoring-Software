import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm'
import type { Move } from '../catalog'
import { poseAt, type Pose } from './coachPose'

const sides = ['left', 'right'] as const

/** Keep the furniture in the figure's frame. Its fitted chair stays put from sitting through standing. */
function makeChair(height: number, width: number, depth: number) {
  const chair = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: 0x607078, roughness: 0.9 })
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    piece.position.set(x, y, z)
    chair.add(piece)
  }
  const rail = 0.065 * width
  bar(width, rail, depth, 0, height - rail / 2, 0)
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      bar(rail, height, rail, x * (width / 2 - rail), height / 2, z * (depth / 2 - rail))
  for (const x of [-1, 1])
    bar(rail, height * 0.8, rail, x * (width / 2 - rail), 1.4 * height, rail - depth / 2)
  bar(width, height * 0.27, rail, 0, height * 1.68, rail - depth / 2)
  return chair
}

export function coachStage(
  canvas: HTMLCanvasElement,
  onReady: () => void,
  onError: (message: string) => void,
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 12)
  const key = new THREE.DirectionalLight(0xffede2, 2.2)
  key.position.set(-1.5, 3, 3)
  scene.add(key, new THREE.HemisphereLight(0xe3f1ff, 0x5c6b7a, 1.5))
  const props = new THREE.Group()
  scene.add(props)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.84, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 }),
  )
  floor.rotation.x = -Math.PI / 2
  props.add(floor)

  let model: VRM | undefined
  let chair: THREE.Group | undefined
  let wall: THREE.Mesh | undefined
  let height = 1.7
  let move: Move = 'together'
  let closed = false
  let disposed = false
  let started = performance.now()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const restHips = new THREE.Vector3()
  const restFeet = [new THREE.Vector3(), new THREE.Vector3()]
  const forefoot = new THREE.Vector3()
  const point = new THREE.Vector3()
  const left = new THREE.Vector3()
  const right = new THREE.Vector3()
  const target = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const bone = (n: VRMHumanBoneName) => model!.humanoid.getNormalizedBoneNode(n)!
  const joint = (name: VRMHumanBoneName) => bone(name).getWorldPosition(point)

  function resize() {
    const { width, height: pixels } = canvas.getBoundingClientRect()
    if (!width || !pixels) return
    renderer.setSize(width, pixels, false)
    const aspect = width / pixels
    const half = Math.max(height * 0.6, (height * 0.32) / aspect)
    camera.left = -half * aspect
    camera.right = half * aspect
    camera.top = half
    camera.bottom = -half
    camera.updateProjectionMatrix()
    const side =
      move === 'together' || move === 'nod' || move === 'leftLeg' || move === 'rightLeg' ? 0.16 : 1.6
    const centerZ = move === 'sitToStand' ? -0.12 : 0
    camera.position.set(-side * height, height * 0.73, height + centerZ)
    camera.lookAt(0, height * 0.51, centerZ)
  }
  const observer = new ResizeObserver(resize)
  resize()
  observer.observe(canvas)

  // Aim the upper arm and forearm independently in torso coordinates. Rotating a T-pose
  // arm around its own long axis alone cannot raise it in front of the body.
  const arm = (side: (typeof sides)[number], p: Pose) => {
    const sign = side === 'left' ? 1 : -1
    const upper = bone(`${side}UpperArm`)
    const lower = bone(`${side}LowerArm`)
    const hand = bone(`${side}Hand`)
    if (p.arms === 'crossed') {
      left.set(sign * 0.1, -0.77, 0.62)
      right.set(-sign * 0.93, side === 'left' ? 0.55 : 0.32, 0)
    } else if (p.arms === 'hips') {
      left.set(sign * 0.65, -0.81, -0.12)
      right.set(-sign * 0.57, -0.65, 0.26)
    } else if (p.arms === 'support' && side === 'left') {
      left.set(0.67, -0.62, 0.38)
      right.set(0.48, 0.1, 0.82)
    } else {
      const reach = p.arms === 'forward' ? p.reach : 0
      left.set(sign * 0.16, -1 + reach * 0.86, reach)
      right.set(sign * 0.06, -1 + reach * 1.08, 0.14 + reach)
    }
    upper.quaternion.setFromUnitVectors(target.copy(lower.position).normalize(), left.normalize())
    rotation.copy(upper.quaternion).invert()
    lower.quaternion.setFromUnitVectors(
      target.copy(hand.position).normalize(),
      right.normalize().applyQuaternion(rotation),
    )
    hand.quaternion.identity()
    if (p.arms === 'support' && side === 'left') {
      // Palm against the support, with the fingers pointing up.
      rotation.copy(upper.quaternion).multiply(lower.quaternion).invert()
      hand.quaternion.setFromAxisAngle(target.set(0, 0, 1), Math.PI / 2).premultiply(rotation)
    }
  }

  function apply(p: Pose, motion: Move) {
    const hips = bone('hips')
    hips.position.copy(restHips)
    sides.forEach((side, i) => {
      const roll = (side === 'left' ? -1 : 1) * p.inward[i]
      bone(`${side}UpperLeg`).rotation.set(-p.hip[i], 0, roll, 'ZXY')
      bone(`${side}LowerLeg`).rotation.set(p.knee[i], 0, 0)
      bone(`${side}Foot`).rotation.set(p.ankle[i], 0, -roll, 'XYZ')
      arm(side, p)
    })
    bone('spine').rotation.set(p.lean * 0.6, 0, p.sway)
    bone('chest').rotation.set(p.lean * 0.4, 0, 0)
    bone('head').rotation.set(p.nod, 0, 0)

    const support = motion === 'rightLeg' ? 1 : 0
    const foot = bone(`${sides[support]}Foot`)
    const offset = target.copy(restFeet[support]).sub(foot.getWorldPosition(point))
    if (motion === 'heelRaise') {
      // Pivot the shoe around its ball, including its distance from the ankle.
      foot.getWorldQuaternion(rotation)
      offset.add(forefoot).sub(point.copy(forefoot).applyQuaternion(rotation))
    } else if (motion === 'tandem' || motion === 'together' || motion === 'nod') {
      // Both feet move inward in the balance stances. Keep depth and width symmetric.
      offset.x = 0
      offset.z = 0
    }
    hips.position.add(offset)
    model!.expressionManager?.setValue('blink', p.eyesClosed ? 1 : 0)
  }

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
    scene.add(vrm.scene)
    vrm.scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(vrm.scene, true)
    height = bounds.max.y - bounds.min.y
    floor.position.y = bounds.min.y - 0.002
    restHips.copy(bone('hips').position)
    sides.forEach((side, i) => restFeet[i].copy(joint(`${side}Foot`)))
    const length = restFeet[0].distanceTo(joint('leftLowerLeg'))
    forefoot.copy(joint('leftToes')).sub(restFeet[0])
    forefoot.y = bounds.min.y - restFeet[0].y
    forefoot.z += 0.12 * length

    apply(poseAt('sitToStand', 0), 'sitToStand')
    updateFigure(vrm)
    vrm.scene.updateMatrixWorld(true)
    const seated = joint('leftUpperLeg').clone()
    const thigh = seated.distanceTo(joint('leftLowerLeg'))
    // Fit the seat top to the loaded figure's shorts and the backrest behind its hips.
    let seatY = seated.y
    vrm.scene.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return
      for (let i = 0; i < o.geometry.attributes.position.count; i++) {
        o.getVertexPosition(i, point)
        o.localToWorld(point)
        if (
          Math.abs(point.x) < Math.abs(seated.x) * 1.6 &&
          Math.abs(point.z - seated.z) < thigh * 0.26 &&
          point.y > seated.y - thigh * 0.48
        )
          seatY = Math.min(seatY, point.y)
      }
    })
    chair = makeChair(seatY - floor.position.y, thigh * 1.24, thigh * 1.08)
    chair.position.set(0, floor.position.y, seated.z - thigh * 0.03)
    props.add(chair)
    apply(poseAt('heelRaise', 0), 'heelRaise')
    const hand = joint('leftHand').clone()
    wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, hand.y + 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x607078, transparent: true, opacity: 0.55 }),
    )
    wall.position.set(hand.x + 0.026, (hand.y + 0.16) / 2, hand.z + 0.025)
    props.add(wall)
    started = performance.now()
    resize()
    onReady()
  })().catch((cause: unknown) => {
    if (!disposed) onError(cause instanceof Error ? cause.message : 'The 3D figure could not be loaded.')
  })

  // Secondary hair springs keep their authored rest shape while switching between demonstration poses.
  function updateFigure(vrm: VRM) {
    vrm.humanoid.update()
    vrm.nodeConstraintManager?.update()
    vrm.expressionManager?.update()
  }

  let raf = 0
  const draw = (time: number) => {
    if (model && chair && wall) {
      const t = reduced.matches ? 0.75 : Math.max(0, time - started) / 1000
      chair.visible = move === 'sitToStand'
      wall.visible = move === 'heelRaise'
      apply(poseAt(move, t, closed), move)
      updateFigure(model)
    }
    renderer.render(scene, camera)
    raf = requestAnimationFrame(draw)
  }
  raf = requestAnimationFrame(draw)
  return {
    play(next: Move, eyesClosed = false) {
      if (next !== move || eyesClosed !== closed) started = performance.now()
      move = next
      closed = eyesClosed
      resize()
    },
    dispose() {
      disposed = true
      abort.abort()
      cancelAnimationFrame(raf)
      observer.disconnect()
      if (model) VRMUtils.deepDispose(model.scene)
      VRMUtils.deepDispose(props)
      renderer.dispose()
      if (!canvas.isConnected) renderer.forceContextLoss()
    },
  }
}
