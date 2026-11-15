import { useEffect, useRef, useState } from 'react'
import { useCrew } from '../crew/CrewProvider'
import type { Member } from '../crew/roster'
import FaceFitter from './face/FaceFitter'
import type { AvatarCapture } from './face/portrait'

/**
 * The face fitting studio, with its fine controls: capture a portrait, fit it on the 3D head and save
 * it to the person's profile in this browser. The profile page sets the face up step by step; this
 * studio is for adjusting it afterwards.
 */
export default function FaceStudio({ member, onApplied }: { member: Member; onApplied: () => void }) {
  const crew = useCrew()
  const avatar = crew.faceOf(member.id)
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
      if (portrait || avatar) await crew.setFace(member.id, portrait)
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
    if (portrait && mounted.current) onApplied()
    return true
  }

  return (
    <fieldset className="min-w-0" disabled={writing} aria-busy={writing} aria-label="Face fitting studio">
      <FaceFitter
        person={member.short}
        build={member.build}
        avatar={avatar}
        onPortrait={updatePortrait}
        storageError={storageError}
      />
    </fieldset>
  )
}
