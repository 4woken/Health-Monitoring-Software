import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '../../ui'
import { Cue, Progress, type RunProps } from '../ui/parts'
import { audioContext, localVoice, voiceAvailable } from '../voice'
import { answer, DIGITS, DIN, dinDone, srt, startDin, triplet, voiceVolume, type DinState } from './din'

type Phase = 'setup' | 'sample' | 'playing' | 'answer' | 'paused' | 'done'
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

function subscribeVoices(notify: () => void) {
  const synth = window.speechSynthesis
  synth?.addEventListener('voiceschanged', notify)
  return () => synth?.removeEventListener('voiceschanged', notify)
}

/** Stop both audio sources as soon as a trial is interrupted. Only completed speech enables answers. */
function present(digits: number[], snr: number, voice: SpeechSynthesisVoice, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const stopNoise = startNoise()
    if (!stopNoise) throw new Error('This browser could not play the masking noise.')
    const synth = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(digits.join(', '))
    utterance.voice = voice
    utterance.lang = voice.lang
    utterance.volume = voiceVolume(snr)
    utterance.rate = 0.9
    let timer = 0
    const stop = () => {
      window.clearTimeout(timer)
      utterance.onend = null
      utterance.onerror = null
      signal.removeEventListener('abort', interrupted)
      stopNoise()
    }
    const interrupted = () => {
      stop()
      synth.cancel()
      reject(new Error('Audio interrupted.'))
    }
    signal.addEventListener('abort', interrupted, { once: true })
    utterance.onerror = interrupted
    utterance.onend = () => {
      stop()
      resolve()
    }
    timer = window.setTimeout(() => {
      timer = window.setTimeout(interrupted, 10000)
      synth.cancel()
      try {
        synth.speak(utterance)
      } catch {
        interrupted()
      }
    }, 500)
  })
}

/** Three digits in noise, 24 times; the voice follows the answers, the noise stays put. */
export default function HearingTest({ onDone, onCancel }: RunProps) {
  const hasVoice = useSyncExternalStore(subscribeVoices, voiceAvailable)
  const [phase, setPhase] = useState<Phase>('setup')
  const [din, setDin] = useState<DinState>(startDin)
  const [digits, setDigits] = useState<number[]>(() => triplet())
  const [typed, setTyped] = useState<number[]>([])
  const [error, setError] = useState('')
  const playback = useRef<AbortController | null>(null)
  const runVoice = useRef<SpeechSynthesisVoice | null>(null)
  useEffect(() => {
    const hide = () => {
      if (!document.hidden) return
      playback.current?.abort()
      setPhase((current) =>
        current === 'sample' ? 'setup' : current === 'playing' || current === 'answer' ? 'paused' : current,
      )
    }
    document.addEventListener('visibilitychange', hide)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      playback.current?.abort()
    }
  }, [])

  async function play(nextDigits: number[], snr: number, sample = false) {
    playback.current?.abort()
    const controller = new AbortController()
    playback.current = controller
    setPhase(sample ? 'sample' : 'playing')
    setTyped([])
    setError('')
    try {
      const voice = runVoice.current ?? localVoice()
      if (!voice) throw new Error('A local English voice is unavailable.')
      if (!sample) runVoice.current = voice
      await present(nextDigits, snr, voice, controller.signal)
      if (!controller.signal.aborted) setPhase(sample ? 'setup' : 'answer')
    } catch {
      if (!controller.signal.aborted) {
        setError('Audio could not finish. Check the sound output and try again.')
        setPhase(sample ? 'setup' : 'paused')
      }
    }
  }

  function type(d: number) {
    if (phase !== 'answer' || document.hidden || typed.length >= 3) return
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
          voice: runVoice.current?.name ?? 'unknown',
          ceiling: next.snrs.some((s) => voiceVolume(s) >= 1),
        },
      })
      return
    }
    const nextDigits = triplet()
    setDigits(nextDigits)
    void play(nextDigits, next.snrs[next.snrs.length - 1])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || phase !== 'answer' || e.ctrlKey || e.metaKey || e.altKey) return
      const n = Number(e.key)
      if ((DIGITS as readonly number[]).includes(n)) {
        e.preventDefault()
        type(n)
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        setTyped((t) => t.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!hasVoice)
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
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
      {phase === 'setup' || phase === 'sample' ? (
        <>
          <Cue>Put on your headphones, then play the sample.</Cue>
          <p className="text-[15px] leading-relaxed text-muted">
            Set your volume so the voice is clear and comfortable over the noise. Then do not touch the volume
            until the end. Use the same headphones every time, so runs can be compared.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={phase === 'sample'} onClick={() => void play([1, 2, 3], 0, true)}>
              {phase === 'sample' ? 'Playing sample…' : 'Play the sample'}
            </Button>
            <Button
              kind="primary"
              disabled={phase === 'sample'}
              onClick={() => void play(digits, din.snrs[0])}
            >
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
          {phase === 'paused' && (
            <Button kind="primary" onClick={() => void play(digits, din.snrs[din.correct.length])}>
              Replay this triplet
            </Button>
          )}
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
              disabled={phase !== 'answer' || !typed.length}
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
