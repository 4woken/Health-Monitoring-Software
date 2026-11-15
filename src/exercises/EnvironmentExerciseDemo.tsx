import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import type { HabitatId } from '../mission/habitats'
import { MISSIONS } from '../mission/missions'
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
  const [gravityChoice, setGravityChoice] = useState('mission')
  const gravityG = gravityChoice === 'mission' ? gravity : Number(gravityChoice)
  const [phase, setPhase] = useState<'ready' | 'running' | 'paused' | 'finished'>('ready')
  const [remaining, setRemaining] = useState(DURATION_MS)
  const timeLeft = useRef(DURATION_MS)
  const notify = useRef(onDemo)
  useEffect(() => {
    notify.current = onDemo
  }, [onDemo])

  useEffect(() => {
    if (phase === 'paused' && mode === 'row') {
      const elapsed = DURATION_MS - timeLeft.current
      notify.current({
        mode,
        gravityG,
        startedAt: performance.now() - elapsed,
        pausedSeconds: elapsed / 1000,
      })
      return () => notify.current(null)
    }
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
    notify.current({ mode, gravityG, startedAt: end - DURATION_MS })
    const timer = window.setInterval(update, 200)
    document.addEventListener('visibilitychange', pauseOnHide)
    return () => {
      timeLeft.current = Math.max(0, end - performance.now())
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', pauseOnHide)
      notify.current(null)
    }
  }, [phase, mode, gravityG])

  const start = () => {
    if (phase !== 'paused') {
      timeLeft.current = DURATION_MS
      setRemaining(DURATION_MS)
    }
    setPhase('running')
  }

  const live = phase === 'running' || phase === 'paused'
  // One sentence is enough here; the source sits behind the name.
  const line = activity.movement.split('. ')[0].replace(/\.$/, '') + '.'
  return (
    <section aria-label="Exercise" className="mt-8">
      <h3 className="text-[13.5px] font-medium text-white/55">Exercise</h3>
      <div className="mt-2 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={activity.source.url}
            target="_blank"
            rel="noreferrer"
            title={`${activity.source.label}. ${activity.movement}`}
            className="text-[15px] font-medium hover:underline hover:decoration-white/40 underline-offset-4"
          >
            {activity.title}
          </a>
          <p className="mt-0.5 truncate text-[13px] text-white/50">
            {live ? `${Math.ceil(remaining / 1000)} s left, on the body` : line}
          </p>
        </div>
        {mode === 'row' && !live && (
          <select
            aria-label="Gravity for the demo"
            className="h-7 shrink-0 rounded-full border border-white/15 bg-[#202226] px-2 font-cond text-[13px] text-white [&>option]:bg-[#202226] [&>option]:text-white"
            value={gravityChoice}
            onChange={(event) => setGravityChoice(event.target.value)}
          >
            <option value="mission">{gravity} g</option>
            <option value="0">0 g, weightless</option>
            <option value={MISSIONS.moon.gravity}>{MISSIONS.moon.gravity} g, Moon</option>
            <option value={MISSIONS.mars.gravity}>{MISSIONS.mars.gravity} g, Mars</option>
            <option value="1">1 g, Earth</option>
          </select>
        )}
        <div data-exercise-controls className="flex shrink-0 items-center gap-1">
          {live && (
            <button
              onClick={() => setPhase('finished')}
              className="press h-7 rounded-full px-2.5 text-[12.5px] text-white/60 hover:bg-white/10 hover:text-white"
            >
              End
            </button>
          )}
          <button
            onClick={phase === 'running' ? () => setPhase('paused') : start}
            title="Plays it on the body for 30 seconds, with the pulse and breathing it brings"
            className="press flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12.5px] font-medium hover:bg-white/20"
          >
            {phase === 'running' ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}
            {phase === 'running'
              ? 'Pause'
              : phase === 'paused'
                ? 'Resume'
                : phase === 'finished'
                  ? 'Again'
                  : 'Watch'}
          </button>
        </div>
      </div>
    </section>
  )
}
