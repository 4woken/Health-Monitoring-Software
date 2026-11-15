// Leg movements seen side-on by the camera: standing up from a chair (the Field Test and the
// five-times sit-to-stand test), squats and heel raises (the resistance exercises of MEDB 5.2).
// Each tracker reads one leg, the one the camera sees best, and counts with hysteresis so jitter
// cannot add a repetition.

import { angleAt, BODY, dist, leg, type Landmark } from '../camera/landmarks'

/** The best seen leg in this frame, with its knee angle and thigh length, or null. */
export function bestLeg(body: Landmark[] | null, aspect: number, side?: 'left' | 'right') {
  if (!body) return null
  const legs = (side ? [leg(body, side)] : [leg(body, 'left'), leg(body, 'right')]).filter(
    (l) => l.inView && l.quality >= 0.5,
  )
  if (!legs.length) return null
  const l = legs.reduce((a, b) => (b.quality > a.quality ? b : a))
  return {
    side: l.side,
    hip: l.hip,
    knee: l.knee,
    ankle: l.ankle,
    angle: angleAt(l.hip, l.knee, l.ankle, aspect),
    thigh: Math.max(0.02, dist(l.hip, l.knee, aspect)),
    shin: Math.max(0.02, dist(l.knee, l.ankle, aspect)),
  }
}

/** Both wrists on the chest, between the shoulders and the hips. */
export function armsCrossed(body: Landmark[] | null): boolean {
  if (!body) return false
  const ls = body[BODY.leftShoulder]
  const rs = body[BODY.rightShoulder]
  const lh = body[BODY.leftHip]
  const rh = body[BODY.rightHip]
  if (![ls, rs, lh, rh].every((p) => p && (p.visibility ?? 1) >= 0.4)) return false
  const top = Math.min(ls.y, rs.y) - 0.05
  const bottom = (lh.y + rh.y) / 2
  const left = Math.min(ls.x, rs.x) - 0.06
  const right = Math.max(ls.x, rs.x) + 0.06
  return [body[BODY.leftWrist], body[BODY.rightWrist]].every(
    (w) => w && (w.visibility ?? 1) >= 0.4 && w.y > top && w.y < bottom && w.x > left && w.x < right,
  )
}

export interface SitView {
  phase: 'seat' | 'ready' | 'running' | 'done'
  stands: number
  /** Seconds since "go". */
  elapsedS: number
  /** Time for all the stands, once done. */
  timeS?: number
  message: string
}

const SEATED_ANGLE = 125
const STANDING_ANGLE = 155

/** Five stands from a chair, timed from "go" to the fifth time fully up. */
export function sitToStandTracker(target = 5) {
  let phase: SitView['phase'] = 'seat'
  let seatedSince: number | null = null
  let state: 'seated' | 'standing' | 'unseen' = 'seated'
  let stands = 0
  let goAt = 0
  let timeS: number | undefined
  let side: 'left' | 'right' | undefined
  return {
    /** Starts the clock; call on "go", once the tracker is ready. */
    go(now: number) {
      if (phase !== 'ready') return
      phase = 'running'
      goAt = now
    },
    update(body: Landmark[] | null, aspect: number, now: number): SitView {
      const elapsedS = timeS ?? (phase === 'running' ? (now - goAt) / 1000 : 0)
      const view = (message: string): SitView => ({ phase, stands, elapsedS, timeS, message })
      if (phase === 'done') return view('Done. You can sit back.')
      const l = bestLeg(body, aspect, side)
      if (!l) {
        seatedSince = null
        if (phase === 'ready') phase = 'seat'
        if (phase === 'running') state = 'unseen'
        side = undefined
        return view('Sit side-on to the camera, with your hip, knee and ankle in view.')
      }
      const hipAboveKnee = (l.knee.y - l.hip.y) / l.thigh
      const seated = l.angle < SEATED_ANGLE && hipAboveKnee < 0.45
      const standing = l.angle > STANDING_ANGLE && hipAboveKnee > 0.7
      if (phase === 'ready' && !seated) {
        phase = 'seat'
        seatedSince = null
        side = undefined
      }
      if (phase === 'seat') {
        if (seated) {
          if (side !== l.side) seatedSince = null
          side = l.side
          seatedSince ??= now
          if (now - seatedSince > 800) {
            phase = 'ready'
            side = l.side
          }
        } else {
          seatedSince = null
          side = undefined
        }
        return view(
          seated ? 'Hold still, seated, arms crossed on your chest.' : 'Sit down on the chair, arms crossed.',
        )
      }
      if (phase === 'ready') return view('Ready.')
      side = l.side
      if (state === 'seated' && standing) {
        state = 'standing'
        stands++
        if (stands >= target) {
          phase = 'done'
          timeS = Number(((now - goAt) / 1000).toFixed(1))
          return view('Done. You can sit back.')
        }
      } else if (seated) state = 'seated'
      return view(state === 'seated' ? 'Stand up fully.' : 'Sit back down.')
    },
  }
}

export interface RepView {
  reps: number
  /** The current part of the movement. */
  phase: 'top' | 'bottom'
  message: string
  /** Shallow repetitions, which still count. */
  shallow: number
}

/** Squats: down until the knee bends to 115° or less, then up to 160°. */
export function squatTracker() {
  let reps = 0
  let shallow = 0
  let phase: RepView['phase'] = 'top'
  let deepest = 180
  let topHip: number | null = null
  let side: 'left' | 'right' | undefined
  return {
    update(body: Landmark[] | null, aspect: number): RepView {
      const view = (message: string): RepView => ({ reps, phase, message, shallow })
      const l = bestLeg(body, aspect, side)
      if (!l) {
        phase = 'top'
        topHip = null
        side = undefined
        return view('Stand side-on to the camera, your whole leg in view.')
      }
      side = l.side
      const legLength = l.thigh + l.shin
      if (phase === 'top') {
        if (l.angle > 160) topHip = topHip === null ? l.hip.y : Math.min(topHip, l.hip.y)
        const drop = topHip === null ? 0 : (l.hip.y - topHip) / legLength
        if (l.angle < 130 && drop > 0.12) {
          phase = 'bottom'
          deepest = l.angle
        }
        return view('Bend your knees and sit back, as onto a chair.')
      }
      deepest = Math.min(deepest, l.angle)
      if (l.angle > 160) {
        reps++
        if (deepest > 115) shallow++
        phase = 'top'
        topHip = l.hip.y
        return view(deepest > 115 ? 'Counted. Go a little lower next time.' : 'Good depth.')
      }
      return view('Push back up.')
    },
  }
}

/** Heel raises: the ankle rises at least 5% of the shin length above its standing height. */
export function heelRaiseTracker() {
  let reps = 0
  let phase: RepView['phase'] = 'bottom'
  let ground: number | null = null
  let side: 'left' | 'right' | undefined
  return {
    update(body: Landmark[] | null, aspect: number): RepView {
      const view = (message: string): RepView => ({ reps, phase, message, shallow: 0 })
      const l = bestLeg(body, aspect, side)
      if (!l) {
        phase = 'bottom'
        ground = null
        side = undefined
        return view('Stand side-on to the camera, your feet in view.')
      }
      side = l.side
      if (l.angle < 150) {
        phase = 'bottom'
        ground = null
        return view('Keep your knees straight.')
      }
      // Flat on the floor the ankle is at its lowest (largest y). Follow that height, slowly, only
      // while the heels are down, so a raise is measured against the floor it left.
      if (ground === null) ground = l.ankle.y
      if (phase === 'bottom') ground = Math.max(l.ankle.y, ground * 0.97 + l.ankle.y * 0.03)
      const rise = (ground - l.ankle.y) / l.shin
      if (phase === 'bottom' && rise > 0.05) {
        phase = 'top'
        return view('Up on your toes. Now lower slowly.')
      }
      if (phase === 'top' && rise < 0.02) {
        phase = 'bottom'
        reps++
        return view('Counted.')
      }
      return view(phase === 'bottom' ? 'Rise up on your toes.' : 'Lower your heels.')
    },
  }
}
