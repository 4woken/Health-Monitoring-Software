import { useEffect, useRef, useState } from 'react'
import { getPulse, getPulseVideo, startPulse, stopPulse } from '../../camera/pulse/pulseSession'
import { Button } from '../../ui'
import { CameraStage, useCameraTest } from '../camera/CameraStage'
import type { CameraFrame } from '../camera/session'
import { squatTracker } from '../movement/movement'
import { Big, Cue, Progress, type RunProps } from '../ui/parts'
import { beep, countdown, say } from '../voice'
import { PulsePreview } from './PulsePreview'
import { BEAT_MS, dicksonIndex, PulseTrace, ruffierIndex, SQUAT_SECONDS, SQUATS } from './ruffier'
import { freshStrapBpm, useStrap } from './strap'

type Phase = 'rest' | 'squats' | 'recover' | 'failed'

/** Seconds of steady readings that make the resting pulse. */
const REST_S = 20
/** The recovery lasts this long after the squats, s. */
const RECOVER_S = 80

/**
 * The Ruffier test: the pulse at rest, 30 squats in 45 seconds on the beeps, then the pulse straight
 * after and one minute later. With the camera, one camera stream serves the pulse and the squats.
 */
export default function PulseRecoveryTest({ mode, onDone, onCancel }: RunProps) {
  const usesStrap = mode === 'strap'
  const strap = useStrap()
  const strapRef = useRef(strap)
  strapRef.current = strap
  const camera = useCameraTest(['body'], { wide: usesStrap })
  const [phase, setPhase] = useState<Phase>('rest')
  const [cue, setCue] = useState('Sit facing the camera and keep still.')
  const [progress, setProgress] = useState(0)
  const [squats, setSquats] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [problem, setProblem] = useState('')
  const trace = useRef(new PulseTrace())
  const tracker = useRef(squatTracker())
  const endAt = useRef(0)
  const values = useRef({ p0: 0, squats: 0 })
  const cancelled = useRef(false)

  const read = () =>
    usesStrap ? freshStrapBpm(strapRef.current) : getPulse().phase === 'measuring' ? getPulse().bpm : null

  // The pulse source runs through the whole test.
  useEffect(() => {
    cancelled.current = false
    if (!usesStrap) void startPulse()
    void say('Sit facing the camera and keep still while I read your resting pulse.')
    const id = window.setInterval(() => {
      const bpm = read()
      if (bpm !== null) trace.current.push(performance.now(), bpm)
    }, 500)
    return () => {
      cancelled.current = true
      clearInterval(id)
      camera.stop()
      if (!usesStrap) stopPulse()
    }
    // Runs once for the chosen source.
  }, [usesStrap])

  // Rest: wait for steady readings, then start the squats.
  useEffect(() => {
    if (phase !== 'rest') return
    const startedAt = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const p0 = trace.current.between(now - REST_S * 1000, now, REST_S * 1.5)
      const first = trace.current.firstAfter(startedAt + 3000)
      setProgress(first === null ? 0 : Math.min(1, (now - first) / (REST_S * 1000)))
      if (p0 === null) {
        if (now - startedAt > 90_000) {
          setPhase('failed')
          setProblem(
            'No steady pulse reading in 90 seconds. Try again in even light, without light behind you, or use a strap.',
          )
        }
        return
      }
      clearInterval(id)
      values.current.p0 = p0
      void beginSquats()
    }, 500)
    return () => clearInterval(id)
  }, [phase])

  async function beginSquats() {
    setCue(`Resting pulse ${values.current.p0} bpm. Stand up and step back: your whole body in view.`)
    await say('Now stand up and step back, so your whole body is in view. Thirty squats, one on each beep.', {
      force: true,
    })
    if (cancelled.current) return
    setPhase('squats')
    await new Promise((r) => setTimeout(r, 3000))
    if (
      !(await countdown(
        3,
        (n) => setCue(n ? String(n) : 'Squat on each beep.'),
        () => cancelled.current,
      ))
    )
      return
    const start = performance.now()
    endAt.current = start + SQUAT_SECONDS * 1000
    let beats = 0
    const metronome = window.setInterval(() => {
      if (cancelled.current) return clearInterval(metronome)
      beats++
      beep(beats % 10 === 0 ? 990 : 760, 90, 0.2, true)
      setSeconds(Math.min(SQUAT_SECONDS, Math.round((performance.now() - start) / 1000)))
      if (beats >= SQUATS) {
        clearInterval(metronome)
        window.setTimeout(endSquats, BEAT_MS / 2)
      }
    }, BEAT_MS)
  }

  // The squats are counted on the same camera stream as the pulse, or on the camera with a strap.
  useEffect(() => {
    if (phase !== 'squats') return
    const stream = usesStrap ? undefined : ((getPulseVideo()?.srcObject as MediaStream | null) ?? undefined)
    camera.start(onFrame, stream)
    return () => camera.stop()
  }, [phase])

  function onFrame(frame: CameraFrame) {
    const v = tracker.current.update(frame.body, frame.aspect)
    if (v.reps !== values.current.squats) {
      values.current.squats = v.reps
      setSquats(v.reps)
    }
  }

  function endSquats() {
    if (cancelled.current) return
    camera.stop()
    const end = performance.now()
    setPhase('recover')
    setCue('Sit straight back down, facing the camera, and keep still.')
    void say('Stop. Sit straight back down facing the camera, and keep still.', { force: true })
    const id = window.setInterval(() => {
      const now = performance.now()
      const t = (now - end) / 1000
      setSeconds(Math.round(t))
      setProgress(Math.min(1, t / RECOVER_S))
      if (t < RECOVER_S) return
      clearInterval(id)
      // P1: the first steady readings after the effort; a strap reads within the first 15 s.
      const first = trace.current.firstAfter(end)
      const p1 = usesStrap
        ? trace.current.between(end, end + 15_000, 2)
        : first !== null && first - end <= 45_000
          ? trace.current.between(first, first + 10_000, 3)
          : null
      // P2: the second quarter-minute after the first minute of rest.
      const p2 =
        trace.current.between(end + 60_000, end + 75_000, 3) ??
        trace.current.between(end + 55_000, end + RECOVER_S * 1000, 3)
      const p0 = values.current.p0
      if (p1 === null || p2 === null) {
        setPhase('failed')
        setProblem(
          p1 === null
            ? 'The camera could not read your pulse straight after the squats. Sit still in even light, or use a heart-rate strap.'
            : 'The camera lost your pulse during the minute of rest. Try again, keeping still, or use a strap.',
        )
        return
      }
      if (!usesStrap) stopPulse()
      void say('Done.', { force: true })
      onDone({
        score: ruffierIndex(p0, p1, p2),
        details: {
          p0,
          p1,
          p2,
          dickson: dicksonIndex(p0, p1, p2),
          squats: values.current.squats,
          source: usesStrap ? 'strap' : 'camera',
          p1AfterS: first === null ? null : Math.round((first - end) / 1000),
        },
      })
    }, 500)
  }

  return (
    <section
      aria-label="Pulse recovery test"
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div>
        {phase === 'squats' ? (
          <CameraStage
            camera={camera}
            idle={usesStrap ? 'Starting the camera for the count…' : 'Starting…'}
          />
        ) : usesStrap ? (
          <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-white/[0.04]">
            <Big value={strap.bpm ?? '—'} unit="bpm, strap" />
          </div>
        ) : (
          <PulsePreview />
        )}
      </div>
      <aside className="space-y-4">
        <p className="font-cond text-[14px] text-white/60">
          {phase === 'rest'
            ? '1 of 3 · Resting pulse'
            : phase === 'squats'
              ? '2 of 3 · Squats'
              : phase === 'recover'
                ? '3 of 3 · Recovery'
                : 'Stopped'}
        </p>
        <Cue>{phase === 'failed' ? problem : cue}</Cue>
        {phase === 'squats' && (
          <>
            <Big value={`${squats} / ${SQUATS}`} unit="squats" />
            <p className="font-cond text-[18px] tabular-nums text-muted">
              {seconds} of {SQUAT_SECONDS} s
            </p>
          </>
        )}
        {(phase === 'rest' || phase === 'recover') && <Progress value={progress} label="Progress" />}
        {phase === 'recover' && (
          <p className="font-cond text-[18px] tabular-nums text-muted">{seconds} s since the squats</p>
        )}
        <Button size="sm" kind="ghost" onClick={onCancel}>
          {phase === 'failed' ? 'Back' : 'Leave the test'}
        </Button>
      </aside>
    </section>
  )
}
