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
  arms: 'side' | 'crossed' | 'forward' | 'hips' | 'support'
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
    case 'squat':
    case 'pacedSquat': {
      const s = wave(t / (move === 'pacedSquat' ? 1.5 : 3))
      p.hip = [1.45 * s, 1.45 * s]
      p.knee = [1.95 * s, 1.95 * s]
      p.ankle = [-0.5 * s, -0.5 * s]
      p.lean = 0.45 * s
      p.arms = 'forward'
      p.reach = s
      break
    }
    case 'heelRaise': {
      const s = wave(t / 2.4)
      p.ankle = [0.55 * s, 0.55 * s]
      p.arms = 'support'
      break
    }
    case 'sitToStand': {
      const c = (t % 3.6) / 3.6
      // Seated, up, standing, down.
      const up = c < 0.25 ? 0 : c < 0.5 ? ease((c - 0.25) / 0.25) : c < 0.75 ? 1 : 1 - ease((c - 0.75) / 0.25)
      const seat = 1 - up
      p.hip = [1.55 * seat, 1.55 * seat]
      p.knee = [1.55 * seat, 1.55 * seat]
      p.lean = 0.08 * seat + 0.48 * Math.sin(Math.PI * up)
      p.arms = 'crossed'
      break
    }
    case 'together':
    case 'nod': {
      p.inward = [0.055, 0.055]
      p.sway = 0.02 * Math.sin(t * 1.3)
      p.arms = 'crossed'
      if (move === 'nod') {
        p.nod = 0.35 * Math.sin(2 * Math.PI * t)
        p.eyesClosed = true
      }
      break
    }
    case 'tandem': {
      p.hip = [0.196, -0.11]
      p.ankle = [0.196, -0.11]
      p.inward = [0.1, 0.1]
      p.sway = 0.025 * Math.sin(t * 1.5)
      p.arms = 'crossed'
      break
    }
    case 'leftLeg':
    case 'rightLeg': {
      const raised = move === 'leftLeg' ? 1 : 0
      p.hip[raised] = 0.75
      p.knee[raised] = 1.35
      p.inward[1 - raised] = 0.095
      p.sway = 0.03 * Math.sin(t * 1.7)
      p.arms = 'hips'
      break
    }
  }
  return p
}
