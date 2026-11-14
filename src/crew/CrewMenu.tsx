import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Plus, Ruler, UsersThree } from '@phosphor-icons/react'
import { EASE } from '../ui'
import { useCrew } from './CrewProvider'
import MemberAvatar from './MemberAvatar'
import { SizeEditor } from './BodySizeControl'

/** The person shown, and a menu to open anyone else's profile. */
export default function CrewMenu({
  onPick,
  onAdd,
  onAll,
}: {
  onPick: (id: string) => void
  onAdd: () => void
  onAll: () => void
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
  if (!current) return null
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
        aria-label={`${current.name}. Open another profile`}
        className="press flex h-10 items-center gap-2 rounded-full bg-white/[0.08] py-1 pr-3.5 pl-1 hover:bg-white/[0.14]"
      >
        <MemberAvatar member={current} face={crew.faceOf(current.id)} size={32} />
        <span className="hidden font-cond text-[15px] font-medium sm:inline">{current.short}</span>
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
            className="glass-strong absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] p-2"
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
                </span>
                {m.id === current.id && <Check size={15} weight="bold" />}
              </button>
            ))}
            <div className="mt-1 border-t border-white/[0.08] pt-1">
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
              <button
                role="menuitem"
                onClick={() => choose(onAll)}
                className="press flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-white/[0.06]"
              >
                <UsersThree size={16} className="mx-[9px]" />
                Back to the crew list
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {edit && <SizeEditor key={current.id} member={current} onClose={() => setEdit(false)} />}
    </div>
  )
}
