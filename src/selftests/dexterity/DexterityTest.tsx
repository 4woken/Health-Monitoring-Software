import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Nut, SolarPanel } from '@phosphor-icons/react'
import { Button } from '../../ui'
import { CameraStage, useCameraTest } from '../camera/CameraStage'
import type { CameraFrame } from '../camera/session'
import type { Point } from '../camera/landmarks'
import { Big, Cue, type RunProps } from '../ui/parts'
import { beep, say } from '../voice'
import { layout, pinchTracker, targetExtent, TRANSFERS, type PinchView } from './pinch'

const at = (p: Point): CSSProperties => ({
  left: `${p.x * 100}%`,
  top: `${p.y * 100}%`,
  transform: 'translate(-50%,-50%)',
})

/** Eight solar cells to pinch, carry and drop in their sockets, timed from the first pinch. */
export default function DexterityTest({ onDone, onCancel }: RunProps) {
  const camera = useCameraTest(['hands'])
  const tracker = useRef(pinchTracker(TRANSFERS))
  const [view, setView] = useState<PinchView>(() => tracker.current.lost(0))
  const finished = useRef(false)
  const lastCount = useRef(0)

  useEffect(() => {
    void say('Raise one hand in front of the camera. Pinch each cell and drop it in its socket.')
    camera.start(onFrame)
    return () => camera.stop()
    // Set once: the frame handler keeps its state in refs.
  }, [])

  function onFrame(frame: CameraFrame) {
    const hand = frame.hands.length === 1 ? frame.hands[0] : null
    const v = hand
      ? tracker.current.update(hand.points, hand.side, frame.aspect, frame.now)
      : tracker.current.lost(frame.now)
    setView(v)
    if (v.count !== lastCount.current) {
      lastCount.current = v.count
      beep(880, 90)
    }
    if (v.timeS !== undefined && !finished.current) {
      finished.current = true
      camera.stop()
      void say(`Done in ${v.timeS.toFixed(1)} seconds.`)
      onDone({
        score: v.timeS,
        details: { drops: v.drops, fastest: v.splits.length ? Math.min(...v.splits) : null },
      })
    }
  }

  const { from, to, radius } = layout(view.count)
  const extent = targetExtent(radius, camera.frame?.aspect ?? 4 / 3)
  const size = { width: extent.x * 200 + '%', height: extent.y * 200 + '%' }
  return (
    <section
      aria-label="Hand dexterity test"
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <CameraStage camera={camera} showBody={false} showHands idle="Starting the camera…">
        <span
          className="absolute grid place-items-center rounded-md border-2 border-dashed border-white/90 bg-black/30 text-white"
          style={{ ...at(to), ...size }}
        >
          <Nut size={23} />
        </span>
        <span
          className="absolute grid place-items-center rounded-md border border-cyan-100 bg-sky-900/90 text-cyan-100 shadow-lg"
          style={{ ...at(view.carrying && view.cursor ? view.cursor : from), ...size }}
        >
          <SolarPanel size={27} />
        </span>
        {view.cursor && (
          <span
            className="absolute h-4 w-4 rounded-full border-[3px] border-white bg-cyan-500 shadow-md"
            style={at(view.cursor)}
          />
        )}
      </CameraStage>
      <aside className="space-y-4">
        <Cue>{view.prompt}</Cue>
        <Big value={`${view.count} / ${TRANSFERS}`} unit="cells" />
        <p className="font-cond text-[20px] tabular-nums text-muted">
          {view.elapsedS.toFixed(1)} s{view.drops ? ` · ${view.drops} dropped` : ''}
        </p>
        <p className="text-[14px] leading-relaxed text-muted">
          The clock starts with your first pinch. One hand only, facing the camera, in good light.
        </p>
        <Button size="sm" kind="ghost" onClick={onCancel}>
          {camera.stopped ? 'Try again' : 'Leave the test'}
        </Button>
      </aside>
    </section>
  )
}
