import { capturePortrait } from '../face/portraitCapture'
// The camera pulse session: one webcam capture shared by the whole app, so the 3D heart can
// beat with the measured pulse while the user looks at another screen.
//
// Privacy: frames are read in memory to average the skin colour and are then dropped. No
// image, landmark or colour sample is stored or sent. Only the numbers shown to the user
// (time, pulse rate, quality) are kept in memory, so the user can download them as a CSV.
// The camera stops on stopPulse(), on an error and whenever the page is hidden.

import { useSyncExternalStore } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import type { FacePoint } from '../face/faceMesh'
import { BpmSmoother, RPPG, estimate, type RgbSample } from './rppg'
import { averageSkin, headMotion, PULSE_MOTION_LIMIT, regionPolygons } from './skinRegions'

export type PulsePhase = 'off' | 'loading' | 'permission' | 'searching' | 'warming' | 'measuring' | 'error'

export interface PulseState {
  phase: PulsePhase
  comparison: { pos: number | null; chrom: number | null } | null
  /** Plain-language status for the interface. */
  message: string
  /** Estimated pulse, beats per minute. Null until the signal is good enough to show. */
  bpm: number | null
  /** Signal quality, 0 to 1. */
  quality: number
  /** Last few seconds of the filtered pulse wave, about -1 to 1, oldest first. */
  wave: number[]
  /** performance.now() in ms of the most recent detected beat, for syncing animations. */
  lastBeatAt: number | null
  /** Frames per second actually analysed. */
  fps: number
}

/** One number the user saw, for the CSV export. */
export interface PulseLogEntry {
  /** Wall-clock time, ms since 1970. */
  timestampMs: number
  /** Seconds since the camera started. */
  timeS: number
  bpm: number
  quality: number
}

const OFF: PulseState = {
  phase: 'off',
  comparison: null,
  message: 'Camera off · no image stored',
  bpm: null,
  quality: 0,
  wave: [],
  lastBeatAt: null,
  fps: 0,
}

/** Analysis canvas: small is enough to average skin colour, and cheap to read back. */
const WIDTH = 160
const HEIGHT = 120
const FRAME_MS = 1000 / 30
const PUBLISH_MS = 110
/** Seconds of samples kept for the analysis. */
const KEEP_MS = (RPPG.spectrumWindowS + 2) * 1000
/** A pause longer than this restarts the signal: interpolating across it would invent data. */
const MAX_GAP_MS = 1000
/** Face missing for longer than this resets the signal. */
const LOST_FACE_MS = 800

let compareMethods = false

export function setPulseComparison(enabled: boolean) {
  compareMethods = enabled
  if (!enabled && state.comparison) set({ comparison: null })
}

let state: PulseState = OFF
const listeners = new Set<() => void>()
const frameListeners = new Set<(points: FacePoint[] | null) => void>()
let log: PulseLogEntry[] = []

function set(next: Partial<PulseState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export const getPulse = (): PulseState => state

export function subscribePulse(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePulse(): PulseState {
  return useSyncExternalStore(subscribePulse, getPulse, getPulse)
}

/** Face landmarks of every analysed frame (null when no face), for drawing the 3D face. */
export function subscribeFrames(listener: (points: FacePoint[] | null) => void): () => void {
  frameListeners.add(listener)
  return () => frameListeners.delete(listener)
}

interface Session {
  id: number
  startedAt: number
  landmarker?: FaceLandmarker
  stream?: MediaStream
  video?: HTMLVideoElement
  ctx?: CanvasRenderingContext2D
  raf: number
  samples: RgbSample[]
  smoother: BpmSmoother
  lastVideoTime: number
  lastDetect: number
  lastPublish: number
  lastPoints: FacePoint[] | null
  faceMissingSince: number | null
  movedAt: number
  fps: number
}

let session: Session | null = null
let nextId = 0

/** The live camera video while the session runs, otherwise null. */
export function getPulseVideo(): HTMLVideoElement | null {
  return session?.video && session.video.readyState >= 2 ? session.video : null
}

/** Capture and analyse one frozen frame together; cached landmarks may belong to an older video frame. */
export function capturePulsePortrait() {
  const video = getPulseVideo(),
    tracker = session?.landmarker
  if (!video || !tracker) throw new Error('Start the camera and face it before capturing.')
  const frozen = document.createElement('canvas')
  frozen.width = video.videoWidth
  frozen.height = video.videoHeight
  frozen.getContext('2d')!.drawImage(video, 0, 0)
  const points = tracker.detectForVideo(frozen, performance.now()).faceLandmarks[0]
  if (!points) throw new Error('Face the camera in even light, then capture again.')
  return capturePortrait(frozen, points)
}

/** Numbers shown during this (or the last) session, oldest first. */
export const getPulseLog = (): readonly PulseLogEntry[] => log

/** The log as CSV: timestamp_ms, time_s, bpm, quality. */
export function pulseLogCsv(): string {
  const rows = log.map(
    (e) => `${e.timestampMs},${e.timeS.toFixed(2)},${e.bpm.toFixed(1)},${e.quality.toFixed(3)}`,
  )
  return ['timestamp_ms,time_s,bpm,quality', ...rows].join('\n') + '\n'
}

const isCurrent = (s: Session) => session === s

function release(s: Session) {
  cancelAnimationFrame(s.raf)
  s.stream?.getTracks().forEach((track) => track.stop())
  if (s.video) {
    s.video.pause()
    s.video.srcObject = null
    s.video.remove()
  }
  try {
    s.landmarker?.close()
  } catch {
    // Already closed.
  }
  s.landmarker = undefined
}

function end(next: PulseState) {
  const s = session
  session = null
  document.removeEventListener('visibilitychange', onVisibility)
  if (s) release(s)
  for (const l of frameListeners) l(null)
  set(next)
}

function onVisibility() {
  if (document.hidden && session) end({ ...OFF, message: 'Camera stopped because the page was hidden.' })
}

function explain(cause: unknown): string {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera permission was refused. Allow the camera for this page in your browser, then try again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it there and try again.'
  return cause instanceof Error && cause.message
    ? cause.message
    : 'Pulse measurement stopped. Try starting the camera again.'
}

export async function startPulse(): Promise<void> {
  if (session) return
  const s: Session = {
    id: ++nextId,
    startedAt: performance.now(),
    raf: 0,
    samples: [],
    smoother: new BpmSmoother(5),
    lastVideoTime: -1,
    lastDetect: -Infinity,
    lastPublish: -Infinity,
    lastPoints: null,
    faceMissingSince: null,
    movedAt: -Infinity,
    fps: 0,
  }
  session = s
  log = []
  document.addEventListener('visibilitychange', onVisibility)
  set({ ...OFF, phase: 'loading', message: 'Loading the local face model…' })
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error('Camera access needs localhost or HTTPS in a supported browser.')
    // Loaded on demand, so the rest of the app does not carry the face model code.
    const vision = await import('@mediapipe/tasks-vision')
    if (!isCurrent(s)) return
    const files = await vision.FilesetResolver.forVisionTasks('/face/wasm')
    if (!isCurrent(s)) return
    const landmarker = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/face/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    })
    if (!isCurrent(s)) {
      landmarker.close()
      return
    }
    s.landmarker = landmarker

    set({ phase: 'permission', message: 'Allow the camera in your browser to begin.' })
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
      audio: false,
    })
    if (!isCurrent(s)) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    s.stream = stream

    // Kept in the page but invisible: some browsers stop decoding a video that is not attached.
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('aria-hidden', 'true')
    video.style.cssText =
      'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1'
    video.srcObject = stream
    document.body.appendChild(video)
    s.video = video
    await video.play()
    if (!isCurrent(s)) return

    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('This browser cannot read camera pixels.')
    s.ctx = ctx

    set({ phase: 'searching', message: 'Looking for your face…' })
    const tick = (now: number) => {
      if (!isCurrent(s)) return
      try {
        if (
          video.readyState >= 2 &&
          video.currentTime !== s.lastVideoTime &&
          now - s.lastDetect >= FRAME_MS - 4
        ) {
          s.lastVideoTime = video.currentTime
          analyse(s, now)
        }
        if (now - s.lastPublish >= PUBLISH_MS) {
          s.lastPublish = now
          publish(s, now)
        }
      } catch (cause) {
        end({ ...OFF, phase: 'error', message: explain(cause) })
        return
      }
      s.raf = requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
  } catch (cause) {
    if (isCurrent(s)) end({ ...OFF, phase: 'error', message: explain(cause) })
  }
}

export function stopPulse(): void {
  end(OFF)
}

function restartSignal(s: Session) {
  s.samples = []
  s.smoother.reset()
}

/** One camera frame: find the face, skip it if the head moved, sample the skin colour. */
function analyse(s: Session, now: number) {
  const video = s.video!
  const ctx = s.ctx!
  if (s.lastDetect > 0) {
    const instant = 1000 / Math.max(1, now - s.lastDetect)
    s.fps = s.fps ? s.fps * 0.9 + instant * 0.1 : instant
  }
  s.lastDetect = now
  const points = s.landmarker!.detectForVideo(video, now).faceLandmarks[0] as FacePoint[] | undefined
  for (const l of frameListeners) l(points ?? null)

  if (!points) {
    s.faceMissingSince ??= now
    if (now - s.faceMissingSince > LOST_FACE_MS) {
      s.lastPoints = null
      restartSignal(s)
    }
    return
  }
  s.faceMissingSince = null
  const previous = s.lastPoints
  s.lastPoints = points
  if (previous && headMotion(previous, points) > PULSE_MOTION_LIMIT) {
    s.movedAt = now
    return
  }

  ctx.drawImage(video, 0, 0, WIDTH, HEIGHT)
  const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT).data
  const polygons = Object.values(regionPolygons(points, WIDTH, HEIGHT))
  const skin = averageSkin(pixels, WIDTH, HEIGHT, polygons)
  if (!skin) return

  const last = s.samples[s.samples.length - 1]
  if (last && now - last.t > MAX_GAP_MS) restartSignal(s)
  s.samples.push({ t: now, r: skin.r, g: skin.g, b: skin.b })
  const cutoff = now - KEEP_MS
  let drop = 0
  while (drop < s.samples.length && s.samples[drop].t < cutoff) drop++
  if (drop) s.samples.splice(0, drop)
}

/** About nine times a second: run the estimate and tell the interface. */
function publish(s: Session, now: number) {
  const fps = Math.round(s.fps)
  if (!s.lastPoints) {
    set({
      phase: 'searching',
      comparison: null,
      message:
        s.lastDetect === -Infinity
          ? 'Looking for your face…'
          : 'No face found. Face the camera in even light.',
      bpm: null,
      quality: 0,
      wave: [],
      lastBeatAt: null,
      fps,
    })
    return
  }
  const first = s.samples[0]
  const last = s.samples[s.samples.length - 1]
  const fresh = last && now - last.t <= MAX_GAP_MS && s.faceMissingSince === null
  const seconds = fresh && first ? (last.t - first.t) / 1000 : 0
  const moving = now - s.movedAt < 1500
  if (moving) {
    s.smoother.reset()
    set({
      phase: 'warming',
      comparison: null,
      message: 'Hold still. Movement hides the pulse signal.',
      bpm: null,
      quality: 0,
      wave: [],
      lastBeatAt: null,
      fps,
    })
    return
  }
  const e = seconds >= 3 ? estimate(s.samples) : null

  if (seconds < RPPG.warmupSeconds) {
    const share = Math.min(99, Math.round((seconds / RPPG.warmupSeconds) * 100))
    set({
      phase: 'warming',
      comparison: null,
      message: `Reading your pulse… ${share}%. Hold still.`,
      bpm: null,
      quality: e?.quality ?? 0,
      wave: e?.wave ?? [],
      lastBeatAt: null,
      fps,
    })
    return
  }

  const good = e !== null && e.bpm !== null && e.quality >= RPPG.qualityThreshold
  const bpm = good ? s.smoother.push(e.bpm!) : null
  if (bpm !== null)
    log.push({ timestampMs: Date.now(), timeS: (now - s.startedAt) / 1000, bpm, quality: e!.quality })
  const alternate = compareMethods ? estimate(s.samples, 'chrom') : null
  set({
    phase: 'measuring',
    comparison: compareMethods
      ? {
          pos: good ? e.bpm : null,
          chrom: alternate && alternate.quality >= RPPG.qualityThreshold ? alternate.bpm : null,
        }
      : null,
    message: good
      ? 'Live estimate from skin colour · not a medical measurement'
      : 'Weak signal. Keep your face still and evenly lit, without light behind you.',
    bpm,
    quality: e?.quality ?? 0,
    wave: e?.wave ?? [],
    lastBeatAt: good && e!.beats.length ? e!.beats[e!.beats.length - 1] : null,
    fps,
  })
}
