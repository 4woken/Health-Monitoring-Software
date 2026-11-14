import { ArrowLeft, ArrowRight, Camera, CameraSlash, Check } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import BodyViewer, { type BodyPhysiology, type Hotspot } from '../body/BodyViewer'
import type { Build } from '../body/anatomy/bodyShape'
import type { AvatarCapture } from '../camera/face/portrait'
import { useFaceTracking } from '../camera/face/useFaceTracking'
import { Button, Logo, Segmented } from '../ui'
import { MannequinPreview, useCrew } from './CrewProvider'
import { parseDimensions, SIZE_RANGES } from './bodyDimensions'
import type { Member } from './roster'
import './crewLogin.css'

const resting: BodyPhysiology = { fluidShiftL: 0, fluidShiftShare: 0, bonePct: 100, musclePct: 100 }
const markers: Hotspot[] = []
const noop = () => {}

type LoginProps = {
  initialMemberId: string
  onEnter: (id: string) => void
  onBack: () => void
}

export default function CrewLogin({ initialMemberId, onEnter, onBack }: LoginProps) {
  const crew = useCrew()
  const member = crew.members.find((m) => m.id === initialMemberId)
  if (!member) return <Button onClick={onBack}>Back to crew</Button>
  return <ProfileSetup key={member.id} member={member} onEnter={onEnter} onBack={onBack} />
}

function ProfileSetup({
  member,
  onEnter,
  onBack,
}: Pick<LoginProps, 'onEnter' | 'onBack'> & { member: Member }) {
  const crew = useCrew()
  const size = crew.sizeOf(member.id)
  const [height, setHeight] = useState(size.values.heightCm?.toString() ?? '')
  const [weight, setWeight] = useState(size.values.weightKg?.toString() ?? '')
  const [remember, setRemember] = useState(size.remembered)
  const [build, setBuild] = useState<Build>(member.build)
  const savedPortrait = crew.faceOf(member.id)
  const [draft, setDraft] = useState<AvatarCapture | null>()
  const portrait = draft === undefined ? savedPortrait : draft
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [captureHint, setCaptureHint] = useState('')
  const input = useRef<HTMLVideoElement>(null)
  const camera = useFaceTracking(input)
  const { valid, values, invalid } = parseDimensions(height, weight)
  const { enabled, quality, liveFace, capture, stop } = camera
  useEffect(() => {
    if (!enabled || !quality.ready) return
    try {
      const next = capture()
      setDraft(next)
      setSaveError('')
      setCaptureHint('')
      stop()
    } catch {
      setCaptureHint('Hold still for a moment to finish fitting your face.')
    }
  }, [enabled, quality, capture, stop])

  const next = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || enabled || saving) return
    if (portrait !== savedPortrait) {
      setSaving(true)
      setSaveError('')
      try {
        await crew.setFace(member.id, portrait)
      } catch {
        setSaving(false)
        setSaveError(
          portrait
            ? 'This browser could not save your face. Check your browser storage and choose Next to retry.'
            : 'This browser could not remove your saved face. Choose Next to retry.',
        )
        return
      }
    }
    if (build !== member.build) crew.setBuild(member.id, build)
    crew.setSize(
      member.id,
      { ...size.values, heightCm: values.heightCm, weightKg: values.weightKg },
      remember,
    )
    onEnter(member.id)
  }

  let faceHint = 'Face the camera and hold still. Choose Next to keep your fitted face in this browser.'
  if (portrait && portrait === savedPortrait) {
    faceHint = 'Your saved face is ready. You can continue without the webcam.'
  } else if (portrait) {
    faceHint = 'Choose Next to save this fitted face to your profile in this browser.'
  } else if (savedPortrait) {
    faceHint = 'Choose Next to remove your saved face and use the reference head.'
  }
  if (enabled) {
    const preparing = camera.status.includes('Loading') || camera.status.includes('Allow')
    faceHint = captureHint || (preparing ? camera.status : quality.message)
  }

  const measure = (
    kind: 'heightCm' | 'weightKg',
    label: string,
    unit: string,
    value: string,
    onChange: (next: string) => void,
  ) => (
    <label className="crew-login__label">
      {label}
      <span className="crew-login__input">
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          min={SIZE_RANGES[kind][0]}
          max={SIZE_RANGES[kind][1]}
          step="any"
          inputMode="decimal"
          aria-invalid={invalid.includes(kind) || undefined}
          placeholder="—"
          aria-label={label + ' (' + unit + ')'}
        />
        <span aria-hidden="true">{unit}</span>
      </span>
      {invalid.includes(kind) && (
        <span role="alert" className="text-xs text-check">
          Enter {SIZE_RANGES[kind][0]}–{SIZE_RANGES[kind][1]} {unit}, or leave empty.
        </span>
      )}
    </label>
  )

  return (
    <main className="crew-login">
      <header className="crew-login__header">
        <Logo variant="full" size={29} />
        <button type="button" className="crew-login__back" onClick={onBack} disabled={saving}>
          <ArrowLeft size={16} /> Back to crew
        </button>
      </header>
      <div className="crew-login__content">
        <div className="crew-login__portrait">
          <MannequinPreview id={member.id}>
            <BodyViewer
              build={build}
              studio
              portraitOnly
              initialView="head"
              hotspots={markers}
              activeId={null}
              focusId={null}
              onPick={noop}
              physiology={resting}
              restingBpm={60}
              layer="signals"
              onLayer={noop}
              avatar={portrait}
              liveFace={enabled ? liveFace : null}
              insetBottom={14}
            />
          </MannequinPreview>
          <div className="crew-login__portrait-tag" aria-hidden="true">
            <span />
            {enabled ? 'Live fitting' : portrait ? 'Fitted portrait' : 'Reference head'}
          </div>
          <video ref={input} autoPlay playsInline muted hidden aria-hidden="true" />
        </div>
        <form onSubmit={next} className="crew-login__form" aria-busy={saving}>
          <h1>Avatar setup</h1>
          <p className="crew-login__member">
            {member.name}
            <span> · {member.role}</span>
          </p>
          <fieldset className="crew-login__section" disabled={saving}>
            <legend>Your 3D face</legend>
            <p aria-live="polite" className="crew-login__hint">
              {camera.error && !enabled && 'Camera unavailable. You can try again. '}
              {faceHint}
            </p>
            {enabled ? (
              <Button
                type="button"
                onClick={() => {
                  setCaptureHint('')
                  stop()
                }}
              >
                <CameraSlash size={17} /> Stop camera
              </Button>
            ) : (
              <div className="crew-login__actions">
                <Button
                  type="button"
                  onClick={() => {
                    setCaptureHint('')
                    camera.start()
                  }}
                >
                  {portrait ? <Check size={17} /> : <Camera size={17} />}
                  {portrait ? 'Retake face' : 'Connect webcam'}
                </Button>
                {portrait && (
                  <button
                    type="button"
                    className="crew-login__clear"
                    onClick={() => {
                      setDraft(null)
                      setSaveError('')
                    }}
                  >
                    Use reference head
                  </button>
                )}
              </div>
            )}
          </fieldset>
          <fieldset className="crew-login__section" disabled={saving}>
            <legend>Body dimensions</legend>
            <span className="crew-login__label">Reference body</span>
            <Segmented
              label="Reference body"
              value={build}
              options={[
                { id: 'male', label: 'Male' },
                { id: 'female', label: 'Female' },
              ]}
              onChange={setBuild}
            />
            <div className="crew-login__dimensions">
              {measure('heightCm', 'Height', 'cm', height, setHeight)}
              {measure('weightKg', 'Weight', 'kg', weight, setWeight)}
            </div>
            <label className="crew-login__remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />{' '}
              Remember measurements on this device
            </label>
          </fieldset>
          {saveError && (
            <p role="alert" className="text-sm text-urgent">
              {saveError}
            </p>
          )}
          <Button
            type="submit"
            kind="primary"
            size="lg"
            disabled={!valid || enabled || saving}
            className="crew-login__next"
          >
            {saving ? 'Saving…' : 'Next'} <ArrowRight size={18} />
          </Button>
        </form>
      </div>
    </main>
  )
}
