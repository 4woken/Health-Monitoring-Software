// Standing balance, as NASA tests it before flight and after landing: feet together with the eyes
// open, then closed, then closed with head movements (MEDB 1.5, the first sensory organization
// tests), heel to toe (the Field Test's tandem walk, done standing here) and on one leg for 15 seconds
// (MEDB 5.1). The camera checks the stance, times how long it is held and measures the sway of the
// shoulders. Robust measures first: time held and feet that move, then sway.

import { BODY, dist, mid, Smoother, wholeBody, type Landmark } from '../camera/landmarks'
import { baselineOf, median, type Detail, type TestResult } from '../results'
import { judgeScore, type Judgement } from '../judge'

export type Stance = 'together' | 'tandem' | 'leftLeg' | 'rightLeg'
export type ConditionId = 'together' | 'togetherClosed' | 'nod' | 'tandem' | 'leftLeg' | 'rightLeg'

export interface Condition {
  id: ConditionId
  title: string
  stance: Stance
  eyes: 'open' | 'closed'
  nod: boolean
  seconds: number
  /** Said and shown before the stance starts. */
  instruction: string
  /** The NASA test it follows. */
  nasa: string
}

export const CONDITIONS: Condition[] = [
  {
    id: 'together',
    title: 'Feet together, eyes open',
    stance: 'together',
    eyes: 'open',
    nod: false,
    seconds: 20,
    instruction: 'Stand with your feet together and your arms crossed on your chest. Look straight ahead.',
    nasa: 'MEDB 1.5, eyes open',
  },
  {
    id: 'togetherClosed',
    title: 'Feet together, eyes closed',
    stance: 'together',
    eyes: 'closed',
    nod: false,
    seconds: 20,
    instruction: 'Same stance. Close your eyes when you hear go, and keep them closed.',
    nasa: 'MEDB 1.5, eyes closed',
  },
  {
    id: 'nod',
    title: 'Eyes closed, nodding',
    stance: 'together',
    eyes: 'closed',
    nod: true,
    seconds: 20,
    instruction: 'Eyes closed again. Nod your head slowly up and down, about once a second.',
    nasa: 'MEDB 1.5, eyes closed with head movements',
  },
  {
    id: 'tandem',
    title: 'Heel to toe',
    stance: 'tandem',
    eyes: 'open',
    nod: false,
    seconds: 20,
    instruction: 'Put one foot right in front of the other, heel against toe, arms crossed.',
    nasa: 'Field Test, tandem walk, done standing',
  },
  {
    id: 'leftLeg',
    title: 'On your left leg',
    stance: 'leftLeg',
    eyes: 'open',
    nod: false,
    seconds: 15,
    instruction: 'Hands on your hips. Stand on your left leg and lift your right foot off the floor.',
    nasa: 'MEDB 5.1, stand test',
  },
  {
    id: 'rightLeg',
    title: 'On your right leg',
    stance: 'rightLeg',
    eyes: 'open',
    nod: false,
    seconds: 15,
    instruction: 'Now stand on your right leg and lift your left foot.',
    nasa: 'MEDB 5.1, stand test',
  },
]

export const TOTAL_SECONDS = CONDITIONS.reduce((s, c) => s + c.seconds, 0)

interface Geometry {
  hipWidth: number
  legLength: number
  torso: number
  left: Landmark
  right: Landmark
}

function geometry(body: Landmark[], aspect: number): Geometry {
  const lHip = body[BODY.leftHip]
  const rHip = body[BODY.rightHip]
  const left = body[BODY.leftAnkle]
  const right = body[BODY.rightAnkle]
  const shoulders = mid(body[BODY.leftShoulder], body[BODY.rightShoulder])
  return {
    hipWidth: Math.max(0.02, dist(lHip, rHip, aspect)),
    legLength: Math.max(0.05, (dist(lHip, left, aspect) + dist(rHip, right, aspect)) / 2),
    torso: Math.max(0.05, dist(shoulders, mid(lHip, rHip), aspect)),
    left,
    right,
  }
}

/** Whether the body is in the stance asked for, and what to change if not. */
export function checkStance(
  body: Landmark[] | null,
  stance: Stance,
  aspect: number,
): { ok: boolean; hint: string } {
  if (!body || !wholeBody(body, 0.5))
    return { ok: false, hint: 'Step back until your whole body, feet included, is in view.' }
  const g = geometry(body, aspect)
  const gap = Math.abs(g.left.x - g.right.x) * aspect
  const lift = (g.right.y - g.left.y) / g.legLength
  if (stance === 'together')
    return gap < 0.75 * g.hipWidth && Math.abs(lift) < 0.06
      ? { ok: true, hint: 'Good. Hold still.' }
      : { ok: false, hint: 'Bring your feet together, both flat on the floor.' }
  if (stance === 'tandem')
    return gap < 0.42 * g.hipWidth && Math.abs(lift) < 0.14
      ? { ok: true, hint: 'Good. Hold still.' }
      : { ok: false, hint: 'Put one foot right in front of the other, heel against toe.' }
  // Image y grows downward: a lifted ankle has a smaller y.
  const raised = stance === 'leftLeg' ? lift < -0.06 : lift > 0.06
  return raised
    ? { ok: true, hint: 'Good. Hold it.' }
    : {
        ok: false,
        hint:
          stance === 'leftLeg' ? 'Lift your right foot off the floor.' : 'Lift your left foot off the floor.',
      }
}

export interface Frame {
  now: number
  aspect: number
  body: Landmark[] | null
  /** True when both eyes are closed, false when they are open, null when the face is not seen. */
  eyesClosed: boolean | null
}

export interface Hold {
  id: ConditionId
  /** Seconds held, up to the target. */
  heldS: number
  targetS: number
  completed: boolean
  /** Root mean square sway of the shoulders, cm (estimated from the torso length). */
  swayCm: number | null
  /** Why it stopped early, in the person's words. */
  reason?: string
  /** True when the stop came from the camera losing the body, not from balance. */
  interrupted?: boolean
  eyesChecked: boolean
  nods: number
}

/** How long something must last before it counts, so one wrong frame does not end a stance. */
const CONFIRM_MS = 350
/** The first second of a stance is settling, and its sway is left out. */
const SETTLE_MS = 1000

/**
 * Follows one stance from "go": time held, feet that move, eyes that open, head nods and sway.
 * `torsoCm` turns sway in torso lengths into centimetres.
 */
export function holdTracker(condition: Condition, startAt: number, torsoCm = 52) {
  let feet: { left: Landmark; right: Landmark } | null = null
  let footSince: number | null = null
  let eyesSince: number | null = null
  let lastSeen = startAt
  let eyesChecked = false
  let nods = 0
  let pitchHigh: boolean | null = null
  const pitches: { t: number; v: number }[] = []
  let lastNodAt = startAt
  const sx = new Smoother(4)
  const sy = new Smoother(4)
  const sway: { x: number; y: number }[] = []
  let done: Hold | null = null

  const finish = (now: number, extra: Partial<Hold> = {}): Hold => {
    const heldS = Math.min(condition.seconds, Math.max(0, (now - startAt) / 1000))
    let swayCm: number | null = null
    if (sway.length >= 10) {
      const mx = sway.reduce((s, p) => s + p.x, 0) / sway.length
      const my = sway.reduce((s, p) => s + p.y, 0) / sway.length
      const rms = Math.sqrt(sway.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / sway.length)
      swayCm = Number((rms * torsoCm).toFixed(1))
    }
    done = {
      id: condition.id,
      heldS: Number(heldS.toFixed(1)),
      targetS: condition.seconds,
      completed: heldS >= condition.seconds,
      swayCm,
      eyesChecked,
      nods,
      ...extra,
    }
    return done
  }

  return {
    get result() {
      return done
    },
    update(frame: Frame): { elapsedS: number; warning?: string; done?: Hold } {
      if (done) return { elapsedS: done.heldS, done }
      const { now, aspect, body } = frame
      const elapsedS = (now - startAt) / 1000
      if (now - lastSeen > 1500)
        return {
          elapsedS,
          done: finish(lastSeen, {
            completed: false,
            reason: 'The camera lost sight of your body.',
            interrupted: true,
          }),
        }
      if (!body || !wholeBody(body, 0.4)) {
        return { elapsedS, warning: 'Stay in view of the camera.' }
      }
      lastSeen = now
      const g = geometry(body, aspect)
      if (!feet) feet = { left: g.left, right: g.right }

      // Feet: a foot that leaves its place, or a raised foot that comes down.
      let footProblem: string | null = null
      const moved = (a: Landmark, b: Landmark) =>
        Math.abs(a.x - b.x) * aspect > 0.3 * g.hipWidth || Math.abs(b.y - a.y) > 0.07 * g.legLength
      if (condition.stance === 'together' || condition.stance === 'tandem') {
        if (moved(feet.left, g.left) || moved(feet.right, g.right)) footProblem = 'You moved a foot.'
      } else {
        const standing = condition.stance === 'leftLeg' ? g.left : g.right
        const raised = condition.stance === 'leftLeg' ? g.right : g.left
        const startStanding = condition.stance === 'leftLeg' ? feet.left : feet.right
        if ((standing.y - raised.y) / g.legLength < 0.025) footProblem = 'Your raised foot touched down.'
        else if (Math.abs(standing.x - startStanding.x) * aspect > 0.35 * g.hipWidth)
          footProblem = 'You hopped.'
      }
      if (footProblem) {
        footSince ??= now
        if (now - footSince >= CONFIRM_MS)
          return { elapsedS, done: finish(footSince, { reason: footProblem }) }
      } else footSince = null

      // Eyes: closed means closed, when the face can be seen.
      if (condition.eyes === 'closed' && frame.eyesClosed !== null) {
        eyesChecked = true
        if (!frame.eyesClosed) {
          eyesSince ??= now
          if (now - eyesSince >= 1000)
            return { elapsedS, done: finish(eyesSince, { reason: 'Your eyes opened.' }) }
        } else eyesSince = null
      } else eyesSince = null

      // Head nods: the nose moves below and above the line of the ears.
      let warning: string | undefined
      if (condition.nod) {
        const ears = mid(body[BODY.leftEar], body[BODY.rightEar])
        const width = Math.max(0.01, dist(body[BODY.leftEar], body[BODY.rightEar], aspect))
        const pitch = (body[BODY.nose].y - ears.y) / width
        pitches.push({ t: now, v: pitch })
        while (pitches.length && pitches[0].t < now - 3000) pitches.shift()
        // Around this person's own head position, so any face shape works.
        const centre = median(pitches.map((p) => p.v))
        const high = pitch > centre + 0.07 ? true : pitch < centre - 0.07 ? false : pitchHigh
        if (high !== null && pitchHigh !== null && high !== pitchHigh && high) {
          nods++
          lastNodAt = now
        }
        pitchHigh = high
        if (now - lastNodAt > 4000) warning = 'Keep nodding slowly.'
      }

      // Sway of the middle of the shoulders, in torso lengths.
      if (now - startAt >= SETTLE_MS) {
        const s = mid(body[BODY.leftShoulder], body[BODY.rightShoulder])
        sway.push({ x: sx.push((s.x * aspect) / g.torso), y: sy.push(s.y / g.torso) })
      }
      const endAt = startAt + condition.seconds * 1000
      if (
        now >= endAt &&
        (footSince === null || footSince >= endAt) &&
        (eyesSince === null || eyesSince >= endAt)
      )
        return { elapsedS, done: finish(now) }
      return { elapsedS, warning }
    },
  }
}

/** Seconds held over all stances: the main score. */
export const totalHeld = (holds: Hold[]) => Number(holds.reduce((s, h) => s + h.heldS, 0).toFixed(1))

export function meanSway(holds: Hold[]): number | null {
  const values = holds.map((h) => h.swayCm).filter((v): v is number => v !== null)
  return values.length ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)) : null
}

/** The details kept with a balance result. */
export function balanceDetails(holds: Hold[], mode: 'camera' | 'phone'): Record<string, Detail> {
  const out: Record<string, Detail> = { mode, sway: meanSway(holds) }
  for (const h of holds) {
    out[`${h.id}Held`] = h.heldS
    out[`${h.id}Done`] = h.completed
    if (h.reason) out[`${h.id}Stop`] = h.reason
  }
  return out
}

export function judgeBalance(
  score: number,
  details: Record<string, Detail>,
  earlier: TestResult[],
): Judgement {
  const base = judgeScore({
    score,
    earlier,
    better: 'higher',
    worse: { by: 5 },
    format: (v) => `${v.toFixed(0)} s`,
    limit: {
      flag: () =>
        (details.leftLegHeld as number) < 15 ||
        (details.rightLegHeld as number) < 15 ||
        details.togetherClosedDone === false,
      note: 'You could not hold one of the stances most adults hold (eyes closed, or 15 seconds on one leg; our assumption).',
    },
  })
  if (base.level !== 'ok') return base
  const sameMode = earlier.filter(
    (r) => r.details.mode === details.mode && typeof r.details.sway === 'number',
  )
  const { usual } = baselineOf(sameMode, (r) => r.details.sway as number)
  const sway = details.sway
  const unit = details.mode === 'phone' ? ' m/s²' : ' cm'
  if (usual !== undefined && typeof sway === 'number' && usual > 0 && sway >= usual * 1.5)
    return {
      ...base,
      level: 'watch',
      note: `You swayed more than usual: ${sway}${unit} against ${usual}${unit}. Repeat it within 24 hours.`,
    }
  return base
}
