import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Build } from '../body/anatomy/bodyShape'

export interface RowingContacts {
  height: number
  /** Machine contact points in body-local metres, with +Z toward the flywheel. */
  seat: Vector3
  handle: Vector3
  gripHalfWidth: number
  heels: [Vector3, Vector3]
  footAngle: number
}

type Coordinates = [number, number, number]
type Points = Record<
  'hip' | 'knee' | 'ankle' | 'shoulder' | 'elbow' | 'wrist' | 'middle' | 'index' | 'pinky' | 'heel',
  Coordinates
>
// The limb centres are the binding targets from build-human-skins.py. Across
// the knuckles, the index/pinky landmarks also encode the rest palm's roll.
const REFERENCE: Record<Build, Points> = {
  male: {
    hip: [0.09, 0.94, -0.024],
    knee: [0.081, 0.497, -0.002],
    ankle: [0.08, 0.078, -0.024],
    shoulder: [0.174, 1.422, -0.039],
    elbow: [0.231, 1.155, -0.055],
    wrist: [0.255, 0.932, 0.003],
    middle: [0.283, 0.84, 0.057],
    index: [0.27, 0.846, 0.089],
    pinky: [0.297, 0.835, 0.02],
    heel: [0.083, -0.0045, -0.085],
  },
  female: {
    hip: [0.107, 0.903, -0.013],
    knee: [0.118, 0.482, -0.006],
    ankle: [0.125, 0.07, -0.024],
    shoulder: [0.167, 1.35, -0.035],
    elbow: [0.249, 1.093, -0.012],
    wrist: [0.357, 0.907, 0.037],
    middle: [0.407, 0.832, 0.057],
    index: [0.399, 0.833, 0.083],
    pinky: [0.411, 0.839, 0.02],
    heel: [0.13, 0.01, -0.076],
  },
}

const axisX = new Vector3(1, 0, 0)
const identityFit = () => 1

function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

export function createRowingRig(height: number, build: Build, torsoFit: (y: number) => number = identityFit) {
  const h = height
  const scale = h / (build === 'male' ? 1.75 : 1.657)
  const point = (name: keyof Points, side: number) => {
    const [x, y, z] = REFERENCE[build][name]
    const factor = torsoFit(y * scale)
    return new Vector3(side * x * scale * factor, y * scale, z * scale * factor)
  }
  const contacts: RowingContacts = {
    height,
    seat: new Vector3(),
    handle: new Vector3(),
    gripHalfWidth: h * 0.099,
    heels: [-1, 1].map((side) => new Vector3(side * h * 0.072, h * 0.102, h * 0.301)) as [Vector3, Vector3],
    footAngle: 0.72,
  }
  const torso = new Matrix4()
  // Each side has upper arm, forearm, gripping hand, thigh, shank, and shoe.
  const bones = Array.from({ length: 12 }, () => new Matrix4())
  const handOrigins = [new Vector3(), new Vector3()]
  const bodyHip = point('hip', 0)
  const footRotation = new Matrix4().makeRotationX(-contacts.footAngle - (build === 'female' ? 0.1 : 0.012))
  const q = new Quaternion()
  const v = new Vector3(),
    from = new Vector3(),
    to = new Vector3(),
    axis = new Vector3(),
    bend = new Vector3()

  function anchorTransform(matrix: Matrix4, restPivot: Vector3, posedPivot: Vector3) {
    const t = v.copy(restPivot).applyMatrix4(matrix)
    matrix.setPosition(t.multiplyScalar(-1).add(posedPivot))
    return matrix
  }
  function alignBone(matrix: Matrix4, a: Vector3, b: Vector3, targetA: Vector3, targetB: Vector3) {
    q.setFromUnitVectors(from.subVectors(b, a).normalize(), to.subVectors(targetB, targetA).normalize())
    return anchorTransform(matrix.makeRotationFromQuaternion(q), a, targetA)
  }
  // Intersect two spheres. Project the bend direction onto their circle so
  // elbows track alongside the torso and knees point up at the catch.
  function joint(result: Vector3, root: Vector3, end: Vector3, l1: number, l2: number, pole: Vector3) {
    axis.subVectors(end, root)
    const d = Math.max(0.00001, axis.length())
    axis.multiplyScalar(1 / d)
    const along = Math.min(l1, Math.max(-l1, (l1 * l1 - l2 * l2 + d * d) / (2 * d)))
    bend.copy(pole).addScaledVector(axis, -pole.dot(axis)).normalize()
    return result
      .copy(root)
      .addScaledVector(axis, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
  }

  const sides = ([-1, 1] as const).map((side, i) => {
    const shoulder = point('shoulder', side),
      elbow = point('elbow', side),
      wrist = point('wrist', side)
    const hip = point('hip', side),
      knee = point('knee', side),
      ankle = point('ankle', side)
    const middle = point('middle', side)
    const advance = middle.clone().sub(wrist).normalize()
    const across = point('index', side).sub(point('pinky', side))
    across.addScaledVector(advance, -across.dot(advance)).normalize()
    const handRest = new Matrix4().makeBasis(across, advance, across.clone().cross(advance))
    const handForward = new Vector3(0, 0, 1)
    const handAcross = new Vector3(-side, 0, 0)
    const handRotation = new Matrix4()
      .makeBasis(handAcross, handForward, handAcross.clone().cross(handForward))
      .multiply(handRest.transpose())
    const [upperArm, forearm, hand, thigh, shank, foot] = bones.slice(i * 6, i * 6 + 6)
    anchorTransform(foot.copy(footRotation), point('heel', side), contacts.heels[i])
    const ankleTarget = ankle.clone().applyMatrix4(foot)
    const thighLength = hip.distanceTo(knee),
      shankLength = knee.distanceTo(ankle)
    const upperArmLength = shoulder.distanceTo(elbow),
      forearmLength = elbow.distanceTo(wrist)
    const armPole = new Vector3(side * 0.45, -1, -0.3)
    const legPole = new Vector3(side * 0.025, 1, 0.3)
    const posedHip = new Vector3(),
      posedKnee = new Vector3(),
      posedShoulder = new Vector3(),
      posedElbow = new Vector3(),
      posedWrist = new Vector3()
    const wristFromGrip = wrist.clone().sub(middle).applyMatrix4(handRotation)
    function handleReach(straight: boolean) {
      posedShoulder.copy(shoulder).applyMatrix4(torso)
      // At extreme torso sizes, unequal segment lengths also limit how
      // closely the wrist can approach the shoulder at the finish.
      const reach = straight
        ? 0.985 * (upperArmLength + forearmLength)
        : Math.abs(upperArmLength - forearmLength) + 0.004 * h
      const dx = side * contacts.gripHalfWidth + wristFromGrip.x - posedShoulder.x
      const dy = contacts.handle.y + h * 0.0125 + wristFromGrip.y - posedShoulder.y
      return posedShoulder.z + Math.sqrt(Math.max(0, reach * reach - dx * dx - dy * dy)) - wristFromGrip.z
    }
    function pose() {
      posedHip.copy(hip).applyMatrix4(torso)
      joint(posedKnee, posedHip, ankleTarget, thighLength, shankLength, legPole)
      alignBone(thigh, hip, knee, posedHip, posedKnee)
      alignBone(shank, knee, ankle, posedKnee, ankleTarget)
      const grip = handOrigins[i].copy(contacts.handle)
      grip.x = side * contacts.gripHalfWidth
      grip.y += h * 0.0125
      anchorTransform(hand.copy(handRotation), middle, grip)
      posedWrist.copy(wrist).applyMatrix4(hand)
      posedShoulder.copy(shoulder).applyMatrix4(torso)
      joint(posedElbow, posedShoulder, posedWrist, upperArmLength, forearmLength, armPole)
      alignBone(upperArm, shoulder, elbow, posedShoulder, posedElbow)
      alignBone(forearm, elbow, wrist, posedElbow, posedWrist)
    }
    return { handleReach, pose }
  })
  const posedCenter = new Vector3()
  return {
    bones,
    torso,
    handOrigins,
    legLevels: new Vector3(point('hip', 1).y, point('knee', 1).y, point('ankle', 1).y),
    wristY: point('wrist', 1).y,
    sample(elapsed: number, reducedMotion = false) {
      const phase = reducedMotion ? 0.22 : (((elapsed / 2.9) % 1) + 1) % 1
      const drive = phase < 0.42 ? phase / 0.42 : (1 - phase) / 0.58
      const slide = smooth(drive / 0.85)
      const pull = smooth((drive - 0.44) / 0.56)
      contacts.seat.set(0, h * 0.236, h * (0.097 - 0.266 * slide))
      contacts.handle.set(0, h * (0.437 + 0.023 * pull), 0)
      const tilt = 0.32 - 0.51 * smooth((drive - 0.18) / 0.73)
      // Offsets measured to the bottom of the clothed pelvis. The underside
      // turns toward the saddle at the finish as the leg weights straighten.
      const clearance = build === 'male' ? 0.027 + 0.025 * slide : 0.034 + 0.024 * slide
      posedCenter.copy(contacts.seat).y += h * clearance
      anchorTransform(torso.makeRotationAxis(axisX, tilt), bodyHip, posedCenter)
      const extended = Math.min(h * 0.52, sides[0].handleReach(true))
      const finish = Math.max(contacts.seat.z + h * 0.105, sides[0].handleReach(false))
      contacts.handle.z = extended + (finish - extended) * pull
      for (const side of sides) side.pose()
      return contacts
    },
  }
}
