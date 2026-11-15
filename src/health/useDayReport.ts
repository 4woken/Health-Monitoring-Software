import { useMemo } from 'react'
import type { Member } from '../crew/roster'
import type { MissionId } from '../mission/missions'
import { useResultsVersion } from '../selftests/results'
import { dayReport } from './readings'

/** One person's day, computed again when a self-test result is saved or cleared. */
export function useDayReport(member: Member, day: number, mission: MissionId) {
  const tests = useResultsVersion()
  return useMemo(() => {
    void tests
    return dayReport(member, day, mission)
  }, [member, day, mission, tests])
}
