import type { ReactNode } from 'react'
import {
  Barbell,
  Brain,
  Chair,
  Ear,
  Eye,
  FlowerLotus,
  HandGrabbing,
  Heart,
  Heartbeat,
  Lightning,
  PersonSimple,
  SneakerMove,
  SpeakerHigh,
  SpeakerSlash,
  Wind,
  type Icon,
} from '@phosphor-icons/react'
import type { BreathReading } from '../../camera/breathReading'
import type { Member } from '../../crew/roster'
import type { SelfTestId } from '../ids'
import type { RunValues } from '../judge'
import { setVoice, useVoiceSetting, voiceAvailable } from '../voice'

export const ICON: Record<SelfTestId, Icon> = {
  reaction: Lightning,
  cognition: Brain,
  vision: Eye,
  hearing: Ear,
  balance: PersonSimple,
  sitToStand: Chair,
  dexterity: HandGrabbing,
  pulseRecovery: Heartbeat,
  restingPulse: Heart,
  breathingRate: Wind,
  squats: Barbell,
  heelRaises: SneakerMove,
  breathing: FlowerLotus,
}

/** What every test screen receives: who is tested, the chosen mode, and how to finish. */
export interface RunProps {
  member: Member
  /** A choice made before the start, such as the camera or the phone for balance. */
  mode: string
  /** The run is complete: its numbers go to be judged and saved. */
  onDone: (run: RunValues) => void
  /** Leaves without saving. */
  onCancel: () => void
  /** A breathing rate measured during the test, for the chest of the body. */
  onBreath?: (reading: BreathReading) => void
  onBreathGone?: () => void
}

export function VoiceToggle() {
  const on = useVoiceSetting()
  if (!voiceAvailable())
    return <p className="text-[13px] text-dim">No voice on this device: follow the words on screen.</p>
  return (
    <button
      type="button"
      onClick={() => setVoice(!on)}
      aria-pressed={on}
      className="press inline-flex min-h-9 items-center gap-2 rounded-full bg-white/[0.07] px-3.5 text-[13px] hover:bg-white/[0.12]"
    >
      {on ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}
      {on ? 'Voice guidance on' : 'Voice guidance off'}
    </button>
  )
}

/** A label above a block of the test screens. */
export function Label({ children }: { children: ReactNode }) {
  return <h3 className="font-cond text-[13px] text-white/60">{children}</h3>
}

/** A large number with its unit, for timers, counters and scores. */
export function Big({ value, unit, label }: { value: ReactNode; unit?: string; label?: string }) {
  return (
    <p className="flex items-baseline gap-2" aria-label={label}>
      <span className="font-cond text-[56px] leading-none font-semibold tabular-nums sm:text-[72px]">
        {value}
      </span>
      {unit && <span className="text-[15px] text-muted">{unit}</span>}
    </p>
  )
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-white/15"
    >
      <div
        className="h-full rounded-full bg-white motion-safe:transition-[width] motion-safe:duration-300"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  )
}

/** The words of the moment, large: what to do now. Also read aloud by the test when voice is on. */
export function Cue({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'done' }) {
  return (
    <p
      aria-live="polite"
      className={`min-h-8 text-[20px] leading-snug font-medium sm:text-[24px] ${tone === 'done' ? 'text-holo' : 'text-ink'}`}
    >
      {children}
    </p>
  )
}
