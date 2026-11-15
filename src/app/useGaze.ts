import { useCallback, useEffect, useRef, useState } from 'react'
import { startCamera, type CameraFrame } from '../selftests/camera/session'
import { beep } from '../selftests/voice'
import {
  blinking,
  DOTS,
  dwell,
  fitGaze,
  gazeFeatures,
  oneEuro,
  pickTarget,
  predictGaze,
  steady,
  type Features,
  type GazeModel,
  type Point,
  type Sample,
} from './gaze'

export type GazeState = 'off' | 'starting' | 'calibrating' | 'on' | 'error'

/** On each dot the eyes arrive and settle first; the samples are taken after that, until the ring closes. */
const SETTLE_MS = 450
const DOT_MS = 1300
/** The first dot also leaves time to read what to do. */
const FIRST_DOT_MS = 2600
/** Samples a dot waits for, and how much longer it waits for them, when blinks get in the way. */
const DOT_SAMPLES = 10
const DOT_GRACE_MS = 2500
/** Hold the gaze on a button this long to press it. */
const HOLD_MS = 1000
/** The face counts as lost after this long out of view. */
const LOST_MS = 600
/** Clicks remembered to refine the calibration, each with the frames just before it. */
const CLICKS = 12
const CLICK_WINDOW_MS = 350
/** Group numbers of clicks start after those of the dots. */
const CLICK_GROUP = 100

/** The calibration of this visit, so reopening the AR view keeps it. Numbers only, no image. */
let kept: { model: GazeModel; samples: Sample[] } | null = null

/** The camera stays out of sight, except as a small mirror while it starts and when the face is lost. */
const HIDDEN = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none'
const MIRROR =
  'position:fixed;right:16px;bottom:16px;width:168px;height:126px;object-fit:cover;transform:scaleX(-1);border-radius:14px;border:1px solid rgb(111 208 236 / 0.6);box-shadow:0 0 22px rgb(111 208 236 / 0.35);z-index:60;pointer-events:none'

interface Run {
  stop: () => void
  unlisten: () => void
  video: HTMLVideoElement
  phase: 'calibrating' | 'on'
  started: boolean
  model: GazeModel | null
  samples: Sample[]
  dot: number
  /** When the current dot appeared; moved on while the face is out of view, which pauses the dot. */
  dotStart: number
  dotSamples: Features[]
  lastFrame: number
  lastFace: number
  lost: boolean
  recent: { t: number; features: Features }[]
  fx: ReturnType<typeof oneEuro>
  fy: ReturnType<typeof oneEuro>
  press: ReturnType<typeof dwell>
  target: HTMLElement | null
  clicks: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

/**
 * Pressing buttons by looking at them. Buttons opt in with a `data-gaze` attribute; the one the gaze
 * rests on for a second is clicked. It starts with nine calibration dots, kept for the visit. The
 * webcam runs only while this is on; frames are read in memory and dropped.
 */
export function useGaze({ auto = false }: { auto?: boolean } = {}) {
  const [state, setState] = useState<GazeState>('off')
  const [message, setMessage] = useState('')
  const [dot, setDot] = useState<{ index: number; point: Point; ms: number } | null>(null)
  const [lost, setLost] = useState(false)
  const [errorPx, setErrorPx] = useState<number | null>(null)
  const run = useRef<Run | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)

  /** The cursor is drawn here, not by React, so the visor does not render again thirty times a second. */
  const drawCursor = useCallback((p: Point | null, snapped = false) => {
    const el = cursorRef.current
    if (!el) return
    el.toggleAttribute('data-show', Boolean(p))
    if (!p) return
    el.toggleAttribute('data-snapped', snapped)
    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
  }, [])

  const hover = useCallback((r: Run, el: HTMLElement | null, progress: number) => {
    if (r.target !== el) {
      r.target?.removeAttribute('data-gaze-hover')
      r.target?.style.removeProperty('--gaze-progress')
      el?.setAttribute('data-gaze-hover', '')
      r.target = el
    }
    el?.style.setProperty('--gaze-progress', progress.toFixed(3))
  }, [])

  const release = useCallback(() => {
    const r = run.current
    if (!r) return
    run.current = null
    r.stop()
    r.unlisten()
    r.video.remove()
    hover(r, null, 0)
    drawCursor(null)
  }, [drawCursor, hover])

  const stop = useCallback(() => {
    release()
    setState('off')
    setMessage('')
    setDot(null)
    setLost(false)
  }, [release])

  const calibrate = useCallback(
    (r: Run, features: Features | null, now: number, gap: number) => {
      // The dot waits while the face is out of view.
      if (r.lost) {
        r.dotStart += gap
        return
      }
      const length = r.dot === 0 ? FIRST_DOT_MS : DOT_MS
      const elapsed = now - r.dotStart
      if (features && elapsed >= length - DOT_MS + SETTLE_MS) r.dotSamples.push(features)
      if (elapsed < length || (r.dotSamples.length < DOT_SAMPLES && elapsed < length + DOT_GRACE_MS)) return
      if (r.dotSamples.length >= 5)
        for (const f of steady(r.dotSamples))
          r.samples.push({ features: f, target: DOTS[r.dot], group: r.dot })
      r.dotSamples = []
      r.dot++
      if (r.dot < DOTS.length) {
        r.dotStart = now
        setDot({ index: r.dot, point: DOTS[r.dot], ms: DOT_MS })
        return
      }
      setDot(null)
      const model = fitGaze(r.samples, viewport())
      if (!model) {
        release()
        setState('error')
        setMessage(
          'The calibration needs your eyes in view of the camera. Sit facing it in even light, then turn eye control on again.',
        )
        return
      }
      r.model = model
      r.phase = 'on'
      kept = { model, samples: r.samples }
      setErrorPx(model.errorPx)
      setState('on')
    },
    [release],
  )

  const track = useCallback(
    (r: Run, features: Features | null, now: number) => {
      if (!r.model) return
      if (!features) {
        // A blink holds everything; a lost face lets go of the button.
        if (r.lost) {
          hover(r, null, 0)
          r.press.update(null, now)
          drawCursor(null)
          r.fx.reset()
          r.fy.reset()
        }
        return
      }
      const { width, height } = viewport()
      const g = predictGaze(r.model, features)
      const x = r.fx.filter(clamp(g.x, -0.03, 1.03) * width, now)
      const y = r.fy.filter(clamp(g.y, -0.03, 1.03) * height, now)
      const targets: { id: string; rect: DOMRect; el: HTMLElement }[] = []
      for (const el of document.querySelectorAll<HTMLElement>('[data-gaze]')) {
        const rect = el.getBoundingClientRect()
        if (rect.width && rect.height && !el.hasAttribute('disabled') && el.dataset.gaze)
          targets.push({ id: el.dataset.gaze, rect, el })
      }
      const reach = clamp(0.075 * Math.hypot(width, height), 90, 170)
      const id = pickTarget({ x, y }, targets, r.target?.dataset.gaze ?? null, reach)
      const el = targets.find((t) => t.id === id)?.el ?? null
      const d = r.press.update(id, now)
      hover(r, el, d.progress)
      drawCursor({ x: clamp(x, 0, width), y: clamp(y, 0, height) }, Boolean(el))
      if (d.press && el) {
        el.click()
        el.setAttribute('data-gaze-pressed', '')
        window.setTimeout(() => el.removeAttribute('data-gaze-pressed'), 400)
        beep(760, 70, 0.06)
      }
    },
    [drawCursor, hover],
  )

  const onFrame = useCallback(
    (r: Run, frame: CameraFrame) => {
      const now = frame.now
      const face = frame.face
      if (face) r.lastFace = now
      const gap = r.lastFrame ? now - r.lastFrame : 0
      r.lastFrame = now
      const isLost = now - r.lastFace > LOST_MS
      if (isLost !== r.lost || !r.started) {
        r.lost = isLost
        setLost(isLost)
        r.video.style.cssText = isLost ? MIRROR : HIDDEN
      }
      if (!r.started) {
        r.started = true
        r.dotStart = now
        setState(r.phase)
        if (r.phase === 'calibrating') setDot({ index: 0, point: DOTS[0], ms: FIRST_DOT_MS })
      }
      const features =
        face && !blinking(face.shapes)
          ? gazeFeatures({
              points: face.points,
              shapes: face.shapes,
              matrix: face.matrix,
              width: frame.width,
              height: frame.height,
            })
          : null
      if (features) {
        r.recent.push({ t: now, features })
        while (r.recent.length && r.recent[0].t < now - 1500) r.recent.shift()
      }
      if (r.phase === 'calibrating') calibrate(r, features, now, gap)
      else track(r, features, now)
    },
    [calibrate, track],
  )

  const start = useCallback(() => {
    if (run.current) return
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('aria-hidden', 'true')
    video.style.cssText = MIRROR
    document.body.appendChild(video)
    const r: Run = {
      stop: () => {},
      unlisten: () => {},
      video,
      phase: kept ? 'on' : 'calibrating',
      started: false,
      model: kept?.model ?? null,
      samples: kept ? [...kept.samples] : [],
      dot: 0,
      dotStart: 0,
      dotSamples: [],
      lastFrame: 0,
      lastFace: 0,
      lost: false,
      recent: [],
      fx: oneEuro(),
      fy: oneEuro(),
      press: dwell(HOLD_MS),
      target: null,
      clicks: 0,
    }
    run.current = r
    setState('starting')
    setMessage('Starting the camera for eye control…')
    setErrorPx(kept?.model.errorPx ?? null)
    setLost(false)
    setDot(null)

    // A click shows where the person looks, as in WebGazer: the frames just before it teach the model.
    const onPointer = (e: PointerEvent) => {
      if (!e.isPrimary || r.phase !== 'on' || !r.model || run.current !== r) return
      const t = performance.now()
      const recent = r.recent.filter((s) => s.t >= t - CLICK_WINDOW_MS)
      if (recent.length < 4) return
      const size = viewport()
      const target = { x: e.clientX / size.width, y: e.clientY / size.height }
      const group = CLICK_GROUP + ++r.clicks
      const clicks = [...new Set(r.samples.filter((s) => s.group >= CLICK_GROUP).map((s) => s.group))]
      const forget = new Set(clicks.slice(0, Math.max(0, clicks.length - (CLICKS - 1))))
      r.samples = r.samples
        .filter((s) => !forget.has(s.group))
        .concat(recent.map((s) => ({ features: s.features, target, group })))
      const model = fitGaze(r.samples, size, [r.model.lambda])
      if (!model) return
      r.model = model
      kept = { model, samples: r.samples }
      setErrorPx(model.errorPx)
    }
    window.addEventListener('pointerdown', onPointer, true)
    r.unlisten = () => window.removeEventListener('pointerdown', onPointer, true)

    r.stop = startCamera(
      { needs: ['face'], video, wide: true, fps: 30, faceEveryMs: 0, headPose: true },
      {
        onStatus: (text) => {
          if (text && run.current === r) setMessage(text)
        },
        onStop: (reason) => {
          if (run.current !== r) return
          release()
          setState('error')
          setMessage(reason)
          setDot(null)
          setLost(false)
        },
        onFrame: (frame) => {
          if (run.current === r) onFrame(r, frame)
        },
      },
    )
  }, [onFrame, release])

  /** Forgets the calibration and shows the dots again. */
  const recalibrate = useCallback(() => {
    const r = run.current
    if (!r) return
    kept = null
    r.phase = 'calibrating'
    r.model = null
    r.samples = []
    r.dot = 0
    r.dotSamples = []
    r.dotStart = performance.now()
    hover(r, null, 0)
    drawCursor(null)
    setErrorPx(null)
    setState('calibrating')
    setDot({ index: 0, point: DOTS[0], ms: FIRST_DOT_MS })
  }, [drawCursor, hover])

  useEffect(() => {
    if (auto) start()
    return release
  }, [auto, start, release])

  return { state, message, dot, lost, errorPx, cursorRef, start, stop, recalibrate }
}
