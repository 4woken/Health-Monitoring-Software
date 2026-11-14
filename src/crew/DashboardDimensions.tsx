import { useState, type FormEvent } from 'react'
import { Ruler } from '@phosphor-icons/react'
import { useCrew } from './CrewProvider'
import { parseDimensions, SIZE_RANGES, type SizeSetting, type BodyDimensions } from './bodyDimensions'

export default function DashboardDimensions({ memberId }: { memberId: string }) {
  const crew = useCrew()
  const saved = crew.sizeOf(memberId)
  return (
    <DimensionsForm
      key={JSON.stringify([memberId, saved])}
      saved={saved}
      apply={(values) => crew.setSize(memberId, values, saved.remembered)}
    />
  )
}

function DimensionsForm({ saved, apply }: { saved: SizeSetting; apply: (value: BodyDimensions) => void }) {
  const [height, setHeight] = useState(String(saved.values.heightCm ?? ''))
  const [weight, setWeight] = useState(String(saved.values.weightKg ?? ''))
  const parsed = parseDimensions(height, weight)
  const dirty =
    parsed.values.heightCm !== saved.values.heightCm || parsed.values.weightKg !== saved.values.weightKg
  function submit(event: FormEvent) {
    event.preventDefault()
    if (parsed.valid)
      apply({ ...saved.values, heightCm: parsed.values.heightCm, weightKg: parsed.values.weightKg })
  }
  return (
    <form
      aria-label="Avatar dimensions"
      onSubmit={submit}
      className="mt-3 rounded-xl border border-white/15 bg-black/60 p-3 text-white backdrop-blur-md"
    >
      <h2 className="flex items-center gap-2 font-cond text-[15px] font-semibold">
        <Ruler size={15} /> Avatar dimensions
      </h2>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {(
          [
            ['Height (cm)', height, setHeight, SIZE_RANGES.heightCm],
            ['Weight (kg)', weight, setWeight, SIZE_RANGES.weightKg],
          ] as const
        ).map(([label, value, change, bounds]) => (
          <label key={label} className="flex min-w-16 flex-1 flex-col gap-1 text-xs text-white/80">
            {label}
            <input
              type="number"
              step="any"
              min={bounds[0]}
              max={bounds[1]}
              inputMode="decimal"
              value={value}
              placeholder="—"
              onChange={(e) => change(e.target.value)}
              className="h-9 w-full rounded-md border border-white/20 bg-black/30 px-2 text-sm text-white"
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={!parsed.valid || !dirty}
          className="press h-9 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-45"
        >
          Apply
        </button>
      </div>
    </form>
  )
}
