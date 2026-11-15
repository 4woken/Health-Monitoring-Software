// The self-tests and exercises a crew member can do on themselves. Tests measure and compare with
// the person's own usual result; exercises keep the body fit and are counted, not judged.

export const TEST_IDS = [
  'reaction',
  'cognition',
  'vision',
  'hearing',
  'balance',
  'sitToStand',
  'dexterity',
  'pulseRecovery',
  'restingPulse',
  'breathingRate',
] as const

export const EXERCISE_IDS = ['squats', 'heelRaises', 'breathing'] as const

export type TestId = (typeof TEST_IDS)[number]
export type ExerciseId = (typeof EXERCISE_IDS)[number]
export type SelfTestId = TestId | ExerciseId

export const SELF_TEST_IDS: SelfTestId[] = [...TEST_IDS, ...EXERCISE_IDS]

export const isSelfTest = (value: unknown): value is SelfTestId =>
  typeof value === 'string' && (SELF_TEST_IDS as string[]).includes(value)
