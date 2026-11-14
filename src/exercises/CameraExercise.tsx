import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Nut, SolarPanel, VideoCamera } from '@phosphor-icons/react'
import { Button } from '../ui'
import { stopPulse } from '../camera/pulse/pulseSession'
import { panelLayout, type CameraMission, type GestureView, type Point } from './cameraGestures'
import { startExerciseCamera } from './exerciseSession'

function located(p: Point): CSSProperties {
  return { left: p.x * 100 + '%', top: p.y * 100 + '%', transform: 'translate(-50%,-50%)' }
}

export function CameraExercise({
  kind,
  target,
  onComplete,
  onExit,
}: {
  kind: CameraMission
  target: number
  onComplete: () => void
  onExit: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stop = useRef<(() => void) | null>(null)
  const [running, setRunning] = useState(false)
  const [view, setView] = useState<GestureView>({ count: 0, prompt: '' })
  const [status, setStatus] = useState('')
  const [aspect, setAspect] = useState(4 / 3)
  const isHand = kind === 'assembly'
  const { from, to, radius } = panelLayout(view.count, target)
  const size = {
    width: 2 * radius * Math.min(1, 1 / aspect) * 100 + '%',
    height: 2 * radius * Math.min(1, aspect) * 100 + '%',
  }

  useEffect(() => () => stop.current?.(), [])

  function pause() {
    stop.current?.()
    setRunning(false)
    setStatus('Paused. Completed gestures are saved for this attempt.')
    setView((v) => ({ count: v.count, prompt: '' }))
  }
  function start() {
    if (!video.current || running) return
    stopPulse()
    setRunning(true)
    setStatus('Opening camera…')
    stop.current = startExerciseCamera(kind, target, view.count, video.current, {
      onStatus: setStatus,
      onFrame: (next) => {
        setView(next)
        setStatus('')
      },
      onPaused: (reason) => {
        setRunning(false)
        setStatus(reason)
        setView((v) => ({ count: v.count, prompt: '' }))
      },
      onComplete: () => {
        setRunning(false)
        onComplete()
      },
    })
  }
  const handPrompt =
    'Face the laptop with one hand in view. Use the fingertip cursor to move each solar cell into the dashed socket.'
  const kneePrompt =
    'Sit sideways on a stable chair. Frame one hip, knee and ankle. Start with your foot down, extend your leg as far as feels comfortable, then lower it.'
  return (
    <section
      className="space-y-4"
      aria-label={isHand ? 'Solar panel assembly camera' : 'Seated knee extension camera'}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-[14rem] flex-1 text-sm leading-relaxed text-muted">
          {isHand ? handPrompt : kneePrompt}
        </p>
        <output
          className="rounded-full border border-line px-3 py-1 text-sm tabular-nums"
          aria-label="Completed gestures"
        >
          {view.count} / {target} {isHand ? 'cells' : 'reps'}
        </output>
      </div>
      <div
        className="relative mx-auto w-full max-w-xl overflow-hidden rounded-xl bg-[#12161e]"
        style={{ aspectRatio: aspect }}
      >
        <video
          ref={video}
          aria-label="Mirrored exercise camera"
          playsInline
          muted
          className="block h-full w-full -scale-x-100 object-contain"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoHeight) setAspect(v.videoWidth / v.videoHeight)
          }}
        />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/60">
            <VideoCamera size={32} weight="light" aria-hidden="true" />
            <span className="text-sm">Camera off</span>
          </div>
        )}
        {running && !status && isHand && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <span
              className="absolute grid place-items-center rounded-md border-2 border-dashed border-white/90 bg-black/30 text-white"
              style={{ ...located(to), ...size }}
            >
              <Nut size={23} />
            </span>
            <span
              className="absolute grid place-items-center rounded-md border border-cyan-100 bg-sky-900/90 text-cyan-100 shadow-lg"
              style={{ ...located(view.carrying && view.cursor ? view.cursor : from), ...size }}
            >
              <SolarPanel size={27} />
            </span>
            {view.cursor && (
              <span
                className="absolute h-4 w-4 rounded-full border-[3px] border-white bg-cyan-500 shadow-md"
                style={located(view.cursor)}
              />
            )}
          </div>
        )}
        {running && view.guide && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <polyline
              fill="none"
              stroke="#85edf4"
              strokeWidth="4"
              vectorEffect="non-scaling-stroke"
              points={view.guide.map((p) => p.x * 100 + ',' + p.y * 100).join(' ')}
            />
            {view.guide.map((p, i) => (
              <ellipse key={i} cx={p.x * 100} cy={p.y * 100} rx={0.95 / aspect} ry=".95" fill="white" />
            ))}
          </svg>
        )}
      </div>
      <p role="status" className="min-h-5 text-sm">
        {status || view.prompt || 'Camera frames are processed on this device.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={running ? pause : start} kind={running ? 'secondary' : 'primary'}>
          {running ? 'Pause camera' : view.count ? 'Resume camera' : 'Start camera'}
        </Button>
        <Button
          kind="secondary"
          onClick={() => {
            stop.current?.()
            onExit()
          }}
        >
          Exit exercise
        </Button>
      </div>
    </section>
  )
}
export default CameraExercise
