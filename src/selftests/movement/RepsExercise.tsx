import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import { CameraStage, useCameraTest } from '../camera/CameraStage'
import type { CameraFrame } from '../camera/session'
import { Big, Cue, Progress, type RunProps } from '../ui/parts'
import { beep, say } from '../voice'
import { heelRaiseTracker, squatTracker } from './movement'

const Coach = lazy(() => import('../coach/Coach'))
const REST_S = 30

/** Sets of squats or heel raises, counted by the camera, with a rest between sets. */
export default function RepsExercise({ mode, onDone, onCancel }: RunProps) {
  const [kind, plan] = mode.split(':') as ['squats' | 'heelRaises', string]
  const [sets, reps] = (plan ?? '2x10').split('x').map(Number)
  const squats = kind === 'squats'
  const camera = useCameraTest(['body'], { wide: true })
  const make = () => (squats ? squatTracker() : heelRaiseTracker())
  const tracker = useRef(make())
  const [set, setSet] = useState(1)
  const [count, setCount] = useState(0)
  const [cue, setCue] = useState(squats ? 'Stand side-on to the camera.' : 'Stand side-on, a hand on a wall.')
  const [rest, setRest] = useState(0)
  const live = useRef({ set: 1, resting: false, total: 0, shallow: 0, last: 0, done: false })

  useEffect(() => {
    void say(
      squats
        ? 'Stand side-on to the camera, feet hip-width apart.'
        : 'Stand side-on, a hand on a wall for balance.',
    )
    camera.start(onFrame)
    return () => camera.stop()
    // Set once: the frame handler keeps its state in refs.
  }, [])

  // The rest between sets.
  useEffect(() => {
    if (rest <= 0 || camera.stopped) return
    const id = window.setTimeout(() => {
      setRest((r) => r - 1)
      if (rest === 1) {
        live.current.resting = false
        tracker.current = make()
        live.current.last = 0
        setSet(live.current.set)
        setCount(0)
        beep(990, 200)
        void say(`Set ${live.current.set}. Go.`)
        setCue('Go.')
      }
    }, 1000)
    return () => clearTimeout(id)
  }, [rest, camera.stopped])

  function onFrame(frame: CameraFrame) {
    const s = live.current
    if (s.resting || s.done) return
    const v = tracker.current.update(frame.body, frame.aspect)
    setCue(v.message)
    if (v.reps === s.last) return
    s.last = v.reps
    setCount(v.reps)
    void say(String(v.reps))
    if (v.reps < reps) return
    s.total += v.reps
    s.shallow += v.shallow
    if (s.set >= sets) {
      s.done = true
      camera.stop()
      void say('Done. Well done.')
      onDone({ score: s.total, details: { sets, reps, shallow: s.shallow } })
      return
    }
    s.set++
    s.resting = true
    setRest(REST_S)
    setCue(`Rest ${REST_S} seconds.`)
    void say(`Rest ${REST_S} seconds.`)
  }

  return (
    <section
      aria-label={squats ? 'Squats' : 'Heel raises'}
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <CameraStage camera={camera} idle="Starting the camera…" />
      <aside className="space-y-4">
        <p className="font-cond text-[14px] text-white/60">
          Set {set} of {sets}
        </p>
        <Cue>{rest > 0 ? `Rest: ${rest} s` : cue}</Cue>
        <Big value={`${count} / ${reps}`} unit={squats ? 'squats' : 'heel raises'} />
        <Progress value={count / reps} label="Repetitions in this set" />
        <Suspense fallback={null}>
          <div className="mx-auto w-40">
            <Coach
              move={squats ? 'squat' : 'heelRaise'}
              small
              label={squats ? 'A figure doing squats' : 'A figure doing heel raises'}
            />
          </div>
        </Suspense>
        <Button size="sm" kind="ghost" onClick={onCancel}>
          {camera.stopped ? 'Try again' : 'Stop the exercise'}
        </Button>
      </aside>
    </section>
  )
}
