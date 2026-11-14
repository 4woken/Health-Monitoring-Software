import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_FACE_CALIBRATION,
  faceCalibration,
  type AvatarCapture,
  type PersonalAvatar,
} from './portrait'
import type { Build } from '../../body/anatomy/bodyShape'
import BodyViewer from '../../body/BodyViewer'
import { Button, Segmented } from '../../ui'
import { ThreeAngleControls } from './ThreeAngleControls'
import { useThreeAngleScan } from './useThreeAngleScan'
import { useFaceTracking } from './useFaceTracking'

/** Frame a face with the camera, check how it sits on the 3D head, then use it on the body. */
export default function FaceFitter({
  person,
  onCapture,
  onRemove,
  avatar,
  build,
  onSkip,
  skipLabel = 'Back to the body',
  initialCapture,
}: {
  /** Whose face this is, as the interface calls them. */
  person: string
  onCapture: (capture: AvatarCapture) => void
  onRemove: () => void
  avatar: PersonalAvatar | null
  build: Build
  onSkip: () => void
  skipLabel?: string
  initialCapture?: AvatarCapture | null
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [draft, setDraft] = useState<AvatarCapture | null>(initialCapture ?? avatar)
  const [calibration, setCalibration] = useState(() =>
    faceCalibration((initialCapture ?? avatar)?.calibration),
  )
  const [busy, setBusy] = useState(false),
    [captureError, setCaptureError] = useState('')
  const camera = useFaceTracking(video)
  const [mode, setMode] = useState<'portrait' | 'scan'>(
    (initialCapture ?? avatar)?.sideViews ? 'scan' : 'portrait',
  )
  const quickEpoch = useRef(0)
  useEffect(
    () => () => {
      quickEpoch.current++
    },
    [],
  )
  const portrait = useMemo(() => (draft ? { ...draft, calibration } : null), [draft, calibration])
  const review = (capture: AvatarCapture) => {
    setDraft(capture)
    setCalibration(DEFAULT_FACE_CALIBRATION)
    setCaptureError('')
    camera.stop()
    camera.aimAt()
  }
  const three = useThreeAngleScan(camera, review)
  const cancel = () => {
    quickEpoch.current++
    setBusy(false)
    setCaptureError('')
    three.cancel()
  }
  const changeMode = (next: typeof mode) => {
    if (mode === next) return
    cancel()
    setMode(next)
  }
  const trackingPreview = camera.enabled && (!three.session || three.session.angle === 'front')
  const scanFront = three.session?.photos.front
  const scanPortrait = useMemo<AvatarCapture | null>(
    () => (scanFront ? { ...scanFront, calibration } : null),
    [scanFront, calibration],
  )
  const preview = three.session ? scanPortrait : portrait
  let previewLabel = 'Reference body · ready to personalise'
  if (preview) {
    if (preview.sideViews)
      previewLabel = preview.sample ? 'Reference sample · three-angle fit' : 'Three-angle fit · review'
    else previewLabel = preview.sample ? 'Fictional sample · fit preview' : 'Portrait · fit preview'
  }
  if (trackingPreview)
    previewLabel =
      camera.source === 'sample'
        ? 'Fictional motion sample · auto-fit preview'
        : 'Live preview · automatically fitted'
  else if (three.session && scanFront) previewLabel = 'Front view saved · capturing remaining angles'
  const adjustments = [
    { key: 'scale', label: 'Face size', min: 0.8, max: 1.25, step: 0.01 },
    { key: 'x', label: 'Left / right', min: -0.25, max: 0.25, step: 0.01 },
    { key: 'y', label: 'Height', min: -0.35, max: 0.35, step: 0.01 },
    { key: 'shape', label: '3D face fit', min: 0, max: 1, step: 0.05 },
    { key: 'skinMatch', label: 'Skin colour blend', min: 0, max: 1, step: 0.05 },
  ] as const
  return (
    <section
      aria-label="Portrait fitting studio"
      className="avatar-studio mx-auto max-w-[1480px] px-4 py-6 sm:px-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{person}&apos;s face on the body</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Fit a portrait or capture three angles to shape the nose and cheeks. Turn the model to inspect the
            fit before applying it to your crew profile.
          </p>
        </div>
        <Button onClick={onSkip}>{skipLabel}</Button>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
        <section
          className="avatar-canvas relative h-[540px] overflow-hidden rounded-3xl border border-line lg:sticky lg:top-[80px] lg:h-[calc(100dvh-100px)] lg:min-h-[440px]"
          aria-label="Connected face and body preview"
        >
          <BodyViewer
            build={build}
            physiology={{ fluidShiftL: 0, fluidShiftShare: 0, bonePct: 100, musclePct: 100 }}
            restingBpm={60}
            layer="signals"
            onLayer={() => {}}
            studio
            avatar={preview}
            calibration={calibration}
            liveFace={trackingPreview ? camera.liveFace : null}
            initialView="head"
            hotspots={[]}
            activeId={null}
            focusId={null}
            onPick={() => {}}
          />
          <div className="pointer-events-none absolute top-4 left-4 right-16 z-[5] rounded-xl bg-panel/90 px-4 py-3 text-xs text-muted">
            <p className="font-medium text-ink">{previewLabel}</p>
            <p className="mt-1">Drag to turn. Use Head or Body to check the connection from another view.</p>
          </div>
        </section>
        <aside className="space-y-5 rounded-3xl border border-line bg-panel p-5">
          <section>
            <h2 className="studio-step">1. Frame the face</h2>
            <Segmented
              label="Face capture mode"
              value={mode}
              size="sm"
              className="mt-3"
              options={[
                { id: 'portrait', label: 'Quick portrait' },
                { id: 'scan', label: 'Three-angle scan' },
              ]}
              onChange={changeMode}
            />
            <video
              ref={video}
              muted
              playsInline
              className={`mt-3 aspect-[4/3] w-full rounded-xl bg-ground object-cover ${camera.enabled ? '' : 'hidden'}`}
              style={{ transform: 'scaleX(-1)' }}
            />
            {!camera.enabled && !three.session && draft && !draft.sideViews && (
              <img
                src={draft.imageUrl}
                alt={draft.sample ? 'Fictional sample portrait' : 'Captured portrait for this session'}
                className="mt-3 mx-auto h-28 w-28 rounded-2xl border border-line object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {mode === 'portrait'
                ? 'Use even light, face straight ahead and keep your whole face visible.'
                : three.session?.source === 'files'
                  ? 'Choose three separate photos of the same person with a relaxed expression. Use the same lighting and camera distance.'
                  : 'Look straight ahead, then turn your head about 30° each way. Keep your expression, lighting and camera distance steady.'}
            </p>
            <p role="status" className="mt-3 text-xs text-muted">
              {camera.enabled ? camera.status : 'Camera off · portrait kept only in this session'}
            </p>
            {camera.enabled && (
              <div className="mt-3">
                <p className="text-sm" role="status">
                  {camera.quality.message}
                </p>
                <progress
                  aria-label="Capture readiness"
                  max={1}
                  value={camera.quality.progress}
                  className="mt-2 h-2 w-full accent-accent"
                />
              </div>
            )}
            <div className="mt-4 grid gap-2">
              {mode === 'scan' ? (
                <ThreeAngleControls scan={three} draft={draft} camera={camera} />
              ) : (
                <>
                  <Button
                    onClick={() => {
                      setCaptureError('')
                      if (camera.enabled) camera.stop()
                      else camera.start()
                    }}
                    disabled={busy}
                  >
                    {camera.enabled ? 'Stop preview' : 'Start my webcam'}
                  </Button>
                  <Button
                    kind="primary"
                    disabled={!camera.enabled || !camera.quality.ready}
                    onClick={() => {
                      try {
                        review(camera.capture())
                      } catch (cause) {
                        setCaptureError(cause instanceof Error ? cause.message : 'Capture failed')
                      }
                    }}
                  >
                    Capture & review
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      const epoch = ++quickEpoch.current
                      setBusy(true)
                      setCaptureError('')
                      try {
                        const sample = await camera.loadSample()
                        if (epoch === quickEpoch.current) review(sample)
                      } catch (cause) {
                        if (epoch === quickEpoch.current)
                          setCaptureError(
                            cause instanceof Error ? cause.message : 'Sample could not be loaded',
                          )
                      } finally {
                        if (epoch === quickEpoch.current) setBusy(false)
                      }
                    }}
                  >
                    {busy ? 'Loading sample…' : 'Try a sample person'}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => (camera.source === 'sample' ? camera.stop() : camera.start('sample'))}
                  >
                    {camera.source === 'sample' ? 'Stop sample motion' : 'Play sample motion'}
                  </Button>
                </>
              )}
            </div>
          </section>
          <section className="border-t border-line pt-4">
            <h2 className="studio-step">2. Check the fit</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Eyes, nose, mouth and outline are matched to this head using MediaPipe landmarks. The surface
              adapts to your estimated face shape and blends into the neck. Auto-fit restores the automatic
              alignment; the controls let you fine-tune it.
            </p>
            <fieldset disabled={!draft && !camera.enabled} className="mt-4 space-y-4 disabled:opacity-50">
              {adjustments.map((control) => (
                <label key={control.key} className="block text-xs text-muted">
                  <span className="flex items-center justify-between">
                    <span>{control.label}</span>
                    <output className="font-mono">
                      {control.key === 'scale'
                        ? `${Math.round(calibration.scale * 100)}%`
                        : control.key === 'skinMatch' || control.key === 'shape'
                          ? `${Math.round(calibration[control.key] * 100)}%`
                          : calibration[control.key].toFixed(2)}
                    </output>
                  </span>
                  <input
                    aria-label={control.label}
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={calibration[control.key]}
                    onChange={(event) =>
                      setCalibration((current) =>
                        faceCalibration({ ...current, [control.key]: Number(event.target.value) }),
                      )
                    }
                    className="mt-2 w-full accent-accent"
                  />
                </label>
              ))}
              <Button onClick={() => setCalibration(DEFAULT_FACE_CALIBRATION)}>Auto-fit face</Button>
            </fieldset>
          </section>
          <section className="border-t border-line pt-4">
            <h2 className="studio-step">3. Use it</h2>
            <Button
              className="mt-3 w-full"
              kind="primary"
              disabled={!portrait || camera.enabled || !!three.session || busy || three.busy}
              onClick={() => portrait && onCapture(portrait)}
            >
              {draft?.sample ? 'Use the sample face' : 'Use this face'}
            </Button>
            {(avatar || draft) && (
              <Button
                className="mt-2 w-full"
                onClick={() => {
                  cancel()
                  setDraft(null)
                  onRemove()
                  setCalibration(DEFAULT_FACE_CALIBRATION)
                }}
              >
                Remove portrait
              </Button>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Your photos and face shape stay in this tab. Reloading the page clears them.
            </p>
          </section>
          {(captureError || three.error || camera.error) && (
            <p role="alert" className="rounded-xl bg-urgent-bg p-3 text-sm text-urgent">
              {captureError || three.error || camera.error}
            </p>
          )}
          <details className="border-t border-line pt-4 text-xs text-muted">
            <summary className="cursor-pointer">About the reference body</summary>
            <p className="mt-2 leading-relaxed">
              The face surface is estimated from camera landmarks and fitted to a generic head and body. Hair
              and the back of your head are not reconstructed. This personalises the display; it is not
              biometric sign-in or a medical scan.
            </p>
            <a
              className="mt-2 inline-block underline"
              href="https://github.com/google-ai-edge/mediapipe"
              target="_blank"
              rel="noreferrer"
            >
              MediaPipe · Apache 2.0
            </a>
          </details>
        </aside>
      </div>
    </section>
  )
}
