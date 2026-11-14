import { useState } from 'react'
import { createPortal } from 'react-dom'
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
