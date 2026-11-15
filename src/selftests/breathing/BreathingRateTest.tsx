import { useEffect, useRef, useState } from 'react'
import { stopPulse } from '../../camera/pulse/pulseSession'
import { MIN_SECONDS } from '../../camera/respiration/breathRate'
import {
  BREATH_STATUS,
  EMPTY_PREVIEW,
  startBreathingSession,
  type BreathPreview,
} from '../../camera/respiration/breathingSession'
import { Button } from '../../ui'
import { median } from '../results'
import { Big, Cue, Progress, type RunProps } from '../ui/parts'
import { say } from '../voice'

/** Seconds of steady estimates that make the result, after the first one. */
const STEADY_S = 6

/** Breaths a minute from the rise and fall of the chest, seen by the camera. */
export default function BreathingRateTest({ onDone, onCancel, onBreath, onBreathGone }: RunProps) {
  const video = useRef<HTMLVideoElement>(null)
  const [preview, setPreview] = useState<BreathPreview>(EMPTY_PREVIEW)
  const rates = useRef<number[]>([])
  const finished = useRef(false)

  useEffect(() => {
    if (!video.current) return
    stopPulse()
    void say('Sit still with your face and upper chest in view, and breathe normally.')
    let lastAt = 0
    const stop = startBreathingSession(video.current, (next) => {
      setPreview(next)
      if (finished.current) return
      if (next.rate === null) {
        rates.current = []
        return
      }
      const now = performance.now()
      if (now - lastAt < 1000) return
      lastAt = now
      rates.current.push(next.rate)
      if (rates.current.length >= STEADY_S) {
        finished.current = true
        const rate = Math.round(median(rates.current))
        stop()
        onBreath?.({ breathsPerMinute: rate, measuredAt: Date.now() })
        void say(`${rate} breaths a minute.`)
        onDone({ score: rate, details: { seconds: Math.round(next.seconds) } })
      }
    })
    return () => {
      stop()
      if (!finished.current) onBreathGone?.()
    }
    // Starts once when the test opens.
  }, [])

  const box = preview.box
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
          className="block h-auto w-full -scale-x-100"
        />
        {box && (
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
      </div>
      <aside className="space-y-4">
        <Cue>{preview.error || BREATH_STATUS[preview.state]}</Cue>
        <Big value={preview.rate ?? '—'} unit="breaths/min" />
        <Progress value={Math.min(1, preview.seconds / (MIN_SECONDS + STEADY_S))} label="Reading" />
        <p className="text-[14px] text-muted">
          {Math.floor(preview.seconds)} s of steady tracking. About {MIN_SECONDS + STEADY_S} s are needed. An
          experimental estimate: talking or swaying can look like breathing.
        </p>
        <Button size="sm" kind="ghost" onClick={onCancel}>
          Leave the test
        </Button>
      </aside>
    </section>
  )
}
