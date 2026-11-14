import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { Button } from '../ui'

export interface ReactionResult {
  medianMs: number
  anticipations: number
}

type Phase = 'ready' | 'waiting' | 'lit' | 'paused' | 'finished'
interface Round {
  phase: Phase
  attempt: number
  times: number[]
  anticipations: number
  early: boolean
}
type Action =
  | { type: 'start' | 'pause' | 'early' }
  | { type: 'light'; attempt: number }
  | { type: 'hit'; elapsed: number; target: number }

export const firstRound: Round = { phase: 'ready', attempt: 0, times: [], anticipations: 0, early: false }

export function reactionRound(state: Round, action: Action): Round {
  switch (action.type) {
    case 'start':
      if (state.phase !== 'paused' && state.phase !== 'ready') return state
      return { ...state, phase: 'waiting', attempt: state.attempt + 1, early: false }
    case 'pause':
      return state.phase === 'lit' || state.phase === 'waiting' ? { ...state, phase: 'paused' } : state
    case 'light':
      return state.phase === 'waiting' && state.attempt === action.attempt
        ? { ...state, phase: 'lit', early: false }
        : state
    case 'early':
      if (state.phase !== 'waiting') return state
      return { ...state, anticipations: state.anticipations + 1, attempt: state.attempt + 1, early: true }
    case 'hit': {
      if (state.phase !== 'lit' || !Number.isFinite(action.elapsed) || action.elapsed < 0) return state
      const times = [...state.times, action.elapsed]
      return {
        ...state,
        times,
        phase: times.length >= action.target ? 'finished' : 'waiting',
        attempt: state.attempt + 1,
      }
    }
  }
}

export function reactionResult(round: Round): ReactionResult {
  const times = [...round.times].sort((a, b) => a - b)
  const mid = Math.floor(times.length / 2)
  return {
    medianMs: Math.round((times[Math.floor((times.length - 1) / 2)] + times[mid]) / 2),
    anticipations: round.anticipations,
  }
}

interface Props {
  target: number
  onComplete: (result: ReactionResult) => void
  onExit: () => void
}

/** The timer only arms a round. Reaction time starts when the lit control is committed to the screen. */
export function ReactionExercise({ target, onComplete, onExit }: Props) {
  const [round, dispatch] = useReducer(reactionRound, firstRound)
  const presentedAt = useRef<number | null>(null)
  const reported = useRef(false)
  const active = round.phase === 'waiting' || round.phase === 'lit'

  useEffect(() => {
    if (round.phase !== 'waiting') return
    const timer = window.setTimeout(
      () => {
        if (document.hidden) dispatch({ type: 'pause' })
        else dispatch({ type: 'light', attempt: round.attempt })
      },
      1200 + 2300 * Math.random(),
    )
    return () => window.clearTimeout(timer)
  }, [round.phase, round.attempt])

  useLayoutEffect(() => {
    presentedAt.current = round.phase === 'lit' ? performance.now() : null
  }, [round.phase])

  useEffect(() => {
    const pause = () => dispatch({ type: 'pause' })
    const checkPage = () => {
      if (document.hidden) pause()
    }
    document.addEventListener('visibilitychange', checkPage)
    window.addEventListener('blur', pause)
    return () => {
      document.removeEventListener('visibilitychange', checkPage)
      window.removeEventListener('blur', pause)
    }
  }, [])

  useEffect(() => {
    if (round.phase === 'finished' && !reported.current) {
      reported.current = true
      onComplete(reactionResult(round))
    }
  }, [round, onComplete])

  function press(timeStamp: number) {
    if (document.hidden) return
    if (round.phase === 'ready' || round.phase === 'paused') dispatch({ type: 'start' })
    else if (round.phase === 'waiting') dispatch({ type: 'early' })
    else if (round.phase === 'lit' && presentedAt.current !== null) {
      // Use the input event's time, even if its handler ran later on a busy device.
      const elapsed = timeStamp - presentedAt.current
      dispatch({ type: 'hit', elapsed, target })
    }
  }

  const lit = round.phase === 'lit'
  const labels: Record<Phase, string> = {
    ready: 'Start signals',
    waiting: 'Wait',
    lit: 'Tap now',
    paused: 'Resume signals',
    finished: 'Complete',
  }

  return (
    <section aria-label="Reaction light">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-cond text-2xl font-semibold">Reaction light</h3>
        <span className="text-sm tabular-nums text-muted">
          {round.times.length} / {target} signals
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        When the light appears, tap it or press Space with the pad focused.
      </p>
      <button
        type="button"
        disabled={round.phase === 'finished'}
        className={`mt-4 flex min-h-44 w-full touch-manipulation select-none flex-col items-center justify-center gap-3 rounded-xl border font-cond text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${lit ? 'border-white bg-white text-black' : 'border-white/20 bg-white/[0.04] text-white'}`}
        onPointerDown={(e) => {
          if (e.isPrimary && e.button === 0) press(e.timeStamp)
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            if (!e.repeat) press(e.timeStamp)
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') e.preventDefault()
        }}
        onClick={(e) => {
          // Assistive technology can activate a control without a pointer or key event.
          if (e.detail === 0) press(e.timeStamp)
        }}
      >
        <span
          aria-hidden="true"
          className={`h-9 w-9 rounded-full border-2 ${lit ? 'border-black bg-black' : 'border-white/35'}`}
        />
        <span aria-live="polite">{labels[round.phase]}</span>
      </button>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-muted">
        {round.phase === 'paused'
          ? 'Paused. Your completed signals are kept.'
          : round.early
            ? 'Early press. Wait for the next light.'
            : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {active && (
          <Button type="button" size="sm" onClick={() => dispatch({ type: 'pause' })}>
            Pause
          </Button>
        )}
        <Button type="button" size="sm" kind="ghost" onClick={onExit}>
          Leave exercise
        </Button>
      </div>
    </section>
  )
}

export default ReactionExercise
