import type { ExerciseMotion } from '../../exercises/environmentExercise'
import { CREW_DEPTH } from '../anatomy/organs'

/** Row in the cabin outfit, then return to the depth the crew member chose. */
export function effectiveDepth(
  depth: number,
  physiology: boolean,
  exercise: ExerciseMotion | null,
  isolated: boolean,
) {
  if (exercise === 'row') return CREW_DEPTH
  if (physiology || (exercise && isolated)) return 0
  return exercise ? Math.max(CREW_DEPTH, depth) : depth
}
