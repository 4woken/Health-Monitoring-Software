import { assemblyTracker, kneeTracker, type CameraMission, type GestureView } from './cameraGestures'

interface SessionEvents {
  onStatus: (message: string) => void
  onFrame: (view: GestureView) => void
  onPaused: (message: string) => void
  onComplete: () => void
}

/** The returned stop function owns all resources, including permission or model requests still in flight. */
export function startExerciseCamera(
  kind: CameraMission,
  target: number,
  initial: number,
  video: HTMLVideoElement,
  events: SessionEvents,
) {
  let disposed = false
  let stream: MediaStream | undefined
  let model: { close: () => void } | undefined
  let frameId = 0
  const hand = assemblyTracker(target, initial),
    leg = kneeTracker(initial)
  const tracker = kind === 'assembly' ? hand : leg
  function stop() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frameId)
    document.removeEventListener('visibilitychange', visibility)
    video.removeEventListener('error', disconnect)
    if (stream) {
      for (const track of stream.getTracks()) {
        track.removeEventListener('ended', disconnect)
        track.stop()
      }
      if (video.srcObject === stream) video.srcObject = null
    }
    model?.close()
  }
  function pause(reason: string) {
    if (disposed) return
    stop()
    events.onPaused(reason)
  }
  function visibility() {
    if (document.hidden) pause('Paused when you left this tab.')
  }
  function disconnect() {
    pause('Camera disconnected. Reconnect it, then resume.')
  }
  async function open() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires localhost or HTTPS.')
      events.onStatus('Waiting for camera permission…')
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      if (disposed) {
        camera.getTracks().forEach((t) => t.stop())
        return
      }
      stream = camera
      for (const track of camera.getVideoTracks()) track.addEventListener('ended', disconnect)
      video.addEventListener('error', disconnect)
      video.srcObject = camera
      await video.play()
      if (disposed) return
      events.onStatus(kind === 'assembly' ? 'Loading hand tracking…' : 'Loading leg tracking…')
      const vision = await import('@mediapipe/tasks-vision')
      const files = await vision.FilesetResolver.forVisionTasks('/face/wasm')
      if (disposed) return
      let read: (now: number, aspect: number) => GestureView
      if (kind === 'assembly') {
        const hands = await vision.HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/exercises/hand_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        model = hands
        read = (now, aspect) => {
          const r = hands.detectForVideo(video, now)
          return r.landmarks.length === 1
            ? hand.update(r.landmarks[0], r.handedness[0]?.[0]?.categoryName ?? '', aspect, now)
            : hand.lost()
        }
      } else {
        const poses = await vision.PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/exercises/pose_landmarker_lite.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 2,
        })
        model = poses
        read = (now, aspect) => {
          const r = poses.detectForVideo(video, now)
          try {
            return r.landmarks.length === 1 ? leg.update(r.landmarks[0], aspect, now) : leg.lost()
          } finally {
            r.close()
          }
        }
      }
      if (disposed) {
        model.close()
        return
      }
      events.onFrame(tracker.lost())
      let lastTime = -1,
        lastRead = 0,
        stale = false
      function tick(now: number) {
        if (disposed) return
        frameId = requestAnimationFrame(tick)
        if (video.readyState < 2 || video.currentTime === lastTime || !video.videoWidth) {
          if (!stale && now - lastRead > 750) {
            events.onFrame(tracker.lost())
            stale = true
          }
          return
        }
        if (now - lastRead < 66) return
        try {
          if (now - lastRead > 500) tracker.lost()
          lastRead = now
          lastTime = video.currentTime
          stale = false
          const next = read(now, video.videoWidth / video.videoHeight)
          events.onFrame(next)
          if (next.count >= target) {
            stop()
            events.onComplete()
          }
        } catch {
          pause('Tracking stopped. Check the camera and try again.')
        }
      }
      frameId = requestAnimationFrame(tick)
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Camera access was declined. Allow the camera in your browser, then retry.'
          : error instanceof Error
            ? error.message
            : 'Camera or tracking model unavailable.'
      pause(message)
    }
  }
  document.addEventListener('visibilitychange', visibility)
  void open()
  return stop
}
