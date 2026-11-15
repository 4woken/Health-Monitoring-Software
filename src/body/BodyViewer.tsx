import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import * as THREE from 'three'
import { useMannequinDimensions } from '../crew/CrewProvider'
import { hasSize, mannequinScale, type BodyDimensions } from '../crew/bodyDimensions'
import { fitTorso } from '../crew/torsoFit'
import { ORGAN_SIGNALS, loadBody, type Body } from './anatomy/loadAnatomy'
import { createExercisePose } from '../exercises/exercisePose'
import { demoVitals } from '../exercises/demoVitals'
import type { ExerciseMotion } from '../exercises/environmentExercise'
import { createBodyGroom } from './groom/bodyGroom'
import { createRestingEye } from './portrait/restingEye'
import { createPersonalFace } from './portrait/skinPortrait'
import type { Build, Vec3 } from './anatomy/bodyShape'
import type { Level } from '../health/signals'
import type { AvatarCapture, FaceCalibration } from '../camera/face/portrait'
import {
  DEPTH_STOPS,
  organNote,
  depthOpacity,
  matchesAnatomySelection,
  anatomyChoices,
  type DepthLayer,
} from './anatomy/organs'
import type { LiveFaceFrame } from '../camera/face/liveFace'
import { Segmented } from '../ui'
import { usePulse } from '../camera/pulse/pulseSession'

export interface Hotspot {
  id: string
  label: string
  pos: Vec3
  level: Level
  /** No name next to the marker, for example when a pop-up already points at it. */
  quiet?: boolean
}

/** A card drawn beside the body, with a line to the marker it is about. */
export interface Pin {
  id: string
  /** The hotspot it points at. */
  at: string
  /** Which side of the marker the card sits on; by default the side of the body the marker is on. */
  side?: 'left' | 'right'
  /** Colour of the line. */
  tone?: string
  children: ReactNode
}

export type Layer = 'signals' | 'physiology'
type Motion = 'still' | 'heart' | 'breathing'

/** What the physiology engine says about this body today. */
export interface BodyPhysiology {
  fluidShiftL: number
  fluidShiftShare: number
  bonePct: number
  musclePct: number
}

export interface Heart {
  bpm: number
  /** True when the rate comes from the webcam, false when it is the simulated wearable. */
  live: boolean
  lastBeatAt: number | null
}

interface Props {
  build: Build
  hotspots: Hotspot[]
  /** Signal to highlight (hovered or open). */
  activeId: string | null
  /** Signal the camera should move to (the open one). */
  focusId: string | null
  onPick: (id: string) => void
  /** An organ was clicked (its mesh name), or the selection was cleared (null). */
  onOrgan?: (name: string | null) => void
  onInventory?: (names: string[]) => void
  /** Organ to keep isolated; null shows the whole body. */
  organ?: string | null
  physiology: BodyPhysiology
  /** Simulated resting heart rate, used when the webcam pulse is not measuring. */
  restingBpm: number
  breathingRate?: number
  exerciseMotion?: ExerciseMotion | null
  exerciseStartedAt?: number
  layer: Layer
  onLayer: (l: Layer) => void
  /** The person's portrait, laid on this body's face. */
  avatar?: AvatarCapture | null
  liveFace?: RefObject<LiveFaceFrame | null> | null
  calibration?: FaceCalibration
  initialView?: View
  studio?: boolean
  /** Lock the camera to the head during crew sign-in. */
  portraitOnly?: boolean
  /** Overlays drawn over the scene by the page (name, vitals, details). */
  children?: ReactNode
  /** Space kept free at the bottom of the scene for the page's own overlays, in pixels. */
  insetBottom?: number
  /** Picture behind the body, and the credit that says what it is. */
  backdrop?: { src: string; caption: string; position?: string; href?: string }
  /** Cards beside the body that point at markers. */
  pins?: Pin[]
  /** Width covered by a panel on the right, in pixels: the body slides left to stay in view. */
  sideInset?: number
  /** Stop drawing while something covers the whole scene. */
  paused?: boolean
  /** A box at the top left of the scene, in pixels, that pins must not cover. */
  pinAvoid?: { right: number; bottom: number }
}

/** Bone meshes of the reference skeleton. */
const BONES = new Set(['skull', 'rib cage', 'shoulder girdle', 'arm bones', 'pelvis', 'leg bones'])

/** Atlas colours: arteries red, veins blue, bones ivory, organs in their usual tones. */
function anatomyColour(name: string): string {
  if (name.includes('vein')) return '#3d63b8'
  if (name === 'aorta' || name === 'arteries') return '#c8302b'
  if (name.includes('vessel')) return '#b8323a'
  if (name === 'heart') return '#a82a28'
  if (name.includes('lung')) return '#e3a09a'
  if (name === 'costal cartilage') return '#88b5b6'
  if (name === 'pancreas') return '#e1b56a'
  if (name === 'spleen') return '#873855'
  if (name === 'liver') return '#7a2c22'
  if (name.includes('kidney')) return '#8a332b'
  if (name === 'stomach') return '#d99782'
  if (name === 'small intestine') return '#e0aa8f'
  if (name === 'large intestine') return '#c98c6b'
  if (name.includes('bladder')) return '#d9bb6c'
  if (name === 'brain') return '#dcb0a6'
  if (name.includes('eyeball')) return '#f1ece2'
  if (name === 'spinal cord') return '#efe1a8'
  if (name.includes('vertebral') || BONES.has(name)) return '#ece3cf'
  return '#c99a84'
}

/** Where the camera goes for each depth stop: the heart for vessels, the torso for organs. */
const STOP_VIEW = [
  { zoom: 1, at: 0.5 },
  { zoom: 2.2, at: 0.73 },
  { zoom: 1.7, at: 0.64 },
  { zoom: 1.35, at: 0.6 },
]
/** Vessel meshes carry a travelling pulse of light, timed on the heartbeat. */
const FLOWING = (name: string) =>
  name === 'aorta' || name === 'arteries' || name.includes('vessel') || name.includes('vein')

type View = 'full' | 'head' | 'chest'
const VIEWS: Record<View, { zoom: number; at: number }> = {
  full: { zoom: 1, at: 0.5 },
  head: { zoom: 3.4, at: 0.92 },
  chest: { zoom: 2.3, at: 0.72 },
}
const MAX_ZOOM = 7
const TRAIL = 6
const LENS_CSS_PX = 170
/** Horizontal length of a pin's line, and the space kept between two cards on one side. */
const PIN_LEAD = 44
const PIN_SPACE = 8
/** The app header covers the top of the scene. */
const PIN_TOP = 76
const DEFAULT_SKIN = '#c79e83'

const FLAG_GLOW: Record<Level, string> = { ok: '#000000', watch: '#f0a73a', act: '#f25757' }
const MARKER: Record<Level, string> = {
  ok: 'border-white bg-white/60',
  watch: 'border-check bg-check',
  act: 'border-urgent bg-urgent',
}
const RANK: Record<Level, number> = { ok: 0, watch: 1, act: 2 }
/** Labels that open to the left, so two markers close together do not cover each other. */
const LABEL_LEFT = new Set(['sleep', 'opticNerve'])

type CalloutId = 'fluid' | 'heart' | 'bone' | 'muscle'
const CALLOUT_LEFT = new Set<CalloutId>(['fluid', 'bone'])

// X-ray lens: a hole in the skin that follows the pointer, with a short trail. Coordinates are
// drawing-buffer pixels. The edge is dithered so it reads as a soft cut, not a sticker.
const LENS = /* glsl */ `
uniform vec4 uLens;
uniform vec3 uTrail[${TRAIL}];
uniform float uTime;
float lensMask() {
  vec2 f = gl_FragCoord.xy;
  float wob = sin(f.x * 0.045 + uTime * 2.1) * 0.5 + sin(f.y * 0.05 - uTime * 1.7) * 0.5;
  float m = 1.0 - smoothstep(uLens.z * 0.62, uLens.z, distance(f, uLens.xy) + wob * uLens.z * 0.05);
  for (int i = 0; i < ${TRAIL}; i++) {
    float r = uTrail[i].z;
    if (r > 1.0) m = max(m, 1.0 - smoothstep(r * 0.45, r, distance(f, uTrail[i].xy) + wob * r * 0.08));
  }
  return m * uLens.w;
}
bool lensOpensSkin() {
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  return lensMask() > 0.12 + 0.76 * n;
}
float lensRim() {
  float d = distance(gl_FragCoord.xy, uLens.xy);
  return smoothstep(uLens.z * 0.86, uLens.z * 0.95, d) * (1.0 - smoothstep(uLens.z * 0.95, uLens.z * 1.04, d)) * uLens.w;
}`

const LENS_CUT = /* glsl */ `#include <clipping_planes_fragment>
  if (lensOpensSkin()) discard;`

// Breathing moves the chest; the fluid shift swells the face and thins the legs (exaggerated
// about tenfold so it can be seen at full-body scale).
const BODY_MOTION = /* glsl */ `#include <begin_vertex>
  float chest = smoothstep(uHeight * 0.57, uHeight * 0.69, position.y) * (1.0 - smoothstep(uHeight * 0.79, uHeight * 0.86, position.y));
  transformed.x *= 1.0 + chest * uBreathing;
  transformed.z *= 1.0 + chest * uBreathing * 2.0;
  float headZone = smoothstep(uHeight * 0.80, uHeight * 0.87, position.y);
  float legZone = 1.0 - smoothstep(uHeight * 0.36, uHeight * 0.47, position.y);
  transformed += normal * uFluid * (0.016 * headZone - 0.012 * legZone);`

interface Stage {
  setBuild: (b: Build) => void
  setDimensions: (values: BodyDimensions) => void
  setHotspots: (h: Hotspot[]) => void
  setActive: (id: string | null) => void
  setFocus: (id: string | null) => void
  /** Depth from 0 (skin) to 3 (skeleton). `fly` also moves the camera to that stop. */
  setDepth: (d: number, fly: boolean) => void
  setOrgan: (name: string | null) => void
  setView: (v: View, yaw?: number) => void
  zoomBy: (factor: number) => void
  setLayer: (l: Layer) => void
  setPhysiology: (p: BodyPhysiology) => void
  setHeart: (h: Heart) => void
  setBreathingRate: (rate: number | undefined) => void
  setMotion: (m: Motion) => void
  setExerciseMotion: (mode: ExerciseMotion | null, startedAt?: number) => void
  setAvatar: (a: AvatarCapture | null) => void
  setFaceOptions: (live: RefObject<LiveFaceFrame | null> | null, calibration?: FaceCalibration) => void
  setPins: (pins: { id: string; at: string; side?: 'left' | 'right' }[]) => void
  setSideInset: (px: number) => void
  setPaused: (paused: boolean) => void
  setPinBounds: (bottom: number, avoid: { right: number; bottom: number }) => void
  dispose: () => void
}

function createStage(
  host: HTMLDivElement,
  dom: {
    markerOf: (id: string) => HTMLElement | null
    calloutOf: (id: CalloutId) => HTMLElement | null
    pinOf: (id: string) => HTMLElement | null
    hoverLabel: () => HTMLElement | null
  },
  onCredit: (text: string) => void,
  onInventory: (names: string[]) => void,
  onBodyPick: (id: string) => void,
  onOrganPick: (name: string | null) => void,
  allowLens: boolean,
  portraitOnly: boolean,
): Stage {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  host.prepend(renderer.domElement)
  renderer.domElement.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;z-index:1'
  if (portraitOnly) renderer.domElement.style.touchAction = 'pan-y'
  renderer.domElement.setAttribute('aria-hidden', 'true')

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xfff8ef, 0x81796e, 2.1))
  const keyLight = new THREE.DirectionalLight(0xfff1df, 3.1)
  keyLight.position.set(-2, 4, 5)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xe5edf2, 1.4)
  fillLight.position.set(3, 1, 2)
  scene.add(fillLight)
  const rimLight = new THREE.DirectionalLight(0xdfe8ff, 1.2)
  rimLight.position.set(0, 2, -4)
  scene.add(rimLight)
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50)
  const group = new THREE.Group()
  const body = new THREE.Group()
  scene.add(group)
  group.add(body)

  const demoPose = createExercisePose()
  let exercise: ExerciseMotion | null = null
  let exerciseStarted = 0
  let demoSecond = -1
  let demoRates = demoVitals('ankle', 0)
  let demoBeatPhase = 0
  let demoBreathPhase = 0
  // Uniforms shared by the skin and the portrait.
  const shared = {
    uLens: { value: new THREE.Vector4(0, 0, 1, 0) },
    uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector3(0, 0, 0)) },
    uTime: { value: 0 },
    uSolidSkin: { value: true },
    uBreathing: { value: 0 },
    uFluid: { value: 0 },
    uHeight: { value: 1.75 },
  }
  /** Adds the lens cut, breathing and fluid shift to a built-in material's shaders. */
  const patch = (shader: THREE.WebGLProgramParametersWithUniforms, withRim: boolean) => {
    demoPose.patch(shader, current?.skin.hasAttribute('exerciseArms') ?? false)
    Object.assign(shader.uniforms, shared)
    shader.vertexShader =
      'uniform float uBreathing;\nuniform float uFluid;\nuniform float uHeight;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', BODY_MOTION)
    shader.fragmentShader = (LENS + '\n' + shader.fragmentShader).replace(
      '#include <clipping_planes_fragment>',
      LENS_CUT,
    )
    if (withRim)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), lensRim() * 0.85);',
      )
  }

  let skinMaterial = new THREE.MeshPhysicalMaterial({
    color: DEFAULT_SKIN,
    roughness: 0.67,
    metalness: 0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.7,
    side: THREE.DoubleSide,
  })
  skinMaterial.onBeforeCompile = (shader) => patch(shader, true)
  const skin = new THREE.Mesh(new THREE.BufferGeometry(), skinMaterial)
  skin.renderOrder = 2
  skin.visible = false
  body.add(skin)
  const organGroup = new THREE.Group()
  body.add(organGroup)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 64),
    new THREE.MeshBasicMaterial({ color: 0x2a241d, transparent: true, opacity: 0.22, depthWrite: false }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.scale.y = 0.65
  floor.position.y = 0.003
  body.add(floor)

  let reference: Body | null = null
  let current: Body | null = null
  let fitted: ReturnType<typeof fitTorso> | undefined
  let requestedBuild: Build | null = null
  let requestRevision = 0
  let groom: ReturnType<typeof createBodyGroom> | null = null
  const restingEyes: ReturnType<typeof createRestingEye>[] = []
  let dimensions: BodyDimensions = {}
  function fitDimensions() {
    if (!current) return
    const scale = mannequinScale(current.build, current.height, dimensions)
    group.scale.set(scale.horizontal, scale.vertical, scale.horizontal)
  }
  let hot: Hotspot[] = []
  let pins: { id: string; at: string; side?: 'left' | 'right' }[] = []
  let sideInset = 0
  let sideShift = 0
  let paused = false
  /** Space kept free at the bottom, and a box at the top left that cards must not cover. */
  let pinBottom = 24
  let pinAvoid = { right: 0, bottom: 0 }
  const pinSizes = new WeakMap<HTMLElement, { w: number; h: number; at: number }>()
  let pinFrame = 0
  let active: string | null = null
  let disposed = false
  let organs: {
    name: string
    layer: DepthLayer
    eye: boolean
    mat: THREE.MeshStandardMaterial
    mesh: THREE.Mesh
    holder: THREE.Object3D
    level: Level
    opacity: number
  }[] = []
  let skinOpacity = 1
  const flow = { value: 0 }
  let depth = 0
  let isolated: string | null = null
  let hovered: string | null = null
  let layer: Layer = 'signals'
  let physio: BodyPhysiology = { fluidShiftL: 0, fluidShiftShare: 0, bonePct: 100, musclePct: 100 }
  let heart: Heart = { bpm: 62, live: false, lastBeatAt: null }
  let breathingRate: number | undefined
  let motion: Motion = 'still'
  let portrait: AvatarCapture | null = null
  let liveFace: RefObject<LiveFaceFrame | null> | null = null
  let calibration: FaceCalibration | undefined
  let face: ReturnType<typeof createPersonalFace> | null = null
  let zoom = 1
  let zoomTo = 1
  let focusY = 0
  let focusTo = 0
  let focusX = 0
  let focusXTo = 0
  let viewBeforeDemo: { zoom: number; x: number; y: number; yaw: number } | null = null
  let baseDist = 4.75
  let userRot = 0
  let velocity = 0
  // The point on the skin/organ is in world space, while the gesture is in
  // viewport coordinates. Keep them paired throughout the eased camera move.
  let zoomAnchor: { world: THREE.Vector3; screen: THREE.Vector2 } | null = null
  const clampView = () => {
    if (portraitOnly) {
      const height = current?.height ?? 1.75
      zoomTo = 6.35
      focusTo = height * 0.43
      return
    }
    zoomTo = Math.min(MAX_ZOOM, Math.max(1, zoomTo))
    const reach = ((current?.height ?? 1.75) / 2) * (1 - 1 / Math.max(zoomTo, 1.0001)) + 0.05
    focusTo = Math.min(reach, Math.max(-reach, focusTo))
  }
  const localPoint = (point: Vec3): Vec3 => {
    const factor = fitted?.factor(point[1]) ?? 1
    return [point[0] * factor, point[1], point[2] * factor]
  }
  const resolve = (h: Hotspot): Vec3 => current?.anchors[h.id] ?? localPoint(h.pos)
  const organCenter = (name: string) => current?.organs.find((o) => o.name === name)?.center
  const flyTo = (zoomValue: number, y: number, x = 0) => {
    zoomAnchor = null
    userRot = 0
    velocity = 0
    zoomTo = zoomValue
    focusTo = y
    focusXTo = x
    clampView()
  }

  /** Where each physiology callout points on the body. */
  const calloutAnchor = (id: CalloutId): Vec3 => {
    const h = current?.height ?? 1.75
    if (id === 'fluid') {
      const b = organCenter('brain')
      return b ? [b[0], b[1] - 0.05, b[2] + 0.08] : [0, h * 0.94, 0.06]
    }
    if (id === 'heart') return organCenter('heart') ?? [0.02, h * 0.76, 0.03]
    if (id === 'bone') return localPoint([0, h * 0.58, -0.06])
    return localPoint([0.09, h * 0.22, -0.02])
  }

  const refresh = () => {
    const physiologyView = layer === 'physiology'
    // Keep a chosen layer for movement, but switch an isolated organ back to the whole mannequin.
    const selection = exercise ? null : isolated
    const d = physiologyView || (exercise && isolated) ? 0 : depth
    skinOpacity = selection ? 0.095 : depthOpacity('skin', d)
    face?.setVisible(skinOpacity > 0.9)
    shared.uFluid.value = physiologyView ? physio.fluidShiftShare : 0
    for (const o of organs) {
      const ids = ORGAN_SIGNALS[o.name] ?? []
      let level: Level = 'ok'
      for (const h of hot) if (ids.includes(h.id) && RANK[h.level] > RANK[level]) level = h.level
      o.level = layer === 'signals' ? level : 'ok'
      const isActive =
        (active !== null && ids.includes(active)) ||
        hovered === o.name ||
        (selection !== null && matchesAnatomySelection(o.name, selection))
      o.opacity = selection
        ? matchesAnatomySelection(o.name, selection)
          ? 1
          : 0.035
        : depthOpacity(o.layer, d)
      o.mat.color.set(anatomyColour(o.name))
      o.mat.emissive.set(isActive && o.level === 'ok' ? '#3c3c3c' : FLAG_GLOW[o.level])
      o.mat.emissiveIntensity = o.level === 'ok' ? (isActive ? 1 : 0) : 0.6
    }
  }

  const updatePortrait = () => {
    if (current) face?.setPortrait(portrait)
    refresh()
  }

  const isolate = (name: string | null) => {
    isolated = name
    pointerMoved = true
    refresh()
    if (!name || !current || exercise) return
    const bounds = new THREE.Box3()
    for (const part of organs) {
      if (!matchesAnatomySelection(part.name, name)) continue
      const geometry = part.mesh.geometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      bounds.union(geometry.boundingBox!)
    }
    if (bounds.isEmpty()) return
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    const available = Math.max(0.3, (host.clientWidth - sideInset) / host.clientHeight)
    const radius = Math.max(0.025, sphere.radius) * Math.max(1, group.scale.x / group.scale.y)
    flyTo(
      Math.min(MAX_ZOOM, (current.height * 0.45 * Math.min(1, available)) / radius),
      sphere.center.y - current.height / 2,
      sphere.center.x,
    )
  }

  const clearSurfaceDetails = () => {
    groom?.dispose()
    groom = null
    for (const eye of restingEyes.splice(0)) {
      eye.removeFromParent()
      eye.geometry.dispose()
      eye.material.dispose()
    }
  }
  const show = () => {
    if (!reference) return
    const scale = mannequinScale(reference.build, reference.height, dimensions)
    clearSurfaceDetails()
    fitted?.dispose()
    fitted =
      dimensions.chestCm !== undefined || dimensions.waistCm !== undefined
        ? fitTorso(reference, scale.horizontal, dimensions)
        : undefined
    current = fitted?.body ?? reference
    for (const o of organs) o.mat.dispose()
    organGroup.clear()
    organGroup.visible = true
    for (const socket of current.eyeSockets ?? []) {
      const eye = createRestingEye(socket, current.build)
      const appearance = eye.material.onBeforeCompile.bind(eye.material)
      eye.material.onBeforeCompile = (shader, renderer) => {
        appearance(shader, renderer)
        patch(shader, false)
      }
      eye.material.customProgramCacheKey = () => 'pulsar-resting-eye-with-lens'
      eye.userData.organ = socket.name
      eye.visible = false
      restingEyes.push(eye)
      body.add(eye)
    }
    organs = current.organs.map((o) => {
      const mat = new THREE.MeshStandardMaterial({
        color: anatomyColour(o.name),
        roughness: 0.55,
        metalness: 0,
      })
      const eye = o.name.includes('eyeball')
      const flowing = FLOWING(o.name)
      const vein = o.name.includes('vein')
      // The atlases intersect locally. An internal surface is visible through
      // opaque skin only at pixels cut out by the inspection lens.
      if (!eye || restingEyes.length > 0) {
        mat.customProgramCacheKey = () => (flowing ? (vein ? 'vein' : 'artery') : 'internal')
        mat.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, shared)
          shader.fragmentShader = (LENS + '\nuniform bool uSolidSkin;\n' + shader.fragmentShader).replace(
            '#include <clipping_planes_fragment>',
            '#include <clipping_planes_fragment>\n if (uSolidSkin && !lensOpensSkin()) discard;',
          )
          if (!flowing) return
          shader.uniforms.uFlow = flow
          shader.vertexShader = shader.vertexShader
            .replace('void main() {', 'varying vec3 vLocal;\nvoid main() {')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocal = position;')
          shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', 'uniform float uFlow;\nvarying vec3 vLocal;\nvoid main() {')
            .replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
  float wave = pow(0.5 + 0.5 * sin(vLocal.y * 34.0 ${vein ? '+' : '-'} uTime * 5.5), 10.0);
  totalEmissiveRadiance += diffuseColor.rgb * wave * uFlow * 1.6;`,
            )
        }
      }
      // Internals and skin are registered in the same rest coordinates.
      const shadeOrgan = mat.onBeforeCompile.bind(mat)
      mat.onBeforeCompile = (shader, renderer) => {
        shadeOrgan(shader, renderer)
        demoPose.patch(shader)
      }
      const mesh = new THREE.Mesh(o.geometry, mat)
      mesh.renderOrder = 1
      mesh.userData.organ = o.name
      // The heart sits in a holder at its own centre, so it can beat in place.
      let holder: THREE.Object3D = mesh
      if (o.name === 'heart') {
        holder = new THREE.Group()
        holder.position.set(...o.center)
        mesh.position.set(-o.center[0], -o.center[1], -o.center[2])
        holder.add(mesh)
      }
      organGroup.add(holder)
      return {
        name: o.name,
        layer: organNote(o.name).layer,
        eye,
        mat,
        mesh,
        holder,
        level: 'ok' as Level,
        opacity: 0,
      }
    })
    if (face) face.dispose()
    else {
      skin.geometry.dispose()
      skinMaterial.dispose()
    }
    face = createPersonalFace(current, { patch: (shader) => patch(shader, true) })
    skin.geometry = face.geometry
    skin.material = skinMaterial = face.material
    skin.visible = true
    groom = createBodyGroom(current, face.geometry, (shader) => patch(shader, false))
    body.add(groom.object)
    shared.uHeight.value = current.height
    demoPose.setBody(current.height, current.build)
    body.position.y = -current.height / 2
    fitDimensions()
    if (portraitOnly) {
      clampView()
      zoom = zoomTo
      focusY = focusTo
    }
    onInventory(current.organs.map((o) => o.name))
    onCredit(current.attribution.endsWith('.') ? current.attribution : current.attribution + '.')
    updatePortrait()
    if (isolated) isolate(isolated)
  }

  // Drag to turn. One finger or the mouse: turn (and slide when zoomed in). Two fingers: pinch to
  // zoom. Wheel: zoom. Pointing names an organ; a click selects it (or the nearest signal on skin).
  let gestureX = 0
  let gestureY = 0
  let dragging = false
  let lastX = 0
  let lastY = 0
  let pinch = 0
  let pinched = false
  let pointerMoved = false
  let wasLookingInside = false
  const pointerCss = { x: 0, y: 0 }
  const touches = new Map<number, { x: number; y: number }>()
  const el = renderer.domElement
  const lensAt = { x: 0, y: 0, strength: 0, target: 0 }
  const trailPos = { x: 0, y: 0 }
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const pinchGesture = () => {
    const [a, b] = touches.values()
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const point = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    const pr = renderer.getPixelRatio()
    pointerCss.x = e.clientX - rect.left
    pointerCss.y = e.clientY - rect.top
    lensAt.x = pointerCss.x * pr
    lensAt.y = (rect.height - pointerCss.y) * pr
    lensAt.target = exercise ? 0 : 1
    pointerMoved = true
  }
  // At the lens centre a strength of 0.88 clears even the last dithered skin pixel.
  const pointerSeesInside = (cssX = pointerCss.x, cssY = pointerCss.y) => {
    if (skinOpacity < 1) return skinOpacity <= 0.5
    const lens = shared.uLens.value
    const pr = renderer.getPixelRatio()
    return (
      lensAt.target > 0 &&
      lens.w >= 0.88 &&
      Math.hypot(cssX * pr - lens.x, (host.clientHeight - cssY) * pr - lens.y) < lens.z * 0.45
    )
  }
  /** Pick only surfaces exposed at this pointer, including the reference eyes. */
  const pickAt = (cssX: number, cssY: number) => {
    if (!current) return null
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    ndc.set((cssX / w) * 2 - 1, -(cssY / h) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const inside = pointerSeesInside(cssX, cssY)
    const targets: THREE.Object3D[] = organs
      .filter((o) => o.mesh.visible && o.mat.opacity >= 0.5 && (inside || o.eye))
      .map((o) => o.mesh)
    if (!inside && skin.visible) targets.push(skin, ...restingEyes.filter((eye) => eye.visible))
    const hit = raycaster.intersectObjects(targets, false)[0]
    if (!hit) return null
    return { what: hit.object === skin ? 'skin' : (hit.object.userData.organ as string), point: hit.point }
  }
  function zoomAt(clientX: number, clientY: number, factor: number, keepAnchor = false) {
    if (portraitOnly) return
    const next = THREE.MathUtils.clamp(zoomTo * factor, 1, MAX_ZOOM)
    if (next === zoomTo && !keepAnchor) return
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = clientX - rect.left,
      y = clientY - rect.top
    const nx = (2 * x) / rect.width - 1,
      ny = 1 - (2 * y) / rect.height
    if (!zoomAnchor || (!keepAnchor && (zoomAnchor.screen.x !== nx || zoomAnchor.screen.y !== ny))) {
      const hit = pickAt(x, y)
      // For background pixels use the plane through the body's rotation axis.
      // Use the camera ray explicitly even while the anatomy is loading.
      raycaster.setFromCamera(ndc.set(nx, ny), camera)
      const ray = raycaster.ray
      const world = hit?.point ?? ray.at(-ray.origin.z / ray.direction.z, new THREE.Vector3())
      zoomAnchor = { world, screen: new THREE.Vector2(nx, ny) }
    } else {
      zoomAnchor.screen.set(nx, ny)
    }
    zoomTo = next
    velocity = 0
  }
  const down = (e: PointerEvent) => {
    point(e)
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.setPointerCapture(e.pointerId)
    if (touches.size === 2) {
      const { distance, x, y } = pinchGesture()
      zoomAnchor = null
      pinch = distance
      pinched = true
      zoomAt(x, y, 1, true)
      dragging = false
      return
    }
    if (touches.size !== 1) return
    zoomAnchor = null
    pinched = false
    dragging = true
    gestureX = lastX = e.clientX
    gestureY = lastY = e.clientY
    el.style.cursor = 'grabbing'
  }
  const move = (e: PointerEvent) => {
    point(e)
    if (!touches.has(e.pointerId)) return
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.size === 2) {
      const { distance, x, y } = pinchGesture()
      if (pinch > 0 && distance > 0) zoomAt(x, y, distance / pinch, true)
      pinch = distance
      return
    }
    if (!dragging) return
    velocity = (e.clientX - lastX) * 0.009
    userRot += velocity
    const visibleHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    focusTo += (((e.clientY - lastY) / (host.clientHeight || 1)) * visibleHeight) / group.scale.y
    clampView()
    lastX = e.clientX
    lastY = e.clientY
  }
  const up = (e: PointerEvent) => {
    if (
      e.type === 'pointerup' &&
      !pinched &&
      touches.size === 1 &&
      Math.hypot(e.clientX - gestureX, e.clientY - gestureY) < 5 &&
      current &&
      allowLens &&
      !exercise &&
      layer === 'signals'
    ) {
      const hit = pickAt(pointerCss.x, pointerCss.y)
      if (hit && hit.what !== 'skin') {
        onOrganPick(hit.what)
      } else if (hit && hit.what === 'skin' && hot.length) {
        const p = body.worldToLocal(hit.point.clone())
        let best = hot[0]
        let bestD = Infinity
        for (const h of hot) {
          const d = p.distanceToSquared(new THREE.Vector3(...resolve(h)))
          if (d < bestD) {
            best = h
            bestD = d
          }
        }
        onBodyPick(best.id)
      } else if (!hit && isolated) {
        onOrganPick(null)
      }
    }
    touches.delete(e.pointerId)
    pinch = 0
    dragging = false
    el.style.cursor = 'grab'
    if (e.pointerType !== 'mouse') lensAt.target = 0
  }
  const leave = () => {
    if (!dragging) lensAt.target = 0
    if (hovered) {
      hovered = null
      refresh()
    }
    const label = dom.hoverLabel()
    if (label) label.style.opacity = '0'
  }
  const wheel = (e: WheelEvent) => {
    if (portraitOnly) return
    e.preventDefault()
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.clientHeight : 1)
    zoomAt(e.clientX, e.clientY, Math.exp(-pixels * 0.0015))
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('pointerleave', leave)
  el.addEventListener('wheel', wheel, { passive: false })

  const resize = () => {
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    baseDist = Math.max(4.75, 0.6 / (w / h) / Math.tan((camera.fov * Math.PI) / 360))
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  const v = new THREE.Vector3()
  let raf = 0
  let lastTime = performance.now()
  const startedAt = lastTime
  let lastRuler = ''
  const frame = () => {
    raf = requestAnimationFrame(frame)
    if (document.hidden || host.clientHeight === 0 || paused) return
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    const t = (now - startedAt) / 1000
    shared.uTime.value = t
    const exerciseSeconds = (now - exerciseStarted) / 1000
    demoPose.update(exercise, exerciseSeconds, reduce)
    if (exercise) {
      if (Math.floor(exerciseSeconds) !== demoSecond) {
        demoSecond = Math.floor(exerciseSeconds)
        demoRates = demoVitals(exercise, exerciseSeconds)
      }
      demoBeatPhase = (demoBeatPhase + (dt * demoRates.bpm) / 60) % 1
      demoBreathPhase = (demoBreathPhase + (dt * demoRates.breathsPerMinute) / 60) % 1
    }
    if (!dragging) {
      userRot += velocity
      velocity *= 0.92
    }
    const ease = reduce ? 1 : Math.min(1, dt * 6)
    zoom += (zoomTo - zoom) * ease
    focusY += (focusTo - focusY) * ease
    focusX += (focusXTo - focusX) * ease
    sideShift += (sideInset - sideShift) * ease
    // The camera and orbit targets use the same reference frame as the meshes.
    // A generous eye distance on narrow screens also accommodates broader builds.
    const viewScale = Math.max(group.scale.y, group.scale.x * Math.min(1, 0.6 / camera.aspect))
    const cameraZ = (baseDist * viewScale) / zoom
    // A panel on the right covers part of the scene: move the camera so the body stays centred in
    // what is left.
    const visibleWidth = 2 * cameraZ * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
    const shiftX = (sideShift / 2 / (host.clientWidth || 1)) * visibleWidth
    if (zoomAnchor) {
      // Solve perspective projection for the camera position at this frame's
      // depth. Undo the panel offset and body scale when storing the new focus.
      const { world, screen } = zoomAnchor
      const halfHeight = (cameraZ - world.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      focusX = focusXTo = (world.x - screen.x * halfHeight * camera.aspect - shiftX) / group.scale.x
      focusY = focusTo = (world.y - screen.y * halfHeight) / group.scale.y
      if (pinch === 0 && Math.abs(zoomTo - zoom) < 1e-6 && Math.abs(sideInset - sideShift) < 0.01)
        zoomAnchor = null
    }
    camera.position.set(focusX * group.scale.x + shiftX, focusY * group.scale.y, cameraZ)
    if (hasSize(dimensions)) {
      const metresVisible = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const ruler = ((0.1 * host.clientHeight) / metresVisible).toFixed(1) + 'px'
      if (ruler !== lastRuler) {
        host.style.setProperty('--body-decimetre', ruler)
        lastRuler = ruler
      }
    }
    group.rotation.y = userRot + (exercise ? 0.55 : 0)

    // X-ray lens: only through solid skin. Eased strength and a short trail.
    lensAt.strength += (lensAt.target - lensAt.strength) * Math.min(1, dt * 9)
    const pr = renderer.getPixelRatio()
    shared.uLens.value.set(
      lensAt.x,
      lensAt.y,
      LENS_CSS_PX * pr,
      allowLens && skinOpacity === 1 ? lensAt.strength : 0,
    )
    const trail = shared.uTrail.value
    for (const p of trail) p.z *= Math.pow(0.04, dt)
    if (Math.hypot(lensAt.x - trailPos.x, lensAt.y - trailPos.y) > 6 * pr) {
      for (let i = TRAIL - 1; i > 0; i--) trail[i].copy(trail[i - 1])
      trail[0].set(trailPos.x, trailPos.y, LENS_CSS_PX * pr * 0.8 * lensAt.strength)
      trailPos.x = lensAt.x
      trailPos.y = lensAt.y
    }

    // Only the cadence is measured. The displayed phase and depth are illustrative.
    shared.uBreathing.value =
      !reduce && exercise
        ? Math.sin(demoBreathPhase * 2 * Math.PI) * 0.012
        : !reduce && motion === 'breathing' && breathingRate
          ? Math.sin((t * 2 * Math.PI * breathingRate) / 60) * 0.012
          : 0
    // Heartbeat: the two heart sounds, timed on the live beat when there is one.
    const period = 60 / Math.max(30, Math.min(200, heart.bpm || 60))
    const sinceBeat = heart.lastBeatAt !== null ? (now - heart.lastBeatAt) / 1000 : Infinity
    const phase = exercise
      ? demoBeatPhase
      : sinceBeat < period * 3
        ? (sinceBeat / period) % 1
        : (t / period) % 1
    const bump = (c: number, w: number) => Math.exp(-(((phase - c) / w) ** 2))
    const beat =
      reduce || (!exercise && motion !== 'heart')
        ? 0
        : bump(0, 0.07) + bump(1, 0.07) + 0.55 * bump(0.24, 0.08)

    skin.visible = !!current && skinOpacity > 0
    const skinSeeThrough = skinOpacity < 1
    if (skinSeeThrough !== skinMaterial.transparent) {
      skinMaterial.transparent = skinSeeThrough
      skinMaterial.depthWrite = !skinSeeThrough
      skinMaterial.needsUpdate = true
    }
    skinMaterial.opacity = skinOpacity
    shared.uSolidSkin.value = !skinSeeThrough
    const lensOpen = shared.uLens.value.w > 0.12
    flow.value = (exercise || motion === 'heart') && skinSeeThrough ? 0.35 + 0.65 * beat : 0
    if (current) face?.updateLive(liveFace?.current ?? null, calibration)
    const portraitVisible = face?.portraitVisible ?? false
    const surfaceVisible = !!current && !skinSeeThrough
    for (const eye of restingEyes) eye.visible = surfaceVisible && !portraitVisible
    if (groom) {
      groom.object.visible = surfaceVisible
      groom.sync(portraitVisible)
    }
    for (const o of organs) {
      if (o.name === 'heart') o.holder.scale.setScalar(1 + 0.07 * beat)
      if (o.level !== 'ok' && !reduce) o.mat.emissiveIntensity = 0.35 + 0.35 * Math.sin(t * 3.2)
      // On solid skin the fragment shader clips anatomy to the inspection lens.
      const legacyEye = surfaceVisible && o.eye && !restingEyes.length
      const opacity = legacyEye ? Number(!portraitVisible) : lensOpen ? 1 : o.opacity
      o.mesh.visible = opacity > 0
      if (!o.mesh.visible) continue
      const partial = opacity < 1
      if (partial !== o.mat.transparent) {
        o.mat.transparent = partial
        o.mat.depthWrite = !partial
        o.mat.needsUpdate = true
      }
      o.mat.opacity = opacity
    }

    renderer.render(scene, camera)

    // Naming the organ under the pointer, at most once a frame and only when organs show.
    const seesInside = pointerSeesInside()
    if (allowLens && !exercise && !dragging && (pointerMoved || seesInside !== wasLookingInside)) {
      pointerMoved = false
      const hit = lensAt.target && seesInside ? pickAt(pointerCss.x, pointerCss.y) : null
      const name = hit && hit.what !== 'skin' ? hit.what : null
      if (name !== hovered) {
        hovered = name
        refresh()
      }
      const label = dom.hoverLabel()
      if (label) {
        label.textContent = name ? organNote(name).name : ''
        label.style.opacity = name ? '1' : '0'
        label.style.transform = `translate(${pointerCss.x + 16}px, ${pointerCss.y - 10}px)`
      }
      el.style.cursor = name ? 'pointer' : 'grab'
    }
    wasLookingInside = seesInside

    const w = host.clientWidth
    const h = host.clientHeight
    const place = (node: HTMLElement | null, p: Vec3, always = false) => {
      if (!node) return
      v.set(p[0], p[1], p[2])
      body.localToWorld(v)
      const front = v.z > -0.03
      v.project(camera)
      node.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`
      node.style.visibility =
        current && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && !isolated ? 'visible' : 'hidden'
      node.style.opacity = always || front ? '1' : '0.3'
      node.style.zIndex = front ? '3' : '2'
    }
    if (layer === 'signals') for (const hs of hot) place(dom.markerOf(hs.id), resolve(hs))
    else
      for (const id of ['fluid', 'heart', 'bone', 'muscle'] as const)
        place(dom.calloutOf(id), calloutAnchor(id), true)
    placePins(w, h)
  }

  /** Pins: a card on the outer side of its marker, pushed down when it would cover the one above. */
  const placePins = (w: number, h: number) => {
    pinFrame++
    const placed: {
      node: HTMLElement
      x: number
      y: number
      side: 'left' | 'right'
      height: number
      centre: number
    }[] = []
    const middle = (w - sideShift) / 2
    for (const p of pins) {
      const node = dom.pinOf(p.id)
      if (!node) continue
      const spot = hot.find((x) => x.id === p.at)
      if (!spot || layer !== 'signals' || isolated || depth > 0) {
        node.style.visibility = 'hidden'
        continue
      }
      v.set(...resolve(spot))
      body.localToWorld(v)
      v.project(camera)
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) {
        node.style.visibility = 'hidden'
        continue
      }
      const x = ((v.x + 1) / 2) * w
      const y = ((1 - v.y) / 2) * h
      // Card sizes change only when their text does: measure now and then, not every frame.
      let size = pinSizes.get(node)
      if (!size || pinFrame - size.at > 20) {
        const card = node.lastElementChild as HTMLElement | null
        size = { w: card?.offsetWidth ?? 0, h: card?.offsetHeight ?? 0, at: pinFrame }
        pinSizes.set(node, size)
      }
      let side = p.side ?? (x < middle ? 'left' : 'right')
      const coversBox = (left: number) => left < pinAvoid.right && y - size.h / 2 < pinAvoid.bottom
      if (side === 'left' && (x - PIN_LEAD - size.w < 8 || coversBox(x - PIN_LEAD - size.w))) side = 'right'
      else if (side === 'right' && x + PIN_LEAD + size.w > w - 8) side = 'left'
      placed.push({ node, x, y, side, height: size.h, centre: y })
    }
    // On each side, keep the cards in order, apart, below the header and above the vitals.
    const floor = h - pinBottom - 8
    for (const side of ['left', 'right'] as const) {
      const list = placed.filter((q) => q.side === side).sort((a, b) => a.y - b.y)
      let edge = PIN_TOP
      for (const p of list) {
        p.centre = Math.max(p.y, edge + p.height / 2)
        edge = p.centre + p.height / 2 + PIN_SPACE
      }
      let limit = floor
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]
        p.centre = Math.max(PIN_TOP + p.height / 2, Math.min(p.centre, limit - p.height / 2))
        limit = p.centre - p.height / 2 - PIN_SPACE
      }
    }
    for (const p of placed) {
      const dx = p.side === 'left' ? -PIN_LEAD : PIN_LEAD
      const dy = p.centre - p.y
      p.node.style.transform = `translate(${p.x}px, ${p.y}px)`
      p.node.style.visibility = 'visible'
      p.node.dataset.side = p.side
      p.node.style.setProperty('--dy', `${dy}px`)
      p.node.style.setProperty('--lead-len', `${Math.hypot(dx, dy)}px`)
      p.node.style.setProperty('--lead-angle', `${Math.atan2(dy, dx)}rad`)
    }
  }
  frame()

  return {
    setBuild: (build) => {
      if (build === requestedBuild) return
      zoomAnchor = null
      requestedBuild = build
      const revision = ++requestRevision
      current = reference = null
      skin.visible = organGroup.visible = false
      clearSurfaceDetails()
      onInventory([])
      onCredit('')
      void loadBody(build).then((loaded) => {
        if (disposed || requestRevision !== revision) return
        if (!loaded) {
          requestedBuild = null
          onCredit('failed')
          return
        }
        reference = loaded
        show()
      })
    },
    setDimensions: (next) => {
      zoomAnchor = null
      const previous = dimensions
      dimensions = next
      const needsRefit =
        previous.chestCm !== undefined ||
        previous.waistCm !== undefined ||
        next.chestCm !== undefined ||
        next.waistCm !== undefined
      if (needsRefit) show()
      else fitDimensions()
    },
    setHotspots: (list) => {
      hot = list
      refresh()
    },
    setActive: (id) => {
      active = id
      refresh()
    },
    setFocus: (id) => {
      const h = id ? hot.find((x) => x.id === id) : undefined
      if (h && current) flyTo(2.6, resolve(h)[1] - current.height / 2, resolve(h)[0])
      else if (!isolated) flyTo(1, 0)
    },
    setDepth: (d, fly) => {
      depth = Math.min(3, Math.max(0, d))
      pointerMoved = true
      if (isolated) {
        isolated = null
        onOrganPick(null)
      }
      refresh()
      if (fly && current) {
        const stop = STOP_VIEW[Math.round(depth)]
        flyTo(stop.zoom, (stop.at - 0.5) * current.height)
      }
    },
    setOrgan: (name) => {
      if (name === isolated) return
      isolate(name)
      if (!name && current) {
        const stop = STOP_VIEW[Math.round(depth)]
        flyTo(stop.zoom, (stop.at - 0.5) * current.height)
      }
    },
    setView: (view, yaw = 0) => {
      flyTo(VIEWS[view].zoom, (VIEWS[view].at - 0.5) * (current?.height ?? 1.75))
      userRot = yaw
    },
    zoomBy: (factor) => {
      zoomAnchor = null
      zoomTo *= factor
      clampView()
    },
    setLayer: (l) => {
      layer = l
      pointerMoved = true
      refresh()
    },
    setPhysiology: (p) => {
      physio = p
      refresh()
    },
    setHeart: (value) => {
      heart = value
    },
    setBreathingRate: (rate) => {
      breathingRate = rate
    },
    setExerciseMotion: (value, startedAt) => {
      if (exercise === value && (startedAt === undefined || startedAt === exerciseStarted)) return
      if (!exercise && value) {
        viewBeforeDemo = { zoom: zoomTo, x: focusXTo, y: focusTo, yaw: userRot }
        leave()
        lensAt.strength = lensAt.target = 0
      }
      exercise = value
      exerciseStarted = startedAt ?? performance.now()
      demoSecond = -1
      demoBeatPhase = demoBreathPhase = 0
      refresh()
      if (value) flyTo(1, 0)
      else if (viewBeforeDemo) {
        flyTo(viewBeforeDemo.zoom, viewBeforeDemo.y, viewBeforeDemo.x)
        userRot = viewBeforeDemo.yaw
        viewBeforeDemo = null
      }
    },
    setMotion: (m) => {
      motion = m
    },
    setAvatar: (a) => {
      portrait = a
      updatePortrait()
    },
    setFaceOptions: (live, adjustment) => {
      liveFace = live
      calibration = adjustment
    },
    setPins: (list) => {
      pins = list
    },
    setSideInset: (px) => {
      sideInset = px
    },
    setPaused: (value) => {
      paused = value
    },
    setPinBounds: (bottom, avoid) => {
      pinBottom = bottom
      pinAvoid = avoid
    },
    dispose: () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('wheel', wheel)
      for (const o of organs) o.mat.dispose()
      clearSurfaceDetails()
      face?.dispose()
      fitted?.dispose()
      if (!face) {
        skinMaterial.dispose()
        skin.geometry.dispose()
      }
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
      renderer.dispose()
      el.remove()
    },
  }
}

const fmt = (v: number, d = 1) => (Math.abs(v) < 0.05 && d === 1 ? '0.0' : v.toFixed(d))

export default function BodyScan({
  build,
  hotspots,
  activeId,
  focusId,
  onPick,
  onOrgan,
  onInventory,
  organ = null,
  physiology,
  restingBpm,
  breathingRate,
  exerciseMotion = null,
  exerciseStartedAt,
  layer,
  onLayer,
  avatar = null,
  liveFace = null,
  calibration,
  initialView = 'full',
  studio = false,
  portraitOnly = false,
  backdrop,
  children,
  insetBottom = 24,
  pins = [],
  sideInset = 0,
  paused = false,
  pinAvoid,
}: Props) {
  const dimensions = useMannequinDimensions()
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const markers = useRef(new Map<string, HTMLElement>())
  const callouts = useRef(new Map<CalloutId, HTMLElement>())
  const pinNodes = useRef(new Map<string, HTMLElement>())
  const hoverLabel = useRef<HTMLDivElement>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const organRef = useRef(onOrgan)
  organRef.current = onOrgan
  const [credit, setCredit] = useState('')
  const [inventory, setInventory] = useState<string[]>([])
  useEffect(() => onInventory?.(inventory), [onInventory, inventory])
  const [depth, setDepth] = useState(0)
  const [motion, setMotion] = useState<Motion>(breathingRate ? 'breathing' : 'heart')

  // The heart beats with the webcam pulse when it is measuring, otherwise with the wearable feed.
  const pulse = usePulse()
  const liveBpm = pulse.phase === 'measuring' && pulse.bpm ? pulse.bpm : null
  const heart = useMemo<Heart>(
    () => ({
      bpm: liveBpm ?? restingBpm,
      live: liveBpm !== null,
      lastBeatAt: liveBpm !== null ? pulse.lastBeatAt : null,
    }),
    [liveBpm, restingBpm, pulse.lastBeatAt],
  )

  useEffect(() => {
    if (!host.current) return
    let s: Stage
    try {
      s = createStage(
        host.current,
        {
          markerOf: (id) => markers.current.get(id) ?? null,
          calloutOf: (id) => callouts.current.get(id) ?? null,
          pinOf: (id) => pinNodes.current.get(id) ?? null,
          hoverLabel: () => hoverLabel.current,
        },
        setCredit,
        setInventory,
        (id) => pickRef.current(id),
        (name) => organRef.current?.(name),
        !studio,
        portraitOnly,
      )
    } catch {
      setCredit('failed')
      return // No 3D support: the rest of the screen remains available.
    }
    stage.current = s
    return () => {
      s.dispose()
      stage.current = null
    }
  }, [studio, portraitOnly])

  useEffect(() => stage.current?.setBuild(build), [build, studio, portraitOnly])
  useEffect(() => stage.current?.setDimensions(dimensions), [dimensions, studio, portraitOnly])
  useEffect(() => stage.current?.setHotspots(hotspots), [hotspots, studio, portraitOnly])
  useEffect(() => stage.current?.setActive(activeId), [activeId, studio, portraitOnly])
  useEffect(() => stage.current?.setFocus(focusId), [focusId, studio, portraitOnly])
  useEffect(() => stage.current?.setOrgan(organ), [organ, studio, portraitOnly])
  useEffect(() => stage.current?.setLayer(layer), [layer, studio, portraitOnly])
  useEffect(() => stage.current?.setPhysiology(physiology), [physiology, studio, portraitOnly])
  useEffect(() => stage.current?.setHeart(heart), [heart, studio, portraitOnly])
  useEffect(() => stage.current?.setBreathingRate(breathingRate), [breathingRate, studio, portraitOnly])
  useEffect(
    () => stage.current?.setExerciseMotion(exerciseMotion, exerciseStartedAt),
    [exerciseMotion, exerciseStartedAt, studio, portraitOnly],
  )
  useEffect(() => stage.current?.setMotion(motion), [motion, studio, portraitOnly])
  useEffect(() => stage.current?.setAvatar(avatar), [avatar, studio, portraitOnly])
  useEffect(
    () => stage.current?.setFaceOptions(liveFace, calibration),
    [liveFace, calibration, studio, portraitOnly],
  )
  useEffect(() => stage.current?.setView(initialView), [initialView, studio, portraitOnly])
  // The stage only needs the ids, anchors and sides; the cards themselves are React children.
  const pinKey = JSON.stringify(pins.map((p) => [p.id, p.at, p.side ?? '']))
  const latestPins = useRef(pins)
  latestPins.current = pins
  useEffect(() => {
    stage.current?.setPins(latestPins.current.map(({ id, at, side }) => ({ id, at, side })))
  }, [pinKey, studio, portraitOnly])
  useEffect(() => stage.current?.setSideInset(sideInset), [sideInset, studio, portraitOnly])
  useEffect(() => stage.current?.setPaused(paused), [paused, studio, portraitOnly])
  const avoidRight = pinAvoid?.right ?? 0
  const avoidBottom = pinAvoid?.bottom ?? 0
  useEffect(
    () => stage.current?.setPinBounds(insetBottom, { right: avoidRight, bottom: avoidBottom }),
    [insetBottom, avoidRight, avoidBottom, studio, portraitOnly],
  )

  const goDepth = (d: number, fly: boolean) => {
    if (layer !== 'signals') onLayer('signals')
    setDepth(d)
    stage.current?.setDepth(d, fly)
  }
  const stopAt = Math.round(depth)
  const maxDepth = DEPTH_STOPS.length - 1
  const shortcuts = layer === 'signals' && stopAt === 2 && onOrgan && (
    <>
      {inventory.some((name) => name.includes('lung')) && (
        <button
          type="button"
          onClick={() => onOrgan('lungs')}
          aria-pressed={organ === 'lungs'}
          className="press shrink-0 rounded-full bg-black/65 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/20"
        >
          Show lungs
        </button>
      )}
      <button
        type="button"
        onClick={() => onOrgan('heart')}
        aria-pressed={organ === 'heart'}
        className="press shrink-0 rounded-full bg-black/65 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-md hover:bg-white/20"
      >
        Show heart
      </button>
    </>
  )
  const system = (['skin', 'vessels', 'organs', 'skeleton'] as const)[stopAt]
  const choices = system === 'skin' ? [] : anatomyChoices(inventory, system)
  const explorer = choices.length > 0 && layer === 'signals' && onOrgan && (
    <select
      aria-label="Explore anatomy"
      value={organ && choices.includes(organ) ? organ : ''}
      onChange={(event) => onOrgan(event.target.value || null)}
      className="mt-1 max-w-full rounded-md bg-[#202226] px-2 py-1.5 text-[13px] text-white"
    >
      <option value="">Explore {DEPTH_STOPS[stopAt].toLowerCase()}…</option>
      {choices.map((name) => (
        <option key={name} value={name}>
          {organNote(name).name}
        </option>
      ))}
    </select>
  )

  const calloutData: { id: CalloutId; label: string; value: string; detail: string }[] = [
    {
      id: 'fluid',
      label: 'Fluid toward the head',
      value: `+${fmt(physiology.fluidShiftL)} L`,
      detail: `${Math.round(physiology.fluidShiftShare * 100)}% of the weightless shift`,
    },
    {
      id: 'heart',
      label: heart.live ? 'Heart rate, webcam' : 'Heart rate, simulated',
      value: `${Math.round(heart.bpm)} bpm`,
      detail: heart.live ? 'Measured from your face' : 'Wearable feed',
    },
    {
      id: 'bone',
      label: 'Hip and spine bone',
      value: `${fmt(physiology.bonePct - 100)}%`,
      detail: 'Density since scenario start',
    },
    {
      id: 'muscle',
      label: 'Calf muscle',
      value: `${fmt(physiology.musclePct - 100)}%`,
      detail: 'Volume since scenario start',
    },
  ]

  return (
    <div
      ref={host}
      className="scene body-stage relative h-full w-full"
      role="group"
      aria-label={
        portraitOnly
          ? '3D head preview'
          : studio
            ? 'Connected face and body preview. Drag to turn; use Head or Whole body to check the fit.'
            : exerciseMotion
              ? 'Exercise demonstration. Drag to turn the body.'
              : 'Body view. Use the depth control to go under the skin, then click an organ to highlight it.'
      }
    >
      {backdrop && (
        <img
          key={backdrop.src}
          src={backdrop.src}
          alt=""
          aria-hidden="true"
          className="scene-photo pointer-events-none blur-[4px] scale-[1.035]"
          style={{ objectPosition: backdrop.position ?? '50% 50%' }}
        />
      )}
      {/* Darker at the edges where the type sits, clear around the body. */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 34% 60% at 50% 55%, transparent 0%, rgb(7 8 10 / 0.25) 60%, rgb(7 8 10 / 0.7) 100%), linear-gradient(0deg, rgb(13 15 18 / 0.95) 0%, transparent 30%), linear-gradient(180deg, rgb(7 8 10 / 0.6) 0%, transparent 22%)',
        }}
        aria-hidden="true"
      />

      {layer === 'signals' &&
        depth === 0 &&
        !organ &&
        hotspots.map((h) => {
          const flag = h.level !== 'ok'
          const active = h.id === activeId
          return (
            <button
              key={h.id}
              ref={(node) => {
                if (node) markers.current.set(h.id, node)
                else markers.current.delete(h.id)
              }}
              onClick={() => onPick(h.id)}
              aria-label={`${h.label}: ${h.level === 'ok' ? 'normal' : h.level === 'watch' ? 'needs a check' : 'urgent'}`}
              aria-pressed={active}
              className="group absolute top-0 left-0 z-[3] -mt-[22px] -ml-[22px] flex h-11 w-11 items-center justify-center"
            >
              {flag && (
                <span
                  className={`marker-ring absolute h-3.5 w-3.5 rounded-full border ${h.level === 'act' ? 'border-urgent' : 'border-check'}`}
                />
              )}
              <span
                className={`relative rounded-full border-2 shadow-[0_1px_4px_rgb(0_0_0/0.6)] transition-transform duration-150 group-hover:scale-125 ${flag ? 'h-3 w-3' : 'h-2.5 w-2.5'} ${MARKER[h.level]} ${active ? 'scale-150' : ''}`}
              />
              <span
                className={`on-photo pointer-events-none absolute text-[14px] font-medium whitespace-nowrap transition-opacity ${LABEL_LEFT.has(h.id) ? 'right-9' : 'left-9'} ${(flag || active) && !h.quiet ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'} ${h.level === 'act' ? 'text-urgent' : h.level === 'watch' ? 'text-check' : 'text-white'}`}
              >
                {h.label}
              </span>
            </button>
          )
        })}

      {!exerciseMotion &&
        layer === 'physiology' &&
        calloutData.map((c) => {
          const left = CALLOUT_LEFT.has(c.id)
          return (
            <div
              key={c.id}
              ref={(node) => {
                if (node) callouts.current.set(c.id, node)
                else callouts.current.delete(c.id)
              }}
              className="pointer-events-none absolute top-0 left-0 z-[3]"
            >
              <span className="absolute -mt-[4px] -ml-[4px] h-2 w-2 rounded-full bg-white shadow-[0_0_0_3px_rgb(0_0_0/0.35)]" />
              <span className={`absolute top-0 h-px w-16 bg-white/80 ${left ? 'right-1' : 'left-1'}`} />
              <div
                className={`on-photo absolute -top-5 w-max ${left ? 'right-[4.6rem] text-right' : 'left-[4.6rem]'}`}
              >
                <p className="font-cond text-[13px] text-white/75">{c.label}</p>
                <p className="font-cond text-[26px] leading-none font-medium text-white tabular-nums">
                  {c.value}
                </p>
                <p className="mt-0.5 text-[12px] text-white/65">{c.detail}</p>
              </div>
            </div>
          )
        })}

      {layer === 'signals' &&
        pins.map((p) => (
          <div
            key={p.id}
            ref={(node) => {
              if (node) pinNodes.current.set(p.id, node)
              else pinNodes.current.delete(p.id)
            }}
            className="body-pin pointer-events-none absolute top-0 left-0 z-[5]"
            style={{ visibility: 'hidden', color: p.tone }}
          >
            <span className="body-pin-lead" aria-hidden="true" />
            <div className="body-pin-card pointer-events-auto">{p.children}</div>
          </div>
        ))}

      {/* The organ name under the pointer, placed by the stage. */}
      <div
        ref={hoverLabel}
        className="on-photo pointer-events-none absolute top-0 left-0 z-[6] rounded-full bg-black/55 px-3 py-1 text-[14px] font-medium text-white opacity-0 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {(credit === '' || credit === 'failed') && (
        <p
          className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center px-8 text-center text-white"
          role="status"
        >
          {portraitOnly
            ? credit === 'failed'
              ? '3D preview unavailable. You can continue to your dashboard.'
              : 'Loading your 3D head…'
            : credit === ''
              ? 'Bringing in the 3D body…'
              : 'The 3D body could not be loaded. The signals list still works.'}
        </p>
      )}

      {/* Keep layer controls clear of the crew information on the left of the scene. */}
      {!studio && !exerciseMotion && (
        <div className="absolute top-24 right-4 z-[7] hidden w-[310px] rounded-2xl bg-black/45 p-3 text-white backdrop-blur-md sm:block lg:right-8">
          <div className="flex items-center justify-between text-[13px] text-white/75">
            Depth <span>{DEPTH_STOPS[stopAt]}</span>
          </div>
          <input
            className="range mt-1 w-full"
            type="range"
            aria-label="Depth"
            min={0}
            max={maxDepth}
            step={0.1}
            value={depth}
            style={{ '--fill': `${(depth / maxDepth) * 100}%` } as CSSProperties}
            aria-valuetext={DEPTH_STOPS[stopAt]}
            onChange={(e) => goDepth(Number(e.target.value), false)}
            onPointerUp={() => goDepth(Math.round(depth), true)}
          />
          <div className="flex gap-1">
            {DEPTH_STOPS.map((label, i) => (
              <button
                key={label}
                onClick={() => goDepth(i, true)}
                aria-pressed={stopAt === i && layer === 'signals'}
                className={`press min-h-9 flex-1 rounded-full px-2 text-[13px] ${stopAt === i && layer === 'signals' ? 'bg-white text-[#0d0f12]' : 'text-white/65 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {explorer}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-white/10 pt-2">
            {shortcuts || (
              <p className="text-[12px] text-white/65">
                {depth < 0.5 ? 'Point at the body to look inside.' : 'Select a structure to look closer.'}
              </p>
            )}
            <button
              onClick={() => onLayer(layer === 'physiology' ? 'signals' : 'physiology')}
              aria-pressed={layer === 'physiology'}
              className="press shrink-0 rounded-full px-2 py-1.5 text-[12px] text-white/80 hover:bg-white/10"
            >
              Mission effects
            </button>
          </div>
        </div>
      )}

      {/* Phones: credits and depth controls share normal flow above the measured gauges. */}
      {!studio && !exerciseMotion && !organ && (
        <div
          className="pointer-events-none absolute inset-x-3 z-[6] flex flex-col items-start gap-2 sm:hidden"
          style={{ bottom: insetBottom + 8 }}
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-1">
            {DEPTH_STOPS.map((label, i) => (
              <button
                key={label}
                onClick={() => goDepth(i, true)}
                aria-pressed={stopAt === i && layer === 'signals'}
                className={`press shrink-0 rounded-full px-2 py-1.5 text-[13px] font-medium ${stopAt === i && layer === 'signals' ? 'bg-white text-[#0d0f12]' : 'bg-black/45 text-white backdrop-blur-md'}`}
              >
                {label}
              </button>
            ))}
            {shortcuts}
            {explorer}
          </div>
        </div>
      )}

      {!portraitOnly && !exerciseMotion && (
        <div
          className={
            studio
              ? 'absolute inset-x-3 bottom-20 z-[5] flex flex-col items-center gap-3'
              : 'absolute top-1/2 right-4 z-[5] hidden -translate-y-1/2 flex-col items-end gap-3 sm:flex lg:right-8'
          }
        >
          {!studio && (
            <Segmented
              size="sm"
              label="Body motion"
              value={motion}
              onChange={setMotion}
              className="bg-black/40 backdrop-blur-md"
              options={[
                { id: 'still', label: 'Still' },
                { id: 'heart', label: 'Heartbeat' },
                { id: 'breathing', label: 'Breathing' },
              ]}
            />
          )}
          {!studio && motion === 'breathing' && (
            <p className="max-w-[15rem] rounded-lg bg-black/65 px-3 py-1.5 text-right text-[13px] text-white">
              {breathingRate
                ? `Last webcam estimate · ${Math.round(breathingRate)} breaths/min`
                : 'Measure your breathing to animate the chest.'}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-1.5">
            {studio &&
              [-35, 35].map((degrees) => (
                <button
                  key={degrees}
                  aria-label={degrees < 0 ? 'View left cheek' : 'View right cheek'}
                  onClick={() => stage.current?.setView('head', THREE.MathUtils.degToRad(degrees))}
                  className="press h-9 rounded-full bg-black/40 px-3 text-[13px] text-white/80 backdrop-blur-md hover:text-white"
                >
                  {degrees < 0 ? 'Left ¾' : 'Right ¾'}
                </button>
              ))}
            {(studio ? (['head', 'full'] as const) : (['head', 'chest', 'full'] as const)).map((view) => (
              <button
                key={view}
                onClick={() => stage.current?.setView(view)}
                className="press h-9 rounded-full bg-black/40 px-3.5 text-[13px] text-white/80 backdrop-blur-md hover:text-white"
              >
                {view === 'full' ? 'Whole body' : view === 'head' ? 'Head' : 'Chest'}
              </button>
            ))}
            <button
              onClick={() => stage.current?.zoomBy(1.4)}
              aria-label="Zoom in"
              className="press flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-md hover:text-white"
            >
              <Plus size={15} />
            </button>
            <button
              onClick={() => stage.current?.zoomBy(1 / 1.4)}
              aria-label="Zoom out"
              className="press flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-md hover:text-white"
            >
              <Minus size={15} />
            </button>
          </div>
        </div>
      )}

      {children}

      {/* The model and photo credits are in the README and docs/CREDITS.md, not over the scene. */}
      {!exerciseMotion && layer === 'physiology' && (
        <p
          className="on-photo pointer-events-none absolute right-4 z-[5] max-w-[46ch] text-right text-[11.5px] leading-snug text-white/60 lg:right-8"
          style={{ bottom: insetBottom }}
        >
          Face and leg change exaggerated about tenfold.
        </p>
      )}
    </div>
  )
}
