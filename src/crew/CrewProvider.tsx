import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { AvatarCapture, PersonalAvatar } from '../camera/face/portrait'
import { EMPTY_SIZE, loadSize, saveSize, type BodyDimensions, type SizeSetting } from './bodyDimensions'
import { clearExerciseHistory } from '../exercises/exercisePlan'
import { ROLES, TEAM, memberForStorage, readProfileDetails, type Member } from './roster'

/** Added people (name, role, body) are kept in this browser. Faces are not: they stay in memory. */
const STORAGE_KEY = 'pulsar.crew.added'
/** The person shown last, so the app opens on them again. */
const CURRENT_KEY = 'pulsar.crew.current'

const isMember = (value: unknown): value is Member => {
  const m = value as Member
  return (
    typeof m?.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.short === 'string' &&
    (ROLES as readonly string[]).includes(m.role) &&
    (m.build === 'male' || m.build === 'female') &&
    typeof m.baseline?.redCellsPct === 'number' &&
    Array.isArray(m.stories)
  )
}

function loadAdded(): Member[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(list)
      ? list.filter(isMember).map((m) => memberForStorage({ ...m, ...readProfileDetails(m), added: true }))
      : []
  } catch {
    return []
  }
}

function loadCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

function saveCurrent(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // Storage turned off: the app opens on the first crew member next time.
  }
}

function saveAdded(list: Member[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(memberForStorage)))
  } catch {
    // Private window or storage turned off: the person stays until the page reloads.
  }
}

export interface Crew {
  members: Member[]
  /** The person whose body is shown: the last one chosen, or the first of the crew. */
  current: Member
  select: (id: string) => void
  add: (member: Member) => void
  remove: (id: string) => void
  sizeOf: (id: string) => SizeSetting
  setSize: (id: string, values: BodyDimensions, remember: boolean) => SizeSetting
  faceOf: (id: string) => PersonalAvatar | null
  setFace: (id: string, face: AvatarCapture | null) => void
}

const CrewContext = createContext<Crew | null>(null)
const PreviewMember = createContext<string | null>(null)

export function MannequinPreview({ id, children }: { id: string; children: ReactNode }) {
  return <PreviewMember.Provider value={id}>{children}</PreviewMember.Provider>
}

export function CrewProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<Member[]>(loadAdded)
  const [currentId, setCurrentId] = useState<string | null>(loadCurrent)
  const [faces, setFaces] = useState<Record<string, PersonalAvatar>>({})

  const [sizes, setSizes] = useState<Record<string, SizeSetting>>(() =>
    Object.fromEntries([...TEAM, ...added].map((m) => [m.id, loadSize(m.id)])),
  )
  const setSize = useCallback((id: string, values: BodyDimensions, remember: boolean) => {
    const setting = saveSize(id, values, remember)
    setSizes((previous) => ({ ...previous, [id]: setting }))
    return setting
  }, [])
  const sizeOf = useCallback((id: string) => (Object.hasOwn(sizes, id) ? sizes[id] : EMPTY_SIZE), [sizes])
  const members = useMemo(() => [...TEAM, ...added], [added])
  const current = members.find((m) => m.id === currentId) ?? members[0]
  const select = useCallback((id: string) => {
    setCurrentId(id)
    saveCurrent(id)
  }, [])

  const add = useCallback((member: Member) => {
    setAdded((list) => {
      const next = [...list.filter((m) => m.id !== member.id), { ...member, added: true }]
      saveAdded(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setAdded((list) => {
      const next = list.filter((m) => m.id !== id)
      saveAdded(next)
      return next
    })
    saveSize(id, {}, false)
    clearExerciseHistory(id)
    setSizes(({ [id]: _size, ...rest }) => rest)
    setFaces(({ [id]: _gone, ...rest }) => rest)
    setCurrentId((selected) => (selected === id ? null : selected))
  }, [])

  const setFace = useCallback((id: string, face: AvatarCapture | null) => {
    setFaces(({ [id]: _old, ...rest }) => (face ? { ...rest, [id]: { ...face, ownerId: id } } : rest))
  }, [])

  const value = useMemo<Crew>(
    () => ({
      members,
      current,
      select,
      add,
      remove,
      sizeOf,
      setSize,
      faceOf: (id) => faces[id] ?? null,
      setFace,
    }),
    [members, current, select, add, remove, faces, setFace, sizeOf, setSize],
  )
  return <CrewContext.Provider value={value}>{children}</CrewContext.Provider>
}

export function useCrew(): Crew {
  const crew = useContext(CrewContext)
  if (!crew) throw new Error('useCrew needs a CrewProvider above it')
  return crew
}

/** Standalone reference viewers can render without a selected crew member. */
export function useMannequinDimensions(): BodyDimensions {
  const crew = useContext(CrewContext)
  const preview = useContext(PreviewMember)
  const id = preview ?? crew?.current?.id
  return id && crew ? crew.sizeOf(id).values : EMPTY_SIZE.values
}
