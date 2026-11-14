import { useEffect, useRef, useState, type RefObject } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { createTracker } from '../face/faceModel'
import { stopPulse } from '../pulse/pulseSession'
import { retarget } from './retarget'

export type SampleAngle = 'front' | 'left' | 'right'
export type InputSource = 'sample' | 'camera'
type Frame = ReturnType<typeof retarget>

/** Infer once per image/video frame and keep the A/B controls independent of the camera. */
export function useComparisonInput(
  video: RefObject<HTMLVideoElement | null>,
  source: InputSource,
  angle: SampleAngle,
  stopCamera: () => void,
) {
  const [frame, setFrame] = useState<Frame>(null)
  const [status, setStatus] = useState('Loading the local face model…')
  const samples = useRef<Partial<Record<SampleAngle, Frame>>>({})
  const sampleAngle = source === 'sample' ? angle : null
  useEffect(() => {
    setFrame(null)
    if (sampleAngle && samples.current[sampleAngle]) {
      setFrame(samples.current[sampleAngle]!)
      setStatus('Sample face detected')
      return
    }
    let stopped = false
    let raf = 0
    let tracker: FaceLandmarker | undefined
    let stream: MediaStream | undefined
    const input = video.current
    const release = () => {
      cancelAnimationFrame(raf)
      if (input && stream && input.srcObject === stream) {
        input.pause()
        input.srcObject = null
      }
      stream?.getTracks().forEach((track) => track.stop())
      stream = undefined
      tracker?.close()
      tracker = undefined
    }
    function handleVisibility() {
      if (source === 'camera' && document.hidden) stopCamera()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    void (async () => {
      setStatus('Loading the local face model…')
      const cameraMode = !sampleAngle
      if (cameraMode) {
        stopPulse()
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs localhost or HTTPS.')
        if (!input) throw new Error('Camera preview is unavailable.')
        setStatus('Allow camera access in your browser.')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        })
        if (stopped) {
          release()
          return
        }
        input.srcObject = stream
        await input.play()
        if (stopped) return
      }
      tracker = await createTracker(cameraMode ? 'VIDEO' : 'IMAGE')
      if (stopped) {
        release()
        return
      }
      await tracker.setOptions({ outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true })
      if (stopped) return
      if (sampleAngle) {
        const image = new Image()
        image.src = '/face/multiview/' + sampleAngle + '.jpg'
        await image.decode()
        if (stopped) return
        const fit = retarget(tracker.detect(image), image.naturalWidth, image.naturalHeight)
        if (!fit) throw new Error('No complete face detected in the sample.')
        samples.current[sampleAngle] = fit
        setFrame(fit)
        setStatus('Sample face detected')
        release()
      } else if (input) {
        let previous = -1
        let last = -1000
        setStatus('Looking for one face…')
        const next = (time: number) => {
          if (stopped) return
          try {
            if (input.readyState >= 2 && time - last >= 66 && input.currentTime !== previous) {
              previous = input.currentTime
              last = time
              const fit = retarget(tracker!.detectForVideo(input, time), input.videoWidth, input.videoHeight)
              setFrame(fit)
              setStatus(fit ? 'Tracking your face locally' : 'Bring your face into view.')
            }
            raf = requestAnimationFrame(next)
          } catch {
            release()
            setFrame(null)
            setStatus('Tracking stopped. Return to the sample and restart the camera.')
          }
        }
        raf = requestAnimationFrame(next)
      }
    })().catch((cause: unknown) => {
      release()
      if (!stopped) setStatus(cause instanceof Error ? cause.message : 'The face input could not start.')
    })
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', handleVisibility)
      release()
    }
  }, [source, sampleAngle, video, stopCamera])
  return { frame, status }
}
