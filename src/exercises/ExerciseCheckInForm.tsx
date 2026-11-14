import { useState } from 'react'
import CheckInBreathingCamera from './CheckInBreathingCamera'
import { Button } from '../ui'
import type { ExerciseCheckIn, ExerciseKind } from './exercisePlan'

const FLAGS = [
  ['shortSleep', 'I slept less than usual'],
  ['longSitting', 'I’ve been sitting for a long time'],
  ['wantsDexterity', 'I want to practise hand coordination'],
  ['wantsMobility', 'I want a leg movement break'],
] as const

export default function ExerciseCheckInForm({
  initial,
  interest,
  reportedStress,
  initialBreathingSample,
  onSubmit,
  onCancel,
}: {
  initial: ExerciseCheckIn | null
  interest?: ExerciseKind
  reportedStress?: ExerciseCheckIn['stress']
  initialBreathingSample: number | null
  onSubmit: (value: ExerciseCheckIn, sample: number | null) => void
  onCancel: () => void
}) {
  const [sample, setSample] = useState(initialBreathingSample)
  const [entry, setEntry] = useState<ExerciseCheckIn>(
    () =>
      initial ?? {
        energy: 'usual',
        stress: reportedStress,
        shortSleep: false,
        longSitting: false,
        wantsDexterity: interest === 'assembly',
        wantsMobility: interest === 'knee',
        onEarth: false,
        unwell: false,
      },
  )
  return (
    <form
      aria-label="Personal exercise check-in"
      className="mt-5 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(entry, sample)
      }}
    >
      <fieldset>
        <legend className="mb-2 font-medium">How is your energy today?</legend>
        <div className="flex gap-2">
          {(['usual', 'low'] as const).map((energy) => (
            <label
              key={energy}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line-strong px-4 py-2 has-checked:border-white/75"
            >
              <input
                type="radio"
                name="exercise-energy"
                checked={energy === entry.energy}
                onChange={() => setEntry({ ...entry, energy })}
              />
              {energy === 'low' ? 'Lower than usual' : 'Usual'}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-medium">How stressed do you feel right now?</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              [undefined, 'Skip'],
              ['none', 'None'],
              ['some', 'Some'],
              ['high', 'A lot'],
            ] as const
          ).map(([stress, label]) => (
            <label
              key={label}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line-strong px-4 py-2 has-checked:border-white/75"
            >
              <input
                type="radio"
                name="exercise-stress"
                checked={entry.stress === stress}
                onChange={() => setEntry({ ...entry, stress })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <CheckInBreathingCamera rate={sample} onSample={setSample} />
      <fieldset>
        <legend className="mb-2 font-medium">What applies right now?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FLAGS.map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 has-checked:border-white/60"
            >
              <input
                type="checkbox"
                checked={entry[key]}
                onChange={(event) => setEntry({ ...entry, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {(entry.longSitting || entry.wantsMobility) && (
        <label className="flex items-start gap-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={entry.onEarth}
            onChange={(event) => setEntry({ ...entry, onEarth: event.target.checked })}
          />
          I’m on Earth and have a stable chair for leg movements.
        </label>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          checked={entry.unwell}
          onChange={(event) => setEntry({ ...entry, unwell: event.target.checked })}
        />
        I feel unwell, dizzy or have pain that affects activity.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" kind="primary">
          Show matching missions
        </Button>
        <Button type="button" kind="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
