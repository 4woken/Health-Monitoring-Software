import type { ReactNode } from 'react'
import type { Level } from '../signals'
import type { VitalLevel } from '../vitalLevels'
import { LEVEL_LINE, LEVEL_TEXT, StatusDot } from '../../ui'

/** The name of a vital sign, with a dot when it needs attention. */
export function VitalLabel({ vital, children }: { vital: VitalLevel; children: ReactNode }) {
  return (
    <span
      className={`flex items-center gap-1.5 font-cond text-[13px] ${vital.level === 'ok' ? 'text-white/65 group-hover:text-white' : LEVEL_TEXT[vital.level]}`}
    >
      {vital.level !== 'ok' && <StatusDot level={vital.level} />}
      {children}
    </span>
  )
}

/** Where a value comes from, and in its colour what is wrong with it. */
export function VitalSource({ vital, children }: { vital: VitalLevel; children: ReactNode }) {
  return (
    <span className="block font-cond text-[13px] text-white/75">
      {children}
      {vital.word && (
        <span className="font-medium" style={{ color: LEVEL_LINE[vital.level] }}>
          {' '}
          · {vital.word}
        </span>
      )}
    </span>
  )
}

/** The colour of a value: white when normal, amber to check, red to act. */
export const valueColor = (level: Level) => (level === 'ok' ? '#ffffff' : LEVEL_LINE[level])
