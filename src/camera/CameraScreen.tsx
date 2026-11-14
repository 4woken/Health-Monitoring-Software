import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from 'react'
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

type Props = Pick<ComponentProps<typeof FaceFitter>, 'person' | 'build' | 'avatar'> & {
  onSavePortrait: (portrait: AvatarCapture | null) => Promise<void>
  onApplied: () => void
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
  onSavePortrait,
  onApplied,
  ...props
}: Props) {
  const [view, setView] = useState<CameraView>(initialView)
  const [capture, setCapture] = useState<AvatarCapture | null>(null)
  const [writing, setWriting] = useState(false)
  const [storageError, setStorageError] = useState('')
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const updatePortrait = async (portrait: AvatarCapture | null) => {
    setStorageError('')
    setWriting(true)
    try {
      if (portrait || props.avatar) await onSavePortrait(portrait)
    } catch {
      setStorageError(
        portrait
          ? 'This browser could not save your portrait. Check your browser storage and try applying it again.'
          : 'This browser could not remove your saved portrait. Try removing it again.',
      )
      return false
    } finally {
      setWriting(false)
    }
    setCapture(null)
    if (portrait && mounted.current) onApplied()
    return true
  }

  return (
    <fieldset className="min-w-0" disabled={writing} aria-busy={writing} aria-label="Camera tools">
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
            setStorageError('')
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
        {view === 'portrait' && (
          <FaceFitter
            {...props}
            initialCapture={capture}
            onPortrait={updatePortrait}
            storageError={storageError}
          />
        )}
        {view === 'respiration' && (
          <RespirationCamera onReading={onBreathReading} onUnavailable={onBreathUnavailable} />
        )}
        {view === 'comparison' && <AvatarComparison />}
        {view === 'pulse' && (
          <PulseCamera
            preflightRestingPulseBpm={preflightRestingPulseBpm}
            hasPortrait={props.avatar !== null}
            onRemove={() => updatePortrait(null)}
            storageError={storageError}
            onCapture={(portrait) => {
              setCapture(portrait)
              setView('portrait')
            }}
          />
        )}
      </Suspense>
    </fieldset>
  )
}
