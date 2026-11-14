import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui'

type Phase = 'ready' | 'running' | 'paused' | 'complete'

interface Clock {
  phase: Phase
  elapsed: number
  sampledAt: number
}

interface Props {
  target: number
  onComplete: () => void
  onExit: () => void
}

export default function BreathingExercise({ target, onComplete, onExit }: Props) {
  const [clock, setClock] = useState<Clock>({ phase: 'ready', elapsed: 0, sampledAt: 0 })
  const reported = useRef(false)
  const duration = target * 1000
  const remaining = Math.ceil((duration - clock.elapsed) / 1000)

  const sample = useCallback(
    (at: number | null, pause: boolean) => {
      setClock((previous) => {
        if (previous.phase !== 'running') return previous
        // If a timer wakes on an already hidden page, keep the last confirmed foreground time.
        const sampledAt = Math.max(previous.sampledAt, at ?? previous.sampledAt)
        const elapsed = Math.min(duration, previous.elapsed + (sampledAt - previous.sampledAt))
        const phase = elapsed >= duration ? 'complete' : pause ? 'paused' : 'running'
        return { phase, elapsed, sampledAt }
      })
    },
    [duration],
  )

  useEffect(() => {
    const hide = (event: Event) => {
      if (document.hidden) sample(event.timeStamp, true)
    }
    const leavePage = (event: PageTransitionEvent) => sample(event.timeStamp, true)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', leavePage)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', leavePage)
    }
  }, [sample])

  useEffect(() => {
    if (clock.phase !== 'running') return
    const nextSecond = Math.min(duration, clock.elapsed + (1000 - (clock.elapsed % 1000)))
    const delay = nextSecond - clock.elapsed - (performance.now() - clock.sampledAt)
    const timer = window.setTimeout(
      () => {
        if (document.hidden) sample(null, true)
        else sample(performance.now(), false)
      },
      Math.max(1, delay),
    )
    return () => window.clearTimeout(timer)
  }, [clock, duration, sample])

  useEffect(() => {
    if (clock.phase === 'complete' && !reported.current) {
      reported.current = true
      onComplete()
    }
  }, [clock.phase, onComplete])

  function start() {
    if (document.hidden) return
    const now = performance.now()
    setClock((current) =>
      current.phase === 'ready' || current.phase === 'paused'
        ? { ...current, phase: 'running', sampledAt: now }
        : current,
    )
  }

  return (
    <section aria-label="Breathing break">
      <p className="mt-2 max-w-prose text-sm text-muted">
        Settle into a comfortable position. Breathe in gently, then let the air flow out at your own pace.
      </p>
      <div className="mt-4 rounded-xl border border-line bg-white/[0.04] p-5">
        <div className="flex items-baseline justify-between gap-2">
          <span aria-live="polite">
            {clock.phase === 'paused' ? 'Paused' : clock.phase === 'complete' ? 'Complete' : 'Time remaining'}
          </span>
          <span role="timer" aria-label="Seconds remaining" className="font-cond text-2xl tabular-nums">
            {remaining} s
          </span>
        </div>
        <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-white/80 motion-safe:transition-[width] motion-safe:duration-300"
            style={{ width: `${(100 * clock.elapsed) / duration}%` }}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {clock.phase === 'running' ? (
          <Button type="button" size="sm" onClick={(event) => sample(event.timeStamp, true)}>
            Pause
          </Button>
        ) : clock.phase !== 'complete' ? (
          <Button type="button" size="sm" kind="primary" onClick={start}>
            {clock.phase === 'paused' ? 'Resume breathing break' : 'Start breathing break'}
          </Button>
        ) : null}
        <Button type="button" size="sm" kind="ghost" onClick={onExit}>
          Leave exercise
        </Button>
      </div>
    </section>
  )
}
