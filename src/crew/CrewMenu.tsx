import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CaretDown, Check, Plus, Ruler, UserFocus } from '@phosphor-icons/react'
import { EASE } from '../ui'
import { useCrew } from './CrewProvider'
import MemberAvatar from './MemberAvatar'
import { SizeEditor } from './SizeEditor'
import type { Member } from './roster'

/** Call sign, speciality and flight history, for the person shown. */
const profileOf = (m: Member) =>
  [
    m.callSign && `Call sign ${m.callSign}`,
    m.specialty,
    m.previousFlights !== undefined &&
      `${m.previousFlights} earlier flight${m.previousFlights === 1 ? '' : 's'}`,
    m.previousDaysInSpace !== undefined &&
      `${m.previousDaysInSpace} ${m.previousDaysInSpace === 1 ? 'day' : 'days'} in space`,
  ]
    .filter(Boolean)
    .join(', ')

/** The person shown, small, with a menu to switch to someone else or change this person's body. */
export default function CrewMenu({
  onPick,
  onAdd,
  onFace,
}: {
  onPick: (id: string) => void
  onAdd: () => void
  /** Opens the camera to put this person's face on the body. */
  onFace: () => void
}) {
  const crew = useCrew()
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const current = crew.current
  const face = crew.faceOf(current.id)
  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${current.name}, ${current.role}. Switch crew member`}
        className="press flex h-8 items-center gap-1.5 rounded-full py-1 pr-2 pl-1 text-white/80 hover:bg-white/[0.08] hover:text-white"
      >
        <MemberAvatar member={current} face={face} size={24} />
        <span className="max-w-[9rem] truncate text-[13px]">{current.short}</span>
        <CaretDown size={11} weight="bold" className="text-white/50" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Crew"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="glass-strong absolute left-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] p-2"
          >
            {crew.members.map((m) => (
              <button
                key={m.id}
                role="menuitem"
                onClick={() => choose(() => onPick(m.id))}
                className={`press flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${m.id === current.id ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}
              >
                <MemberAvatar member={m} face={crew.faceOf(m.id)} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block font-cond text-[13px] text-muted">{m.role}</span>
                  {m.id === current.id && profileOf(m) && (
                    <span className="mt-0.5 block text-[12px] leading-snug text-white/55">
                      {profileOf(m)}
                    </span>
                  )}
                </span>
                {m.id === current.id && <Check size={15} weight="bold" />}
              </button>
            ))}
            <div className="mt-1 border-t border-white/[0.08] pt-1">
              <button
                role="menuitem"
                onClick={() => choose(onFace)}
                className="press flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-white/[0.06]"
              >
                <UserFocus size={16} className="mx-[9px]" />
                {face ? 'Change the face on the body' : 'Put my face on the body'}
              </button>
              <button
                role="menuitem"
                onClick={() => choose(() => setEdit(true))}
                className="press flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-white/[0.06]"
              >
                <Ruler size={16} className="mx-[9px]" /> Edit body dimensions
              </button>
              <button
                role="menuitem"
                onClick={() => choose(onAdd)}
                className="press flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-white/[0.06]"
              >
                <Plus size={16} className="mx-[9px]" />
                Add a crew member
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {edit && <SizeEditor key={current.id} member={current} onClose={() => setEdit(false)} />}
    </div>
  )
}
