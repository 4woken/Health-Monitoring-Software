import { lazy, Suspense, useState, type ComponentProps } from 'react'
import { Segmented } from '../ui'
import type { AvatarCapture } from './face/portrait'
import type { BreathReading } from './breathReading'
import { stopPulse } from './pulse/pulseSession'
import FaceFitter from './face/FaceFitter'

const PulseCamera = lazy(() => import('./pulse/PulseCamera'))
const RespirationCamera = lazy(() =>
  import('./respiration/RespirationCamera').then((module) => ({ default: module.RespirationCamera })),
)
const AvatarComparison = lazy(() =>
  import('./avatarLab/AvatarComparison').then((module) => ({ default: module.AvatarComparison })),
)

export type CameraView = 'portrait' | 'pulse' | 'respiration' | 'comparison'

type Props = ComponentProps<typeof FaceFitter> & {
  initialView: CameraView
  preflightRestingPulseBpm?: number
  onBreathReading: (reading: BreathReading) => void
  onBreathUnavailable: () => void
}

export default function CameraScreen({
  initialView,
  preflightRestingPulseBpm,
  onBreathReading,
  onBreathUnavailable,
  ...props
}: Props) {
  const [view, setView] = useState<CameraView>(initialView)
  const [capture, setCapture] = useState<AvatarCapture | null>(null)
  return (
    <div>
      <div className="mx-auto max-w-[1480px] px-4 pt-5 sm:px-6">
        <Segmented
          label="Camera workspace"
          value={view}
          className="max-w-full flex-wrap justify-center rounded-2xl sm:rounded-full"
          options={[
            { id: 'portrait', label: 'Face & body' },
            { id: 'pulse', label: 'Pulse camera' },
            { id: 'respiration', label: 'Breathing' },
            { id: 'comparison', label: 'Avatar comparison' },
          ]}
          onChange={(next) => {
            if (next !== 'pulse') stopPulse()
            setView(next)
          }}
        />
      </div>
      <Suspense
        fallback={
          <p role="status" className="p-6 text-muted">
            Loading camera tools…
          </p>
        }
      >
        {view === 'portrait' && <FaceFitter {...props} initialCapture={capture} />}
        {view === 'respiration' && (
          <RespirationCamera onReading={onBreathReading} onUnavailable={onBreathUnavailable} />
        )}
        {view === 'comparison' && <AvatarComparison />}
        {view === 'pulse' && (
          <PulseCamera
            preflightRestingPulseBpm={preflightRestingPulseBpm}
            hasPortrait={props.avatar !== null}
            onRemove={props.onRemove}
            onCapture={(portrait) => {
              setCapture(portrait)
              setView('portrait')
            }}
          />
        )}
      </Suspense>
    </div>
  )
}
