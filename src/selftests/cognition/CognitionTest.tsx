import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import { Cue, Progress, type RunProps } from '../ui/parts'
import { say } from '../voice'
import {
  digitFor,
  DSST_SECONDS,
  isTarget,
  makeKey,
  N_BACK,
  nBackSequence,
  nextSymbol,
  scoreNBack,
  SYMBOL_PATHS,
} from './cognition'

type Phase =
  'symbolsIntro' | 'symbolsPractice' | 'symbols' | 'lettersIntro' | 'lettersPractice' | 'letters' | 'done'

function Glyph({ index, size = 40 }: { index: number; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d={SYMBOL_PATHS[index]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

const PRACTICE_SYMBOLS = 4
const PRACTICE_LETTERS = ['K', 'R', 'K', 'T', 'M', 'T', 'B', 'M']

/** Digit Symbol Substitution for 90 seconds, then a 2-back, each with a short practice first. */
export default function CognitionTest({ onDone, onCancel }: RunProps) {
  const [phase, setPhase] = useState<Phase>('symbolsIntro')
  const [key] = useState(() => makeKey())
  const [symbol, setSymbol] = useState(() => nextSymbol(null))
  const [feedback, setFeedback] = useState('')
  const [left, setLeft] = useState(DSST_SECONDS)
  const counts = useRef({ correct: 0, errors: 0, practice: 0 })
  const endAt = useRef(0)
  const [seq] = useState(() => nBackSequence())
  const [index, setIndex] = useState(-1)
  const [visible, setVisible] = useState(false)
  const pressed = useRef<boolean[]>([])
  const [, redraw] = useState(0)
  const result = useRef<{ correct: number; errors: number } | null>(null)

  const answer = useCallback(
    (digit: number) => {
      if (phase !== 'symbols' && phase !== 'symbolsPractice') return
      const right = digitFor(key, symbol) === digit
      if (phase === 'symbolsPractice') {
        setFeedback(right ? 'Right.' : `Not quite: this symbol is ${digitFor(key, symbol)}.`)
        if (!right) return
        counts.current.practice++
        if (counts.current.practice >= PRACTICE_SYMBOLS) {
          setFeedback('')
          setPhase('symbols')
          endAt.current = performance.now() + DSST_SECONDS * 1000
          void say('Go. Ninety seconds.')
        }
      } else if (right) counts.current.correct++
      else counts.current.errors++
      setSymbol((s) => nextSymbol(s))
      redraw((n) => n + 1)
    },
    [phase, key, symbol],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        answer(Number(e.key))
      }
      if ((phase === 'letters' || phase === 'lettersPractice') && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        match()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The 90 seconds of symbols.
  useEffect(() => {
    if (phase !== 'symbols') return
    const id = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt.current - performance.now()) / 1000))
      setLeft(remaining)
      if (remaining <= 0) {
        clearInterval(id)
        result.current = { correct: counts.current.correct, errors: counts.current.errors }
        setPhase('lettersIntro')
        void say('Time. Now the letters.')
      }
    }, 200)
    return () => clearInterval(id)
  }, [phase])

  // Letters: each one shown for 1.5 seconds, then half a second of blank.
  const letters = phase === 'lettersPractice' ? PRACTICE_LETTERS : seq
  useEffect(() => {
    if (phase !== 'letters' && phase !== 'lettersPractice') return
    if (index >= letters.length) {
      if (phase === 'lettersPractice') {
        setFeedback('')
        setIndex(-1)
        pressed.current = []
        setPhase('letters')
        void say('Go.')
      } else {
        const n = scoreNBack(seq, pressed.current)
        const symbols = result.current ?? { correct: counts.current.correct, errors: counts.current.errors }
        setPhase('done')
        onDone({
          score: symbols.correct,
          details: {
            errors: symbols.errors,
            nBack: n.accuracy,
            hits: n.hits,
            misses: n.misses,
            falseAlarms: n.falseAlarms,
          },
        })
      }
      return
    }
    if (index < 0) {
      const t = window.setTimeout(() => setIndex(0), 900)
      return () => clearTimeout(t)
    }
    setVisible(true)
    const hide = window.setTimeout(() => setVisible(false), N_BACK.showMs)
    const next = window.setTimeout(() => {
      if (phase === 'lettersPractice' && isTarget(letters, index) && !pressed.current[index])
        setFeedback(`That ${letters[index]} was a match: it came two letters before.`)
      setIndex((i) => i + 1)
    }, N_BACK.showMs + N_BACK.gapMs)
    return () => {
      clearTimeout(hide)
      clearTimeout(next)
    }
  }, [phase, index, letters, seq, onDone])

  function match() {
    if ((phase !== 'letters' && phase !== 'lettersPractice') || index < 0 || index >= letters.length) return
    if (pressed.current[index]) return
    pressed.current[index] = true
    if (phase === 'lettersPractice')
      setFeedback(
        isTarget(letters, index) ? 'Right: a match.' : 'Not a match: it differs from two letters before.',
      )
    redraw((n) => n + 1)
  }

  const keyRow = (
    <div className="grid grid-cols-9 gap-1.5 rounded-2xl bg-white/[0.05] p-3" aria-label="The key">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <Glyph index={key[i]} size={30} />
          <span className="font-cond text-[18px] font-semibold">{i + 1}</span>
        </div>
      ))}
    </div>
  )

  return (
    <section aria-label="Thinking test" className="mx-auto max-w-3xl space-y-5">
      {(phase === 'symbolsIntro' || phase === 'symbolsPractice' || phase === 'symbols') && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="font-cond text-[15px] text-white/70">Part 1 of 2 · Symbols</p>
            {phase === 'symbols' && (
              <p className="tabular-nums text-[15px] text-muted">
                {left} s · {counts.current.correct} matched
              </p>
            )}
          </div>
          {phase === 'symbols' && <Progress value={1 - left / DSST_SECONDS} label="Time" />}
          {keyRow}
          {phase === 'symbolsIntro' ? (
            <div className="space-y-3">
              <Cue>Type the digit that goes with the symbol in the middle, using the key above.</Cue>
              <p className="text-[15px] text-muted">
                Four practice symbols first, then 90 seconds. Use the number keys, or the buttons below.
              </p>
              <Button kind="primary" onClick={() => setPhase('symbolsPractice')}>
                Start the practice
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-h-40 flex-col items-center justify-center rounded-3xl border border-white/15 bg-white/[0.03]">
                <Glyph index={symbol} size={96} />
              </div>
              <p className="min-h-6 text-center text-[15px] text-muted" aria-live="polite">
                {phase === 'symbolsPractice' ? feedback || 'Practice: no clock yet.' : ''}
              </p>
              <div className="grid grid-cols-9 gap-1.5">
                {Array.from({ length: 9 }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => answer(i + 1)}
                    className="press min-h-12 rounded-xl bg-white/[0.08] font-cond text-[20px] font-semibold hover:bg-white/[0.14]"
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {(phase === 'lettersIntro' || phase === 'lettersPractice' || phase === 'letters') && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="font-cond text-[15px] text-white/70">Part 2 of 2 · Letters</p>
            {phase === 'letters' && (
              <p className="tabular-nums text-[15px] text-muted">
                {Math.max(0, Math.min(seq.length, index + 1))} of {seq.length}
              </p>
            )}
          </div>
          {phase === 'letters' && <Progress value={Math.max(0, index) / seq.length} label="Letters shown" />}
          {phase === 'lettersIntro' ? (
            <div className="space-y-3">
              <Cue>Press Match when a letter is the same as the one two letters before.</Cue>
              <p className="text-[15px] text-muted">
                For example in K, R, K the second K is a match. Eight practice letters first, then{' '}
                {seq.length}.
              </p>
              <Button kind="primary" onClick={() => setPhase('lettersPractice')}>
                Start the practice
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-h-48 items-center justify-center rounded-3xl border border-white/15 bg-white/[0.03]">
                <span className="font-cond text-[110px] leading-none font-semibold" aria-live="off">
                  {visible && index >= 0 && index < letters.length ? letters[index] : ''}
                </span>
              </div>
              <p className="min-h-6 text-center text-[15px] text-muted" aria-live="polite">
                {phase === 'lettersPractice' ? feedback || 'Practice.' : ''}
              </p>
              <Button kind="primary" size="lg" className="w-full" onClick={match}>
                Match (Space)
              </Button>
            </>
          )}
        </>
      )}

      {phase === 'done' && <Cue tone="done">Done.</Cue>}

      <Button size="sm" kind="ghost" onClick={onCancel}>
        Leave the test
      </Button>
    </section>
  )
}
