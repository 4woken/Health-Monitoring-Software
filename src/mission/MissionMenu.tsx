import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CaretDown, Check } from '@phosphor-icons/react'
import { MISSIONS, MISSION_ORDER, type MissionId } from './missions'
import { HABITATS, type HabitatId } from './habitats'
import { MISSION_DAYS } from '../health/simulation'
import { EASE } from '../ui'

/**
 * One button for where and when: destination (gravity and radiation), habitat (the picture) and
 * mission day. It keeps the top bar to a single line.
 */
export default function MissionMenu({
  mission,
  onMission,
  habitat,
  onHabitat,
  day,
  onDay,
}: {
  mission: MissionId
  onMission: (m: MissionId) => void
  habitat: HabitatId
  onHabitat: (h: HabitatId) => void
  day: number
  onDay: (d: number) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const m = MISSIONS[mission]
  const fill = ((day - 1) / (MISSION_DAYS - 1)) * 100

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="press flex h-10 items-center gap-2.5 rounded-full bg-white/[0.08] pr-3 pl-4 text-left hover:bg-white/[0.14]"
      >
        <span className="leading-none">
          <span className="block font-cond text-[15px] font-medium whitespace-nowrap">{m.name}</span>
          <span className="mt-0.5 block font-cond text-[12px] whitespace-nowrap text-muted">
            Day {day} of {MISSION_DAYS}
          </span>
        </span>
        <CaretDown
          size={13}
          weight="bold"
          className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Mission settings"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="glass-strong absolute right-0 z-50 mt-2 w-[min(25rem,calc(100vw-1.5rem))] p-5"
          >
            <p className="font-cond text-[13px] text-muted">Mission day</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="display w-16 text-[34px]">{day}</span>
              <input
                type="range"
                min={1}
                max={MISSION_DAYS}
                value={day}
                onChange={(e) => onDay(Number(e.target.value))}
                aria-label="Mission day"
                className="range flex-1"
                style={{ '--fill': `${fill}%` } as CSSProperties}
              />
            </div>

            <p className="mt-5 font-cond text-[13px] text-muted">Destination: sets gravity and radiation</p>
            <ul className="mt-2 grid gap-1">
              {MISSION_ORDER.map((id) => MISSIONS[id]).map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => onMission(o.id)}
                    aria-pressed={o.id === mission}
                    className={`press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${o.id === mission ? 'bg-white/[0.1]' : 'hover:bg-white/[0.05]'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{o.name}</span>
                      <span className="block font-cond text-[13px] text-muted">
                        {o.place}. {o.gravity > 0 ? `${o.gravity} g` : 'Weightless'}, {o.radiationMSvDay} mSv
                        a day
                      </span>
                    </span>
                    {o.id === mission && <Check size={15} weight="bold" />}
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-5 font-cond text-[13px] text-muted">
              Habitat: the room you see. It never changes the body.
            </p>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {(Object.keys(HABITATS) as HabitatId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => onHabitat(id)}
                  aria-pressed={id === habitat}
                  title={HABITATS[id].description}
                  className={`press group flex flex-col gap-1.5 rounded-lg p-1 text-left ${id === habitat ? 'bg-white/[0.12]' : 'hover:bg-white/[0.06]'}`}
                >
                  <img
                    src={HABITATS[id].image}
                    alt=""
                    className={`aspect-[4/5] w-full rounded-md object-cover ${id === habitat ? '' : 'opacity-70 group-hover:opacity-100'}`}
                  />
                  <span className="truncate px-0.5 font-cond text-[12px] leading-tight">
                    {HABITATS[id].name}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
