import { useEffect, useRef, useState } from 'react'
import type { HabitatId } from '../mission/habitats'
import { HABITATS } from '../mission/habitats'
import { Button } from '../ui'
import type { OnExerciseDemo } from './demoVitals'
import { ENVIRONMENT_EXERCISES, environmentMotion } from './environmentExercise'

const DURATION_MS = 30_000

export default function EnvironmentExerciseDemo({
  habitat,
  gravity,
  onDemo,
}: {
  habitat: HabitatId
  gravity: number
  onDemo: OnExerciseDemo
}) {
  const mode = environmentMotion(habitat, gravity)
  const activity = ENVIRONMENT_EXERCISES[mode]
  const [phase, setPhase] = useState<'ready' | 'running' | 'paused' | 'finished'>('ready')
  const [remaining, setRemaining] = useState(DURATION_MS)
  const timeLeft = useRef(DURATION_MS)
  const notify = useRef(onDemo)
  useEffect(() => {
    notify.current = onDemo
  }, [onDemo])

  useEffect(() => {
    if (phase !== 'running') return
    if (document.hidden) {
      setPhase('paused')
      return
    }
    const end = performance.now() + timeLeft.current
    const update = () => {
      timeLeft.current = Math.max(0, end - performance.now())
      setRemaining(timeLeft.current)
      if (timeLeft.current === 0) setPhase('finished')
    }
    const pauseOnHide = () => {
      if (document.hidden) {
        update()
        setPhase(timeLeft.current > 0 ? 'paused' : 'finished')
      }
    }
    notify.current(mode, (DURATION_MS - timeLeft.current) / 1000)
    const timer = window.setInterval(update, 200)
    document.addEventListener('visibilitychange', pauseOnHide)
    return () => {
      timeLeft.current = Math.max(0, end - performance.now())
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', pauseOnHide)
      notify.current(null)
    }
  }, [phase, mode])

  const start = () => {
    if (phase !== 'paused') {
      timeLeft.current = DURATION_MS
      setRemaining(DURATION_MS)
    }
    setPhase('running')
  }

  return (
    <section
      aria-label="Environment exercise demo"
      className="my-5 rounded-2xl border border-white/15 bg-white/[0.04] p-4"
    >
      <p className="font-cond text-sm text-white/65">
        {HABITATS[habitat].name} · {Number(gravity.toFixed(2))} g · Avatar demo
      </p>
      <h3 className="mt-1 text-xl font-medium">{activity.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{activity.movement}</p>
      <p className="mt-2 text-sm text-muted">30-second animation with simulated pulse and breathing.</p>
      <div data-exercise-controls className="mt-3 flex flex-wrap items-center gap-2">
        {phase === 'running' ? (
          <Button size="sm" onClick={() => setPhase('paused')}>
            Pause demo
          </Button>
        ) : (
          <Button size="sm" onClick={start}>
            {phase === 'paused' ? 'Resume demo' : phase === 'finished' ? 'Replay demo' : 'Start avatar demo'}
          </Button>
        )}
        {(phase === 'running' || phase === 'paused') && (
          <>
            <Button size="sm" kind="ghost" onClick={() => setPhase('finished')}>
              End demo
            </Button>
            <span className="text-sm tabular-nums text-muted">{Math.ceil(remaining / 1000)} s left</span>
          </>
        )}
        {phase === 'finished' && (
          <span className="text-sm text-muted" role="status">
            Demo finished
          </span>
        )}
      </div>
      <details className="mt-3 text-sm text-muted">
        <summary className="w-fit cursor-pointer">Research behind this demo</summary>
        <p className="mt-2">
          {mode === 'cycle' || mode === 'row'
            ? 'Equipment background'
            : 'Research on exercise at different gravity levels'}
        </p>
        <a
          className="underline underline-offset-4"
          href={activity.source.url}
          target="_blank"
          rel="noreferrer"
        >
          {activity.source.label}
        </a>
      </details>
    </section>
  )
}
