import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Build } from '../body/anatomy/bodyShape'
import type { AvatarCapture, PersonalAvatar } from '../camera/face/portrait'
import { EMPTY_SIZE, loadSize, saveSize, type BodyDimensions, type SizeSetting } from './bodyDimensions'
import { clearExerciseHistory } from '../exercises/exercisePlan'
import { ROLES, TEAM, memberForStorage, readProfileDetails, type Member } from './roster'
import { loadPortraits, storePortrait } from './portraitStorage'

/** Lightweight crew profiles live in localStorage. Fitted portraits live in IndexedDB. */
const STORAGE_KEY = 'pulsar.crew.added'
/** The person shown last, so the app opens on them again. */
const CURRENT_KEY = 'pulsar.crew.current'

const portraitKey = (member: Member) => member.portraitKey ?? `crew:${member.id}`

const isMember = (value: unknown): value is Member => {
  const m = value as Member
  return (
    typeof m?.id === 'string' &&
    (m.portraitKey === undefined || typeof m.portraitKey === 'string') &&
    typeof m.name === 'string' &&
    typeof m.short === 'string' &&
    (ROLES as readonly string[]).includes(m.role) &&
    (m.build === 'male' || m.build === 'female') &&
    typeof m.baseline?.redCellsPct === 'number' &&
    Array.isArray(m.stories)
  )
}

function readAdded(): Member[] {
  const list: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  return Array.isArray(list)
    ? list.filter(isMember).map((m) => memberForStorage({ ...m, ...readProfileDetails(m), added: true }))
    : []
}

function loadAdded(): Member[] {
  try {
    return readAdded()
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
  remove: (id: string) => Promise<void>
  sizeOf: (id: string) => SizeSetting
  setSize: (id: string, values: BodyDimensions, remember: boolean) => SizeSetting
  setBuild: (id: string, build: Build) => void
  faceOf: (id: string) => PersonalAvatar | null
  setFace: (id: string, face: AvatarCapture | null) => Promise<void>
}

const CrewContext = createContext<Crew | null>(null)
const PreviewMember = createContext<string | null>(null)

export function MannequinPreview({ id, children }: { id: string; children: ReactNode }) {
  return <PreviewMember.Provider value={id}>{children}</PreviewMember.Provider>
}

export function CrewProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<Member[]>(loadAdded)
  const [currentId, setCurrentId] = useState<string | null>(loadCurrent)
  const [faces, setFaces] = useState<Map<string, PersonalAvatar> | null>(null)
  const [portraitReadFailed, setPortraitReadFailed] = useState(false)
  useEffect(() => {
    let active = true
    loadPortraits().then(
      (saved) => {
        if (active) setFaces(saved)
      },
      () => {
        if (active) {
          setFaces(new Map())
          setPortraitReadFailed(true)
        }
      },
    )
    return () => {
      active = false
    }
  }, [])

  const [sizes, setSizes] = useState<Record<string, SizeSetting>>(() =>
    Object.fromEntries([...TEAM, ...added].map((m) => [m.id, loadSize(m.id)])),
  )
  const setSize = useCallback((id: string, values: BodyDimensions, remember: boolean) => {
    const setting = saveSize(id, values, remember)
    setSizes((previous) => ({ ...previous, [id]: setting }))
    return setting
  }, [])
  const sizeOf = useCallback((id: string) => (Object.hasOwn(sizes, id) ? sizes[id] : EMPTY_SIZE), [sizes])
  const [teamBuilds, setTeamBuilds] = useState<Partial<Record<string, Build>>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('pulsar.crew.builds') ?? '{}')
      return Object.fromEntries(
        TEAM.filter((m) => raw?.[m.id] === 'male' || raw?.[m.id] === 'female').map((m) => [m.id, raw[m.id]]),
      )
    } catch {
      return {}
    }
  })
  const members = useMemo(
    () => [...TEAM.map((m) => (teamBuilds[m.id] ? { ...m, build: teamBuilds[m.id]! } : m)), ...added],
    [teamBuilds, added],
  )
  const setBuild = useCallback((id: string, build: Build) => {
    if (TEAM.some((m) => m.id === id)) {
      setTeamBuilds((current) => {
        const next = { ...current, [id]: build }
        try {
          localStorage.setItem('pulsar.crew.builds', JSON.stringify(next))
        } catch {
          /* Session only. */
        }
        return next
      })
    } else {
      setAdded((current) => {
        const next = current.map((m) => (m.id === id ? { ...m, build } : m))
        saveAdded(next)
        return next
      })
    }
  }, [])
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

  const setFace = useCallback(
    async (id: string, capture: AvatarCapture | null) => {
      const member = members.find((m) => m.id === id)
      if (!member) throw new Error('Crew profile no longer exists.')
      const key = portraitKey(member)
      // A failed roster save or an old tab must not attach a face to an unpersisted or recreated profile.
      if (capture && member.added && !loadAdded().some((m) => m.id === id && portraitKey(m) === key))
        throw new Error('The crew profile is unavailable in browser storage.')
      const face = capture ? { ...capture, ownerId: id } : null
      await storePortrait(key, face)
      setFaces((previous) => {
        const next = new Map(previous)
        if (face) next.set(key, face)
        else next.delete(key)
        return next
      })
    },
    [members],
  )

  const remove = useCallback(
    async (id: string) => {
      const member = added.find((m) => m.id === id)
      if (!member) return
      await setFace(id, null)
      const key = portraitKey(member)
      const stored = readAdded()
      const remaining = stored.filter((m) => portraitKey(m) !== key)
      if (remaining.length !== stored.length)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining.map(memberForStorage)))
      setAdded((list) => list.filter((m) => portraitKey(m) !== key))
      // An old tab can still show a deleted member while a namesake now owns the slug.
      if (remaining.some((m) => m.id === id)) return
      saveSize(id, {}, false)
      clearExerciseHistory(id)
      setSizes(({ [id]: _size, ...rest }) => rest)
      setCurrentId((selected) => (selected === id ? null : selected))
    },
    [added, setFace],
  )

  const value = useMemo<Crew>(
    () => ({
      members,
      current,
      select,
      add,
      remove,
      sizeOf,
      setSize,
      setBuild,
      faceOf: (id) => {
        const member = members.find((m) => m.id === id)
        const face = member && faces?.get(portraitKey(member))
        return face?.ownerId === id ? face : null
      },
      setFace,
    }),
    [members, current, select, add, remove, faces, setFace, sizeOf, setSize, setBuild],
  )
  if (!faces)
    return (
      <p role="status" className="p-4 text-sm text-muted">
        Loading crew profiles…
      </p>
    )
  return (
    <CrewContext.Provider value={value}>
      {portraitReadFailed && (
        <p role="status" className="p-2 text-sm text-muted">
          Saved faces could not be loaded. Allow site storage and reload to restore them.
        </p>
      )}
      {children}
    </CrewContext.Provider>
  )
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
