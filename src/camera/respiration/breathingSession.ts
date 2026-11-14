import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { createTracker } from '../face/faceModel'
import { BreathWindow, MIN_SECONDS, type BreathingEstimate } from './breathRate'
import { chestFlow, grayscale, torsoRegions, type Regions } from './opticalFlow'

export type CameraState =
  'off' | 'permission' | 'loading' | 'frame' | 'collect' | 'texture' | 'motion' | 'weak' | 'reading' | 'error'
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
  let box: BreathPreview['box']
  let sourceWidth = 0
  let sourceHeight = 0
  const canvas = document.createElement('canvas')

  function emit(state: CameraState, extra: Partial<BreathPreview> = {}) {
    if (stopped) return
    lastState = state
    update({ ...EMPTY_PREVIEW, box, ...extra, state })
  }
  function interrupt(state: CameraState) {
    trace.clear()
    if (lastState !== state) emit(state)
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
      previous = null
      regions = null
      box = undefined
      lastDetection = -Infinity
      interrupt('frame')
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
      const model = await createTracker('VIDEO', 2)
      if (stopped) {
        model.close()
        return
      }
      tracker = model
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('This browser cannot read camera frames.')
      document.addEventListener('visibilitychange', visibility)
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
            interrupt('frame')
          }
          return
        }
        try {
          if (
            now - lastFrameAt > 500 ||
            sourceWidth !== video.videoWidth ||
            sourceHeight !== video.videoHeight
          ) {
            previous = null
            regions = null
            box = undefined
            lastDetection = -Infinity
            interrupt('frame')
          }
          lastVideoTime = video.currentTime
          lastFrameAt = now
          if (sourceWidth !== video.videoWidth || sourceHeight !== video.videoHeight) {
            sourceWidth = video.videoWidth
            sourceHeight = video.videoHeight
            const scale = 256 / Math.max(sourceWidth, sourceHeight)
            canvas.width = Math.round(sourceWidth * scale)
            canvas.height = Math.round(sourceHeight * scale)
            buffer = new Uint8Array(canvas.width * canvas.height)
          }
          const { width, height } = canvas
          if (now - lastDetection >= 320) {
            const next = torsoRegions(model.detectForVideo(video, now).faceLandmarks, width, height)
            if (
              regions &&
              next &&
              (Math.abs(regions.chest.x - next.chest.x) > 0.1 * regions.chest.w ||
                Math.abs(regions.chest.y - next.chest.y) > 0.1 * regions.chest.h ||
                Math.abs(regions.chest.w - next.chest.w) > 0.12 * regions.chest.w)
            ) {
              previous = null
              interrupt('motion')
            }
            regions = next
            const c = next?.chest
            box = c
              ? { left: 1 - (c.x + c.w) / width, top: c.y / height, width: c.w / width, height: c.h / height }
              : undefined
            lastDetection = now
          }
          if (!regions) {
            previous = null
            interrupt('frame')
            return
          }
          ctx!.drawImage(video, 0, 0, width, height)
          grayscale(ctx!.getImageData(0, 0, width, height).data, buffer)
          if (previous) {
            const flow = chestFlow(previous, buffer, width, regions)
            trace.add(lastVideoTime, flow)
            if (flow.status !== 'tracking') interrupt(flow.status)
            else if (now - lastUi >= 800) {
              lastUi = now
              const reading = trace.estimate()
              emit(
                reading.rate !== null ? 'reading' : reading.seconds >= MIN_SECONDS ? 'weak' : 'collect',
                reading,
              )
            }
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
