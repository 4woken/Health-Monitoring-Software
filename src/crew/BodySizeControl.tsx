import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Ruler } from '@phosphor-icons/react'
import { Button, Sheet } from '../ui'
import { BodySizeFields, parseSizeDraft, sizeDraft } from './BodySizeFields'
import { hasSize } from './bodyDimensions'
import { useCrew } from './CrewProvider'
import type { Member } from './roster'

export function SizeEditor({ member, onClose }: { member: Member; onClose: () => void }) {
  const crew = useCrew()
  const setting = crew.sizeOf(member.id)
  const [draft, setDraft] = useState(() => sizeDraft(setting.values, setting.remembered))
  const [storageError, setStorageError] = useState('')
  const { valid, values } = parseSizeDraft(draft)
  return createPortal(
    <Sheet onClose={onClose} label={'Body dimensions for ' + member.name} className="max-w-md p-6">
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          const stored = crew.setSize(member.id, values, draft.remember)
          if (draft.remember && hasSize(values) && !stored.remembered) {
            setStorageError(
              'Your changes apply for this session. This browser could not save them on this device.',
            )
            setDraft({ ...draft, remember: false })
          } else onClose()
        }}
      >
        <h2 className="font-cond text-2xl font-semibold">{member.short}’s body dimensions</h2>
        <BodySizeFields draft={draft} onChange={setDraft} />
        {storageError && (
          <p role="status" className="text-sm">
            {storageError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" kind="primary" disabled={!valid}>
            Apply to mannequin
          </Button>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
          {hasSize(setting.values) && (
            <Button
              type="button"
              kind="ghost"
              onClick={() => {
                crew.setSize(member.id, {}, false)
                onClose()
              }}
            >
              Clear measurements
            </Button>
          )}
        </div>
      </form>
    </Sheet>,
    document.body,
  )
}

export function BodySizeControl({ member }: { member: Member }) {
  const crew = useCrew()
  const [edit, setEdit] = useState(false)
  const { heightCm, weightKg, chestCm, waistCm } = crew.sizeOf(member.id).values
  const summary = [
    heightCm && heightCm + ' cm',
    weightKg && weightKg + ' kg',
    chestCm && 'Chest ' + chestCm + ' cm',
    waistCm && 'Waist ' + waistCm + ' cm',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
      <button
        type="button"
        aria-label={'Edit body dimensions for ' + member.name}
        className="press inline-flex min-h-8 items-center text-left gap-2 rounded-full bg-black/45 px-3 text-white hover:bg-black/60"
        onClick={() => setEdit(true)}
      >
        <Ruler size={15} />
        {summary || 'Body dimensions'}
      </button>
      {summary && (
        <span
          className="inline-flex items-center gap-1.5 text-white/85"
          aria-label="10 centimetre scale at model centre"
        >
          <span
            aria-hidden="true"
            style={{ width: 'var(--body-decimetre)' }}
            className="block h-1.5 border-x border-b border-white/70"
          />
          10 cm
        </span>
      )}
      {edit && <SizeEditor member={member} onClose={() => setEdit(false)} />}
    </div>
  )
}
