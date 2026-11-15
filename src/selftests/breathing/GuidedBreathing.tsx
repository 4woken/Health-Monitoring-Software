import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import { Cue, Progress, type RunProps } from '../ui/parts'
import { beep, say } from '../voice'

/** Six breaths a minute: 4 seconds in, 6 seconds out. */
const IN_MS = 4000
const OUT_MS = 6000
const CYCLE_MS = IN_MS + OUT_MS
/** The voice says "in" and "out" for the first breaths only, then soft tones lead. */
const SPOKEN_CYCLES = 3
const FEELINGS = ['calmer', 'about the same', 'more tense'] as const

/** A paced breathing break. The circle grows as you breathe in and shrinks as you breathe out. */
export default function GuidedBreathing({ mode, onDone, onCancel }: RunProps) {
  const minutes = Number(mode) || 3
  const total = minutes * 60_000
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [ended, setEnded] = useState(false)
  const used = useRef(0)
  const since = useRef<number | null>(null)
  const lastHalf = useRef(-1)

  const clock = () => used.current + (since.current === null ? 0 : performance.now() - since.current)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const t = clock()
      setElapsed(t)
      const cycle = Math.floor(t / CYCLE_MS)
      const half = cycle * 2 + (t % CYCLE_MS < IN_MS ? 0 : 1)
      if (half !== lastHalf.current) {
        lastHalf.current = half
        const breathingIn = half % 2 === 0
        if (cycle < SPOKEN_CYCLES) void say(breathingIn ? 'Breathe in' : 'Breathe out', { rate: 0.85 })
        else beep(breathingIn ? 520 : 390, 160, 0.08)
      }
      if (t >= total) {
        clearInterval(id)
        since.current = null
        used.current = total
        setRunning(false)
        setEnded(true)
        void say('Well done. Breathe normally again.')
      }
    }, 100)
    return () => clearInterval(id)
  }, [running, total])

  useEffect(() => {
    const hide = () => {
      if (document.hidden && since.current !== null) {
        used.current += performance.now() - since.current
        since.current = null
        setRunning(false)
      }
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  const t = elapsed % CYCLE_MS
  const inhaling = t < IN_MS
  const grow = running ? (inhaling ? t / IN_MS : 1 - (t - IN_MS) / OUT_MS) : ended ? 0 : 0.15
  const finish = (feeling?: (typeof FEELINGS)[number]) =>
    onDone({
      score: Number((clock() / 60_000).toFixed(1)),
      details: { feeling: feeling ?? null, planned: minutes },
    })

  return (
    <section aria-label="Guided breathing" className="mx-auto max-w-2xl space-y-6 text-center">
      <div className="flex min-h-[44vh] items-center justify-center">
        <div
          aria-hidden="true"
          className="rounded-full bg-holo/25 ring-1 ring-holo/60"
          style={{
            width: `${12 + grow * 26}rem`,
            height: `${12 + grow * 26}rem`,
            maxWidth: '86vw',
            maxHeight: '86vw',
            transition: 'width 120ms linear, height 120ms linear',
          }}
        />
      </div>
      {!ended ? (
        <>
          <Cue>
            {running
              ? inhaling
                ? 'Breathe in…'
                : 'Breathe out, slowly…'
              : 'Sit comfortably. Press start when ready.'}
          </Cue>
          <Progress value={elapsed / total} label="Time" />
          <p className="text-[14px] text-muted">
            {Math.max(0, Math.ceil((total - elapsed) / 1000))} s left · 4 seconds in, 6 seconds out
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {running ? (
              <Button
                onClick={() => {
                  used.current = clock()
                  since.current = null
                  setRunning(false)
                }}
              >
                Pause
              </Button>
            ) : (
              <Button
                kind="primary"
                onClick={() => {
                  since.current = performance.now()
                  setRunning(true)
                }}
              >
                {elapsed > 0 ? 'Go on' : 'Start'}
              </Button>
            )}
            {elapsed >= 30_000 && !running && (
              <Button kind="ghost" onClick={() => setEnded(true)}>
                Finish here
              </Button>
            )}
            <Button kind="ghost" onClick={onCancel}>
              Leave
            </Button>
          </div>
        </>
      ) : (
        <fieldset className="space-y-3">
          <legend className="mx-auto text-[18px] font-medium">How do you feel now? (optional)</legend>
          <div className="flex flex-wrap justify-center gap-2">
            {FEELINGS.map((f) => (
              <Button key={f} onClick={() => finish(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
            <Button kind="ghost" onClick={() => finish()}>
              Skip
            </Button>
          </div>
        </fieldset>
      )}
    </section>
  )
}
