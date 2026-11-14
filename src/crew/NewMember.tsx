import { useState, type FormEvent } from 'react'
import { UserPlus } from '@phosphor-icons/react'
import type { Build } from '../body/anatomy/bodyShape'
import { HABITATS } from '../mission/habitats'
import { Button, Segmented } from '../ui'
import { useCrew } from './CrewProvider'
import { BodySizeFields, parseSizeDraft, sizeDraft } from './BodySizeFields'
import {
  PROFILE_LIMITS,
  PULSE_INPUT_RANGE,
  ROLES,
  flightHistoryError,
  newMember,
  validRestingPulse,
  type Role,
} from './roster'

const PLACE = HABITATS.station
const fieldClass =
  'mt-1.5 block h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-[16px] text-white placeholder:text-white/35 focus:border-white/50 focus:outline-none'

/** Add someone to the crew: who they are, then their face from the camera (optional). */
export default function NewMember({
  onCancel,
  onDone,
}: {
  onCancel: () => void
  onDone: (id: string) => void
}) {
  const crew = useCrew()
  const [name, setName] = useState('')
  const [callSign, setCallSign] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [flights, setFlights] = useState('')
  const [daysInSpace, setDaysInSpace] = useState('')
  const [pulse, setPulse] = useState('')
  const [rememberPulse, setRememberPulse] = useState(false)
  const [role, setRole] = useState<Role>('Mission specialist')
  const [build, setBuild] = useState<Build>('male')
  const [dimensions, setDimensions] = useState(() => sizeDraft())
  const { valid, values } = parseSizeDraft(dimensions)
  const profile = {
    callSign,
    specialty,
    previousFlights: flights === '' ? undefined : Number(flights),
    previousDaysInSpace: daysInSpace === '' ? undefined : Number(daysInSpace),
    preflightRestingPulseBpm: pulse === '' ? undefined : Number(pulse),
    rememberPreflightPulse: rememberPulse,
  }
  const historyError = flightHistoryError(profile)
  const pulseValid =
    profile.preflightRestingPulseBpm === undefined || validRestingPulse(profile.preflightRestingPulseBpm)
  const ready = name.trim().length > 0 && valid && !historyError && pulseValid

  const create = () => {
    const m = newMember(
      name,
      role,
      build,
      crew.members.map((x) => x.id),
      profile,
    )
    crew.add(m)
    crew.setSize(m.id, values, dimensions.remember)
    return m
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (ready) onDone(create().id)
  }

  return (
    <div className="scene flex min-h-[100dvh] items-center px-4 py-6 sm:px-6 sm:py-10">
      <img
        className="scene-photo"
        src={PLACE.image}
        alt=""
        aria-hidden="true"
        style={{ objectPosition: PLACE.imagePosition }}
      />
      <div className="scene-shade" aria-hidden="true" />
      <form
        onSubmit={submit}
        className="veil rise relative z-[2] mx-auto w-full max-w-[920px] space-y-6 p-5 sm:p-8"
        aria-labelledby="new-member-title"
      >
        <div>
          <h1 id="new-member-title" className="font-cond text-[40px] leading-none font-semibold">
            Add a crew member
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Your crew profile is saved in this browser. You can add a face now or later.
          </p>
        </div>

        <div className="grid gap-6 border-y border-white/10 py-6 md:grid-cols-2 md:gap-8">
          <section className="min-w-0 space-y-4" aria-labelledby="crew-profile-heading">
            <h2 id="crew-profile-heading" className="font-cond text-[22px] font-semibold leading-none">
              Crew profile
            </h2>
            <label className="block text-sm text-muted">
              Name
              <input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={48}
                autoComplete="off"
                placeholder="First and last name"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm text-muted">
              Call sign (optional)
              <input
                value={callSign}
                onChange={(e) => setCallSign(e.target.value)}
                maxLength={PROFILE_LIMITS.callSign}
                autoComplete="off"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm text-muted">
              Role on board
              <select
                className={fieldClass}
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option className="bg-ground" key={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted">
              Specialty (optional)
              <input
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                maxLength={PROFILE_LIMITS.specialty}
                autoComplete="off"
                placeholder="e.g. Robotics"
                className={fieldClass}
              />
            </label>
            <fieldset>
              <legend className="font-cond text-[15px] text-white/85">Previous flights (optional)</legend>
              <p className="mt-1 text-[13px] text-muted">Count only flights completed before this mission.</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="text-sm text-muted">
                  Completed spaceflights
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    className={fieldClass}
                    value={flights}
                    onChange={(event) => setFlights(event.target.value)}
                    aria-describedby={historyError ? 'flight-history-error' : undefined}
                  />
                </label>
                <label className="text-sm text-muted">
                  Prior days in space
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    className={fieldClass}
                    value={daysInSpace}
                    onChange={(event) => setDaysInSpace(event.target.value)}
                    aria-describedby={historyError ? 'flight-history-error' : undefined}
                  />
                </label>
              </div>
              {historyError && (
                <p id="flight-history-error" role="alert" className="mt-2 text-sm text-check">
                  {historyError}
                </p>
              )}
            </fieldset>
          </section>

          <section
            className="min-w-0 space-y-4 md:border-l md:border-white/10 md:pl-8"
            aria-labelledby="body-profile-heading"
          >
            <h2 id="body-profile-heading" className="font-cond text-[22px] font-semibold leading-none">
              3D body
            </h2>
            <div>
              <p className="text-sm text-muted">Reference body</p>
              <Segmented
                className="mt-1.5"
                label="Reference body"
                value={build}
                onChange={setBuild}
                options={[
                  { id: 'male', label: 'Male' },
                  { id: 'female', label: 'Female' },
                ]}
              />
            </div>
            <BodySizeFields draft={dimensions} onChange={setDimensions} />
            <fieldset className="border-t border-white/10 pt-4">
              <label className="block text-sm text-muted">
                Preflight resting pulse (bpm, optional)
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={PULSE_INPUT_RANGE.min}
                  max={PULSE_INPUT_RANGE.max}
                  value={pulse}
                  onChange={(event) => setPulse(event.target.value)}
                  className={fieldClass}
                  aria-invalid={!pulseValid}
                  aria-describedby={pulseValid ? 'pulse-note' : 'pulse-note pulse-error'}
                />
              </label>
              <p id="pulse-note" className="mt-2 text-[13px] leading-relaxed text-muted">
                Enter your measured resting pulse before launch to compare it with a camera reading. It stays
                in this tab until reload unless you choose to save it.
              </p>
              {!pulseValid && (
                <p id="pulse-error" role="alert" className="mt-2 text-sm text-check">
                  Enter a value between {PULSE_INPUT_RANGE.min} and {PULSE_INPUT_RANGE.max} bpm.
                </p>
              )}
              {pulse !== '' && pulseValid && (
                <label className="mt-2 flex items-center gap-2 text-[13px] text-white/85">
                  <input
                    type="checkbox"
                    checked={rememberPulse}
                    onChange={(event) => setRememberPulse(event.target.checked)}
                  />
                  Remember this pulse on this device
                </label>
              )}
            </fieldset>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button kind="primary" type="submit" disabled={!ready}>
            <UserPlus size={16} />
            Continue to face setup
          </Button>
          <Button kind="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
