import type { SelfTestId } from './ids'

/** The self-tests by what they look after, in the order of the list. */
export const TEST_GROUPS: { title: string; tests: SelfTestId[] }[] = [
  { title: 'Alertness and senses', tests: ['reaction', 'cognition', 'vision', 'hearing'] },
  { title: 'Balance and strength', tests: ['balance', 'sitToStand', 'dexterity'] },
  { title: 'Heart and lungs', tests: ['pulseRecovery', 'restingPulse', 'breathingRate'] },
  { title: 'Exercises', tests: ['squats', 'heelRaises', 'breathing'] },
]
