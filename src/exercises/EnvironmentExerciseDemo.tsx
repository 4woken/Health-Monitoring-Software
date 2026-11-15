import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
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

  const live = phase === 'running' || phase === 'paused'
  return (
    <section aria-label="Exercise here" className="mt-9">
      <h3 className="flex items-baseline justify-between gap-3 text-[15px] font-semibold">
        Exercise here
        <span className="font-cond text-[13px] font-normal text-white/45">
          {HABITATS[habitat].name}, {Number(gravity.toFixed(2))} g
        </span>
      </h3>
      <p className="mt-2 text-[15.5px] font-medium">{activity.title}</p>
      <p className="mt-0.5 text-[13.5px] leading-snug text-white/55">{activity.movement}</p>
      <div data-exercise-controls className="mt-3 flex flex-wrap items-center gap-2">
        {phase === 'running' ? (
          <Button size="sm" onClick={() => setPhase('paused')}>
            <Pause size={14} weight="fill" />
            Pause
          </Button>
        ) : (
          <Button size="sm" kind="primary" onClick={start}>
            <Play size={14} weight="fill" />
            {phase === 'paused' ? 'Resume' : phase === 'finished' ? 'Watch again' : 'Watch it on the body'}
          </Button>
        )}
        {live && (
          <Button size="sm" kind="ghost" onClick={() => setPhase('finished')}>
            End
          </Button>
        )}
        <span
          className="font-cond text-[13px] text-white/50 tabular-nums"
          role={phase === 'finished' ? 'status' : undefined}
        >
          {live
            ? `${Math.ceil(remaining / 1000)} s left`
            : phase === 'finished'
              ? 'Done'
              : '30 s, with the pulse and breathing it brings'}
        </span>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-snug text-white/45">
        {mode === 'cycle' || mode === 'row' ? 'The equipment' : 'Exercise at this gravity'}:{' '}
        <a
          className="underline decoration-white/30 underline-offset-2 hover:text-white"
          href={activity.source.url}
          target="_blank"
          rel="noreferrer"
        >
          {activity.source.label}
        </a>
      </p>
    </section>
  )
}
