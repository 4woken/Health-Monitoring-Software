import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { BreathWindow, MIN_SECONDS, type BreathingEstimate } from './breathRate'
import { chestFlow, grayscale, torsoRegions, type Regions } from './opticalFlow'

export type CameraState =
  'off' | 'permission' | 'loading' | 'frame' | 'collect' | 'texture' | 'motion' | 'weak' | 'reading' | 'error'
export const BREATH_STATUS: Record<CameraState, string> = {
  off: 'Camera off',
  permission: 'Waiting for camera permission',
  loading: 'Loading face tracking',
  frame: 'Frame one person, with face and upper chest in view',
  collect: 'Collecting chest motion',
  texture: 'More detail needed. Light your face and chest evenly. Clothing with a pattern can help.',
  motion: 'Movement detected. Settle back into position and keep breathing normally.',
  weak: 'No clear breathing rhythm yet. Keep your chest in view and breathe normally.',
  reading: 'Repeated chest motion detected',
  error: 'Camera stopped',
}

export interface BreathPreview extends BreathingEstimate {
  state: CameraState
  error?: string
  /** Normalized region for the mirrored live video. */
  box?: { left: number; top: number; width: number; height: number }
}

export const EMPTY_PREVIEW: BreathPreview = { state: 'off', rate: null, seconds: 0, wave: [] }

/** Opens only from the start button. Each request owns its tracks, model, animation loop and buffers. */
export function startBreathingSession(video: HTMLVideoElement, update: (preview: BreathPreview) => void) {
  const trace = new BreathWindow()
  let stopped = false
  let stream: MediaStream | undefined
  let tracker: FaceLandmarker | undefined
  let frameId = 0
  let lastState: CameraState | undefined
  let lastUi = -Infinity
  let lastVideoTime = -1
  let lastFrameAt = 0
  let lastDetection = -Infinity
  let previous: Uint8Array | null = null
  let buffer: Uint8Array = new Uint8Array(0)
  let regions: Regions | null = null
  let lastSubject: Regions | null = null
  let box: BreathPreview['box']
  let sourceWidth = 0
  let sourceHeight = 0
  const canvas = document.createElement('canvas')

  function emit(state: CameraState, extra: Partial<BreathPreview> = {}) {
    if (stopped) return
    lastState = state
    update({ ...EMPTY_PREVIEW, box, ...extra, state })
  }
  function resetTracking() {
    trace.clear()
    previous = null
    regions = null
    lastSubject = null
    lastDetection = -Infinity
    box = undefined
  }
  function report(now: number, issue?: 'motion' | 'texture' | 'frame') {
    // Limit hints to a readable cadence when a few bad frames interrupt an otherwise usable signal.
    if (now - lastUi < 500 && !(issue && lastState === 'reading')) return
    lastUi = now
    const reading = trace.estimate()
    const state =
      issue ?? (reading.rate !== null ? 'reading' : reading.seconds >= MIN_SECONDS ? 'weak' : 'collect')
    emit(state, reading)
  }
  function interrupt(now: number, issue: 'motion' | 'texture' | 'frame') {
    trace.interrupt(now / 1000)
    report(now, issue)
  }
  function release() {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frameId)
    document.removeEventListener('visibilitychange', visibility)
    video.removeEventListener('error', streamLost)
    stream?.getTracks().forEach((track) => {
      track.removeEventListener('ended', streamLost)
      track.stop()
    })
    tracker?.close()
    video.pause()
    video.srcObject = null
  }
  function fail(message: string) {
    if (stopped) return
    emit('error', { error: message })
    release()
  }
  function streamLost() {
    fail('The camera disconnected. Reconnect it and start a new reading.')
  }
  function visibility() {
    if (document.hidden) {
      resetTracking()
      emit('frame')
    }
  }

  async function open() {
    try {
      emit('permission')
      if (!navigator.mediaDevices?.getUserMedia) {
        fail('Camera access is unavailable here. Open this page on localhost or HTTPS.')
        return
      }
      const camera = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      if (stopped) {
        camera.getTracks().forEach((track) => track.stop())
        return
      }
      stream = camera
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', streamLost))
      video.addEventListener('error', streamLost)
      video.srcObject = camera
      await video.play()
      if (stopped) return
      emit('loading')
      const { createTracker } = await import('../face/faceModel')
      if (stopped) return
      const model = await createTracker('VIDEO', 2)
      if (stopped) {
        model.close()
        return
      }
      tracker = model
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('This browser cannot read camera frames.')
      document.addEventListener('visibilitychange', visibility)
      emit('frame')
      function tick(now: number) {
        if (stopped) return
        frameId = requestAnimationFrame(tick)
        if (document.hidden || now - lastFrameAt < 66) return
        if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) {
          if (now - lastFrameAt > 950) {
            previous = null
            regions = null
            box = undefined
            lastDetection = -Infinity
            interrupt(now, 'frame')
          }
          return
        }
        try {
          if (sourceWidth !== video.videoWidth || sourceHeight !== video.videoHeight) {
            resetTracking()
            sourceWidth = video.videoWidth
            sourceHeight = video.videoHeight
            const scale = 256 / Math.max(sourceWidth, sourceHeight)
            canvas.width = Math.round(sourceWidth * scale)
            canvas.height = Math.round(sourceHeight * scale)
            buffer = new Uint8Array(canvas.width * canvas.height)
          } else if (now - lastFrameAt > 500) {
            // There is no valid displacement across a stalled video frame.
            previous = null
            lastDetection = -Infinity
            interrupt(now, 'frame')
          }
          lastVideoTime = video.currentTime
          lastFrameAt = now
          const { width, height } = canvas
          if (now - lastDetection >= 320) {
            const faces = model.detectForVideo(video, now).faceLandmarks
            const next = torsoRegions(faces, width, height)
            if (faces.length > 1) {
              resetTracking()
              if (lastState !== 'frame') emit('frame')
            } else if (lastSubject && next) {
              const a = lastSubject.chest
              const b = next.chest
              const dx = Math.abs(b.x + b.w / 2 - a.x - a.w / 2) / a.w
              const dy = Math.abs(b.y + b.h / 2 - a.y - a.h / 2) / a.h
              const sizeChange = Math.max(b.w / a.w, a.w / b.w, b.h / a.h, a.h / b.h)
              if (dx > 0.6 || dy > 0.8 || sizeChange > 1.6) {
                // A face reappearing in a different location or at a different scale may be another person.
                resetTracking()
                emit('frame')
              } else if (dx > 0.17 || dy > 0.23 || sizeChange > 1.2) {
                previous = null
                interrupt(now, 'motion')
              }
            }
            if (next) lastSubject = next
            regions = next
            const c = next?.chest
            box = c
              ? { left: 1 - (c.x + c.w) / width, top: c.y / height, width: c.w / width, height: c.h / height }
              : undefined
            lastDetection = now
          }
          if (!regions) {
            previous = null
            interrupt(now, 'frame')
            return
          }
          ctx!.drawImage(video, 0, 0, width, height)
          grayscale(ctx!.getImageData(0, 0, width, height).data, buffer)
          if (previous) {
            const flow = chestFlow(previous, buffer, width, regions)
            trace.add(now / 1000, flow)
            report(now, flow.status === 'tracking' ? undefined : flow.status)
          }
          const spare = previous
          previous = buffer
          buffer = spare ?? new Uint8Array(width * height)
        } catch (cause) {
          fail(cause instanceof Error ? cause.message : 'Camera analysis stopped. Start a new reading.')
        }
      }
      frameId = requestAnimationFrame(tick)
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : ''
      fail(
        name === 'NotAllowedError'
          ? 'Camera permission was declined. Allow this site to use the camera and retry.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : cause instanceof Error
              ? cause.message
              : 'The camera could not start.',
      )
    }
  }
  void open()
  return release
}
