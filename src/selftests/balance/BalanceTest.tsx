import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { Button } from '../../ui'
import { CameraStage, useCameraTest } from '../camera/CameraStage'
import { eyesClosed, type CameraFrame } from '../camera/session'
import type { Move } from '../catalog'
import { Big, Cue, type RunProps } from '../ui/parts'
import { beep, countdown, say } from '../voice'
import {
  balanceDetails,
  checkStance,
  CONDITIONS,
  holdTracker,
  totalHeld,
  type Condition,
  type Hold,
} from './balance'
import { allowMotion, measurePhoneHold } from './phone'

const Coach = lazy(() => import('../coach/Coach'))

const MOVE_OF: Record<Condition['id'], Move> = {
  together: 'together',
  togetherClosed: 'together',
  nod: 'nod',
  tandem: 'tandem',
  leftLeg: 'leftLeg',
  rightLeg: 'rightLeg',
}

type Stage = 'position' | 'countdown' | 'hold' | 'rest' | 'done'

/** Six stances, one after the other, with the camera or with the phone held on the chest. */
export default function BalanceTest({ mode, onDone, onCancel }: RunProps) {
  return mode === 'phone' ? (
    <PhoneBalance onDone={onDone} onCancel={onCancel} />
  ) : (
    <CameraBalance onDone={onDone} onCancel={onCancel} />
  )
}

function Stances({ index, holds }: { index: number; holds: Hold[] }) {
  return (
    <ol className="space-y-1.5 text-[14px]">
      {CONDITIONS.map((c, i) => {
        const h = holds.find((x) => x.id === c.id)
        return (
          <li
            key={c.id}
            className={`flex items-center justify-between gap-2 ${i === index ? 'text-ink' : 'text-white/55'}`}
          >
            <span className="flex items-center gap-2">
              {h ? (
                <CheckCircle size={15} weight="fill" />
              ) : (
                <span className="inline-block h-[15px] w-[15px]" />
              )}
              {c.title}
            </span>
            <span className="font-cond tabular-nums">
              {h ? `${h.heldS} / ${c.seconds} s` : `${c.seconds} s`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function CameraBalance({ onDone, onCancel }: Pick<RunProps, 'onDone' | 'onCancel'>) {
  const camera = useCameraTest(['body', 'face'], { wide: true })
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<Stage>('position')
  const [cue, setCue] = useState(CONDITIONS[0].instruction)
  const [left, setLeft] = useState(CONDITIONS[0].seconds)
  const [holds, setHolds] = useState<Hold[]>([])
  const live = useRef({
    index: 0,
    stage: 'position' as Stage,
    okSince: null as number | null,
    countdownId: 0,
  })
  const tracker = useRef<ReturnType<typeof holdTracker> | null>(null)
  const done = useRef<Hold[]>([])
  const cancelled = useRef(false)

  const condition = CONDITIONS[index]

  useEffect(() => {
    cancelled.current = false
    void say(CONDITIONS[0].instruction)
    camera.start(onFrame)
    return () => {
      cancelled.current = true
      live.current.countdownId++
      camera.stop()
    }
    // Set once: the frame handler keeps its state in refs.
  }, [])

  useEffect(() => {
    if (camera.stopped) {
      cancelled.current = true
      live.current.countdownId++
    }
  }, [camera.stopped])

  function setStageBoth(s: Stage) {
    live.current.stage = s
    setStage(s)
  }

  function next(hold: Hold) {
    done.current = [...done.current.filter((h) => h.id !== hold.id), hold]
    setHolds(done.current)
    tracker.current = null
    beep(520, 260)
    void say(hold.completed ? 'Stop. Well held.' : `Stop. ${hold.reason ?? ''}`)
    setStageBoth('rest')
    setCue(hold.completed ? 'Well held. Relax.' : `${hold.reason ?? 'Stopped.'} Relax.`)
    window.setTimeout(() => {
      if (cancelled.current) return
      const i = live.current.index + 1
      if (i >= CONDITIONS.length) {
        setStageBoth('done')
        camera.stop()
        void say('Balance test complete.')
        onDone({ score: totalHeld(done.current), details: balanceDetails(done.current, 'camera') })
        return
      }
      live.current = { ...live.current, index: i, okSince: null }
      setIndex(i)
      setLeft(CONDITIONS[i].seconds)
      setCue(CONDITIONS[i].instruction)
      void say(CONDITIONS[i].instruction)
      setStageBoth('position')
    }, 2500)
  }

  function onFrame(frame: CameraFrame) {
    const s = live.current
    const c = CONDITIONS[s.index]
    if (s.stage === 'position' || s.stage === 'countdown') {
      const check = checkStance(frame.body, c.stance, frame.aspect)
      const needsFace = c.eyes === 'closed' && eyesClosed(frame.face) === null
      if (!check.ok || needsFace) {
        if (s.stage === 'countdown') {
          s.countdownId++
          setStageBoth('position')
        }
        s.okSince = null
        setCue(check.ok ? 'Face the camera with both eyes visible before starting this stance.' : check.hint)
        return
      }
      if (s.stage === 'countdown') return
      setCue(`${c.title}: hold it…`)
      s.okSince ??= frame.now
      if (frame.now - s.okSince < 1500) return
      setStageBoth('countdown')
      const id = ++s.countdownId
      void countdown(
        3,
        (n) => setCue(n ? String(n) : c.eyes === 'closed' ? 'Close your eyes' : 'Hold still'),
        () => cancelled.current || document.hidden || s.countdownId !== id,
      ).then((go) => {
        if (!go) return
        if (c.eyes === 'closed') void say('Close your eyes.')
        tracker.current = holdTracker(c, performance.now())
        setStageBoth('hold')
      })
      return
    }
    if (s.stage !== 'hold' || !tracker.current) return
    const r = tracker.current.update({
      now: frame.now,
      aspect: frame.aspect,
      body: frame.body,
      eyesClosed: eyesClosed(frame.face),
    })
    setLeft(Math.max(0, Math.ceil(c.seconds - r.elapsedS)))
    if (r.warning) setCue(r.warning)
    else setCue(c.eyes === 'closed' ? 'Eyes closed. Hold still.' : 'Hold still.')
    if (!r.done) return
    if (r.done.interrupted) {
      tracker.current = null
      s.okSince = null
      const retry = `${r.done.reason} Get back into position to try this stance again.`
      void say(retry)
      setCue(retry)
      setStageBoth('position')
      return
    }
    next(r.done)
  }

  return (
    <section aria-label="Balance test" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <CameraStage camera={camera} idle="Starting the camera…" />
      <aside className="space-y-4">
        <p className="font-cond text-[14px] text-white/60">
          Stance {index + 1} of {CONDITIONS.length} · {condition.nasa}
        </p>
        <h3 className="text-[22px] leading-tight font-semibold">{condition.title}</h3>
        <Cue tone={stage === 'rest' ? 'done' : 'plain'}>{cue}</Cue>
        {stage === 'hold' && <Big value={left} unit="s left" label="Seconds left" />}
        <Suspense fallback={null}>
          <div className="mx-auto w-40">
            <Coach
              move={MOVE_OF[condition.id]}
              small
              eyesClosed={condition.eyes === 'closed'}
              label={`A figure showing: ${condition.title}`}
            />
          </div>
        </Suspense>
        <Stances index={index} holds={holds} />
        <Button size="sm" kind="ghost" onClick={onCancel}>
          {camera.stopped ? 'Try again' : 'Leave the test'}
        </Button>
      </aside>
    </section>
  )
}

function PhoneBalance({ onDone, onCancel }: Pick<RunProps, 'onDone' | 'onCancel'>) {
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<Stage>('position')
  const [cue, setCue] = useState('')
  const [left, setLeft] = useState(CONDITIONS[0].seconds)
  const [holds, setHolds] = useState<Hold[]>([])
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)
  useEffect(() => {
    const hide = () => {
      if (!document.hidden || !active.current) return
      active.current.abort()
      active.current = null
      setStarted(false)
      setError('The balance test stopped when you left this tab. Choose Begin to try again.')
    }
    document.addEventListener('visibilitychange', hide)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      active.current?.abort()
      active.current = null
    }
  }, [])

  async function run() {
    if (active.current) return
    const session = new AbortController()
    active.current = session
    const { signal } = session
    setError('')
    const allowed = await allowMotion()
    if (signal.aborted) return
    if (!allowed) {
      active.current = null
      setError('Motion access was declined. Allow it in the browser settings, or use the camera instead.')
      return
    }
    setStarted(true)
    const result: Hold[] = []
    setHolds([])
    for (let i = 0; i < CONDITIONS.length; i++) {
      if (signal.aborted) return
      const c = CONDITIONS[i]
      setIndex(i)
      setLeft(c.seconds)
      setStage('position')
      setCue(c.instruction)
      await say(`${c.instruction} Hold the phone flat on your chest.`, { force: true })
      if (signal.aborted) return
      await new Promise((r) => setTimeout(r, 3000))
      if (signal.aborted) return
      setStage('countdown')
      if (
        !(await countdown(
          3,
          (n) => setCue(n ? String(n) : 'Hold still'),
          () => signal.aborted,
        ))
      )
        return
      if (c.eyes === 'closed') void say('Close your eyes.', { force: true })
      setStage('hold')
      const hold = await measurePhoneHold(c, signal, setLeft)
      if (signal.aborted) return
      if (!hold) {
        active.current = null
        setStarted(false)
        setError('Motion readings stopped. Check the sensor permission or choose the camera.')
        return
      }
      result.push(hold)
      setHolds([...result])
      beep(520, 260, 0.18, true)
      setStage('rest')
      setCue(hold.completed ? 'Well held. Relax.' : `${hold.reason} Relax.`)
      await say(hold.completed ? 'Stop. Well held.' : `Stop. ${hold.reason}`, { force: true })
      if (signal.aborted) return
      await new Promise((r) => setTimeout(r, 2000))
    }
    if (signal.aborted) return
    active.current = null
    setStage('done')
    void say('Balance test complete.', { force: true })
    onDone({ score: totalHeld(result), details: balanceDetails(result, 'phone') })
  }

  return (
    <section aria-label="Balance test with the phone" className="mx-auto max-w-xl space-y-5">
      {!started ? (
        <>
          <Cue>Hold the phone flat against your chest with both hands, screen facing out.</Cue>
          <p className="text-[15px] leading-relaxed text-muted">
            The voice tells you each stance and when to stop; you will not need to look at the screen. Keep
            the phone pressed still against your chest: its motion sensor feels your sway.
          </p>
          {error && <p className="text-[14px] text-check">{error}</p>}
          <Button kind="primary" size="lg" onClick={() => void run()}>
            Begin
          </Button>
        </>
      ) : (
        <>
          <p className="font-cond text-[14px] text-white/60">
            Stance {index + 1} of {CONDITIONS.length}
          </p>
          <h3 className="text-[24px] leading-tight font-semibold">{CONDITIONS[index].title}</h3>
          <Cue tone={stage === 'rest' ? 'done' : 'plain'}>{cue}</Cue>
          {stage === 'hold' && <Big value={left} unit="s left" />}
          <Stances index={index} holds={holds} />
        </>
      )}
      <Button size="sm" kind="ghost" onClick={onCancel}>
        Leave the test
      </Button>
    </section>
  )
}
