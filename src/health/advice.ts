// What to do today, as a few short recommendations pinned to the body. Each one comes from a signal
// that needs attention, or from the mission itself, and says what kind of action it is.

import { MISSIONS, type MissionId } from '../mission/missions'
import type { DayReport } from './readings'
import { RANK, type Level, type SignalId } from './signals'

export type AdviceKind =
  | 'exercise'
  | 'stretch'
  | 'heart'
  | 'fatigue'
  | 'stress'
  | 'balance'
  | 'hydration'
  | 'eyes'
  | 'air'
  | 'radiation'
  | 'food'
  | 'infection'

export const KIND_LABEL: Record<AdviceKind, string> = {
  exercise: 'Exercise',
  stretch: 'Stretching',
  heart: 'Heart',
  fatigue: 'Fatigue',
  stress: 'Stress',
  balance: 'Balance',
  hydration: 'Hydration',
  eyes: 'Eyes',
  air: 'Air',
  radiation: 'Radiation',
  food: 'Food',
  infection: 'Infection',
}

export interface Advice {
  id: string
  kind: AdviceKind
  /** watch: do it today. act: do it now. */
  level: Exclude<Level, 'ok'>
  /** What to do, in a few words. */
  title: string
  /** Why, in a sentence. */
  why: string
  /** The signal it comes from; it also places the recommendation on the body. */
  signal: SignalId
}

const FROM_SIGNAL: Record<SignalId, { kind: AdviceKind; title: string; now?: string }> = {
  loading: { kind: 'exercise', title: 'Do a resistance session today' },
  oxygen: { kind: 'heart', title: 'Rest, then measure again', now: 'Sit down and get medical advice now' },
  bodyChecks: { kind: 'heart', title: 'Rest, then measure again' },
  neckVein: { kind: 'heart', title: 'Repeat the neck ultrasound', now: 'Get medical advice now' },
  sleep: { kind: 'fatigue', title: 'Protect tonight’s sleep' },
  mood: { kind: 'stress', title: 'Take a real break today' },
  balance: { kind: 'balance', title: 'Move with care, test again tomorrow' },
  headache: { kind: 'air', title: 'Check the air where you sleep' },
  hydration: { kind: 'hydration', title: 'Drink more through the day' },
  redCells: { kind: 'hydration', title: 'Drink more, then repeat the test' },
  opticNerve: {
    kind: 'eyes',
    title: 'Test your vision today',
    now: 'Get your eyes and your lens dose checked',
  },
  cabinAir: { kind: 'air', title: 'Check the CO2 scrubber' },
  radiation: {
    kind: 'radiation',
    title: 'Use the shielded area in solar storms',
    now: 'Limit your exposure now',
  },
  bodyMass: { kind: 'food', title: 'Eat more and log your meals' },
  vitaminD: { kind: 'food', title: 'Take your vitamin D' },
  immunity: { kind: 'infection', title: 'Watch for signs of infection' },
}

/** Weightless days during which the back is stretched every day: the spine lengthens early in flight. */
const STRETCH_DAYS = 21

/** Today's recommendations for one person, most urgent first. */
export function advise(report: DayReport, mission: MissionId): Advice[] {
  const list: Advice[] = []
  for (const s of report.signals) {
    if (s.level === 'ok') continue
    const rule = FROM_SIGNAL[s.id]
    list.push({
      id: `signal:${s.id}`,
      kind: rule.kind,
      level: s.level,
      title:
        s.level === 'act' && rule.now
          ? rule.now
          : s.id === 'opticNerve' && s.sources.includes('SANS_EXAM_CRITERIA')
            ? 'Have your eye exam reviewed'
            : rule.title,
      why: s.meaning,
      signal: s.id,
    })
  }
  if (MISSIONS[mission].gravity === 0 && report.day <= STRETCH_DAYS)
    list.push({
      id: 'mission:stretch',
      kind: 'stretch',
      level: 'watch',
      title: 'Stretch your back today',
      why: 'Without gravity the spine lengthens by a few centimetres, and back pain is common in the first weeks of flight.',
      signal: 'loading',
    })
  return list.sort((a, b) => RANK[b.level] - RANK[a.level])
}
