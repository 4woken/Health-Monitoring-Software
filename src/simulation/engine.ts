// SIMULATED. Plays one mission day minute by minute: the body's response to what the crew member
// does (heart rate, blood pressure, breathing, core temperature, blood sugar, water drunk), the air
// and the radiation around them, and the monitoring rules that turn readings into alerts and tasks.
// Everything is computed once, ahead of time, so the day can be played, paused and scrubbed: the
// screen only looks up a minute.
//
// The body model is deliberately simple and is explained in docs/SIMULATION.md. Heart rate moves
// towards a target set by the effort (in METs) between the person's resting and maximum rates,
// faster on the way up than on the way down. In weightlessness, the core warms faster during
// exercise, as measured on the station (Stahn et al., Scientific Reports 2017).

import type { Task } from '../checkup/planner'
import { LIMITS, type Level, type Readings } from '../health/signals'
import { MISSIONS } from '../mission/missions'
import type { SelfTestId } from '../selftests/ids'
import type { Activity, Block, Scenario, ScenarioTask } from './scenarios'

/** The person's own values, from their readings of the day. */
export interface Person {
  restingBpm: number
  maxBpm: number
  spo2Pct: number
  systolic: number
  diastolic: number
  glucoseMgDl: number
  temperatureC: number
  /** Average over the last seven nights, hours. */
  sleepHours: number
}

/** Profiles hold no age, so the maximum heart rate is the one of a 38-year-old (208 − 0.7 × age). */
export const MAX_BPM = 181

export const personOf = (r: Readings): Person => ({
  restingBpm: r.restingPulseBpm,
  maxBpm: MAX_BPM,
  spo2Pct: r.spo2Pct,
  systolic: r.systolic,
  diastolic: r.diastolic,
  glucoseMgDl: r.glucoseMgDl,
  temperatureC: r.temperatureC,
  sleepHours: r.sleepHours,
})

/** One minute of the day. */
export interface Sample {
  t: number
  bpm: number
  spo2Pct: number
  systolic: number
  diastolic: number
  breaths: number
  coreTempC: number
  glucoseMgDl: number
  /** Drunk since waking, ml. */
  waterMl: number
  co2MmHg: number
  /** In the suit on a spacewalk; null otherwise. */
  suitCo2MmHg: number | null
  /** Where the person is, µSv per hour. */
  doseRate: number
  /** Outside the shelter, µSv per hour. */
  outsideRate: number
  /** Since waking, mSv. */
  doseMSv: number
  met: number
  /** Index of the block in the scenario. */
  block: number
}

export interface SimEvent {
  at: number
  level: Level
  title: string
  detail: string
  /** From the scenario's story, or from a monitoring rule reading the values. */
  from: 'story' | 'monitor'
}

export interface SimTask {
  id: string
  at: number
  title: string
  detail: string
  /** The person's check-up, the mission plan, or a monitoring rule. */
  from: 'checkup' | 'mission' | 'monitor'
  shownFrom: number
  doneAt: number | null
  move?: { at: number; to: number; reason: string }
  test?: SelfTestId
}

export interface Simulation {
  scenario: Scenario
  person: Person
  samples: Sample[]
  /** In time order. */
  events: SimEvent[]
  tasks: SimTask[]
  /** Usual dose rate at the destination, µSv per hour. */
  usualRate: number
}

/** Usual effort of each activity, in METs (1 is sitting still). */
const MET: Record<Activity, number> = {
  sleep: 0.9,
  rest: 1.2,
  meal: 1.5,
  hygiene: 1.8,
  work: 1.6,
  meeting: 1.3,
  check: 1.3,
  maintenance: 2.4,
  resistance: 5,
  cycle: 6.5,
  run: 8,
  eva: 4,
  suit: 2.2,
  shelter: 1.3,
}
const EXERCISE: Activity[] = ['resistance', 'cycle', 'run']

/** The planned effort of a block, in METs. */
export const blockMet = (b: Block) => b.met ?? MET[b.activity]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The value of a line through `points` at `t`, flat before the first point and after the last. */
export function profile(points: [number, number][] | undefined, t: number, fallback: number): number {
  if (!points?.length) return fallback
  if (t <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i]
    if (t <= t1) {
      const [t0, v0] = points[i - 1]
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1)
    }
  }
  return points[points.length - 1][1]
}

/** "09:05" */
export const clock = (t: number) =>
  `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/** The effort of a minute: resistance comes in sets, runs warm up and cool down, walks vary. */
function effort(b: Block, t: number): number {
  const base = b.met ?? MET[b.activity]
  const m = t - b.from
  const length = b.to - b.from
  switch (b.activity) {
    case 'resistance':
      return m % 4 < 2 ? base * 1.25 : base * 0.45
    case 'run':
    case 'cycle': {
      const ramp = Math.min(1, (m + 1) / 6, (b.to - t) / 5)
      const interval = b.activity === 'run' && m > length / 3 && m < (2 * length) / 3 && m % 6 < 3 ? 1.12 : 1
      return Math.max(2.5, base * (0.45 + 0.55 * ramp) * interval)
    }
    case 'eva':
      return base * (1 + 0.15 * Math.sin(t / 1.8) + 0.08 * Math.sin(t / 0.7))
    default:
      return base
  }
}

/** A meal raises blood sugar for two to three hours, most about forty minutes after. */
const mealRise = (minutesAfter: number) =>
  minutesAfter <= 0 ? 0 : (minutesAfter / 40) * Math.exp(1 - minutesAfter / 40)

/** Small, smooth wobble, the same at every run. */
const wobble = (t: number) => 1.2 * Math.sin(t / 3.1) + 0.8 * Math.sin(t / 7.7 + 1)

/**
 * Plays the day. `checkup` is the person's own check-up for that day, laid out at the free times of
 * the scenario: routine checks in the morning health check, the rest in order.
 */
export function simulate(scenario: Scenario, person: Person, checkup: Task[], cabinCo2?: number): Simulation {
  const { blocks, start, end } = scenario
  // The story's CO2 starts from the day's own cabin level, when it is given.
  const co2Shift = cabinCo2 === undefined ? 0 : cabinCo2 - profile(scenario.co2, start, cabinCo2)
  const gravity = MISSIONS[scenario.mission].gravity
  const usualRate = (MISSIONS[scenario.mission].radiationMSvDay * 1000) / 24
  const events: SimEvent[] = scenario.events.map((e) => ({ ...e, from: 'story' }))
  const tasks: SimTask[] = [
    ...placeCheckup(scenario, checkup),
    ...scenario.tasks.map((t) => missionTask(t, start)),
  ]
  const say = (at: number, level: Level, title: string, detail: string) =>
    events.push({ at, level, title, detail, from: 'monitor' })
  const add = (task: Omit<SimTask, 'from' | 'shownFrom'>) =>
    tasks.push({ ...task, from: 'monitor', shownFrom: task.at })

  // Water: the planned drinks, a sip from the suit's bag every half hour outside, and what the rules add.
  const drinks = new Map<number, number>()
  const drink = (t: number, ml: number) => drinks.set(t, (drinks.get(t) ?? 0) + ml)
  for (const d of scenario.drinks) drink(d.at, d.ml)
  const walks = evaSpans(blocks)
  for (const w of walks) for (let t = w.from + 30; t < w.to; t += 30) drink(t, 90)
  const meals = [...scenario.meals]
  const wake = start
  const bed = blocks.find((b) => b.activity === 'sleep')?.from ?? end

  // The person's morning: a week of short nights adds the reaction test.
  const check = blocks.find((b) => b.activity === 'check')
  if (person.sleepHours < 6) {
    say(
      start + 1,
      'watch',
      `Short nights: ${person.sleepHours.toFixed(1)} h on average this week`,
      'Under six hours slows the reactions. A reaction test is added to the morning checks.',
    )
    const due = (check?.from ?? start + 60) + 18
    add({
      id: 'monitor:reaction',
      at: due,
      doneAt: due + 5,
      title: 'Reaction test: a week of short nights',
      detail: 'Three minutes on the keyboard, as NASA’s crews do when they are tired.',
      test: 'reaction',
    })
  } else
    say(
      start + 1,
      'ok',
      `Slept ${person.sleepHours.toFixed(1)} h a night this week`,
      'Enough sleep for a demanding day.',
    )

  const samples: Sample[] = []
  let bpm = person.restingBpm - 4
  let breaths = 12
  let core = person.temperatureC - 0.2
  let spent = 0
  let water = 0
  let dose = 0
  // What the rules remember.
  let co2High = 0
  let co2Over = false
  let co2Alarm = false
  let waterOpenUntil = 0
  let suitAlarm = false
  let doseAlarm = false
  const fastBlocks = new Set<number>()
  let hot = false
  const peaks = new Map<number, { bpm: number; at: number }>()

  for (let t = start; t <= end; t++) {
    const index = blocks.findIndex((b) => t >= b.from && t < b.to)
    const b = blocks[index] ?? blocks[blocks.length - 1]
    const met = effort(b, t)
    const sleeping = b.activity === 'sleep'
    const suited = b.activity === 'eva'

    // Heart: towards the target of the effort, faster up than down.
    const share = clamp((met - 1) / 9, 0, 1) ** 1.1
    const target =
      (sleeping ? person.restingBpm - 7 : person.restingBpm + (person.maxBpm - person.restingBpm) * share) +
      profile(scenario.stress, t, 0)
    bpm += (target - bpm) * (1 - Math.exp(-1 / (target > bpm ? 0.9 : 1.8)))
    const heart = Math.round(bpm + wobble(t))
    const rise = Math.max(0, heart - person.restingBpm)
    breaths += ((sleeping ? 11 : clamp(12 + 2.4 * (met - 1), 10, 40)) - breaths) * 0.6
    // Core temperature: effort heats, slowly; without gravity's convection, faster.
    // The body clock: warmest in the late afternoon, coolest before dawn.
    const circadian = 0.25 * Math.cos((2 * Math.PI * (t - 16 * 60)) / 1440)
    const heat = Math.min(1.5, (gravity === 0 ? 0.2 : 0.11) * Math.max(0, met - 1.2))
    core += (person.temperatureC + circadian + heat - core) * (1 - Math.exp(-1 / 18))
    // Blood sugar: meals raise it, sustained effort uses it.
    spent = spent * Math.exp(-1 / 40) + 0.12 * Math.max(0, met - 3)
    const sugar = person.glucoseMgDl + meals.reduce((s, m) => s + 38 * mealRise(t - m), 0) - spent
    water += drinks.get(t) ?? 0
    const co2 = profile(scenario.co2, t, 2.4) + co2Shift
    const suitCo2 = suited ? 1.3 + 0.28 * Math.max(0, met - 2) + profile(scenario.suitCo2, t, 0) : null
    const outsideRate = usualRate * profile(scenario.radiation, t, 1)
    const shielding = b.activity === 'shelter' ? 0.2 : 0.85
    const doseRate = usualRate + (outsideRate - usualRate) * shielding
    dose += doseRate / 60 / 1000
    const resistance = b.activity === 'resistance'

    const s: Sample = {
      t,
      bpm: heart,
      spo2Pct: suited
        ? 99
        : clamp(Math.round(person.spo2Pct - (met > 7 ? 1 : 0) - (sleeping ? 1 : 0)), 85, 100),
      systolic: Math.round(
        person.systolic + Math.min(55, 0.5 * rise) + (resistance ? 8 : 0) - (sleeping ? 10 : 0),
      ),
      diastolic: Math.round(person.diastolic + 0.1 * rise + (resistance ? 5 : 0) - (sleeping ? 6 : 0)),
      breaths: Math.round(breaths),
      coreTempC: Math.round(core * 10) / 10,
      glucoseMgDl: Math.round(sugar),
      waterMl: water,
      co2MmHg: Math.round(co2 * 10) / 10,
      suitCo2MmHg: suitCo2 === null ? null : Math.round(suitCo2 * 10) / 10,
      doseRate: Math.round(doseRate),
      outsideRate: Math.round(outsideRate),
      doseMSv: dose,
      met: Math.round(met * 10) / 10,
      block: index,
    }
    samples.push(s)

    // Cabin air.
    if (!co2Over && co2 > LIMITS.co2LimitMmHg) {
      co2Over = true
      say(
        t,
        'watch',
        `Cabin CO2 above the ${LIMITS.co2LimitMmHg} mmHg limit`,
        `${s.co2MmHg} mmHg. Crews get headaches at lower CO2 in space than on Earth.`,
      )
    }
    co2High = co2 >= 4 ? co2High + 1 : 0
    if (!co2Alarm && co2High >= 10) {
      co2Alarm = true
      say(
        t,
        'act',
        `Cabin CO2 at ${s.co2MmHg} mmHg`,
        'Over 4 mmHg for ten minutes: headaches and slower thinking are likely. Checks are added to the list.',
      )
      add({
        id: 'monitor:headache',
        at: t,
        doneAt: t + 8,
        title: 'Say if you have a headache',
        detail: 'High CO2 is the usual cause of headaches on the station.',
      })
    }
    if (co2Over && co2 < LIMITS.co2LimitMmHg) {
      co2Over = false
      say(t, 'ok', `Cabin CO2 back under ${LIMITS.co2LimitMmHg} mmHg`, 'The air is clean again.')
      if (co2Alarm)
        add({
          id: 'monitor:cognition',
          at: t + 20,
          doneAt: t + 45,
          title: 'Thinking test, now the air is clean',
          detail: 'NASA tests thinking after a high-CO2 exposure (MEDB 7.4). Four minutes.',
          test: 'cognition',
        })
    }

    // Heart rate higher than the task calls for.
    if (
      !EXERCISE.includes(b.activity) &&
      !sleeping &&
      heart >= 0.8 * person.maxBpm &&
      !fastBlocks.has(index)
    ) {
      const recent = samples.slice(-3)
      if (recent.length === 3 && recent.every((x) => x.bpm >= 0.8 * person.maxBpm)) {
        fastBlocks.add(index)
        say(
          t,
          'watch',
          `Heart rate ${heart} bpm, ${Math.round((100 * heart) / person.maxBpm)}% of maximum`,
          'Harder than planned for this task. Slowing down saves oxygen and keeps the body cool.',
        )
        add({
          id: `monitor:slow:${index}`,
          at: t,
          doneAt: t + 4,
          title: 'Slow down for three minutes',
          detail: 'The heart rate should settle under 80% of its maximum.',
        })
      }
    }
    // Exercise: the peak of each session, then the recovery ten minutes after it.
    if (EXERCISE.includes(b.activity)) {
      const p = peaks.get(index)
      if (!p || heart > p.bpm) peaks.set(index, { bpm: heart, at: t })
      if (t === b.to - 1) {
        const peak = peaks.get(index)!
        const share = Math.round((100 * peak.bpm) / person.maxBpm)
        say(
          t,
          share > 95 ? 'watch' : 'ok',
          `Peak ${peak.bpm} bpm · ${b.title}`,
          share > 95
            ? `${share}% of the maximum heart rate, above the zone planned for this session.`
            : `${share}% of the maximum heart rate, in the zone planned for this session.`,
        )
      }
    }
    // Only after the last session of a row: a run straight after weights is not a recovery.
    const done = blocks.find(
      (x, i) =>
        EXERCISE.includes(x.activity) && x.to + 10 === t && !EXERCISE.includes(blocks[i + 1]?.activity),
    )
    if (done) {
      const above = heart - person.restingBpm
      if (above <= 25)
        say(
          t,
          'ok',
          `Back to ${heart} bpm ten minutes after exercise`,
          'A quick recovery: the heart copes well with the training.',
        )
      else {
        say(
          t,
          'watch',
          `Still ${heart} bpm ten minutes after exercise`,
          'Recovery is slower than usual. Rest, drink, and check the resting pulse tomorrow morning.',
        )
        add({
          id: `monitor:recover:${t}`,
          at: t,
          doneAt: t + 15,
          title: 'Rest and drink 250 ml',
          detail: 'Then measure the pulse again before dinner.',
        })
        drink(t + 15, 250)
      }
    }

    // Core temperature: one alert per warming, until the core is back under 37.6 °C.
    if (hot && s.coreTempC < 37.6) hot = false
    if (s.coreTempC >= 38 && !hot) {
      hot = true
      say(
        t,
        'watch',
        `Core temperature ${s.coreTempC.toFixed(1)} °C`,
        gravity === 0
          ? 'Without gravity, warm air does not rise off the skin, so exercise heats the body faster than on Earth.'
          : 'The effort warms the body faster than it can cool.',
      )
      add({
        id: `monitor:cool:${t}`,
        at: t,
        doneAt: t + 12,
        title: EXERCISE.includes(b.activity)
          ? 'Lower the pace and drink 250 ml'
          : 'Cool down: drink 250 ml and rest a few minutes',
        detail: 'Until the core is back under 38 °C.',
      })
      drink(t + 12, 250)
    }

    // Water, checked every half hour from three hours after waking.
    if (t >= wake + 180 && t < bed && (t - wake) % 30 === 0 && t >= waterOpenUntil) {
      const expected = (scenario.waterGoalMl * (t - wake)) / (bed - wake)
      if (water < expected - 450) {
        say(
          t,
          'watch',
          `Behind on water: ${(water / 1000).toFixed(1)} L of ${(expected / 1000).toFixed(1)} L so far`,
          'Drinking enough keeps kidney stones away, a known risk in space.',
        )
        add({
          id: `monitor:water:${t}`,
          at: t,
          doneAt: t + 12,
          title: 'Drink 500 ml now',
          detail: `Aim for ${(scenario.waterGoalMl / 1000).toFixed(1)} L today.`,
        })
        drink(t + 12, 500)
        waterOpenUntil = t + 90
      }
    }

    // The suit.
    if (suitCo2 !== null && !suitAlarm && suitCo2 >= 4.5) {
      suitAlarm = true
      const walk = walks.find((w) => t >= w.from && t < w.to)
      say(
        t,
        'act',
        `Suit CO2 at ${s.suitCo2MmHg} mmHg`,
        'The suit’s CO2 removal is falling behind. The walk ends early: head back to the airlock.',
      )
      add({
        id: 'monitor:airlock',
        at: t,
        doneAt: walk?.to ?? t + 30,
        title: 'Head back to the airlock',
        detail: 'Keep the pace easy: effort makes more CO2.',
      })
    }

    // Radiation.
    if (!doseAlarm && doseRate >= 5 * usualRate) {
      doseAlarm = true
      say(
        t,
        'act',
        `Dose rate ${s.doseRate} µSv/h in the shelter, ${Math.round(doseRate / usualRate)}× usual`,
        `Outside the shelter it would be ${s.outsideRate} µSv/h. Stay behind the water tanks until the all-clear.`,
      )
      const clear = scenario.radiation?.find(([pt, v]) => pt > t && v < 4)?.[0] ?? t + 60
      add({
        id: 'monitor:shelter',
        at: t,
        doneAt: clear,
        title: 'Stay in the shelter until the all-clear',
        detail: 'Every hour inside spares most of the storm’s dose.',
      })
    }
  }

  // The day in one line.
  const last = samples[samples.length - 1]
  const top = samples.reduce((m, x) => Math.max(m, x.bpm), 0)
  const usual = (usualRate * (end - start)) / 60 / 1000
  say(
    end,
    'ok',
    'End of the day',
    `Peak heart rate ${top} bpm, ${(last.waterMl / 1000).toFixed(1)} L drunk, dose ${last.doseMSv.toFixed(1)} mSv` +
      (last.doseMSv > 1.5 * usual ? `, ${(last.doseMSv / usual).toFixed(1)}× a usual day.` : '.'),
  )

  events.sort((a, b) => a.at - b.at)
  return { scenario, person, samples, events, tasks, usualRate }
}

/** Contiguous spacewalk blocks, as one walk each. */
function evaSpans(blocks: Block[]) {
  const spans: { from: number; to: number }[] = []
  for (const b of blocks) {
    if (b.activity !== 'eva') continue
    const last = spans[spans.length - 1]
    if (last && last.to === b.from) last.to = b.to
    else spans.push({ from: b.from, to: b.to })
  }
  return spans
}

const missionTask = (t: ScenarioTask, start: number): SimTask => ({
  id: t.id,
  at: t.at,
  title: t.title,
  detail: t.detail,
  from: 'mission',
  shownFrom: t.shownFrom ?? start,
  doneAt: t.doneAt ?? t.at + 15,
  ...(t.move ? { move: t.move } : {}),
  ...(t.test ? { test: t.test } : {}),
})

/** The person's check-up of the day, at sensible times: routine checks in the morning, the rest in order. */
function placeCheckup(scenario: Scenario, checkup: Task[]): SimTask[] {
  const { blocks, slots, start } = scenario
  const check = blocks.find((b) => b.activity === 'check')?.from ?? slots[0] ?? start
  const training = blocks.find((b) => b.activity === 'resistance')
  // The mission plan may already hold the day's resistance session.
  const planned = !!training && scenario.tasks.some((t) => t.at === training.from)
  const nearest = (time: number) =>
    slots.reduce((best, s) => (Math.abs(s - time) < Math.abs(best - time) ? s : best))
  // Tasks that fall while the crew shelters from a storm wait until the all-clear.
  const shelter = blocks.find((b) => b.activity === 'shelter')
  const warning = shelter
    ? (scenario.events.find((e) => e.level === 'act' && e.at <= shelter.from)?.at ?? shelter.from)
    : 0
  let after = 0
  const free = [...slots]
  let extra = 0
  return checkup
    .filter((task) => !(planned && task.id === 'routine:exercise'))
    .map((task) => {
      let at: number
      let length = 15
      if (task.id === 'routine:checks') at = check
      else if (task.id === 'routine:pulse') {
        at = check + 12
        length = 5
      } else if (task.id === 'routine:exercise' && training) {
        at = training.from
        length = training.to - training.from
      } else if (task.id === 'routine:urine') {
        at = nearest(17 * 60)
        length = 5
      } else if (task.id === 'routine:mood') {
        at = 20 * 60
        length = 3
      } else {
        at = free.shift() ?? (slots[slots.length - 1] ?? start) + 20 * ++extra
        length = task.kind === 'exam' ? 25 : 15
      }
      const sheltered = shelter && at >= shelter.from && at < shelter.to
      const to = sheltered ? shelter.to + 25 + 20 * after++ : at
      return {
        id: `checkup:${task.id}`,
        at,
        title: task.title,
        detail: task.detail,
        from: 'checkup',
        shownFrom: start,
        doneAt: to + length,
        ...(sheltered ? { move: { at: warning, to, reason: 'Moved: solar storm' } } : {}),
        ...(task.test ? { test: task.test } : {}),
      }
    })
}

export type TaskState = 'upcoming' | 'now' | 'done' | 'late'

/** Where a task stands at minute `t`, and when it is due by then (a move shows once it happened). */
export function taskAt(task: SimTask, t: number): { state: TaskState; due: number; moved: boolean } {
  const moved = !!task.move && t >= task.move.at
  const due = moved ? task.move!.to : task.at
  if (task.doneAt !== null && t >= task.doneAt) return { state: 'done', due, moved }
  if (t >= due) return { state: t > due + 30 ? 'late' : 'now', due, moved }
  return { state: 'upcoming', due, moved }
}

/** The minute `t`, between two samples. */
export function sampleAt(sim: Simulation, t: number): Sample {
  const { samples, scenario } = sim
  const i = clamp(Math.floor(t) - scenario.start, 0, samples.length - 1)
  const a = samples[i]
  const b = samples[Math.min(i + 1, samples.length - 1)]
  const f = clamp(t - Math.floor(t), 0, 1)
  const mix = (x: number, y: number) => x + (y - x) * f
  return {
    ...a,
    t,
    bpm: Math.round(mix(a.bpm, b.bpm)),
    breaths: Math.round(mix(a.breaths, b.breaths)),
    doseMSv: mix(a.doseMSv, b.doseMSv),
  }
}

/** Minutes until the next drink after `t`: the suit's sips outside, the planned drinks inside. */
export function nextDrink(sim: Simulation, t: number): number | null {
  const walk = evaSpans(sim.scenario.blocks).find((w) => t >= w.from && t < w.to)
  if (walk) return 30 - (Math.floor(t - walk.from) % 30)
  const next = sim.scenario.drinks.find((d) => d.at > t)
  return next ? next.at - t : null
}
