import { useCallback, useEffect, useRef, useState } from 'react'
import { Euler, MathUtils } from 'three'
import { Button, Segmented } from '../../ui'
import { neutralRig, type Solver } from './retarget'
import { vrmStage } from './vrmStage'
import { useComparisonInput, type SampleAngle, type InputSource } from './useComparisonInput'

export function AvatarComparison() {
  const [solver, setSolver] = useState<Solver>('hybrid')
  const [source, setSource] = useState<InputSource>('sample')
  const [angle, setAngle] = useState<SampleAngle>('front')
  const [stageStatus, setStageStatus] = useState('Loading the sample VRM…')
  const canvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const stage = useRef<ReturnType<typeof vrmStage> | null>(null)
  const stopCamera = useCallback(() => setSource('sample'), [])
  const { frame, status } = useComparisonInput(video, source, angle, stopCamera)

  useEffect(() => {
    if (!canvas.current) return
    try {
      stage.current = vrmStage(canvas.current, () => setStageStatus(''), setStageStatus)
    } catch {
      setStageStatus('WebGL is unavailable in this browser.')
    }
    return () => {
      stage.current?.dispose()
      stage.current = null
    }
  }, [])
  useEffect(() => {
    stage.current?.setPose(frame?.[solver] ?? neutralRig())
  }, [frame, solver])

  const rig = frame?.[solver]
  const yaw = rig && Math.round(MathUtils.radToDeg(new Euler().setFromQuaternion(rig.head, 'YXZ').y))
  return (
    <section className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6" aria-label="VRM avatar comparison">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Avatar movement comparison</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Hybrid uses KalidoKit for blinks and MediaPipe for mouth shape and head turns. Switch modes to
          compare the same pose.
        </p>
      </div>
      <Segmented
        label="Avatar solver"
        value={solver}
        onChange={setSolver}
        options={[
          { id: 'hybrid', label: 'Hybrid' },
          { id: 'direct', label: 'MediaPipe direct' },
          { id: 'kalidokit', label: 'KalidoKit' },
        ]}
      />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-[#29313c] to-[#0d1721]">
        <canvas
          ref={canvas}
          className="block h-[330px] w-full sm:h-[410px]"
          aria-label="Three-dimensional VRM pose preview"
        />
        {stageStatus && (
          <p role="status" className="absolute left-4 top-4 rounded-md bg-panel px-3 py-2 text-sm">
            {stageStatus}
          </p>
        )}
        <div className="absolute bottom-3 left-3 w-24 overflow-hidden rounded-lg border border-white/20 bg-panel sm:w-32">
          {source === 'sample' && (
            <img
              src={'/face/multiview/' + angle + '.jpg'}
              alt={'Input photo, ' + angle + ' view'}
              className="block w-full"
            />
          )}
          <video ref={video} playsInline muted className={source === 'camera' ? 'block w-full' : 'hidden'} />
        </div>
        {typeof yaw === 'number' && (
          <span className="absolute bottom-3 right-3 rounded-md bg-panel/90 px-3 py-1 text-xs text-muted">
            Head turn <strong className="font-medium tabular-nums text-ink">{yaw}°</strong>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {source === 'sample' && (
          <Segmented
            label="Sample head turn"
            value={angle}
            onChange={setAngle}
            size="sm"
            options={[
              { id: 'front', label: 'Front' },
              { id: 'left', label: 'Left cheek' },
              { id: 'right', label: 'Right cheek' },
            ]}
          />
        )}
        <Button size="sm" onClick={() => setSource(source === 'sample' ? 'camera' : 'sample')}>
          {source === 'sample' ? 'Try my webcam' : 'Stop webcam'}
        </Button>
      </div>
      <p aria-live="polite" className="text-sm text-muted">
        {status}
      </p>
      <p className="text-xs text-muted">
        Reference avatar © 2022 pixiv Inc. Your camera frames stay in this browser.
      </p>
    </section>
  )
}
