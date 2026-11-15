import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import { CameraStage, useCameraTest } from '../camera/CameraStage'
import type { CameraFrame } from '../camera/session'
import { Big, Cue, type RunProps } from '../ui/parts'
import { countdown, say } from '../voice'
import { armsCrossed, sitToStandTracker } from './movement'

const Coach = lazy(() => import('../coach/Coach'))

/** Five stands from a chair, timed by the camera from "go" to the fifth time fully up. */
export default function SitToStandTest({ onDone, onCancel }: RunProps) {
  const camera = useCameraTest(['body'], { wide: true })
  const tracker = useRef(sitToStandTracker(5))
  const [cue, setCue] = useState('Sit side-on to the camera, arms crossed on your chest.')
  const [stands, setStands] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const crossed = useRef<boolean[]>([])
  const countdownId = useRef(0)
  const counting = useRef(false)
  const finished = useRef(false)
  const lastStands = useRef(0)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    void say('Sit side-on to the camera, with your arms crossed on your chest.')
    camera.start(onFrame)
    return () => {
      cancelled.current = true
      countdownId.current++
      camera.stop()
    }
    // Set once: the frame handler keeps its state in refs.
  }, [])

  useEffect(() => {
    if (camera.stopped) countdownId.current++
  }, [camera.stopped])

  function onFrame(frame: CameraFrame) {
    const v = tracker.current.update(frame.body, frame.aspect, frame.now)
    if (v.phase === 'seat' && counting.current) {
      countdownId.current++
      counting.current = false
    }
    if (v.phase === 'running') crossed.current.push(armsCrossed(frame.body))
    setStands(v.stands)
    setElapsed(v.elapsedS)
    if (v.stands !== lastStands.current) {
      lastStands.current = v.stands
      if (v.stands > 0 && v.stands < 5) void say(String(v.stands))
    }
    if (v.phase === 'ready' && !counting.current) {
      counting.current = true
      const id = ++countdownId.current
      setCue('Ready.')
      void countdown(
        3,
        (n) => setCue(n ? String(n) : 'Go: stand up fully, five times.'),
        () => cancelled.current || countdownId.current !== id || document.hidden,
      ).then((go) => go && tracker.current.go(performance.now()))
      return
    }
    if (v.phase === 'done' && !finished.current && v.timeS !== undefined) {
      finished.current = true
      camera.stop()
      void say(`Five. ${v.timeS.toFixed(1)} seconds.`)
      const share = crossed.current.filter(Boolean).length / Math.max(1, crossed.current.length)
      onDone({ score: v.timeS, details: { armsCrossed: share >= 0.6 } })
      return
    }
    if (v.phase !== 'ready') setCue(v.message)
  }

  return (
    <section
      aria-label="Sit-to-stand test"
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <CameraStage camera={camera} idle="Starting the camera…" />
      <aside className="space-y-4">
        <Cue>{cue}</Cue>
        <Big value={`${stands} / 5`} unit="stands" />
        <p className="font-cond text-[20px] tabular-nums text-muted">{elapsed.toFixed(1)} s</p>
        <Suspense fallback={null}>
          <div className="mx-auto w-40">
            <Coach move="sitToStand" small label="A figure standing up from a chair" />
          </div>
        </Suspense>
        <Button size="sm" kind="ghost" onClick={onCancel}>
          {camera.stopped ? 'Try again' : 'Leave the test'}
        </Button>
      </aside>
    </section>
  )
}
