// Leg movements seen side-on by the camera: standing up from a chair (the Field Test and the
// five-times sit-to-stand test), squats and heel raises (the resistance exercises of MEDB 5.2).
// Each tracker reads one leg, the one the camera sees best, and counts with hysteresis so jitter
// cannot add a repetition.

import { angleAt, BODY, dist, leg, seen, type Landmark } from '../camera/landmarks'

type Side = 'left' | 'right'
type WorldBody = Landmark[] | null | undefined

function kneeAngle3d(body: WorldBody, side: Side) {
  const hip = side === 'left' ? BODY.leftHip : BODY.rightHip
  const a = body?.[hip],
    b = body?.[hip + 2],
    c = body?.[hip + 4]
  if (!a || !b || !c || a.z === undefined || b.z === undefined || c.z === undefined) return null
  const ux = a.x - b.x,
    uy = a.y - b.y,
    uz = a.z - b.z
  const vx = c.x - b.x,
    vy = c.y - b.y,
    vz = c.z - b.z
  const lengths = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz)
  if (!Number.isFinite(lengths) || lengths < 0.001) return null
  return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / lengths))) * 180) / Math.PI
}

/** Image landmarks establish visibility and height; metric landmarks preserve knee flexion when viewed head-on. */
export function bestLeg(body: Landmark[] | null, aspect: number, side?: Side, world?: WorldBody) {
  if (!body) return null
  const legs = (side ? [leg(body, side)] : [leg(body, 'left'), leg(body, 'right')]).filter(
    (l) => l.inView && l.quality >= 0.45,
  )
  if (!legs.length) return null
  const l = legs.reduce((a, b) => (b.quality > a.quality ? b : a))
  const thigh = dist(l.hip, l.knee, aspect),
    shin = dist(l.knee, l.ankle, aspect)
  if (shin < 0.025) return null
  const angle3d = kneeAngle3d(world, l.side)
  if (angle3d === null && thigh < 0.015) return null
  const shoulder = body[l.side === 'left' ? BODY.leftShoulder : BODY.rightShoulder]
  const shoulderWorld = world?.[l.side === 'left' ? BODY.leftShoulder : BODY.rightShoulder]
  const hipWorld = world?.[l.side === 'left' ? BODY.leftHip : BODY.rightHip]
  const trunkTilt =
    shoulderWorld?.z !== undefined && hipWorld?.z !== undefined
      ? (Math.atan2(
          Math.hypot(shoulderWorld.x - hipWorld.x, shoulderWorld.z - hipWorld.z),
          hipWorld.y - shoulderWorld.y,
        ) *
          180) /
        Math.PI
      : null
  return {
    trunkTilt,
    side: l.side,
    hip: l.hip,
    knee: l.knee,
    ankle: l.ankle,
    angle: angle3d ?? angleAt(l.hip, l.knee, l.ankle, aspect),
    height: l.ankle.y - l.hip.y,
    torsoHeight: seen(shoulder, 0.5) ? l.hip.y - shoulder.y : null,
    kneeBelowHip: (l.knee.y - l.hip.y) / shin,
    shin,
    toe: body[l.side === 'left' ? BODY.leftToe : BODY.rightToe],
  }
}

type TrackedLeg = NonNullable<ReturnType<typeof bestLeg>>

/** A flicker on the same leg keeps its state. A long gap, changed leg or unseen transition re-arms it. */
function observeLeg() {
  let previous: TrackedLeg | null = null,
    lastSeen = -Infinity,
    missing = false,
    otherSeenAt = -Infinity
  return (body: Landmark[] | null, aspect: number, now: number, world: WorldBody) => {
    const gap = now - lastSeen
    let current = bestLeg(body, aspect, previous?.side, world)
    if (!current && (gap > 600 || (gap > 330 && now - otherSeenAt > 330)))
      current = bestLeg(body, aspect, undefined, world)
    if (!current) {
      const other = previous?.side === 'left' ? 'right' : 'left'
      // The other leg witnesses a brief crossing of the frame edge without changing the calibrated side.
      if (previous && bestLeg(body, aspect, other, world)) otherSeenAt = now
      else missing = true
      return { current, reset: gap > 600 }
    }
    const footJumped = previous && dist(current.ankle, previous.ankle, aspect) > previous.shin * 0.32
    // Wait briefly for a misplaced ankle to snap back while the hip stays in place.
    if (
      previous &&
      footJumped &&
      gap < 220 &&
      dist(current.hip, previous.hip, aspect) < previous.shin * 0.2
    ) {
      missing = true
      return { current: null, reset: false }
    }
    const reset =
      !!previous &&
      (current.side !== previous.side ||
        gap > 600 ||
        footJumped ||
        ((missing || (gap > 330 && now - otherSeenAt > 330)) &&
          (Math.abs(current.angle - previous.angle) > 28 ||
            Math.abs(current.height - previous.height) > previous.shin * 0.28)))
    previous = current
    lastSeen = now
    otherSeenAt = -Infinity
    missing = false
    return { current, reset }
  }
}

/** An upright thigh and a straightening knee; a seated, extended shin cannot arm a rep. */
export const standingLeg = (l: TrackedLeg | null) => !!l && l.angle >= 148 && l.kneeBelowHip > 0.56

/** Confirm transitions across frames, recording the start of the observed hold for timed tests. */
function confirmedFor(ms: number) {
  let since: number | null = null
  return (ok: boolean, now: number) => {
    if (!ok) since = null
    else since ??= now
    return since !== null && now - since >= ms ? since : null
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

/** Five stands from a chair, timed from "go" to the fifth time fully up. */
export function sitToStandTracker(target = 5) {
  let phase: SitView['phase'] = 'seat'
  let seatedSince: number | null = null
  let state: 'seated' | 'standing' | 'unseen' = 'seated'
  let stands = 0
  let goAt = 0
  let timeS: number | undefined
  const observe = observeLeg()
  const held = confirmedFor(90)
  let lastSeated = -Infinity
  return {
    /** Starts the clock; call on "go", once the tracker is ready. */
    go(now: number) {
      if (phase !== 'ready') return
      if (now - lastSeated > 330) {
        phase = 'seat'
        seatedSince = null
        return
      }
      held(false, now)
      phase = 'running'
      goAt = now
    },
    update(body: Landmark[] | null, aspect: number, now: number, world?: WorldBody): SitView {
      const elapsedS = timeS ?? (phase === 'running' ? (now - goAt) / 1000 : 0)
      const view = (message: string): SitView => ({ phase, stands, elapsedS, timeS, message })
      if (phase === 'done') return view('Done. You can sit back.')
      const { current: l, reset } = observe(body, aspect, now, world)
      if (reset) {
        seatedSince = null
        if (phase === 'ready') phase = 'seat'
        if (phase === 'running') state = 'unseen'
        held(false, now)
      }
      if (!l) {
        return view('Keep your hip, knee and ankle in the frame.')
      }
      const seated = l.angle < 135 && l.kneeBelowHip < 0.65
      if (seated) lastSeated = now
      if (phase === 'ready' && !seated) {
        phase = 'seat'
        seatedSince = null
      }
      if (phase === 'seat') {
        if (seated) {
          seatedSince ??= now
          if (now - seatedSince >= 800) phase = 'ready'
        } else seatedSince = null
        return view(
          seated ? 'Hold still, seated, arms crossed on your chest.' : 'Sit down on the chair, arms crossed.',
        )
      }
      if (phase === 'ready') return view('Ready.')
      const at = held(state === 'seated' ? standingLeg(l) : seated, now)
      if (at !== null) {
        held(false, now)
        if (state === 'seated') {
          state = 'standing'
          stands++
          if (stands >= target) {
            phase = 'done'
            timeS = Number(((at - goAt) / 1000).toFixed(1))
            return view('Done. You can sit back.')
          }
        } else state = 'seated'
      }
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

/** A full descent and return relative to this person's standing leg height and knee angle. */
export function squatTracker() {
  let reps = 0,
    shallow = 0,
    deepest = 180,
    hinged = false
  let phase: RepView['phase'] = 'top'
  let standing: {
    trunkTilt: number | null
    height: number
    angle: number
    torsoHeight: number | null
  } | null = null
  const observe = observeLeg(),
    held = confirmedFor(65)
  return {
    update(body: Landmark[] | null, aspect: number, now: number, world?: WorldBody): RepView {
      const view = (message: string): RepView => ({ reps, phase, message, shallow })
      const { current: l, reset } = observe(body, aspect, now, world)
      if (reset) {
        phase = 'top'
        standing = null
        hinged = false
        held(false, now)
      }
      if (!l) {
        return view('Step back until one hip, knee and ankle are visible together.')
      }
      if (!standing) {
        if (held(standingLeg(l), now) !== null) {
          standing = { trunkTilt: l.trunkTilt, height: l.height, angle: l.angle, torsoHeight: l.torsoHeight }
          held(false, now)
          return view('Standing position detected. Bend your knees to start.')
        }
        return view('Stand upright for a moment so the camera can find your starting height.')
      }
      // Ankle-relative height cancels camera translation; bending the knee distinguishes squats from walking away.
      const drop = (standing.height - l.height) / standing.height
      const bend = standing.angle - l.angle
      if (phase === 'top') {
        if (drop < 0.035 && standingLeg(l)) {
          hinged = false
          standing.height += 0.12 * (l.height - standing.height)
          standing.angle += 0.12 * (l.angle - standing.angle)
          if (l.torsoHeight !== null) standing.torsoHeight = l.torsoHeight
        }
        // In a hip hinge the shoulders descend mainly because the trunk tips forward.
        const trunkFold =
          standing.torsoHeight !== null && l.torsoHeight !== null
            ? (standing.torsoHeight - l.torsoHeight) / standing.height
            : 0
        const leaningForward =
          l.trunkTilt !== null &&
          standing.trunkTilt !== null &&
          l.trunkTilt > 32 &&
          l.trunkTilt - standing.trunkTilt > 18
        // A hip hinge can start and end with bent knees. Keep its evidence through the reach,
        // unless the thigh and pelvis subsequently descend together into a squat.
        if (l.kneeBelowHip < 0.5 && drop > 0.2) hinged = false
        else if ((trunkFold > 0.1 && trunkFold > drop * 1.3) || leaningForward) hinged = true
        if (held(!hinged && bend >= 23 && drop >= 0.065 && trunkFold <= drop, now) !== null) {
          phase = 'bottom'
          deepest = l.angle
          held(false, now)
          return view('Descent detected. Stand back up.')
        }
        return view(
          drop > 0.04 || bend > 12
            ? 'Keep your feet planted and bend your knees within your comfortable range.'
            : 'Bend your knees and sit back, as onto a chair.',
        )
      }
      deepest = Math.min(deepest, l.angle)
      if (held(drop <= 0.07 && bend <= 14 && l.kneeBelowHip > 0.55, now) !== null) {
        reps++
        if (deepest > 115) shallow++
        phase = 'top'
        held(false, now)
        return view('Counted. Ready for the next squat.')
      }
      return view('Stand back up to your starting height to count this squat.')
    },
  }
}

/** Rise above the flat-foot reference, then lower. The toe provides a floor anchor when visible. */
export function heelRaiseTracker() {
  let reps = 0
  let phase: RepView['phase'] = 'bottom'
  let ground: { ankle: number; toe: number | null; shin: number } | null = null
  const observe = observeLeg(),
    held = confirmedFor(90)
  return {
    update(body: Landmark[] | null, aspect: number, now: number, world?: WorldBody): RepView {
      const view = (message: string): RepView => ({ reps, phase, message, shallow: 0 })
      const { current: l, reset } = observe(body, aspect, now, world)
      if (reset || (l && !standingLeg(l))) {
        ground = null
        phase = 'bottom'
        held(false, now)
      }
      if (!l) {
        return view('Keep one whole leg in view, including the foot.')
      }
      if (!standingLeg(l)) return view('Stand upright with your knees comfortably straight.')
      const toe = seen(l.toe, 0.5) ? l.toe.y : null
      if (!ground) {
        if (held(true, now) !== null) {
          ground = { ankle: l.ankle.y, toe, shin: l.shin }
          held(false, now)
        }
        return view('Start with your feet flat on the floor.')
      }
      if (ground.toe !== null && toe === null) {
        held(false, now)
        return view('Keep your toes in the frame while you raise and lower your heels.')
      }
      const toeShift = toe !== null && ground.toe !== null ? toe - ground.toe : 0
      const rise = (ground.ankle - l.ankle.y + toeShift) / ground.shin
      if (phase === 'bottom' && held(rise >= 0.05, now) !== null) {
        phase = 'top'
        held(false, now)
        return view('Up on your toes. Now lower slowly.')
      }
      if (phase === 'top' && held(rise <= 0.025, now) !== null) {
        phase = 'bottom'
        ground = { ankle: l.ankle.y, toe, shin: l.shin }
        held(false, now)
        reps++
        return view('Counted.')
      }
      return view(phase === 'bottom' ? 'Rise up on your toes.' : 'Lower your heels.')
    },
  }
}
