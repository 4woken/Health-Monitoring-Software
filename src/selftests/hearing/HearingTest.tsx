import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import { Cue, Progress, type RunProps } from '../ui/parts'
import { audioContext, localVoice, say } from '../voice'
import { answer, DIGITS, DIN, dinDone, srt, startDin, triplet, voiceVolume, type DinState } from './din'

type Phase = 'setup' | 'playing' | 'answer' | 'done'
const NOISE_GAIN = 0.12

/** A steady noise shaped roughly like speech: white noise between 120 Hz and 4 kHz. */
function startNoise(): (() => void) | null {
  const ctx = audioContext()
  if (!ctx) return null
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 4000
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 120
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(NOISE_GAIN, ctx.currentTime + 0.25)
  source.connect(high).connect(low).connect(gain).connect(ctx.destination)
  source.start()
  return () => {
    gain.gain.cancelScheduledValues(ctx.currentTime)
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2)
    source.stop(ctx.currentTime + 0.25)
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Plays three digits in the noise at a signal-to-noise ratio. */
async function present(digits: number[], snr: number, alive: () => boolean) {
  const stop = startNoise()
  await pause(500)
  if (alive()) await say(digits.join(', '), { volume: voiceVolume(snr), force: true, rate: 0.9 })
  await pause(400)
  stop?.()
}

/** Three digits in noise, 24 times; the voice follows the answers, the noise stays put. */
export default function HearingTest({ onDone, onCancel }: RunProps) {
  const voice = localVoice()
  const [phase, setPhase] = useState<Phase>('setup')
  const [din, setDin] = useState<DinState>(startDin)
  const [digits, setDigits] = useState<number[]>(() => triplet())
  const [typed, setTyped] = useState<number[]>([])
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
      window.speechSynthesis?.cancel()
    },
    [],
  )

  async function play(nextDigits: number[], snr: number) {
    setPhase('playing')
    setTyped([])
    await present(nextDigits, snr, () => alive.current)
    if (alive.current) setPhase('answer')
  }

  function type(d: number) {
    if (phase !== 'answer' || typed.length >= 3) return
    const now = [...typed, d]
    setTyped(now)
    if (now.length < 3) return
    const right = now.every((v, i) => v === digits[i])
    const next = answer(din, right)
    setDin(next)
    if (dinDone(next)) {
      setPhase('done')
      onDone({
        score: srt(next),
        details: {
          correct: next.correct.filter(Boolean).length,
          voice: voice?.name ?? 'unknown',
          ceiling: next.snrs.some((s) => voiceVolume(s) >= 1),
        },
      })
      return
    }
    const nextDigits = triplet()
    setDigits(nextDigits)
    window.setTimeout(() => void play(nextDigits, next.snrs[next.snrs.length - 1]), 500)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if ((DIGITS as readonly number[]).includes(n)) {
        e.preventDefault()
        type(n)
      }
      if (e.key === 'Backspace') setTyped((t) => t.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!voice)
    return (
      <section className="max-w-2xl space-y-4">
        <Cue>This device has no built-in voice, which the hearing test needs.</Cue>
        <p className="text-[15px] text-muted">
          Voices that run over the internet are not used, so that nothing leaves this device. Windows, macOS,
          iOS and Android include local voices; a browser on Linux may not.
        </p>
        <Button kind="ghost" onClick={onCancel}>
          Back
        </Button>
      </section>
    )

  const trial = din.correct.length + 1
  return (
    <section aria-label="Hearing test" className="mx-auto max-w-2xl space-y-5">
      {phase === 'setup' ? (
        <>
          <Cue>Put on your headphones, then play the sample.</Cue>
          <p className="text-[15px] leading-relaxed text-muted">
            Set your volume so the voice is clear and comfortable over the noise. Then do not touch the volume
            until the end. Use the same headphones every time, so runs can be compared.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void present([1, 2, 3], 0, () => alive.current)}>Play the sample</Button>
            <Button kind="primary" onClick={() => void play(digits, din.snrs[0])}>
              Start the test
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between text-[14px] text-muted">
            <span>
              Triplet {Math.min(DIN.trials, trial)} of {DIN.trials}
            </span>
            <span>{phase === 'playing' ? 'Listen…' : phase === 'answer' ? 'Type the three digits' : ''}</span>
          </div>
          <Progress value={din.correct.length / DIN.trials} label="Triplets done" />
          <div className="flex justify-center gap-3" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="flex h-16 w-14 items-center justify-center rounded-xl border border-white/20 bg-white/[0.04] font-cond text-[34px] font-semibold"
              >
                {typed[i] ?? ''}
              </span>
            ))}
          </div>
          <div className="mx-auto grid max-w-sm grid-cols-4 gap-2">
            {DIGITS.map((d) => (
              <button
                key={d}
                onClick={() => type(d)}
                disabled={phase !== 'answer'}
                className="press min-h-14 rounded-xl bg-white/[0.08] font-cond text-[24px] font-semibold hover:bg-white/[0.14] disabled:opacity-40"
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              kind="ghost"
              onClick={() => setTyped((t) => t.slice(0, -1))}
              disabled={!typed.length}
            >
              Delete
            </Button>
          </div>
          <p className="text-center text-[13px] text-dim">
            Each triplet plays once. Guess when you are unsure: guessing is part of the test.
          </p>
        </>
      )}
      <Button size="sm" kind="ghost" onClick={onCancel}>
        Leave the test
      </Button>
    </section>
  )
}
