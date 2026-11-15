import { useMemo } from 'react'
import type { Member } from '../crew/roster'
import type { MissionId } from '../mission/missions'
import { useResultsVersion } from '../selftests/results'
import { dayReport } from './readings'
import { useMedicalVersion } from './medicalRecords'

/** One person's day, computed again when a self-test result is saved or cleared. */
export function useDayReport(member: Member, day: number, mission: MissionId) {
  const tests = useResultsVersion()
  const medical = useMedicalVersion()
  return useMemo(() => {
    void tests
    void medical
    return dayReport(member, day, mission)
  }, [member, day, mission, tests, medical])
}
