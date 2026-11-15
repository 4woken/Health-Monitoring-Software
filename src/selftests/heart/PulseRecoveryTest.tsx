import { useEffect, useRef, useState } from 'react'
import { getPulse, getPulseVideo, startPulse, stopPulse } from '../../camera/pulse/pulseSession'
import { Button } from '../../ui'
import { CameraStage, useCameraTest } from '../camera/CameraStage'
import type { CameraFrame } from '../camera/session'
import { bestLeg, squatTracker, standingLeg } from '../movement/movement'
import { Big, Cue, Progress, type RunProps } from '../ui/parts'
import { beep, say } from '../voice'
import { PulsePreview } from './PulsePreview'
import { BEAT_MS, dicksonIndex, PulseTrace, ruffierIndex, SQUAT_SECONDS, SQUATS } from './ruffier'
import { freshStrapBpm, useStrap } from './strap'

type Phase = 'rest' | 'frame' | 'countdown' | 'squats' | 'recover' | 'failed'

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
  const work = useRef({ start: 0, end: 0, squats: 0, p0: 0 })
  const active = phase !== 'failed'
  const movement = phase === 'frame' || phase === 'countdown' || phase === 'squats'
  const latestPhase = useRef(phase)
  latestPhase.current = phase
  const finish = useRef(onDone)
  finish.current = onDone

  function fail(message: string) {
    setProblem(message)
    setPhase('failed')
  }

  useEffect(() => {
    if (!active) return
    if (!usesStrap) void startPulse()
    void say('Sit still while I read your resting pulse.')
    const hide = () => {
      if (document.hidden)
        fail('The test was interrupted when you left this tab. Start a new test when ready.')
    }
    document.addEventListener('visibilitychange', hide)
    const id = window.setInterval(() => {
      const pulse = getPulse()
      if (!usesStrap && (pulse.phase === 'error' || pulse.phase === 'off')) return fail(pulse.message)
      if (usesStrap && strapRef.current.status !== 'connected')
        return fail('The strap disconnected. Reconnect it before starting a new test.')
      const bpm = usesStrap ? freshStrapBpm(strapRef.current) : pulse.phase === 'measuring' ? pulse.bpm : null
      if (bpm !== null) trace.current.push(performance.now(), bpm)
    }, 500)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      clearInterval(id)
      if (!usesStrap) stopPulse()
    }
  }, [active, usesStrap])

  useEffect(() => {
    if (phase !== 'rest') return
    const started = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const first = trace.current.firstAfter(started)
      const p0 = trace.current.between(now - REST_S * 1000, now, REST_S * 1.5)
      setProgress(first === null ? 0 : Math.min(1, (now - first) / (REST_S * 1000)))
      if (first !== null && now - first >= REST_S * 1000 && p0 !== null) {
        work.current.p0 = p0
        setPhase('frame')
        setCue('Stand side-on or at a slight angle, with your feet in view.')
        void say(
          'Stand side-on or at a slight angle with your feet in view. Stand still for a moment before the first squat.',
        )
      } else if (now - started > 90_000) {
        fail('Could not obtain a steady resting pulse. Check the sensor and start a new test.')
      }
    }, 500)
    return () => clearInterval(id)
  }, [phase])

  const { start: startCamera, stop: stopCamera } = camera
  useEffect(() => {
    if (!movement) return
    const stream = usesStrap ? undefined : getPulseVideo()?.srcObject
    if (!usesStrap && !(stream instanceof MediaStream)) {
      fail('The pulse camera stopped. Start a new test.')
      return
    }
    startCamera(
      (frame: CameraFrame) => {
        if (latestPhase.current !== 'squats') {
          const standing = standingLeg(bestLeg(frame.body, frame.aspect, undefined, frame.worldBody))
          if (standing) tracker.current.update(frame.body, frame.aspect, frame.now, frame.worldBody)
          else if (latestPhase.current === 'countdown') tracker.current = squatTracker()
          if (latestPhase.current === 'frame' && standing) setPhase('countdown')
          if (latestPhase.current === 'countdown' && !standing) setPhase('frame')
          return
        }
        if (performance.now() > work.current.end) return
        const { reps, message } = tracker.current.update(frame.body, frame.aspect, frame.now, frame.worldBody)
        setCue(`Squat on each beep. ${message}`)
        work.current.squats = reps
        setSquats(reps)
      },
      stream as MediaStream | undefined,
    )
    return stopCamera
  }, [movement, startCamera, stopCamera, usesStrap])

  useEffect(() => {
    if (movement && camera.stopped) fail(camera.stopped)
  }, [movement, camera.stopped])

  useEffect(() => {
    if (phase === 'frame') {
      setCue('Stand side-on or at a slight angle, with your feet in view. Hold still to start the countdown.')
      return
    }
    if (phase !== 'countdown') return
    let remaining = 3
    setCue(String(remaining))
    const timer = window.setInterval(() => {
      if (--remaining > 0) setCue(String(remaining))
      else {
        clearInterval(timer)
        work.current.start = performance.now()
        work.current.end = work.current.start + SQUAT_SECONDS * 1000
        setPhase('squats')
        setCue('Squat on each beep.')
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'squats') return
    let lastBeat = -1
    const tick = () => {
      const now = performance.now()
      if (document.hidden) return
      if (now >= work.current.end) {
        if (work.current.squats !== SQUATS) {
          fail(
            `Counted ${work.current.squats} of ${SQUATS} squats in ${SQUAT_SECONDS} seconds. No recovery score was saved.`,
          )
        } else {
          setSeconds(0)
          setProgress(0)
          setPhase('recover')
          setCue('Sit straight back down and keep still.')
          void say('Stop. Sit straight back down and keep still.')
        }
        return
      }
      const elapsed = now - work.current.start
      const beat = Math.floor(elapsed / BEAT_MS)
      if (lastBeat !== beat) {
        lastBeat = beat
        beep(beat % 10 === 0 ? 990 : 760, 90, 0.2, true)
      }
      setSeconds(Math.floor(elapsed / 1000))
    }
    tick()
    const timer = window.setInterval(tick, 75)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'recover') return
    const { end, p0, squats } = work.current
    const id = window.setInterval(() => {
      if (document.hidden) return
      const t = (performance.now() - end) / 1000
      setSeconds(Math.floor(t))
      setProgress(Math.min(1, t / RECOVER_S))
      if (t < RECOVER_S) return
      clearInterval(id)
      const first = trace.current.firstAfter(end)
      const p1 = usesStrap
        ? trace.current.between(end, end + 15_000, 2)
        : first !== null && first - end <= 45_000
          ? trace.current.between(first, first + 10_000, 3)
          : null
      const p2 =
        trace.current.between(end + 60_000, end + 75_000, 3) ??
        trace.current.between(end + 55_000, end + RECOVER_S * 1000, 3)
      if (p1 === null || p2 === null) {
        fail('A pulse reading was missing during recovery. No score was saved.')
        return
      }
      finish.current({
        score: ruffierIndex(p0, p1, p2),
        details: {
          p0,
          p1,
          p2,
          dickson: dicksonIndex(p0, p1, p2),
          squats,
          source: usesStrap ? 'strap' : 'camera',
          p1AfterS: first === null ? null : Math.round((first - end) / 1000),
        },
      })
    }, 500)
    return () => clearInterval(id)
  }, [phase, usesStrap])

  return (
    <section
      aria-label="Pulse recovery test"
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div>
        {movement ? (
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
            : movement
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
