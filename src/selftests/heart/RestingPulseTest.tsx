import { useEffect, useRef, useState } from 'react'
import { getPulse, startPulse, stopPulse } from '../../camera/pulse/pulseSession'
import { Button } from '../../ui'
import { median } from '../results'
import { Big, Cue, Progress, type RunProps } from '../ui/parts'
import { say } from '../voice'
import { PulsePreview } from './PulsePreview'
import { freshStrapBpm, useStrap } from './strap'

/** Seconds of good readings the result is made of. */
const NEEDED_S = 30

/** The pulse at rest: thirty seconds of good readings from the camera, or from a strap. */
export default function RestingPulseTest({ mode, onDone, onCancel }: RunProps) {
  const strap = useStrap()
  const readings = useRef<number[]>([])
  const [count, setCount] = useState(0)
  const [problem, setProblem] = useState('')
  const finished = useRef(false)
  const usesStrap = mode === 'strap'
  const strapRef = useRef(strap)
  strapRef.current = strap

  useEffect(() => {
    void say(
      usesStrap ? 'Sit still and breathe normally.' : 'Sit still, facing the camera, and breathe normally.',
    )
    if (!usesStrap) void startPulse()
    const settleUntil = performance.now() + 5000
    const id = window.setInterval(() => {
      if (finished.current || document.hidden) return
      const pulse = getPulse()
      if (usesStrap && strapRef.current.status !== 'connected') {
        clearInterval(id)
        setProblem('The strap disconnected. Reconnect it before starting a new reading.')
        return
      }
      if (!usesStrap && (pulse.phase === 'error' || pulse.phase === 'off')) {
        clearInterval(id)
        setProblem(pulse.message)
        return
      }
      const bpm = usesStrap ? freshStrapBpm(strapRef.current) : pulse.phase === 'measuring' ? pulse.bpm : null
      if (bpm === null || performance.now() < settleUntil) return
      readings.current.push(bpm)
      setCount(readings.current.length)
      if (readings.current.length >= NEEDED_S) {
        finished.current = true
        clearInterval(id)
        const score = Math.round(median(readings.current))
        if (!usesStrap) stopPulse()
        void say(`${score} beats a minute.`)
        onDone({ score, details: { source: usesStrap ? 'strap' : 'camera', seconds: NEEDED_S } })
      }
    }, 1000)
    return () => {
      clearInterval(id)
      if (!usesStrap && !finished.current) stopPulse()
    }
    // Runs once for the chosen source.
  }, [usesStrap])

  return (
    <section aria-label="Resting pulse" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      {usesStrap ? (
        <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-white/[0.04]">
          <Big value={strap.bpm ?? '—'} unit="bpm, strap" />
        </div>
      ) : (
        <PulsePreview />
      )}
      <aside className="space-y-4">
        <Cue>
          {problem ||
            (usesStrap
              ? 'Sit still and breathe normally.'
              : 'Sit still, facing the camera, and breathe normally.')}
        </Cue>
        <Progress value={count / NEEDED_S} label="Good readings" />
        <p className="text-[14px] text-muted">
          {count} of {NEEDED_S} seconds of good readings. Movement and light behind you pause the reading.
        </p>
        <Button size="sm" kind="ghost" onClick={onCancel}>
          {problem ? 'Back to setup' : 'Leave the test'}
        </Button>
      </aside>
    </section>
  )
}
