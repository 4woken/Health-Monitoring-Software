import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { VideoCamera } from '@phosphor-icons/react'
import { BODY_LINES, HAND_LINES, type Landmark } from './landmarks'
import { startCamera, type CameraFrame, type Need } from './session'

/**
 * A camera session owned by a component: start it with the function that reads each frame, stop it
 * when the test ends. `shared` reuses a stream another part of the app owns, such as the pulse
 * session. The latest frame is kept for drawing the skeleton.
 */
export function useCameraTest(
  needs: Need[],
  { wide = false, stream }: { wide?: boolean; stream?: MediaStream } = {},
) {
  const video = useRef<HTMLVideoElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [frame, setFrame] = useState<CameraFrame | null>(null)
  const [stopped, setStopped] = useState('')
  const key = needs.join(',')

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    setRunning(false)
    setFrame(null)
  }, [])

  const start = useCallback(
    (onFrame: (frame: CameraFrame) => void, shared?: MediaStream) => {
      if (!video.current || stopRef.current) return
      setStopped('')
      setRunning(true)
      setStatus('Opening the camera…')
      stopRef.current = startCamera(
        { needs: key.split(',') as Need[], video: video.current, wide, stream: shared ?? stream },
        {
          onStatus: setStatus,
          onFrame: (f) => {
            setFrame(f)
            onFrame(f)
          },
          onStop: (reason) => {
            stopRef.current = null
            setRunning(false)
            setFrame(null)
            setStopped(reason)
          },
        },
      )
    },
    [key, wide, stream],
  )

  useEffect(() => () => stopRef.current?.(), [])
  return { video, start, stop, running, status, frame, stopped }
}

/** Points on the mirrored preview: x is flipped so the person sees themselves as in a mirror. */
const mirror = (p: Landmark) => ({ x: (1 - p.x) * 100, y: p.y * 100 })

/** The mirrored camera with the skeleton the models see, and room for the test's own marks. */
export function CameraStage({
  camera,
  showBody = true,
  showHands = false,
  idle = 'Camera off',
  className = '',
  children,
}: {
  camera: ReturnType<typeof useCameraTest>
  showBody?: boolean
  showHands?: boolean
  idle?: string
  className?: string
  /** Drawn over the video, in a 0 to 100 box of the mirrored image. */
  children?: ReactNode
}) {
  const { video, frame, running, status } = camera
  const [aspect, setAspect] = useState(4 / 3)
  const body = showBody ? frame?.body : null
  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-[#12161e] ${className}`}
      style={{ aspectRatio: aspect }}
    >
      <video
        ref={video}
        aria-label="Mirrored camera preview"
        playsInline
        muted
        className="block h-full w-full -scale-x-100 object-cover"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
        }}
      />
      {running && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {body &&
            BODY_LINES.map(([a, b]) => {
              const p = body[a]
              const q = body[b]
              if (!p || !q || (p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) return null
              const m = mirror(p)
              const n = mirror(q)
              return (
                <line
                  key={`${a}-${b}`}
                  x1={m.x}
                  y1={m.y}
                  x2={n.x}
                  y2={n.y}
                  stroke="#85edf4"
                  strokeWidth="3"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          {showHands &&
            frame?.hands.map((hand, h) =>
              HAND_LINES.map(([a, b]) => {
                const m = mirror(hand.points[a])
                const n = mirror(hand.points[b])
                return (
                  <line
                    key={`${h}-${a}-${b}`}
                    x1={m.x}
                    y1={m.y}
                    x2={n.x}
                    y2={n.y}
                    stroke="#ffffff"
                    strokeOpacity="0.7"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              }),
            )}
        </svg>
      )}
      {running && children && <div className="pointer-events-none absolute inset-0">{children}</div>}
      {(!running || status) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 px-6 text-center text-white/75">
          {!running && <VideoCamera size={32} weight="light" aria-hidden="true" />}
          <span role="status" className="text-sm">
            {running ? status : camera.stopped || idle}
          </span>
        </div>
      )}
    </div>
  )
}
