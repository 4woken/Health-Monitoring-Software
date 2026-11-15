import { useEffect, useRef, useState } from 'react'
import { ChestMotionTrace } from '../../camera/respiration/ChestMotionTrace'
import { stopPulse } from '../../camera/pulse/pulseSession'
import {
  BREATH_STATUS,
  EMPTY_PREVIEW,
  startBreathingSession,
  type BreathPreview,
  type CameraState,
} from '../../camera/respiration/breathingSession'
import { Button } from '../../ui'
import { BREATH_TEST_SECONDS } from '../catalog'
import { Cue, Progress, type RunProps } from '../ui/parts'
import { say } from '../voice'

function retryHint(state: CameraState) {
  switch (state) {
    case 'frame':
      return 'Move back until your face and upper chest fit together in the picture.'
    case 'texture':
      return 'Light your chest from the front. A collar, seam or pattern gives the camera a detail to follow.'
    case 'motion':
      return 'Rest the camera on a stable surface and let your shoulders relax.'
    default:
      return 'Keep your upper chest in the outline, with a collar or seam visible, and breathe at your usual pace.'
  }
}

export default function BreathingRateTest(props: RunProps) {
  const [attempt, setAttempt] = useState(0)
  return <BreathingAttempt key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />
}

function BreathingAttempt({
  onDone,
  onCancel,
  onBreath,
  onBreathGone,
  onRetry,
}: RunProps & { onRetry: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [preview, setPreview] = useState<BreathPreview>(EMPTY_PREVIEW)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const callbacks = useRef({ onDone, onBreath, onBreathGone })

  useEffect(() => {
    callbacks.current = { onDone, onBreath, onBreathGone }
  }, [onDone, onBreath, onBreathGone])

  useEffect(() => {
    if (!video.current) return
    stopPulse()
    void say('Sit with your face and upper chest in view, and breathe normally.')
    let ended = false
    let saved = false
    let deadline: number | undefined
    let timer: number | undefined
    let stop: (() => void) | undefined

    function updateClock() {
      if (deadline === undefined || ended) return
      const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
      setRemaining(left)
      if (left === 0) {
        ended = true
        window.clearInterval(timer)
        stop?.()
        setTimedOut(true)
      }
    }

    stop = startBreathingSession(video.current, (next) => {
      if (ended) return
      setPreview(next)
      if (next.state === 'error') {
        ended = true
        window.clearInterval(timer)
        return
      }
      if (next.state === 'permission' || next.state === 'loading' || next.state === 'off') return
      if (deadline === undefined) {
        deadline = performance.now() + BREATH_TEST_SECONDS * 1000
        timer = window.setInterval(updateClock, 200)
      }
      updateClock()
      if (ended || next.rate === null) return
      // The estimator has already verified repeated bilateral chest motion.
      ended = true
      saved = true
      window.clearInterval(timer)
      stop?.()
      callbacks.current.onBreath?.({ breathsPerMinute: next.rate, measuredAt: Date.now() })
      void say(`${next.rate} breaths a minute.`)
      callbacks.current.onDone({ score: next.rate, details: { seconds: Math.round(next.seconds) } })
    })
    return () => {
      ended = true
      window.clearInterval(timer)
      stop?.()
      if (!saved) callbacks.current.onBreathGone?.()
    }
  }, [])

  const box = preview.box
  const failed = timedOut || preview.state === 'error'
  return (
    <section
      aria-label="Breathing rate"
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="relative w-full overflow-hidden rounded-2xl bg-[#12161e]">
        <video
          ref={video}
          playsInline
          muted
          aria-label="Mirrored breathing camera"
          className={failed ? 'hidden' : 'block h-auto w-full -scale-x-100'}
        />
        {box && !failed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-2 border-holo/90"
            style={{
              left: `${box.left * 100}%`,
              top: `${box.top * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />
        )}
        {failed && (
          <div className="flex min-h-32 items-center justify-center px-5 text-sm text-white/65">
            Camera off
          </div>
        )}
      </div>
      <aside className="space-y-4">
        <Cue>
          {timedOut ? 'No clear breathing rate this time.' : preview.error || BREATH_STATUS[preview.state]}
        </Cue>
        {timedOut && <p className="text-[14px] text-muted">{retryHint(preview.state)}</p>}
        {!failed && remaining !== null && (
          <>
            <ChestMotionTrace wave={preview.wave} />
            <Progress value={1 - remaining / BREATH_TEST_SECONDS} label="Capture time elapsed" />
            <p className="text-[14px] tabular-nums text-muted">
              Up to {remaining} s left · {Math.floor(preview.seconds)} s of usable chest motion
            </p>
          </>
        )}
        {failed && (
          <Button kind="primary" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button size="sm" kind="ghost" onClick={onCancel}>
          Leave the test
        </Button>
      </aside>
    </section>
  )
}
