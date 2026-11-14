import * as THREE from 'three'
import { FACE_VERTEX_COUNT, faceIndices, writeFaceSurface, type FaceEdge, type FacePoint } from './faceMesh'

/** Face height in scene units once framed. The camera sees about 1.6 units at its distance. */
const FACE_HEIGHT = 1.22
/** Share of the remaining framing distance covered per rendered frame. */
const FRAMING_EASE = 0.14

/**
 * Owns GPU resources only. The camera and the face model live in the shared pulse session;
 * this draws the 468-point face surface with the live video as its texture, kept centred and
 * at a steady size so small head movements do not make it jump around the stage.
 */
export function createFaceStage(host: HTMLDivElement, video: HTMLVideoElement, edges: FaceEdge[]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20)
  camera.position.z = 3

  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(FACE_VERTEX_COUNT * 3)
  const uvs = new Float32Array(FACE_VERTEX_COUNT * 2)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(faceIndices(edges))

  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  const skin = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  // Hologram mesh drawn over the skin when the wireframe is on.
  const wire = new THREE.MeshBasicMaterial({
    color: 0x5cc8e8,
    wireframe: true,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const face = new THREE.Group()
  const surface = new THREE.Mesh(geometry, skin)
  const mesh = new THREE.Mesh(geometry, wire)
  surface.frustumCulled = false
  mesh.frustumCulled = false
  mesh.visible = false
  mesh.renderOrder = 1
  face.add(surface, mesh)
  face.visible = false
  scene.add(face)

  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)
  const resize = () => {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  const center = new THREE.Vector3()
  const target = new THREE.Vector3()
  let scale = 1
  let targetScale = 1
  let framed = false

  return {
    update(points?: FacePoint[]) {
      face.visible = Boolean(points)
      if (!points || !video.videoWidth || !video.videoHeight) return
      writeFaceSurface(points, video.videoWidth / video.videoHeight, positions, uvs)
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      let z = 0
      for (let i = 0; i < FACE_VERTEX_COUNT; i++) {
        const x = positions[i * 3]
        const y = positions[i * 3 + 1]
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
        z += positions[i * 3 + 2]
      }
      target.set((minX + maxX) / 2, (minY + maxY) / 2, z / FACE_VERTEX_COUNT)
      targetScale = FACE_HEIGHT / Math.max(maxY - minY, 1e-3)
      if (!framed) {
        center.copy(target)
        scale = targetScale
        framed = true
      }
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.uv.needsUpdate = true
    },
    setWireframe(value: boolean) {
      mesh.visible = value
      skin.color.setScalar(value ? 0.42 : 1)
    },
    render() {
      center.lerp(target, FRAMING_EASE)
      scale += (targetScale - scale) * FRAMING_EASE
      face.scale.setScalar(scale)
      face.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
      renderer.render(scene, camera)
    },
    dispose() {
      observer.disconnect()
      geometry.dispose()
      texture.dispose()
      skin.dispose()
      wire.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
