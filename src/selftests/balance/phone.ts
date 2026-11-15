// Balance with the phone held flat against the chest: its accelerometer feels sway far more finely
// than a webcam sees it. The page must run on the phone itself, and the voice guides the stances.

import { Smoother } from '../camera/landmarks'
import type { Condition, Hold } from './balance'

interface MotionPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/** iOS exposes its permission prompt before it can deliver samples. Elsewhere wait for a reading. */
export function probeMotion(timeoutMs = 1200): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return Promise.resolve(false)
  if ((window.DeviceMotionEvent as unknown as MotionPermission)?.requestPermission)
    return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = (value: boolean) => {
      window.removeEventListener('devicemotion', listen)
      clearTimeout(timer)
      resolve(value)
    }
    const listen = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      if (a && [a.x, a.y, a.z].every(Number.isFinite)) done(true)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    window.addEventListener('devicemotion', listen)
  })
}

/** Phones that ask first (iOS) need a tap before motion readings start. */
export async function allowMotion(): Promise<boolean> {
  const sensor = window.DeviceMotionEvent as unknown as MotionPermission | undefined
  if (!sensor?.requestPermission) return true
  try {
    return (await sensor.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export interface MotionSample {
  t: number
  x: number
  y: number
  z: number
}

export function listenMotion(onSample: (s: MotionSample) => void): () => void {
  const listen = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity
    if (!a || a.x === null || a.y === null || a.z === null || ![a.x, a.y, a.z].every(Number.isFinite)) return
    onSample({ t: e.timeStamp, x: a.x, y: a.y, z: a.z })
  }
  window.addEventListener('devicemotion', listen)
  return () => window.removeEventListener('devicemotion', listen)
}

/** A missing or frozen motion stream cannot supply a timed balance result. */
export function measurePhoneHold(
  condition: Condition,
  signal: AbortSignal,
  showLeft: (seconds: number) => void,
): Promise<Hold | null> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(null)
    const start = performance.now()
    let last = start
    const tracker = phoneHold(condition, start)
    const finish = (hold: Hold | null) => {
      stop()
      clearInterval(watchdog)
      signal.removeEventListener('abort', abort)
      resolve(hold)
    }
    const abort = () => finish(null)
    const watchdog = setInterval(() => {
      if (performance.now() - last > 1500) abort()
    }, 250)
    const stop = listenMotion((sample) => {
      const now = performance.now()
      if (now - last > 1500) return abort()
      last = now
      const result = tracker.update(sample, now)
      showLeft(Math.max(0, Math.ceil(condition.seconds - result.elapsedS)))
      if (result.done) finish(result.done)
    })
    signal.addEventListener('abort', abort, { once: true })
  })
}

/**
 * One stance felt by the phone: sway is the root mean square of the acceleration across the chest
 * (side to side, and front to back), after the slow pull of gravity is taken out. A jolt above
 * 3.5 m/s² means a step or a stumble.
 */
export function phoneHold(condition: Condition, startAt: number) {
  const gx = new Smoother(25)
  const gz = new Smoother(25)
  const values: number[] = []
  let done: Hold | null = null
  let last: MotionSample | null = null
  const finish = (now: number, reason?: string): Hold => {
    const heldS = Math.min(condition.seconds, Math.max(0, (now - startAt) / 1000))
    const rms = values.length >= 20 ? Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length) : null
    done = {
      id: condition.id,
      heldS: Number(heldS.toFixed(1)),
      targetS: condition.seconds,
      completed: heldS >= condition.seconds,
      swayCm: rms === null ? null : Number(rms.toFixed(3)),
      eyesChecked: false,
      nods: 0,
      reason,
    }
    return done
  }
  return {
    get result() {
      return done
    },
    update(s: MotionSample, now: number): { elapsedS: number; done?: Hold } {
      if (done) return { elapsedS: done.heldS, done }
      const elapsedS = (now - startAt) / 1000
      if (elapsedS >= condition.seconds) return { elapsedS, done: finish(now) }
      const dx = s.x - gx.push(s.x)
      const dz = s.z - gz.push(s.z)
      if (last && Math.hypot(s.x - last.x, s.y - last.y, s.z - last.z) > 3.5 && elapsedS > 1)
        return { elapsedS, done: finish(now, 'The phone felt a step or a stumble.') }
      last = s
      // Held upright on the chest, the phone's y axis is vertical: sway lies in x and z.
      if (elapsedS > 1) values.push(Math.hypot(dx, dz))
      return { elapsedS }
    },
  }
}
