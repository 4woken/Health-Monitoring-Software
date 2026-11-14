import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { writeProfileUV } from './profileTexture'
import { portraitEyePatches } from './portraitEyes'
import { refinePortraitSkin } from './refinePortraitSkin'
import { applySkinShading, setSkinFinish } from '../appearance/skinSurface'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { faceContours, faceIndices } from '../../camera/face/faceMesh'
import {
  faceCalibration,
  normaliseFace,
  type AvatarCapture,
  type PortraitView,
  type FaceCalibration,
} from '../../camera/face/portrait'
import type { LiveFaceFrame } from '../../camera/face/liveFace'
import referenceHeads from './referenceHeads.json'
import type { Body } from '../anatomy/loadAnatomy'
import {
  bindFaceToHead,
  bindPortraitNormals,
  updateFaceUV,
  fitHeadSurface,
  registeredHeadTemplate,
  type FaceBinding,
  type HeadFrame,
} from './headFit'

const triangles = faceIndices(FaceLandmarker.FACE_LANDMARKS_TESSELATION)
const oval = faceContours(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL)[0]
const holes = [
  ...faceContours(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE),
  ...faceContours(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE),
  ...faceContours(FaceLandmarker.FACE_LANDMARKS_LIPS),
]
const DEFAULT_SKIN = new THREE.Color('#c79e83')
// Median sRGB of the two 8 mm cheek patches in each neutral UV texture,
// sampled at the same MediaPipe points (50 and 280) as the camera.
const ALBEDO_CHEEKS = { male: new THREE.Color(0xe39b6b), female: new THREE.Color(0xe3a883) }

/** One continuous skin mesh: a portrait is projected onto its head, never placed in front of it. */
export function createPersonalFace(
  reference: Body,
  options: { patch?: (shader: THREE.WebGLProgramParametersWithUniforms) => void } = {},
) {
  const eyes = (reference.eyeSockets ?? reference.organs.filter((o) => o.name.includes('eyeball'))).map(
    (o) => o.center,
  )
  const center =
    eyes.length === 2
      ? eyes.reduce((v, p) => v.add(new THREE.Vector3(...p)), new THREE.Vector3()).multiplyScalar(0.5)
      : new THREE.Vector3(0, reference.height * 0.928, 0.06)
  const head: HeadFrame = {
    x: center.x,
    y: center.y,
    eyeDistance: eyes.length === 2 ? Math.abs(eyes[0][0] - eyes[1][0]) : 0.064,
    eyeZ: center.z,
  }
  const eyePatches = portraitEyePatches(reference.build, reference.referenceHead?.eyeOpenings)
  const skin = refinePortraitSkin(reference.skin, head)
  const skinVertexCount = skin.getAttribute('position').count
  // Eye caps carry the projected portrait only. Keep every attribute aligned
  // when merging them with a UV-mapped body and its normalized region weights.
  for (const patch of eyePatches) {
    const count = patch.getAttribute('position').count
    if (skin.hasAttribute('uv'))
      patch.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    if (skin.hasAttribute('skinDetail'))
      patch.setAttribute('skinDetail', new THREE.BufferAttribute(new Uint8Array(count * 4), 4, true))
  }
  const geometry = mergeGeometries([skin, ...eyePatches])!
  // Some offline tools still pass plain, unbaked reference geometries.
  if (!geometry.hasAttribute('skinDetail'))
    geometry.setAttribute(
      'skinDetail',
      new THREE.BufferAttribute(new Uint8Array(geometry.getAttribute('position').count * 4), 4, true),
    )
  skin.dispose()
  eyePatches.forEach((patch) => patch.dispose())
  const base = Float32Array.from(geometry.attributes.position.array),
    baseNormals = Float32Array.from(geometry.attributes.normal.array)
  const uv = new Float32Array((base.length / 3) * 2),
    weights = new Float32Array(base.length / 3)
  geometry.setAttribute('portraitUv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('portraitWeight', new THREE.BufferAttribute(weights, 1))
  const profileUV = new Float32Array((base.length / 3) * 4),
    profileMix = new Float32Array((base.length / 3) * 2)
  geometry.setAttribute('profileUV', new THREE.BufferAttribute(profileUV, 4))
  geometry.setAttribute('profileMix', new THREE.BufferAttribute(profileMix, 2))
  const eyeMask = new Float32Array(base.length / 3)
  eyeMask.fill(1, skinVertexCount)
  geometry.setAttribute('portraitEye', new THREE.BufferAttribute(eyeMask, 1))
  const placeholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  placeholder.needsUpdate = true
  const uniforms = {
    uPortraitMap: { value: placeholder as THREE.Texture },
    uPortraitEnabled: { value: 0 },
    uLeftMap: { value: placeholder as THREE.Texture },
    uRightMap: { value: placeholder as THREE.Texture },
    uProfileReady: { value: new THREE.Vector2() },
    uLeftGain: { value: new THREE.Color(1, 1, 1) },
    uRightGain: { value: new THREE.Color(1, 1, 1) },
  }
  const baseColor = reference.albedo ? new THREE.Color(0xffffff) : DEFAULT_SKIN
  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    map: reference.albedo ?? null,
    roughness: 0.67,
    metalness: 0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.7,
    side: THREE.DoubleSide,
  })
  setSkinFinish(material)
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader =
      'attribute vec2 portraitUv; attribute float portraitWeight; attribute float portraitEye; attribute vec4 profileUV; attribute vec2 profileMix; varying vec4 vProfileUV; varying vec2 vProfileMix; varying vec2 vPortraitUv; varying float vPortraitWeight; varying float vPortraitEye;\n' +
      shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vPortraitUv=portraitUv*portraitWeight; vPortraitWeight=portraitWeight; vPortraitEye=portraitEye; vProfileUV=profileUV*profileMix.xxyy; vProfileMix=profileMix;',
    )
    shader.fragmentShader =
      'varying vec2 vPortraitUv; varying float vPortraitWeight; varying float vPortraitEye; varying vec4 vProfileUV; varying vec2 vProfileMix; uniform vec2 uProfileReady; uniform sampler2D uLeftMap, uRightMap, uPortraitMap; uniform vec3 uLeftGain, uRightGain; uniform float uPortraitEnabled;\n' +
      shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
        if(vPortraitEye > 0.5 && uPortraitEnabled < 0.5) discard;
        if (uPortraitEnabled > 0.5 && vPortraitWeight > 0.0) {
          vec2 w = uProfileReady * vProfileMix;
          vec3 color = texture2D(uPortraitMap, vPortraitUv/max(vPortraitWeight,0.00001)).rgb * (1.0 - w.x - w.y);
          if (w.x > 0.00001) color += texture2D(uLeftMap, vProfileUV.xy/w.x).rgb * uLeftGain * w.x;
          if (w.y > 0.00001) color += texture2D(uRightMap, vProfileUV.zw/w.y).rgb * uRightGain * w.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, color, clamp(vPortraitWeight,0.0,1.0));
        }`,
    )
    applySkinShading(shader)
    options.patch?.(shader)
  }
  material.customProgramCacheKey = () => 'three-view-portrait-skin-v2'
  const referenceFace = reference.referenceHead ?? referenceHeads[reference.build]
  const template = registeredHeadTemplate(referenceFace.points, head)
  const restShape = template.map((p, i) => ({ ...p, z: referenceFace.normalised[i].z }))

  let disposed = false,
    visible = true,
    photo: AvatarCapture | null = null,
    photoTexture: THREE.Texture | null = null,
    photoImage: HTMLImageElement | null = null
  let videoTexture: THREE.CanvasTexture | null = null,
    sourceVideo: HTMLCanvasElement | null = null,
    kind: 'none' | 'photo' | 'video' = 'none',
    lastFrame = -1
  let lastCalibration: FaceCalibration | undefined
  let bindings: FaceBinding[] = []
  let updateNormals: ReturnType<typeof bindPortraitNormals> | undefined
  const profileMaps = [uniforms.uLeftMap, uniforms.uRightMap]
  const profileGains = [uniforms.uLeftGain.value, uniforms.uRightGain.value]
  const profileImages: (HTMLImageElement | null)[] = [null, null]
  const profileUrls: (string | undefined)[] = [undefined, undefined]
  const releaseProfile = (i: number) => {
    const img = profileImages[i]
    if (img) img.onload = null
    if (profileMaps[i].value !== placeholder) profileMaps[i].value.dispose()
    profileMaps[i].value = placeholder
    profileImages[i] = null
    profileUrls[i] = undefined
    uniforms.uProfileReady.value.setComponent(i, 0)
  }
  const setProfile = (i: number, view?: PortraitView) => {
    const tone = photo?.skinTone,
      sideTone = view?.skinTone,
      gain = profileGains[i]
    gain.setRGB(1, 1, 1)
    if (tone && sideTone) {
      // Correct modest exposure changes, retaining real skin variation between views.
      const linear = (n: number) =>
        new THREE.Color().setRGB(n / 255, n / 255, n / 255, THREE.SRGBColorSpace).r
      gain.fromArray(
        tone.map((n, c) =>
          THREE.MathUtils.clamp(linear(n) / Math.max(0.01, linear(sideTone[c])), 0.76, 1.32),
        ),
      )
    }
    if (view?.imageUrl === profileUrls[i]) return
    releaseProfile(i)
    if (!view) return
    const image = new Image(),
      texture = new THREE.Texture(image)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    profileUrls[i] = view.imageUrl
    profileImages[i] = image
    profileMaps[i].value = texture
    image.onload = () => {
      texture.needsUpdate = true
      if (!disposed && kind === 'photo') uniforms.uProfileReady.value.setComponent(i, 1)
    }
    image.src = view.imageUrl
  }
  const bind = (
    capture: Pick<AvatarCapture, 'points' | 'width' | 'height'>,
    adjustment?: FaceCalibration,
  ) => {
    const face = template
    // MediaPipe omits the interiors of eyes and lips from its tessellation.
    // Fill them for texture projection so the reference head does not show through.
    const filled = holes.flatMap((ring) =>
      THREE.ShapeUtils.triangulateShape(
        ring.map((i) => new THREE.Vector2(face[i].x, face[i].y)),
        [],
      ).flatMap((triangle) => triangle.map((i) => ring[i])),
    )
    bindings = bindFaceToHead(base, face, [...triangles, ...filled], oval, head, adjustment)
    updateNormals = bindPortraitNormals(base, baseNormals, geometry.getIndex()!.array, bindings)
    weights.fill(0)
    for (const b of bindings) weights[b.vertex] = b.feather
    geometry.attributes.portraitWeight.needsUpdate = true
    updateFaceUV(bindings, capture.points, uv)
    geometry.attributes.portraitUv.needsUpdate = true
    lastCalibration = adjustment
  }
  const deform = (
    capture: Pick<AvatarCapture, 'points' | 'width' | 'height' | 'surface'>,
    adjustment?: FaceCalibration,
  ) => {
    fitHeadSurface(
      base,
      geometry.attributes.position.array as Float32Array,
      bindings,
      restShape,
      capture.surface ?? normaliseFace(capture.points, capture.width, capture.height),
      head,
      adjustment,
      Boolean(capture.surface),
    )
    geometry.attributes.position.needsUpdate = true
    updateNormals?.(
      geometry.attributes.position.array as Float32Array,
      geometry.attributes.normal.array as Float32Array,
    )
    geometry.attributes.normal.needsUpdate = true
  }
  const tint = (tone: AvatarCapture['skinTone'], adjustment?: FaceCalibration) => {
    material.color.copy(baseColor)
    if (tone?.every(Number.isFinite)) {
      const colour = new THREE.Color().setRGB(
        tone[0] / 255,
        tone[1] / 255,
        tone[2] / 255,
        THREE.SRGBColorSpace,
      )
      if (reference.albedo) {
        // Albedo already contains skin colour; apply a bounded change relative
        // to the base tone so its natural variations survive the colour match.
        const cheek = ALBEDO_CHEEKS[reference.build]
        colour.setRGB(
          THREE.MathUtils.clamp(colour.r / cheek.r, 0.025, 3),
          THREE.MathUtils.clamp(colour.g / cheek.g, 0.025, 3),
          THREE.MathUtils.clamp(colour.b / cheek.b, 0.025, 3),
        )
      }
      material.color.lerp(colour, faceCalibration(adjustment).skinMatch)
    }
  }
  const showPhoto = () => {
    kind = photo ? 'photo' : 'none'
    uniforms.uProfileReady.value.set(0, 0)
    if (photo) {
      bind(photo, photo.calibration)
      if (photo.sideViews) {
        writeProfileUV(bindings, template, photo, photo.sideViews, profileUV, profileMix)
        geometry.attributes.profileUV.needsUpdate = true
        geometry.attributes.profileMix.needsUpdate = true
        profileImages.forEach((image, i) => {
          if (image?.complete && image.naturalWidth) uniforms.uProfileReady.value.setComponent(i, 1)
        })
      }
      deform(photo, photo.calibration)
      tint(photo.skinTone, photo.calibration)
      uniforms.uPortraitMap.value = photoTexture ?? placeholder
    } else {
      weights.fill(0)
      geometry.attributes.portraitWeight.needsUpdate = true
      ;(geometry.attributes.position.array as Float32Array).set(base)
      geometry.attributes.position.needsUpdate = true
      ;(geometry.attributes.normal.array as Float32Array).set(baseNormals)
      geometry.attributes.normal.needsUpdate = true
      material.color.copy(baseColor)
    }
    uniforms.uPortraitEnabled.value =
      visible && photo && photoImage?.complete && photoImage.naturalWidth > 0 ? 1 : 0
  }
  return {
    geometry,
    material,
    get portraitVisible() {
      return uniforms.uPortraitEnabled.value > 0
    },
    setPortrait(value: AvatarCapture | null) {
      const sameImage = value?.imageUrl === photo?.imageUrl
      photo = value
      setProfile(0, value?.sideViews?.left)
      setProfile(1, value?.sideViews?.right)
      if (!sameImage) {
        if (photoImage) photoImage.onload = null
        photoTexture?.dispose()
        photoTexture = null
        photoImage = null
        if (value) {
          const image = new Image(),
            texture = new THREE.Texture(image)
          texture.colorSpace = THREE.SRGBColorSpace
          texture.minFilter = THREE.LinearFilter
          texture.generateMipmaps = false
          photoImage = image
          photoTexture = texture
          image.onload = () => {
            if (disposed) return
            texture.needsUpdate = true
            if (kind !== 'video') showPhoto()
          }
          image.src = value.imageUrl
        }
      }
      if (kind !== 'video') showPhoto()
    },
    updateLive(frame: LiveFaceFrame | null, adjustment?: FaceCalibration) {
      if (!frame) {
        if (kind === 'video') {
          showPhoto()
          lastFrame = -1
        }
        return
      }
      const newSource = sourceVideo !== frame.source
      if (newSource) {
        videoTexture?.dispose()
        sourceVideo = frame.source
        videoTexture = new THREE.CanvasTexture(frame.source)
        videoTexture.colorSpace = THREE.SRGBColorSpace
      }
      const adjusted = lastCalibration !== adjustment
      if (kind !== 'video' || newSource || adjusted) bind(frame, adjustment)
      kind = 'video'
      uniforms.uProfileReady.value.set(0, 0)
      if (lastFrame !== frame.id) {
        updateFaceUV(bindings, frame.points, uv)
        geometry.attributes.portraitUv.needsUpdate = true
        videoTexture!.needsUpdate = true
        deform(frame, adjustment)
        lastFrame = frame.id
        tint(frame.skinTone, adjustment)
      } else if (adjusted) {
        deform(frame, adjustment)
        tint(frame.skinTone, adjustment)
      }
      uniforms.uPortraitMap.value = videoTexture!
      uniforms.uPortraitEnabled.value = visible ? 1 : 0
    },
    setVisible(value: boolean) {
      visible = value
      uniforms.uPortraitEnabled.value =
        visible &&
        (kind === 'video' || (kind === 'photo' && photoImage?.complete && photoImage.naturalWidth > 0))
          ? 1
          : 0
    },
    dispose() {
      disposed = true
      releaseProfile(0)
      releaseProfile(1)
      if (photoImage) photoImage.onload = null
      photoTexture?.dispose()
      videoTexture?.dispose()
      placeholder.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
