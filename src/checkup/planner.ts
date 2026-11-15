// The daily check-up: the list of things one person should do today.
//
// A planner turns a person's day into tasks. The one here follows plain rules on the signals, so
// every task can be traced to a value. Another planner, for example one backed by a language model,
// can take its place: it receives the same request and returns the same task shape, and the
// interface does not change. Tasks stay editable whoever planned them.

import { dueOn } from '../health/exams'
import { GUIDE } from '../health/guide'
import { SCHEDULE, type DayReport } from '../health/readings'
import { LIMITS, type SignalId } from '../health/signals'
import { MISSIONS, type MissionId } from '../mission/missions'
import type { SelfTestId } from '../selftests/ids'

export type TaskKind = 'exam' | 'test' | 'followUp' | 'routine' | 'own'

export interface Task {
  id: string
  kind: TaskKind
  title: string
  detail: string
  /** The signal the task comes from, if any. */
  signal?: SignalId
  /** The self-test that does this task: it can be started from the task, and ticks it when done. */
  test?: SelfTestId
}

export interface PlanRequest {
  report: DayReport
  mission: MissionId
}

export interface Planner {
  id: string
  /** Shown under the list, so people know where the tasks come from. */
  credit: string
  plan: (request: PlanRequest) => Promise<Task[]>
}

/** Exams that someone has to do, by the signal they feed. Blood tests feed two signals. */
const EXAMS: Partial<Record<SignalId, string>> = {
  opticNerve: 'Eye ultrasound',
  neckVein: 'Neck ultrasound',
  redCells: 'Blood test',
  immunity: 'Blood test',
  vitaminD: 'Vitamin D blood sample',
  bodyMass: 'Body mass',
}

/** Today's tasks for one person, from their signals and the measurement schedule. */
export function planDay({ report, mission }: PlanRequest): Task[] {
  const exams = new Map<string, Task>()
  for (const s of report.signals) {
    const name = EXAMS[s.id]
    const f = report.freshness[s.id]
    if (!name || !f || f.automatic || exams.has(name)) continue
    if (f.ageDays === 0 && SCHEDULE[s.id].every > 1 && report.day > 1)
      exams.set(name, {
        id: `exam:${name}`,
        kind: 'exam',
        title: `${name}, scheduled today`,
        detail: GUIDE[s.id].how,
        signal: s.id,
      })
    else if (f.outdated)
      exams.set(name, {
        id: `exam:${name}`,
        kind: 'exam',
        title: `${name}: the last one is ${f.ageDays} days old`,
        detail:
          f.nextDay === null
            ? 'The last result is out of date and no further check is scheduled in this scenario.'
            : `Next scheduled on day ${f.nextDay}. Do it sooner if something feels wrong.`,
        signal: s.id,
      })
  }

  // NASA's in-flight schedule for long-duration crews: the tasks that fall on this flight day.
  for (const r of dueOn(report.day))
    exams.set(r.code, {
      id: `nasa:${r.code}`,
      kind: 'exam',
      title: r.task ?? r.name,
      detail: `${r.what} NASA ${r.code}: ${r.when}.`,
      signal: r.signals[0],
    })

  const followUps: Task[] = report.signals
    .filter((s) => s.level !== 'ok')
    .map((s) => ({
      id: `follow:${s.id}`,
      kind: 'followUp',
      title: s.advice,
      detail: `${s.title}: ${s.meaning}`,
      signal: s.id,
    }))

  const loaded = MISSIONS[mission].gravity > 0
  const routine: Task[] = [
    {
      id: 'routine:checks',
      kind: 'routine',
      title: 'Blood pressure, temperature and sugar',
      detail: 'Arm cuff, thermometer and finger-prick meter, before breakfast.',
      signal: 'bodyChecks',
    },
    {
      id: 'routine:urine',
      kind: 'routine',
      title: 'Log urine volume',
      detail: `At least ${LIMITS.urineMinLitres} L a day keeps kidney stones away.`,
      signal: 'hydration',
    },
    {
      id: 'routine:mood',
      kind: 'routine',
      title: 'Rate your mood, and say if you have a headache',
      detail: 'A rating from 1 to 5. Ten seconds.',
      signal: 'mood',
    },
    {
      id: 'routine:exercise',
      kind: 'routine',
      title: 'Resistance exercise session',
      detail: loaded
        ? 'Partial gravity loads the bones a little. Exercise still does most of the work.'
        : 'Without gravity, this is what keeps bones and muscles. NASA plans 2.5 hours of exercise a day on the ISS (MEDB 5.2).',
      signal: 'loading',
    },
    {
      id: 'routine:pulse',
      kind: 'routine',
      title: 'Measure your pulse with the camera',
      detail: 'One minute, facing the camera, in even light.',
      signal: 'oxygen',
      test: 'restingPulse',
    },
  ]

  return [...exams.values(), ...followUps, ...routine]
}

export const rulesPlanner: Planner = {
  id: 'rules',
  credit: 'Planned from today’s signals, the measurement schedule and NASA’s in-flight medical requirements.',
  plan: async (request) => planDay(request),
}
