import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { RowingContacts } from './rowing'

const axisY = new Vector3(0, 1, 0)
const referenceHeight = 1.75

function assembly(parent: Group, name: string) {
  const part = new Group()
  part.name = name
  parent.add(part)
  return part
}

function mount(parent: Group, geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0) {
  const part = new Mesh(geometry, material)
  part.position.set(x, y, z)
  parent.add(part)
  return part
}

const block = (x: number, y: number, z: number, radius: number) => new RoundedBoxGeometry(x, y, z, 2, radius)
const cylinder = (radius: number, length: number, sides = 24) =>
  new CylinderGeometry(radius, radius, length, sides)
const axle = (radius: number, length: number, sides = 24) =>
  cylinder(radius, length, sides).rotateZ(Math.PI / 2)

function strut(parent: Group, a: Vector3, b: Vector3, radius: number, material: Material) {
  const direction = b.clone().sub(a)
  const beam = mount(parent, cylinder(radius, direction.length(), 12), material)
  beam.position.copy(a).lerp(b, 0.5)
  beam.quaternion.setFromUnitVectors(axisY, direction.normalize())
}

/** Batch the fabricated pieces of each rigid assembly, preserving the individual
 * moving groups for the seat, rotor, grips and foot stretchers. */
function batchPart(group: Group) {
  const sections = new Map<Material, BufferGeometry[]>()
  for (const part of [...group.children]) {
    if (!(part instanceof Mesh)) continue
    part.updateMatrix()
    const original: BufferGeometry = part.geometry
    const shape = original.index ? original.toNonIndexed() : original
    shape.applyMatrix4(part.matrix)
    if (shape !== original) original.dispose()
    const shapes = sections.get(part.material) ?? []
    shapes.push(shape)
    sections.set(part.material, shapes)
    group.remove(part)
  }
  for (const [material, shapes] of sections) {
    if (shapes.length === 1) mount(group, shapes[0], material)
    else {
      mount(group, mergeGeometries(shapes)!, material)
      for (const shape of shapes) shape.dispose()
    }
  }
}

function instepStrap() {
  // The forward edge sits lower on the toe box than the rear edge.
  const shape = new Shape()
  shape.moveTo(-0.064, 0)
  shape.bezierCurveTo(-0.062, 0.062, -0.042, 0.08, 0, 0.08)
  shape.bezierCurveTo(0.042, 0.08, 0.062, 0.062, 0.064, 0)
  shape.lineTo(0.058, 0)
  shape.bezierCurveTo(0.057, 0.056, 0.038, 0.075, 0, 0.075)
  shape.bezierCurveTo(-0.038, 0.075, -0.057, 0.056, -0.058, 0)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: 0.037, curveSegments: 12, bevelEnabled: false })
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const slope = 1 - (positions.getZ(i) / 0.037) * 0.15
    positions.setY(i, positions.getY(i) * slope)
  }
  geometry.computeVertexNormals()
  return geometry
}

function heelCup() {
  // A U-shaped lip leaves the toe end open for the shoe to slide under the strap.
  const shape = new Shape()
  shape.moveTo(-0.063, -0.058)
  shape.lineTo(-0.063, 0)
  shape.bezierCurveTo(-0.063, 0.035, 0.063, 0.035, 0.063, 0)
  shape.lineTo(0.063, -0.058)
  shape.lineTo(0.055, -0.058)
  shape.lineTo(0.055, 0)
  shape.bezierCurveTo(0.055, 0.023, -0.055, 0.023, -0.055, 0)
  shape.lineTo(-0.055, -0.058)
  shape.closePath()
  return new ExtrudeGeometry(shape, {
    depth: 0.042,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 2,
    curveSegments: 10,
  }).rotateX(-Math.PI / 2)
}

/** An unthreaded tail starts at each buckle. Its fixed-length segments drape
 * under gravity. Cabin airflow gives the unloaded webbing a small, slow curl. */
function createStrapTail(root: Group, side: number, fabric: Material) {
  const segments = 12
  const widths = [-1, -0.8, 0.8, 1]
  const pos = new Float32BufferAttribute(new Float32Array((segments + 1) * widths.length * 3), 3)
  pos.setUsage(DynamicDrawUsage)
  const colors: number[] = [],
    triangles: number[] = []
  const amber = new Color(0xf79c45),
    seam = new Color(0x9b572d),
    stitch = new Color(0xffdda2)
  for (let i = 0; i <= segments; i++) {
    widths.forEach((width, j) => {
      const tone = Math.abs(width) === 1 ? seam : i === segments - 1 ? stitch : amber
      colors.push(tone.r, tone.g, tone.b)
      if (i === 0 || j === 0) return
      const end = i * widths.length + j
      triangles.push(end - 5, end - 1, end, end - 5, end, end - 4)
    })
  }
  const geometry = new BufferGeometry()
  geometry.setIndex(triangles)
  geometry.setAttribute('position', pos)
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  const mesh = mount(root, geometry, fabric)
  mesh.name = side < 0 ? 'Free strap left' : 'Free strap right'
  // Horizontal/vertical flex does not change the total reach from the buckle.
  mesh.frustumCulled = false
  const center = new Vector3(),
    tangent = new Vector3(),
    cross = new Vector3()
  let previousGravity = NaN,
    previousTime = NaN
  return (foot: Group, gravity: number, elapsed: number, reduce: boolean) => {
    mesh.position
      .set(side * 0.071, 0.024, 0.15)
      .applyQuaternion(foot.quaternion)
      .add(foot.position)
    const time = reduce ? 0 : elapsed
    if (gravity === previousGravity && time === previousTime) return
    previousGravity = gravity
    previousTime = time
    // Normalize the response to 1 g. The shape is illustrative, independent of
    // the cord tension and the footwear restraints.
    const drop = Math.min(1, (1 - Math.exp(-2 * Math.max(0, gravity))) / (1 - Math.exp(-2)))
    center.set(0, 0, 0)
    for (let i = 0; i <= segments; i++) {
      const t = Math.max(0, (i - 0.5) / segments)
      const flutter = Math.sin(time * 1.25 + t * 2.2 + side * 0.7)
      tangent
        .set(
          side * (0.95 - t * 0.66),
          (1 - drop) * (0.05 + t * (0.7 + 0.62 * flutter)) - drop * (0.12 + 2.7 * t),
          -(0.43 + 0.65 * t) * (1 - 0.78 * drop) + (1 - drop) * t * 0.25 * Math.sin(time + t * 2),
        )
        .normalize()
      if (i > 0) center.addScaledVector(tangent, 0.23 / segments)
      cross.set(side * 0.14, 0.12 + 0.71 * (1 - drop), 1)
      cross.addScaledVector(tangent, -cross.dot(tangent)).normalize()
      const halfWidth = i === segments ? 0.013 : 0.017
      widths.forEach((width, j) => {
        const d = width * halfWidth
        pos.setXYZ(
          i * widths.length + j,
          center.x + cross.x * d,
          center.y + cross.y * d,
          center.z + cross.z * d,
        )
      })
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
  }
}

export function createRowingDevice() {
  const root = new Group()
  root.name = 'Rowing machine'
  const frame = assembly(root, 'Rowing frame')
  const seat = assembly(root, 'Rowing seat')
  const handle = assembly(root, 'Rowing handle')
  const feet = [assembly(root, 'Footplate left'), assembly(root, 'Footplate right')]
  const grips = [assembly(handle, 'Grip left'), assembly(handle, 'Grip right')]

  const paint = new MeshStandardMaterial({ color: 0x374852, metalness: 0.33, roughness: 0.42 })
  const housing = new MeshStandardMaterial({ color: 0xcdcfc7, metalness: 0.13, roughness: 0.46 })
  const alloy = new MeshStandardMaterial({ color: 0xb7c3c5, metalness: 0.59, roughness: 0.34 })
  const rubber = new MeshStandardMaterial({ color: 0x222c32, roughness: 0.84 })
  const teal = new MeshStandardMaterial({ color: 0x37b6b1, roughness: 0.58, side: DoubleSide })
  const graphite = new MeshStandardMaterial({ color: 0x151c22, roughness: 0.62, metalness: 0.16 })
  const fabric = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: DoubleSide })
  const materials = [paint, housing, alloy, rubber, teal, graphite, fabric]
  const strapTails = [-1, 1].map((side) => createStrapTail(root, side, fabric))

  // Twin running surfaces and low crossfeet, with isolation pads at the four cabin mounts.
  mount(frame, block(0.124, 0.074, 1.63, 0.013), paint, 0, -0.004, -0.296)
  mount(frame, block(0.074, 0.008, 1.55, 0.003), graphite, 0, 0.037, -0.313)
  for (const side of [-1, 1]) {
    mount(frame, block(0.014, 0.012, 1.58, 0.004), alloy, side * 0.05, 0.037, -0.311)
    mount(frame, block(0.003, 0.006, 0.87, 0.001), teal, side * 0.062, -0.002, -0.55)
  }
  for (const z of [-1.06, 0.5]) {
    mount(frame, block(0.41, 0.04, 0.08, 0.012), paint, 0, -0.235, z)
    for (const side of [-1, 1]) {
      const x = side * 0.171
      mount(frame, block(0.079, 0.026, 0.085, 0.01), rubber, x, -0.259, z)
      mount(frame, cylinder(0.01, 0.008, 6), alloy, x, -0.213, z)
      strut(frame, new Vector3(x, -0.223, z), new Vector3(side * 0.045, -0.031, z), 0.014, paint)
    }
  }

  // Captive fan with a separate rotor behind the grille, axle along the X axis.
  const flywheel = assembly(frame, 'Flywheel')
  flywheel.position.set(0, 0.261, 0.56)
  const rotor = assembly(flywheel, 'Flywheel rotor')
  mount(flywheel, axle(0.163, 0.117, 48), graphite)
  for (const sign of [-1, 1]) {
    const sx = (x: number) => sign * x
    mount(flywheel, new TorusGeometry(0.166, 0.014, 8, 48).rotateY(Math.PI / 2), housing, sx(0.063))
    mount(flywheel, new TorusGeometry(0.14, 0.004, 6, 48).rotateY(Math.PI / 2), alloy, sx(0.08))
    mount(flywheel, axle(0.033, 0.019), paint, sx(0.074))
    mount(flywheel, axle(0.014, 0.004, 12), teal, sx(0.086))
    for (let i = 0; i < 10; i++) {
      const theta = (i * Math.PI * 2) / 10
      const blade = mount(rotor, block(0.005, 0.116, 0.014, 0.002), alloy, sx(0.061))
      blade.position.y = Math.cos(theta) * 0.087
      blade.position.z = Math.sin(theta) * 0.087
      blade.rotation.x = theta + 0.32
      const inner = new Vector3(sx(0.077), Math.cos(theta) * 0.032, Math.sin(theta) * 0.032)
      const outer = new Vector3(sx(0.079), Math.cos(theta + 0.18) * 0.159, Math.sin(theta + 0.18) * 0.159)
      strut(flywheel, inner, outer, 0.0035, paint)
    }
    strut(frame, new Vector3(sx(0.048), 0.017, 0.48), new Vector3(sx(0.066), 0.261, 0.56), 0.023, paint)
  }
  batchPart(rotor)
  batchPart(flywheel)

  const outlet = new Vector3(0, 0.384, 0.434)
  mount(frame, block(0.12, 0.054, 0.08, 0.018), housing, 0, outlet.y - 0.006, outlet.z + 0.034)
  mount(frame, block(0.061, 0.024, 0.028, 0.008), graphite, 0, outlet.y, outlet.z)
  mount(frame, axle(0.008, 0.055, 16), alloy, 0, outlet.y - 0.009, outlet.z - 0.012)
  batchPart(frame)

  mount(seat, block(0.153, 0.035, 0.165, 0.011), paint, 0, -0.069)
  mount(seat, block(0.313, 0.043, 0.239, 0.019), graphite, 0, -0.04)
  for (const side of [-1, 1]) {
    const pad = mount(seat, block(0.166, 0.04, 0.25, 0.019), rubber, side * 0.071, -0.021)
    pad.rotation.z = side * 0.045
    for (const z of [-0.057, 0.058]) {
      mount(seat, axle(0.022, 0.019, 16), graphite, side * 0.07, -0.08, z)
      mount(seat, axle(0.007, 0.004, 8), alloy, side * 0.081, -0.08, z)
    }
  }
  batchPart(seat)

  feet.forEach((foot, i) => {
    const side = i === 0 ? -1 : 1
    mount(foot, block(0.135, 0.022, 0.275, 0.009), paint, 0, -0.015, 0.11)
    mount(foot, block(0.119, 0.008, 0.255, 0.004), rubber, 0, -0.002, 0.113)
    mount(foot, heelCup(), graphite)
    for (const z of [0.066, 0.193, 0.212, 0.23]) {
      mount(foot, block(0.095, 0.003, 0.005, 0.001), graphite, 0, 0.003, z)
    }
    mount(foot, instepStrap(), teal, 0, 0, 0.134)
    mount(foot, block(0.013, 0.019, 0.04, 0.003), alloy, side * 0.063, 0.025, 0.149)
    mount(foot, axle(0.013, 0.158, 16), alloy, 0, -0.022, 0.103)
    batchPart(foot)
  })
  const stretcher = mount(root, axle(0.017, 1, 16), paint)
  const backbone = mount(root, cylinder(0.02, 1, 12), paint)
  const handleBar = mount(handle, axle(0.01, 1), alloy)
  for (const grip of grips) {
    mount(grip, axle(0.014, 0.116), rubber)
    for (const x of [-0.061, 0.061]) mount(grip, axle(0.015, 0.007), teal, x)
    for (const x of [-0.038, -0.032, 0.032, 0.038]) mount(grip, axle(0.0145, 0.0025), graphite, x)
    batchPart(grip)
  }
  const ferrule = mount(handle, block(0.032, 0.03, 0.051, 0.012), paint, 0, 0, 0.013)
  ferrule.name = 'Cable ferrule'
  const cord = mount(root, cylinder(0.004, 1, 10), graphite)
  cord.name = 'Cable'
  const start = new Vector3(),
    end = new Vector3(),
    direction = new Vector3()
  let lastHandleZ: number | undefined
  function connect(mesh: Mesh, from: Vector3, to: Vector3) {
    direction.subVectors(to, from)
    mesh.scale.y = direction.length()
    mesh.position.copy(from).lerp(to, 0.5)
    mesh.quaternion.setFromUnitVectors(axisY, direction.normalize())
  }

  return {
    root,
    update(contacts: RowingContacts, gravityG = 0, elapsedSeconds = 0, reducedMotion = false) {
      const scale = contacts.height / referenceHeight
      root.scale.setScalar(scale)
      seat.position.copy(contacts.seat).divideScalar(scale)
      handle.position.copy(contacts.handle).divideScalar(scale)
      const halfWidth = contacts.gripHalfWidth / scale
      handleBar.scale.x = 2 * halfWidth
      grips[0].position.x = -halfWidth
      grips[1].position.x = halfWidth
      feet.forEach((foot, i) => {
        foot.position.copy(contacts.heels[i]).divideScalar(scale)
        foot.rotation.x = -contacts.footAngle
        strapTails[i](foot, gravityG, elapsedSeconds, reducedMotion)
      })
      frame.position.set(0, seat.position.y - 0.145, (feet[0].position.z + feet[1].position.z) / 2)
      start.set(0, -0.022, 0.103).applyQuaternion(feet[0].quaternion).add(feet[0].position)
      const halfSpan = 0.5 * (feet[1].position.x - feet[0].position.x)
      stretcher.position.set(0, start.y, start.z)
      stretcher.scale.x = 2 * halfSpan + 0.09
      end.set(0, 0, 0.015).add(frame.position)
      connect(backbone, stretcher.position, end)
      start.copy(outlet).add(frame.position)
      end.copy(handle.position)
      end.z += 0.035
      connect(cord, start, end)
      if (lastHandleZ !== undefined) {
        const travel = handle.position.z - lastHandleZ
        rotor.rotation.x += Math.abs(travel) * (travel < 0 ? 15 : 8)
      }
      lastHandleZ = handle.position.z
    },
    dispose() {
      root.removeFromParent()
      root.traverse((part) => {
        if (part instanceof Mesh) part.geometry.dispose()
      })
      for (const material of materials) material.dispose()
    },
  }
}
