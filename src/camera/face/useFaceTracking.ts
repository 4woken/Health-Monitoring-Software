import { useEffect, useRef, useState, type RefObject } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { createTracker } from './faceModel'
import { assessScanView, type ScanAngle } from './scanGuidance'
import { faceYawDegrees } from './multiViewFace'
import { normaliseFace, type AvatarCapture } from './portrait'
import type { LiveFaceFrame } from './liveFace'
import { stopPulse } from '../pulse/pulseSession'
import { capturePortrait, sampleSkin } from './portraitCapture'

const INITIAL_QUALITY = { ready: false, progress: 0, message: 'Start the camera or try the sample person.' }
type Source = 'camera' | 'sample'

/** Pixels, landmarks, texture and capture always come from the same frozen inference frame. */
export function useFaceTracking(video: RefObject<HTMLVideoElement | null>) {
  const [source, setSource] = useState<Source | null>(null)
  const [status, setStatus] = useState('Camera off'),
    [error, setError] = useState('')
  const [quality, setQuality] = useState(INITIAL_QUALITY)
  const target = useRef<ScanAngle | undefined>(undefined)
  const currentQuality = useRef(INITIAL_QUALITY),
    liveFace = useRef<LiveFaceFrame | null>(null),
    sampleEpoch = useRef(0)
  useEffect(
    () => () => {
      sampleEpoch.current++
    },
    [],
  )
  useEffect(() => {
    if (!source || !video.current) return
    const input = video.current,
      probe = document.createElement('canvas'),
      frozen = document.createElement('canvas')
    const frozenContext = frozen.getContext('2d')!
    let cancelled = false,
      stream: MediaStream | undefined,
      tracker: FaceLandmarker | undefined,
      frame = 0,
      sampleFrame = 0
    const onVisibility = () => {
      if (document.hidden) setSource(null)
    }
    document.addEventListener('visibilitychange', onVisibility)
    const fail = (cause: unknown) => {
      if (cancelled) return
      setError(cause instanceof Error ? cause.message : 'Camera tracking stopped.')
      setSource(null)
    }
    const start = async () => {
      try {
        setError('')
        setStatus('Loading the local face model…')
        tracker = await createTracker('VIDEO', target.current ? 2 : 1)
        if (cancelled) {
          tracker.close()
          tracker = undefined
          return
        }
        if (source === 'sample') {
          const portrait = new Image()
          portrait.src = '/face/sample-portrait.png'
          await portrait.decode()
          if (cancelled) return
          const sample = document.createElement('canvas')
          sample.width = 1280
          sample.height = 960
          const context = sample.getContext('2d')!,
            started = performance.now()
          const animate = () => {
            const t = (performance.now() - started) / 1000,
              size = 1100 * (1 + 0.055 * Math.sin(t * 0.6))
            context.fillStyle = '#d4d4d4'
            context.fillRect(0, 0, sample.width, sample.height)
            context.drawImage(
              portrait,
              (1280 - size) / 2 + 140 * Math.sin(t * 0.8),
              -20 + 35 * Math.sin(t * 0.53),
              size,
              size,
            )
            sampleFrame = requestAnimationFrame(animate)
          }
          animate()
          stream = sample.captureStream(30)
        } else {
          if (!navigator.mediaDevices?.getUserMedia)
            throw new Error('Camera access requires localhost or HTTPS in a supported browser.')
          setStatus('Allow the camera in your browser to begin.')
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
            audio: false,
          })
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        input.srcObject = stream
        await input.play()
        if (cancelled) return
        let lastVideo = -1,
          lastFrame = -1000,
          lastUI = 0,
          stableSince = 0,
          previous: { x: number; y: number; yaw: number; eyeSpan: number } | null = null,
          previousTarget: ScanAngle | undefined
        const render = (time: number) => {
          if (cancelled) return
          try {
            if (input.readyState >= 2 && input.currentTime !== lastVideo && time - lastFrame >= 1000 / 20) {
              lastVideo = input.currentTime
              lastFrame = time
              if (frozen.width !== input.videoWidth || frozen.height !== input.videoHeight) {
                frozen.width = input.videoWidth
                frozen.height = input.videoHeight
              }
              frozenContext.drawImage(input, 0, 0, frozen.width, frozen.height)
              const faces = tracker!.detectForVideo(frozen, time).faceLandmarks
              const points = faces.length === 1 ? faces[0] : undefined
              const tone = points
                ? sampleSkin(frozen, points, probe)
                : ([0, 0, 0] as [number, number, number])
              const angle = target.current
              const view = { points: points ?? [], width: frozen.width, height: frozen.height }
              const assessment =
                faces.length > 1
                  ? { ready: false, message: 'Keep only your face in the camera view.' }
                  : assessScanView(view, (tone[0] + tone[1] + tone[2]) / 3, angle)
              const nose = points?.[1]
              const pose = nose && {
                x: nose.x,
                y: nose.y,
                yaw: angle ? faceYawDegrees(view) : 0,
                eyeSpan: Math.abs(points[263].x - points[33].x),
              }
              const moved =
                !pose ||
                !previous ||
                Math.hypot(pose.x - previous.x, pose.y - previous.y) > (angle ? 0.016 : 0.012) ||
                (angle &&
                  (Math.abs(pose.yaw - previous.yaw) > 3 ||
                    Math.abs(pose.eyeSpan - previous.eyeSpan) > previous.eyeSpan * 0.06))
              if (!assessment.ready || previousTarget !== angle || moved) {
                stableSince = time
                previous = pose ?? null
              } else if (!angle) previous = pose ?? null
              previousTarget = angle
              const progress = assessment.ready ? Math.min(1, (time - stableSince) / 650) : 0
              const fresh = {
                ready: assessment.ready && progress === 1,
                progress,
                message:
                  assessment.ready && progress === 1
                    ? angle
                      ? 'Ready to capture this angle.'
                      : 'Ready. Capture and check the fit.'
                    : assessment.message,
              }
              currentQuality.current = fresh
              // No VideoTexture: a later video frame must never be paired with earlier points.
              let trackable = false
              if (points) {
                try {
                  normaliseFace(points, frozen.width, frozen.height)
                  trackable = true
                } catch {
                  /* Keep a partial or tiny face out of the renderer. */
                }
              }
              liveFace.current =
                points && trackable
                  ? {
                      id: time,
                      source: frozen,
                      points,
                      width: frozen.width,
                      height: frozen.height,
                      skinTone: tone,
                      sample: source === 'sample',
                    }
                  : null
              if (time - lastUI > 160) {
                lastUI = time
                setQuality(fresh)
                setStatus(
                  source === 'sample'
                    ? 'Fictional motion sample · no webcam access'
                    : assessment.ready
                      ? 'Live face automatically fitted to the head'
                      : 'Camera on · framing needed',
                )
              }
            }
            frame = requestAnimationFrame(render)
          } catch (cause) {
            fail(cause)
          }
        }
        frame = requestAnimationFrame(render)
      } catch (cause) {
        fail(cause)
      }
    }
    void start()
    return () => {
      cancelled = true
      liveFace.current = null
      currentQuality.current = INITIAL_QUALITY
      cancelAnimationFrame(frame)
      cancelAnimationFrame(sampleFrame)
      document.removeEventListener('visibilitychange', onVisibility)
      stream?.getTracks().forEach((track) => track.stop())
      input.pause()
      input.srcObject = null
      tracker?.close()
    }
  }, [source, video])
  const aimAt = (angle?: ScanAngle) => {
    target.current = angle
    currentQuality.current = INITIAL_QUALITY
    setQuality(INITIAL_QUALITY)
  }
  const capture = (): AvatarCapture => {
    const frame = liveFace.current
    if (!source || !frame || !currentQuality.current.ready || performance.now() - frame.id > 400)
      throw new Error('Hold still with your whole face visible before capturing.')
    return { ...capturePortrait(frame.source, frame.points), sample: frame.sample }
  }
  const loadSample = async (): Promise<AvatarCapture> => {
    stopPulse()
    setSource(null)
    setError('')
    const epoch = ++sampleEpoch.current
    let tracker: FaceLandmarker | undefined
    try {
      const image = new Image()
      image.src = '/face/sample-portrait.png'
      await image.decode()
      tracker = await createTracker('IMAGE')
      if (epoch !== sampleEpoch.current) throw new Error('The preview was closed.')
      const points = tracker.detect(image).faceLandmarks[0]
      if (!points) throw new Error('The sample face could not be detected.')
      return { ...capturePortrait(image, points), sample: true }
    } finally {
      tracker?.close()
    }
  }
  const start = (next: Source = 'camera') => {
    stopPulse()
    sampleEpoch.current++
    currentQuality.current = INITIAL_QUALITY
    setQuality(INITIAL_QUALITY)
    setSource(next)
  }
  return {
    enabled: source !== null,
    source,
    status,
    error,
    quality,
    liveFace,
    aimAt,
    capture,
    loadSample,
    start,
    stop: () => {
      sampleEpoch.current++
      setSource(null)
      setError('')
    },
  }
}
