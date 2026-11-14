// Camera positions are normalized to the video. Measurements use square pixels.
export interface Point {
  x: number
  y: number
}
export interface Landmark extends Point {
  visibility?: number
}
export type CameraMission = 'assembly' | 'knee'
export type GestureView = {
  count: number
  prompt: string
  cursor?: Point
  carrying?: boolean
  guide?: Point[]
}

const distance = (a: Point, b: Point, aspect: number) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
const inFrame = (p: Landmark | undefined): p is Landmark =>
  !!p && p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99

export function panelLayout(count: number, target: number) {
  // Alternate the direction after every completed transfer.
  const slots = [0.5, 0.36, 0.62, 0.46, 0.55]
  const y = slots[count % slots.length]
  const from = { x: count % 2 === 0 ? 0.3 : 0.7, y }
  const to = { x: 1 - from.x, y: 1 - y }
  return { from, to, radius: target <= 3 ? 0.1 : 0.085 }
}

export function assemblyTracker(target: number, initial: number) {
  let count = initial
  let carrying = false
  let open = false
  let candidate: 'open' | 'closed' | null = null
  let since = 0
  let last: Point | undefined
  let previousHand = ''

  function lost(): GestureView {
    carrying = false
    open = false
    candidate = null
    last = undefined
    previousHand = ''
    return { count, prompt: 'Show one open hand, including your thumb and index finger.' }
  }
  return {
    lost,
    update(hand: Landmark[], label: string, aspect: number, now: number): GestureView {
      const [wrist, thumb, index, middle, baseIndex, basePinky] = [0, 4, 8, 9, 5, 17].map((n) => hand[n])
      if (![wrist, thumb, index, middle, baseIndex, basePinky].every(inFrame)) return lost()
      const size = Math.max(distance(wrist, middle, aspect), distance(baseIndex, basePinky, aspect))
      if (size < 0.06) return lost()
      const cursor = { x: 1 - index.x, y: index.y }
      if ((last && distance(last, cursor, aspect) > 0.35) || (previousHand && label !== previousHand)) {
        lost()
      }
      last = cursor
      previousHand = label
      const gap = distance(thumb, index, aspect) / size
      const gesture = gap <= 0.32 ? 'closed' : gap >= 0.58 ? 'open' : null
      const { from, to, radius } = panelLayout(count, target)
      const near = (point: Point) => distance(cursor, point, aspect) <= radius * Math.min(1, aspect)
      if (gesture !== candidate) {
        candidate = gesture
        since = now
      }
      if (gesture && now - since >= 90) {
        if (gesture === 'open') {
          if (carrying && near(to)) count++
          carrying = false
          open = true
        } else if (open) {
          carrying = near(from)
          open = false
        }
      }
      return {
        count,
        cursor,
        carrying,
        prompt: carrying
          ? 'Carry the cell to the dashed socket, then open your fingers.'
          : 'Open your hand over the cell, then pinch with thumb and index finger.',
      }
    },
  }
}

type Leg = 'left' | 'right'

function readLeg(body: Landmark[], side: Leg, aspect: number) {
  const ids = side === 'left' ? [23, 25, 27] : [24, 26, 28]
  const points = ids.map((i) => body[i])
  if (!points.every(inFrame)) return null
  const [hip, knee, ankle] = points
  const quality = Math.min(...points.map((p) => p.visibility ?? 0))
  const thigh = distance(hip, knee, aspect),
    shin = distance(knee, ankle, aspect)
  // Side-on sitting gives a visible thigh and meaningful knee angle in the image plane.
  if (quality < 0.65 || thigh < 0.08 || shin < 0.08 || Math.abs(hip.x - knee.x) * aspect < 0.6 * thigh)
    return null
  const dx = (hip.x - knee.x) * (ankle.x - knee.x) * aspect * aspect
  const dy = (hip.y - knee.y) * (ankle.y - knee.y)
  const angle = (Math.acos(Math.max(-1, Math.min(1, (dx + dy) / (thigh * shin)))) * 180) / Math.PI
  return { side, quality, angle, points: points.map((p) => ({ x: 1 - p.x, y: p.y })) }
}

export function kneeTracker(initial: number) {
  let count = initial
  let side: Leg | undefined
  let stage: 'rest' | 'extend' | 'return' = 'rest'
  let since: number | null = null
  let restAngle = 0
  let excursion = 20
  let peak = 0
  function lost(): GestureView {
    stage = 'rest'
    side = undefined
    since = null
    return { count, prompt: 'Sit side-on with your hip, knee and ankle visible. Start with your foot down.' }
  }
  return {
    lost,
    update(body: Landmark[], aspect: number, now: number): GestureView {
      const left = readLeg(body, 'left', aspect),
        right = readLeg(body, 'right', aspect)
      const visible =
        side === 'left'
          ? left
          : side === 'right'
            ? right
            : left && (!right || left.quality >= right.quality)
              ? left
              : right
      if (!visible) return lost()
      // Lock the leg during a repetition; a better view of the other knee cannot complete it.
      side = visible.side
      const { angle, points } = visible
      if (stage === 'extend' && angle > restAngle + excursion) peak = Math.max(peak, angle)
      const held =
        stage === 'rest'
          ? angle >= 50 && angle <= 125 && points[2].y > points[1].y
          : stage === 'extend'
            ? angle >= restAngle + excursion
            : angle <= restAngle + 9
      if (!held) since = null
      else if (since === null) since = now
      else if (now - since >= 180) {
        if (stage === 'rest') {
          restAngle = angle
          peak = angle
          stage = 'extend'
        } else if (stage === 'extend') {
          peak = Math.max(peak, angle)
          stage = 'return'
        } else {
          count++
          excursion = Math.max(17, Math.min(32, (peak - restAngle) * 0.65))
          stage = 'rest'
        }
        since = null
      }
      if (stage === 'return') peak = Math.max(peak, angle)
      return {
        count,
        guide: points,
        prompt:
          stage === 'rest'
            ? 'Rest your foot on the ground and hold your starting position.'
            : stage === 'extend'
              ? 'Gently straighten the highlighted leg within your comfortable range.'
              : 'Lower your foot to its starting position to finish the repetition.',
      }
    },
  }
}
