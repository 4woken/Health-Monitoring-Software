import { useCallback, useEffect, useRef, useState } from 'react'
import { startCamera } from '../selftests/camera/session'
import { centreOf, dwell, gazePoint, gazeSample, smooth, type GazeSample, type Point } from './gaze'

export type GazeState = 'off' | 'starting' | 'centre' | 'on' | 'error'

/** How long the person looks at the centre to set the neutral gaze, ms. */
const CENTRE_MS = 1500

/**
 * Pressing buttons by looking at them. Buttons opt in with a `data-gaze` attribute; one held under the
 * gaze for a second is clicked. The webcam runs only while this is on, and frames stay on this device.
 */
export function useGaze() {
  const [state, setState] = useState<GazeState>('off')
  const [message, setMessage] = useState('')
  const [cursor, setCursor] = useState<Point | null>(null)
  const [hover, setHover] = useState<{ id: string | null; progress: number }>({ id: null, progress: 0 })
  const video = useRef<HTMLVideoElement | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const centre = useRef<GazeSample | null>(null)
  const samples = useRef<{ t: number; s: GazeSample }[]>([])
  const point = useRef<Point | null>(null)
  const press = useRef(dwell())

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    video.current?.remove()
    video.current = null
    point.current = null
    setCursor(null)
    setHover({ id: null, progress: 0 })
    setState('off')
  }, [])

  const recentre = useCallback(() => {
    centre.current = null
    samples.current = []
    setState('centre')
    setMessage('Look at the centre of the screen…')
  }, [])

  const start = useCallback(() => {
    if (stopRef.current) return
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.setAttribute('aria-hidden', 'true')
    v.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none'
    document.body.appendChild(v)
    video.current = v
    setState('starting')
    setMessage('Starting the camera…')
    stopRef.current = startCamera(
      { needs: ['face'], video: v },
      {
        onStatus: (text) => text && setMessage(text),
        onStop: (reason) => {
          stopRef.current = null
          video.current?.remove()
          video.current = null
          setCursor(null)
          setState('error')
          setMessage(reason)
        },
        onFrame: (frame) => {
          const sample = frame.face ? gazeSample(frame.face.points) : null
          if (!sample) return
          if (!centre.current) {
            samples.current.push({ t: frame.now, s: sample })
            const first = samples.current[0].t
            setState('centre')
            setMessage('Look at the centre of the screen…')
            if (frame.now - first < CENTRE_MS) return
            centre.current = centreOf(samples.current.map((x) => x.s))
            setState('on')
            setMessage('Look at a button for a second to press it.')
            return
          }
          const next = smooth(point.current, gazePoint(sample, centre.current))
          point.current = next
          setCursor(next)
          const el = document.elementFromPoint(next.x * window.innerWidth, next.y * window.innerHeight)
          const target = el?.closest<HTMLElement>('[data-gaze]') ?? null
          const id = target?.dataset.gaze ?? null
          const r = press.current.update(id, frame.now)
          setHover({ id, progress: r.progress })
          if (r.press && target) target.click()
        },
      },
    )
  }, [])

  useEffect(
    () => () => {
      stopRef.current?.()
      video.current?.remove()
    },
    [],
  )
  return { state, message, cursor, hover, start, stop, recentre }
}
