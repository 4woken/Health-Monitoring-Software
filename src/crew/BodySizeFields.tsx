import { useId } from 'react'
import { SIZE_RANGES, parseDimensions, type BodyDimensions } from './bodyDimensions'

export interface SizeDraft {
  height: string
  weight: string
  chest: string
  waist: string
  remember: boolean
}

export function sizeDraft(values: BodyDimensions = {}, remember = false): SizeDraft {
  return {
    height: values.heightCm?.toString() ?? '',
    weight: values.weightKg?.toString() ?? '',
    chest: values.chestCm?.toString() ?? '',
    waist: values.waistCm?.toString() ?? '',
    remember,
  }
}

export function parseSizeDraft(draft: SizeDraft) {
  return parseDimensions(draft.height, draft.weight, draft.chest, draft.waist)
}

export function BodySizeFields({ draft, onChange }: { draft: SizeDraft; onChange: (d: SizeDraft) => void }) {
  const fieldId = useId()
  const { invalid } = parseSizeDraft(draft)
  return (
    <fieldset className="space-y-3">
      <legend className="font-cond text-[15px] text-white/85">Mannequin dimensions (optional)</legend>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['height', 'Height (cm)', 'heightCm', ''],
            ['weight', 'Weight (kg)', 'weightKg', ''],
            [
              'chest',
              'Chest circumference (cm)',
              'chestCm',
              'Wrap a tape level around your chest, under the arms.',
            ],
            [
              'waist',
              'Waist circumference (cm)',
              'waistCm',
              'Wrap a tape level around your natural waist, above the hips.',
            ],
          ] as const
        ).map(([field, label, key, hint]) => (
          <div key={field} className="block text-sm text-muted">
            <label htmlFor={fieldId + field}>{label}</label>
            <input
              id={fieldId + field}
              aria-describedby={
                [hint && fieldId + field + '-hint', invalid.includes(key) && fieldId + field + '-error']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              type="number"
              inputMode="decimal"
              min={SIZE_RANGES[key][0]}
              max={SIZE_RANGES[key][1]}
              aria-invalid={invalid.includes(key) || undefined}
              step="any"
              placeholder="Optional"
              value={draft[field]}
              onChange={(e) => onChange({ ...draft, [field]: e.target.value })}
              className="mt-1.5 block h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white"
            />
            {hint && (
              <span id={fieldId + field + '-hint'} className="mt-1 block text-xs leading-snug text-dim">
                {hint}
              </span>
            )}
            {invalid.includes(key) && (
              <span id={fieldId + field + '-error'} role="alert" className="mt-1 block text-xs text-check">
                Enter {SIZE_RANGES[key][0]}–{SIZE_RANGES[key][1]} {key === 'weightKg' ? 'kg' : 'cm'}, or leave
                empty.
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        Height sets the scale. Chest and waist measurements fit two rings on the reference torso. Weight sets
        its approximate overall width. The organs illustrate reference anatomy.
      </p>
      <label className="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={draft.remember}
          onChange={(e) => onChange({ ...draft, remember: e.target.checked })}
        />
        Remember these measurements on this device
      </label>
    </fieldset>
  )
}
