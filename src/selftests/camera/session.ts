// One camera session for a self-test: the webcam, the MediaPipe models the test needs (body, hands,
// face) and a frame loop that hands their landmarks to the test. Models load on demand from this
// site, run on the CPU and are closed when the session stops.
//
// Privacy: frames are read in memory and dropped. Nothing is recorded or sent. The camera stops on
// stop(), on an error and whenever the page is hidden.

import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { stopPulse } from '../../camera/pulse/pulseSession'
import { BODY, type Landmark } from './landmarks'

export type Need = 'body' | 'hands' | 'face'

export interface Face {
  points: Landmark[]
  /** Eye closure scores, 0 (open) to 1 (closed), from the face model's blendshapes. */
  blink: { left: number; right: number } | null
  /** Every blendshape score of the face model, by name. */
  shapes: Record<string, number>
  /** The head pose, a 4×4 matrix in column order with the position in centimetres, when asked for. */
  matrix: number[] | null
}

export interface CameraFrame {
  now: number
  width: number
  height: number
  aspect: number
  body: Landmark[] | null
  hands: { points: Landmark[]; side: string }[]
  face: Face | null
}

export interface SessionOptions {
  needs: Need[]
  video: HTMLVideoElement
  /** A stream someone else owns (the pulse session): used as is and never stopped here. */
  stream?: MediaStream
  /** Higher resolution, for the face of someone standing a few metres away. */
  wide?: boolean
  /** Frames a second to analyse. */
  fps?: number
  /** The shortest time between two readings of the face, ms: ten a second unless asked otherwise. */
  faceEveryMs?: number
  /** Also read the pose of the head, for the gaze. */
  headPose?: boolean
}

export interface SessionEvents {
  onFrame: (frame: CameraFrame) => void
  onStatus: (message: string) => void
  /** The session ended by itself, with the reason in plain words. */
  onStop: (reason: string) => void
}

/** Starts the camera and the models; returns the function that stops everything. */
export function startCamera(options: SessionOptions, events: SessionEvents): () => void {
  const { needs, video, wide = false, fps = 15, faceEveryMs = 100, headPose = false } = options
  let disposed = false
  let ownStream: MediaStream | undefined
  let attached: MediaStream | undefined
  let raf = 0
  let pose: PoseLandmarker | undefined
  let hands: HandLandmarker | undefined
  let face: FaceLandmarker | undefined
  const crop = document.createElement('canvas')
  crop.width = crop.height = 256
  const cropCtx = crop.getContext('2d')

  function release() {
    cancelAnimationFrame(raf)
    document.removeEventListener('visibilitychange', onVisibility)
    video.removeEventListener('error', onDisconnect)
    attached?.getVideoTracks().forEach((track) => track.removeEventListener('ended', onDisconnect))
    ownStream?.getTracks().forEach((track) => track.stop())
    if (attached && video.srcObject === attached) video.srcObject = null
    attached = ownStream = undefined
    pose?.close()
    hands?.close()
    face?.close()
    pose = hands = face = undefined
  }
  function stop() {
    if (disposed) return
    disposed = true
    release()
  }
  function end(reason: string) {
    if (disposed) return
    stop()
    events.onStop(reason)
  }
  function onVisibility() {
    if (document.hidden) end('The camera stopped when you left this tab.')
  }
  function onDisconnect() {
    end('The camera disconnected. Reconnect it, then start again.')
  }

  async function open() {
    try {
      if (disposed) return
      if (options.stream) {
        attached = options.stream
      } else {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error('Camera access needs localhost or HTTPS in a supported browser.')
        // One camera at a time: the pulse session lets go of it first.
        stopPulse()
        events.onStatus('Allow the camera in your browser to begin.')
        const camera = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: wide ? 1280 : 640 },
            height: { ideal: wide ? 720 : 480 },
          },
          audio: false,
        })
        if (disposed) {
          camera.getTracks().forEach((t) => t.stop())
          return
        }
        ownStream = camera
        attached = camera
      }
      video.srcObject = attached
      for (const t of attached.getVideoTracks()) t.addEventListener('ended', onDisconnect)
      video.addEventListener('error', onDisconnect)
      video.muted = true
      video.playsInline = true
      await video.play()
      if (disposed) return

      events.onStatus('Loading the tracking models…')
      const vision = await import('@mediapipe/tasks-vision')
      const files = await vision.FilesetResolver.forVisionTasks('/face/wasm')
      if (disposed) return
      if (needs.includes('body'))
        pose = await vision.PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/exercises/pose_landmarker_lite.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
      if (disposed) return release()
      if (needs.includes('hands'))
        hands = await vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/exercises/hand_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      if (disposed) return release()
      if (needs.includes('face'))
        face = await vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/face/face_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: headPose,
        })
      if (disposed) return release()
      events.onStatus('')

      let lastVideoTime = -1
      let lastRun = performance.now()
      let lastFace = 0
      let faceResult: Face | null = null
      const step = 1000 / fps
      const tick = (now: number) => {
        if (disposed) return
        raf = requestAnimationFrame(tick)
        if (now - lastRun > 2500) {
          end('The camera stopped providing frames. Check the camera, then start again.')
          return
        }
        if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) return
        if (now - lastRun < step - 4) return
        lastRun = now
        lastVideoTime = video.currentTime
        try {
          const width = video.videoWidth
          const height = video.videoHeight
          let body: Landmark[] | null = null
          if (pose) {
            const r = pose.detectForVideo(video, now)
            body = (r.landmarks[0] as Landmark[] | undefined) ?? null
            r.close()
          }
          const handList: CameraFrame['hands'] = []
          if (hands) {
            const r = hands.detectForVideo(video, now)
            r.landmarks.forEach((points, i) =>
              handList.push({ points: points as Landmark[], side: r.handedness[i]?.[0]?.categoryName ?? '' }),
            )
          }
          // The face model runs ten times a second unless asked for more. With a body in view, it
          // reads a close crop around the head, so the eyes can be seen from a few metres away.
          if (face && now - lastFace >= faceEveryMs) {
            lastFace = now
            faceResult = body
              ? faceFromCrop(face, video, body, now)
              : readFace(face.detectForVideo(video, now), null)
          }
          events.onFrame({
            now,
            width,
            height,
            aspect: width / height,
            body,
            hands: handList,
            face: faceResult,
          })
        } catch {
          end('Tracking stopped. Check the camera and try again.')
        }
      }
      raf = requestAnimationFrame(tick)
    } catch (cause) {
      end(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Camera access was declined. Allow the camera in your browser, then try again.'
          : cause instanceof Error
            ? cause.message
            : 'The camera or a tracking model is unavailable.',
      )
    }
  }

  /** Face points in the crop, mapped back to the whole image. */
  function faceFromCrop(
    model: FaceLandmarker,
    source: HTMLVideoElement,
    body: Landmark[],
    now: number,
  ): Face | null {
    if (!cropCtx) return null
    const w = source.videoWidth
    const h = source.videoHeight
    const head = [BODY.nose, BODY.leftEye, BODY.rightEye, BODY.leftEar, BODY.rightEar].map((i) => body[i])
    if (head.some((p) => !p || (p.visibility ?? 1) < 0.4)) return null
    const xs = head.map((p) => p.x * w)
    const ys = head.map((p) => p.y * h)
    const span = Math.max(Math.max(...xs) - Math.min(...xs), 12)
    const size = span * 2.6
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2 + span * 0.15
    const x0 = cx - size / 2
    const y0 = cy - size / 2
    cropCtx.clearRect(0, 0, crop.width, crop.height)
    cropCtx.drawImage(source, x0, y0, size, size, 0, 0, crop.width, crop.height)
    return readFace(model.detectForVideo(crop, now), { x0: x0 / w, y0: y0 / h, sx: size / w, sy: size / h })
  }

  document.addEventListener('visibilitychange', onVisibility)
  // Deliver even an unsupported-camera error after the owner has received the stop function.
  void Promise.resolve().then(open)
  return stop
}

function readFace(
  r: ReturnType<FaceLandmarker['detectForVideo']>,
  box: { x0: number; y0: number; sx: number; sy: number } | null,
): Face | null {
  const points = r.faceLandmarks[0]
  if (!points) return null
  const shapes: Record<string, number> = {}
  for (const c of r.faceBlendshapes[0]?.categories ?? []) shapes[c.categoryName] = c.score
  const left = shapes.eyeBlinkLeft
  const right = shapes.eyeBlinkRight
  const pose = r.facialTransformationMatrixes?.[0]?.data
  return {
    points: box
      ? points.map((p) => ({ x: box.x0 + p.x * box.sx, y: box.y0 + p.y * box.sy, z: p.z }))
      : points,
    blink: left === undefined || right === undefined ? null : { left, right },
    shapes,
    // The pose found in a crop would place the head wrongly in the whole image.
    matrix: !box && pose && pose.length === 16 ? Array.from(pose) : null,
  }
}

/** Both eyes closed, from the blink scores; null when the face is not seen. */
export const eyesClosed = (face: Face | null) =>
  face?.blink ? Math.min(face.blink.left, face.blink.right) > 0.5 : null
