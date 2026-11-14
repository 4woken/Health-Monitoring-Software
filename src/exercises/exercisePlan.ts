export type ExerciseKind = 'assembly' | 'knee' | 'reaction' | 'breathing'
export type ExerciseRating = 'easy' | 'right' | 'hard'
export type StressChange = 'lower' | 'same' | 'higher'

/** Today's answers from this person. The selected mission is a simulation and
 * does not establish where the person using the camera is physically seated. */
export interface ExerciseCheckIn {
  energy: 'low' | 'usual'
  /** Undefined when the person skips the question. */
  stress?: 'none' | 'some' | 'high'
  shortSleep: boolean
  longSitting: boolean
  wantsDexterity: boolean
  wantsMobility: boolean
  onEarth: boolean
  unwell: boolean
}

export interface ExerciseResult {
  kind: ExerciseKind
  target: number
  completedAt: number
  rating?: ExerciseRating
  stressChange?: StressChange
  medianMs?: number
  anticipations?: number
}

export type ExerciseHistory = Partial<Record<ExerciseKind, ExerciseResult>>

export interface ExerciseRecommendation {
  kind: ExerciseKind
  target: number
  reason: string
}

export function completedToday(result: ExerciseResult | undefined, now = new Date()): boolean {
  return !!result && new Date(result.completedAt).toDateString() === now.toDateString()
}

// Self-reported stress stays in this tab, including when session results are saved.
const reportedStress = new Map<string, { day: string; value: NonNullable<ExerciseCheckIn['stress']> }>()

export function getReportedStress(memberId: string, now = new Date()): ExerciseCheckIn['stress'] {
  const report = reportedStress.get(memberId)
  if (!report) return undefined
  if (report.day === now.toDateString()) return report.value
  reportedStress.delete(memberId)
  return undefined
}

export function setReportedStress(
  memberId: string,
  stress: ExerciseCheckIn['stress'],
  now = new Date(),
): void {
  if (stress === undefined) reportedStress.delete(memberId)
  else reportedStress.set(memberId, { day: now.toDateString(), value: stress })
}

const kinds: ExerciseKind[] = ['assembly', 'knee', 'reaction', 'breathing']
const minReps = 2
const maxReps = 6
const reactionTrials = 5
export const BREATHING_SECONDS = 60

function sessionTarget(kind: ExerciseKind, lowEnergy: boolean, history: ExerciseHistory): number {
  // A fixed number of trials keeps successive reaction-game scores comparable.
  if (kind === 'reaction') return reactionTrials
  if (kind === 'breathing') return BREATHING_SECONDS
  const last = history[kind]
  const step = last?.rating === 'easy' ? 1 : last?.rating === 'hard' ? -1 : 0
  const ceiling = lowEnergy ? (kind === 'knee' ? 3 : 4) : maxReps
  return Math.max(minReps, Math.min(ceiling, (last?.target ?? 3) + step))
}

export function recommendExercises(
  checkIn: ExerciseCheckIn,
  history: ExerciseHistory,
  now = new Date(),
): ExerciseRecommendation[] {
  if (checkIn.unwell) return []
  const suggestions: ExerciseRecommendation[] = []
  const lowEnergy = checkIn.energy === 'low'
  const suggest = (kind: ExerciseKind, reason: string) => {
    if (!completedToday(history[kind], now)) {
      suggestions.push({ kind, reason, target: sessionTarget(kind, lowEnergy, history) })
    }
  }
  if (checkIn.stress === 'some' || checkIn.stress === 'high')
    suggest('breathing', 'You reported feeling stressed right now.')
  if (checkIn.shortSleep) suggest('reaction', 'You reported a shorter night than usual.')
  if (checkIn.wantsDexterity || lowEnergy) {
    suggest(
      'assembly',
      checkIn.wantsDexterity
        ? 'You chose a hand-coordination activity.'
        : 'You reported low energy. This game uses one hand while seated.',
    )
  }
  if (checkIn.onEarth && (checkIn.longSitting || checkIn.wantsMobility)) {
    suggest(
      'knee',
      checkIn.longSitting ? 'You reported a long time seated today.' : 'You chose a seated mobility break.',
    )
  }
  return suggestions
}

// Keep the latest completed result per activity. Separate entries prevent a save
// from copying a different activity's session-only result into local storage.
const sessionResults = new Map<string, ExerciseResult>()
const keyFor = (memberId: string, kind: ExerciseKind) => 'pulsar.exercises.v1.' + memberId + '.' + kind

function readResult(kind: ExerciseKind, value: unknown): ExerciseResult | undefined {
  if (!value || typeof value !== 'object') return
  const r = value as Partial<ExerciseResult>
  if (r.kind !== kind || typeof r.target !== 'number' || !Number.isInteger(r.target)) return
  if (kind === 'reaction' && r.target !== reactionTrials) return
  if (kind === 'breathing' && r.target !== BREATHING_SECONDS) return
  if ((kind === 'assembly' || kind === 'knee') && (r.target < minReps || r.target > maxReps)) return
  if (typeof r.completedAt !== 'number' || !Number.isFinite(new Date(r.completedAt).getTime())) return

  const result: ExerciseResult = { kind, target: r.target, completedAt: r.completedAt }
  if (kind === 'breathing') {
    if (r.stressChange === 'lower' || r.stressChange === 'same' || r.stressChange === 'higher')
      result.stressChange = r.stressChange
  } else if (r.rating === 'easy' || r.rating === 'right' || r.rating === 'hard') {
    result.rating = r.rating
  }
  if (kind === 'reaction') {
    if (typeof r.medianMs === 'number' && Number.isFinite(r.medianMs) && r.medianMs >= 0)
      result.medianMs = r.medianMs
    if (typeof r.anticipations === 'number' && Number.isSafeInteger(r.anticipations) && r.anticipations >= 0)
      result.anticipations = r.anticipations
  }
  return result
}

export function loadExerciseHistory(memberId: string): ExerciseHistory {
  const results: ExerciseHistory = {}
  for (const kind of kinds) {
    const key = keyFor(memberId, kind)
    let result = sessionResults.get(key)
    if (!result) {
      try {
        result = readResult(kind, JSON.parse(localStorage.getItem(key) ?? 'null'))
      } catch {
        // Each activity can still be read if another entry is damaged.
      }
    }
    if (result) results[kind] = result
  }
  return results
}

function storeResult(key: string, result: ExerciseResult, remember: boolean) {
  sessionResults.set(key, result)
  try {
    if (remember) {
      localStorage.setItem(key, JSON.stringify(result))
      sessionResults.delete(key)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // The completion and next target still work for this tab when storage is unavailable.
  }
}

export function saveExerciseResult(
  memberId: string,
  session: Omit<ExerciseResult, 'completedAt'>,
  remember: boolean,
): ExerciseHistory {
  const result = readResult(session.kind, { ...session, completedAt: Date.now() })
  if (result) storeResult(keyFor(memberId, session.kind), result, remember)
  return loadExerciseHistory(memberId)
}

function updateSessionFeedback(
  memberId: string,
  kind: ExerciseKind,
  completedAt: number,
  feedback: Pick<ExerciseResult, 'rating' | 'stressChange'>,
): ExerciseHistory {
  const history = loadExerciseHistory(memberId)
  const last = history[kind]
  if (!last || last.completedAt !== completedAt) return history
  const key = keyFor(memberId, kind)
  const result = readResult(kind, { ...last, ...feedback })
  if (result) storeResult(key, result, !sessionResults.has(key))
  return loadExerciseHistory(memberId)
}

export function rateExerciseResult(
  memberId: string,
  kind: ExerciseKind,
  completedAt: number,
  rating: ExerciseRating,
): ExerciseHistory {
  return updateSessionFeedback(memberId, kind, completedAt, { rating })
}

export function recordStressChange(
  memberId: string,
  completedAt: number,
  change: StressChange,
): ExerciseHistory {
  return updateSessionFeedback(memberId, 'breathing', completedAt, { stressChange: change })
}

export function clearExerciseHistory(memberId: string): void {
  reportedStress.delete(memberId)
  for (const kind of kinds) {
    const key = keyFor(memberId, kind)
    sessionResults.delete(key)
    try {
      localStorage.removeItem(key)
    } catch {
      // There may be no local storage in this browsing mode.
    }
  }
}
