import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import { Progress, type RunProps } from '../ui/parts'
import { say } from '../voice'
import { nextWait, PVT, summarize } from './pvt'

type Phase = 'ready' | 'wait' | 'lit' | 'feedback' | 'paused' | 'empty' | 'done'

/**
 * The 3-minute reaction test. A counter starts after a random wait; the person presses as soon as
 * it starts. The reaction time runs from the frame the counter is drawn to the time of the press.
 */
export default function ReactionTest({ onDone, onCancel }: RunProps) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [shown, setShown] = useState<string>('')
  const [elapsed, setElapsed] = useState(0)
  const times = useRef<number[]>([])
  const falseStarts = useRef(0)
  const onset = useRef<number | null>(null)
  const timer = useRef(0)
  const raf = useRef(0)
  /** Test time used so far, ms, and when the current stretch started. */
  const used = useRef(0)
  const since = useRef<number | null>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const finished = useRef(false)

  const clock = () => used.current + (since.current === null ? 0 : performance.now() - since.current)

  const clear = () => {
    clearTimeout(timer.current)
    cancelAnimationFrame(raf.current)
  }

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    clear()
    since.current = null
    setElapsed(PVT.durationMs)
    if (!times.current.length) {
      setPhase('empty')
      return
    }
    setPhase('done')
    void say('Done.')
    const s = summarize(times.current, falseStarts.current)
    onDone({
      score: s.medianMs,
      details: { lapses: s.lapses, falseStarts: s.falseStarts, trials: s.trials, speed: s.speed },
    })
  }, [onDone])

  const wait = useCallback(() => {
    if (clock() >= PVT.durationMs) return finish()
    setPhase('wait')
    setShown('')
    timer.current = window.setTimeout(() => setPhase('lit'), nextWait())
  }, [finish])

  // When the counter is drawn: start timing on the next frame, and count up on screen.
  useLayoutEffect(() => {
    if (phase !== 'lit') return
    onset.current = null
    raf.current = requestAnimationFrame((t0) => {
      onset.current = t0
      const tick = (t: number) => {
        const ms = Math.max(0, t - t0)
        if (counter.current) counter.current.textContent = String(Math.round(ms)).padStart(3, '0')
        if (ms >= PVT.timeoutMs) {
          times.current.push(PVT.timeoutMs)
          onset.current = null
          setShown('No press: counted as a lapse.')
          setPhase('feedback')
          timer.current = window.setTimeout(wait, 1000)
          return
        }
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf.current)
  }, [phase, wait])

  // The whole test clock, shown as a progress bar.
  useEffect(() => {
    if (phase === 'ready' || phase === 'paused' || phase === 'empty' || phase === 'done') return
    const id = window.setInterval(() => {
      const elapsed = clock()
      setElapsed(Math.min(elapsed, PVT.durationMs))
      if (elapsed >= PVT.durationMs) finish()
    }, 250)
    return () => clearInterval(id)
  }, [phase, finish])

  const pause = useCallback(() => {
    if (phase === 'ready' || phase === 'done' || phase === 'empty' || phase === 'paused') return
    clear()
    if (since.current !== null) used.current += performance.now() - since.current
    since.current = null
    onset.current = null
    setPhase('paused')
  }, [phase])

  useEffect(() => {
    const hide = () => document.hidden && pause()
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('blur', pause)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('blur', pause)
    }
  }, [pause])
  useEffect(() => clear, [])

  function press(timeStamp: number) {
    if (document.hidden) return
    if (phase === 'empty') {
      finished.current = false
      times.current = []
      falseStarts.current = 0
      used.current = 0
      setElapsed(0)
    }
    if (phase === 'ready' || phase === 'empty' || phase === 'paused') {
      since.current = performance.now()
      wait()
      return
    }
    if (phase === 'wait') {
      clearTimeout(timer.current)
      falseStarts.current++
      setShown('Too early. Wait for the counter.')
      setPhase('feedback')
      timer.current = window.setTimeout(wait, 1000)
      return
    }
    if (phase === 'lit' && onset.current !== null) {
      cancelAnimationFrame(raf.current)
      const rt = timeStamp - onset.current
      onset.current = null
      if (rt < PVT.falseStartMs) {
        falseStarts.current++
        setShown('Too early. Wait for the counter.')
      } else {
        times.current.push(rt)
        setShown(`${Math.round(rt)} ms`)
      }
      setPhase('feedback')
      timer.current = window.setTimeout(wait, 1000)
    }
  }

  const lit = phase === 'lit'
  const label: Record<Phase, string> = {
    ready: 'Press to start',
    wait: '',
    lit: '',
    feedback: shown,
    paused: 'Paused. Press to go on.',
    empty: 'No timed responses were recorded. Press to try again.',
    done: 'Done',
  }
  return (
    <section aria-label="Reaction test" className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3 text-[14px] text-muted">
        <span>
          {times.current.length} response{times.current.length === 1 ? '' : 's'} · {falseStarts.current} early
        </span>
        <span className="tabular-nums">
          {Math.max(0, Math.ceil((PVT.durationMs - elapsed) / 1000))} s left
        </span>
      </div>
      <div className="mt-2">
        <Progress value={elapsed / PVT.durationMs} label="Test time" />
      </div>
      <button
        type="button"
        disabled={phase === 'done'}
        onPointerDown={(e) => {
          if (e.isPrimary && e.button === 0) press(e.timeStamp)
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            if (!e.repeat) press(e.timeStamp)
          }
        }}
        onClick={(e) => {
          if (e.detail === 0) press(e.timeStamp)
        }}
        className={`mt-4 flex min-h-[46vh] w-full touch-manipulation flex-col items-center justify-center rounded-3xl border select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${lit ? 'border-white bg-white text-[#0d0f12]' : 'border-white/15 bg-white/[0.04] text-white'}`}
        aria-label="Response pad: press with Space, Enter or a tap"
      >
        {lit ? (
          <span ref={counter} className="font-cond text-[96px] leading-none font-semibold tabular-nums">
            000
          </span>
        ) : (
          <span className="px-6 text-center font-cond text-[28px] font-semibold" aria-live="polite">
            {label[phase]}
          </span>
        )}
      </button>
      <p className="mt-3 text-[14px] text-muted">
        Press Space, Enter or the pad as soon as the counter starts. The pad needs the focus: click it once if
        the keys do nothing.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {phase !== 'ready' && phase !== 'done' && phase !== 'empty' && phase !== 'paused' && (
          <Button size="sm" onClick={pause}>
            Pause
          </Button>
        )}
        <Button size="sm" kind="ghost" onClick={onCancel}>
          Leave the test
        </Button>
      </div>
    </section>
  )
}
