// The simulated minute, as the rest of the app reads it: the day's report with the air, the oxygen,
// a headache, the water and the radiation of that minute, so the markers on the body and the list of
// things to do follow the simulation; the vital signs of that minute; and where the list of the day
// stands.

import type { LiveReadings } from '../app/ArVisor'
import { medicalSignals, type DayReport } from '../health/readings'
import { cabinOn } from '../health/simulation'
import { assess, bySeverity, LIMITS, type Readings, type Signal } from '../health/signals'
import type { MissionId } from '../mission/missions'
import { testFacts } from '../selftests/facts'
import {
  clock,
  nextDrink,
  sampleAt,
  taskAt,
  type Simulation,
  type SimEvent,
  type SimTask,
  type TaskState,
} from './engine'

/** The day's cabin CO2, where the simulation starts from. */
export const cabinCo2Of = (report: DayReport, mission: MissionId) => cabinOn(report.day, mission).co2MmHg

const doneAt = (sim: Simulation, id: string, t: number) => {
  const task = sim.tasks.find((k) => k.id === id)
  return !!task && task.doneAt !== null && t >= task.doneAt
}

/** Exercise sessions, when a hard-working heart is expected. */
const trainingAt = (sim: Simulation, t: number) => {
  const { now } = activityAt(sim, t)
  return now.activity === 'resistance' || now.activity === 'cycle' || now.activity === 'run'
}

/** A heart working harder than the task asks: 80% of its maximum or more outside an exercise session. */
export const heartTooHard = (sim: Simulation, t: number) =>
  !trainingAt(sim, t) && sampleAt(sim, t).bpm >= 0.8 * sim.person.maxBpm

/** The report of minute `t`: the signals are judged again on that minute's values. */
export function liveReport(base: DayReport, sim: Simulation, mission: MissionId, t: number): DayReport {
  const s = sampleAt(sim, t)
  // A headache is reported when the check asks for it, and gone once the air is clean and tested.
  const headache = doneAt(sim, 'monitor:headache', t) && !doneAt(sim, 'monitor:cognition', t)
  const thirsty = sim.tasks.some(
    (k) => k.id.startsWith('monitor:water') && t >= k.at && (k.doneAt === null || t < k.doneAt),
  )
  const readings: Readings = {
    ...base.readings,
    spo2Pct: s.spo2Pct,
    headache: base.readings.headache || headache,
    urineLitres: thirsty
      ? Math.min(base.readings.urineLitres, LIMITS.urineMinLitres - 0.4)
      : base.readings.urineLitres,
  }
  const day = cabinOn(base.day, mission)
  const cabin = {
    ...day,
    // On a spacewalk, the air breathed is the suit's.
    co2MmHg: s.suitCo2MmHg ?? s.co2MmHg,
    doseMSv: day.doseRateMSvDay * (base.day - 1 + sim.scenario.start / 1440) + s.doseMSv,
    doseRateMSvDay: Math.round(((s.doseRate * 24) / 1000) * 100) / 100,
  }
  const judged = medicalSignals(
    assess(readings, base.member.baseline, cabin, testFacts(base.member.id, base.day)),
    base.member.id,
    base.day,
    mission,
  )
  const { now } = activityAt(sim, t)
  const training = trainingAt(sim, t)
  // What the day's signals cannot see in a minute: a storm's dose rate, a heart working too hard,
  // a body running hot. The marker of that part lights up while it lasts.
  const live: Partial<Record<Signal['id'], Pick<Signal, 'level' | 'value' | 'meaning' | 'advice'>>> = {}
  if (s.doseRate >= 5 * sim.usualRate)
    live.radiation = {
      level: 'act',
      value: `${s.doseRate} µSv/h now, ${Math.round(s.doseRate / sim.usualRate)} times the usual rate`,
      meaning: `A solar storm. Outside the shelter it would be ${s.outsideRate} µSv/h.`,
      advice: 'Stay in the storm shelter until the all-clear.',
    }
  if (heartTooHard(sim, t))
    live.oxygen = {
      level: 'watch',
      value: `Heart rate ${s.bpm} bpm, ${Math.round((100 * s.bpm) / sim.person.maxBpm)}% of maximum`,
      meaning: `Harder than planned for this task: ${now.title.toLowerCase()}.`,
      advice: 'Slow down for three minutes.',
    }
  if (s.coreTempC >= 38)
    live.bodyChecks = {
      level: 'watch',
      value: `Core temperature ${s.coreTempC.toFixed(1)} °C`,
      meaning: training
        ? 'Without gravity, heat does not rise off the skin, so exercise warms the body fast.'
        : 'The body is warming faster than it can cool.',
      advice: training ? 'Lower the pace and drink 250 ml.' : 'Cool down and drink 250 ml.',
    }
  const signals = bySeverity(judged.map((x) => (live[x.id] ? { ...x, ...live[x.id] } : x)))
  return { ...base, readings, signals }
}

/** The vital signs of minute `t`. */
export function liveVitals(sim: Simulation, t: number) {
  const s = sampleAt(sim, t)
  return {
    bpm: s.bpm,
    breaths: s.breaths,
    spo2Pct: s.spo2Pct,
    systolic: s.systolic,
    diastolic: s.diastolic,
    temperatureC: s.coreTempC,
    glucoseMgDl: s.glucoseMgDl,
    radiationUSvH: s.doseRate,
  }
}
export type LiveVitals = ReturnType<typeof liveVitals>

/** The newest warning of the last half hour, if any. */
export function latestWarning(sim: Simulation, t: number): SimEvent | undefined {
  for (let i = sim.events.length - 1; i >= 0; i--) {
    const e = sim.events[i]
    if (e.at > t) continue
    if (t - e.at > 30) return undefined
    if (e.level !== 'ok') return e
  }
  return undefined
}

/** What the helmet shows at minute `t`. */
export function visorReadings(sim: Simulation, t: number): LiveReadings {
  const s = sampleAt(sim, t)
  const warning = latestWarning(sim, t)
  return {
    bpm: s.bpm,
    spo2Pct: s.spo2Pct,
    systolic: s.systolic,
    diastolic: s.diastolic,
    coreTempC: s.coreTempC,
    glucoseMgDl: s.glucoseMgDl,
    sleepHours: sim.person.sleepHours,
    nextDrinkMin: nextDrink(sim, t),
    radiationUSvH: s.doseRate,
    clock: clock(t),
    alert: warning ? { level: warning.level, text: warning.title } : null,
  }
}

export type TaskView = SimTask & { state: TaskState; due: number; moved: boolean }

/** The list of the day at minute `t`, in time order. */
export function tasksAt(sim: Simulation, t: number): TaskView[] {
  return sim.tasks
    .filter((x) => t >= x.shownFrom)
    .map((x) => ({ ...x, ...taskAt(x, t) }))
    .sort((a, b) => a.due - b.due || a.at - b.at)
}

/** What happened up to minute `t`, newest first. */
export const eventsUntil = (sim: Simulation, t: number) => sim.events.filter((e) => e.at <= t).reverse()

/** The activity of minute `t`, and the next one. */
export function activityAt(sim: Simulation, t: number) {
  const { blocks } = sim.scenario
  const index = sampleAt(sim, t).block
  return { now: blocks[index] ?? blocks[blocks.length - 1], next: blocks[index + 1] }
}
