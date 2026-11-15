// Fine hand control, after NASA's Fine Motor Skills study on the ISS: pinch a solar cell between
// thumb and index finger, carry it to its socket and let go, eight times, against the clock. The
// layout is the same every run so runs can be compared.

import { dist, inFrame, type Landmark, type Point } from '../camera/landmarks'

export const TRANSFERS = 8

/** Where the cell and its socket are for the nth transfer; the direction alternates. */
export function layout(count: number) {
  const slots = [0.5, 0.36, 0.62, 0.46, 0.55]
  const y = slots[count % slots.length]
  const from = { x: count % 2 === 0 ? 0.28 : 0.72, y }
  const to = { x: 1 - from.x, y: 1 - y }
  return { from, to, radius: 0.085 }
}

export interface PinchView {
  count: number
  /** Fingertip position on the mirrored preview, 0 to 1. */
  cursor?: Point
  carrying: boolean
  prompt: string
  /** Cells let go outside the socket. */
  drops: number
  /** Seconds since the first pinch, once started. */
  elapsedS: number
  /** Time for all the transfers, once done. */
  timeS?: number
  /** Seconds each transfer took. */
  splits: number[]
}

export function pinchTracker(target = TRANSFERS) {
  let count = 0
  let carrying = false
  let open = false
  let candidate: 'open' | 'closed' | null = null
  let since = 0
  let last: Point | undefined
  let previousHand = ''
  let drops = 0
  let startAt: number | null = null
  let lastAt = 0
  let timeS: number | undefined
  const splits: number[] = []

  const view = (now: number, prompt: string, cursor?: Point): PinchView => ({
    count,
    cursor,
    carrying,
    prompt,
    drops,
    elapsedS: startAt === null ? 0 : (timeS ?? (now - startAt) / 1000),
    timeS,
    splits,
  })

  function lost(now: number): PinchView {
    carrying = false
    open = false
    candidate = null
    last = undefined
    previousHand = ''
    return view(now, 'Show one open hand to the camera, thumb and index finger in view.')
  }

  return {
    lost,
    update(hand: Landmark[], label: string, aspect: number, now: number): PinchView {
      if (timeS !== undefined) return view(now, 'Done.')
      const [wrist, thumb, index, middle, baseIndex, basePinky] = [0, 4, 8, 9, 5, 17].map((n) => hand[n])
      if (![wrist, thumb, index, middle, baseIndex, basePinky].every((p) => inFrame(p))) return lost(now)
      const size = Math.max(dist(wrist, middle, aspect), dist(baseIndex, basePinky, aspect))
      if (size < 0.06) return lost(now)
      const cursor = { x: 1 - index.x, y: index.y }
      if ((last && dist(last, cursor, aspect) > 0.35) || (previousHand && label !== previousHand)) lost(now)
      last = cursor
      previousHand = label
      const gap = dist(thumb, index, aspect) / size
      const gesture = gap <= 0.32 ? 'closed' : gap >= 0.58 ? 'open' : null
      const { from, to, radius } = layout(count)
      const near = (p: Point) => dist(cursor, p, aspect) <= radius * Math.min(1, aspect)
      if (gesture !== candidate) {
        candidate = gesture
        since = now
      }
      if (gesture && now - since >= 90) {
        if (gesture === 'open') {
          if (carrying) {
            if (near(to)) {
              count++
              splits.push(Number(((now - lastAt) / 1000).toFixed(2)))
              lastAt = now
              if (count >= target && startAt !== null) timeS = Number(((now - startAt) / 1000).toFixed(1))
            } else drops++
          }
          carrying = false
          open = true
        } else if (open) {
          carrying = near(from)
          if (carrying && startAt === null) startAt = lastAt = now
          open = false
        }
      }
      if (timeS !== undefined) return view(now, 'Done.', cursor)
      return view(
        now,
        carrying
          ? 'Carry the cell to the dashed socket, then open your fingers.'
          : 'Open your hand over the cell, then pinch it.',
        cursor,
      )
    },
  }
}
