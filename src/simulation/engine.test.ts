import { describe, expect, it } from 'vitest'
import { planDay, type Task } from '../checkup/planner'
import { TEAM } from '../crew/roster'
import { dayReport } from '../health/readings'
import { MISSION_ORDER } from '../mission/missions'
import { nextDrink, personOf, sampleAt, simulate, taskAt, type Person, type Simulation } from './engine'
import { at, SCENARIOS } from './scenarios'

const PERSON: Person = {
  restingBpm: 62,
  maxBpm: 181,
  spo2Pct: 97,
  systolic: 114,
  diastolic: 74,
  glucoseMgDl: 90,
  temperatureC: 36.7,
  sleepHours: 6.8,
}

const CHECKUP: Task[] = [
  { id: 'routine:checks', kind: 'routine', title: 'Blood pressure, temperature and sugar', detail: '' },
  { id: 'routine:pulse', kind: 'routine', title: 'Measure your pulse', detail: '', test: 'restingPulse' },
  { id: 'routine:exercise', kind: 'routine', title: 'Resistance exercise session', detail: '' },
  { id: 'routine:urine', kind: 'routine', title: 'Log urine volume', detail: '' },
  { id: 'routine:mood', kind: 'routine', title: 'Rate your mood', detail: '' },
  { id: 'exam:Eye ultrasound', kind: 'exam', title: 'Eye ultrasound, scheduled today', detail: '' },
  { id: 'follow:sleep', kind: 'followUp', title: 'Sleep more', detail: '' },
]

const run = (mission: keyof typeof SCENARIOS, person = PERSON) =>
  simulate(SCENARIOS[mission], person, CHECKUP)
const during = (sim: Simulation, from: string, to: string) =>
  sim.samples.filter((s) => s.t >= at(from) && s.t < at(to))
const event = (sim: Simulation, title: string) => sim.events.find((e) => e.title.startsWith(title))

describe('mission scenarios', () => {
  it('fill each day with blocks end to end', () => {
    for (const id of MISSION_ORDER) {
      const s = SCENARIOS[id]
      expect(s.mission).toBe(id)
      expect(s.blocks[0].from).toBe(s.start)
      expect(s.blocks[s.blocks.length - 1].to).toBe(s.end)
      s.blocks.forEach((b, i) => {
        expect(b.to).toBeGreaterThan(b.from)
        if (i > 0) expect(b.from).toBe(s.blocks[i - 1].to)
      })
      for (const slot of s.slots) {
        expect(slot).toBeGreaterThan(s.start)
        expect(slot).toBeLessThan(s.end)
      }
      expect(simulate(s, PERSON, CHECKUP).samples).toHaveLength(s.end - s.start + 1)
    }
  })

  it('give the same day every time', () => {
    expect(run('orbit').samples).toEqual(run('orbit').samples)
  })
})

describe('the body through the day', () => {
  const sim = run('orbit')

  it('raises the heart rate with the effort and lowers it in sleep', () => {
    const treadmill = Math.max(...during(sim, '14:30', '15:15').map((s) => s.bpm))
    expect(treadmill).toBeGreaterThan(145)
    expect(treadmill).toBeLessThanOrEqual(PERSON.maxBpm)
    const desk = during(sim, '08:00', '09:00').map((s) => s.bpm)
    expect(Math.max(...desk)).toBeLessThan(80)
    const night = during(sim, '21:45', '22:30').map((s) => s.bpm)
    expect(Math.max(...night)).toBeLessThan(PERSON.restingBpm)
  })

  it('raises blood pressure with the effort', () => {
    const rest = sampleAt(sim, at('08:30'))
    const run = sampleAt(sim, at('14:55'))
    expect(run.systolic).toBeGreaterThan(rest.systolic + 20)
    expect(run.diastolic - rest.diastolic).toBeLessThan(run.systolic - rest.systolic)
  })

  it('warms the core past 38 °C on a weightless treadmill, less in Mars gravity', () => {
    const hot = event(sim, 'Core temperature')!
    expect(hot.at).toBeGreaterThanOrEqual(at('14:30'))
    expect(hot.at).toBeLessThan(at('15:30'))
    expect(sim.tasks.some((t) => t.id.startsWith('monitor:cool'))).toBe(true)
    const orbitPeak = Math.max(...during(sim, '14:30', '15:15').map((s) => s.coreTempC))
    const mars = run('mars')
    const marsPeak = Math.max(...during(mars, '15:00', '15:45').map((s) => s.coreTempC))
    expect(marsPeak).toBeLessThan(orbitPeak)
  })

  it('reports the peak of a session and a quick recovery after it', () => {
    expect(event(sim, 'Peak')).toBeDefined()
    const recovery = sim.events.find((e) => e.title.includes('ten minutes after exercise'))!
    expect(recovery.at).toBe(at('15:25'))
  })
})

describe('monitoring rules', () => {
  it('follow a stopped CO2 scrubber with a headache check, then a thinking test', () => {
    const sim = run('orbit')
    const alarm = event(sim, 'Cabin CO2 at')!
    expect(alarm.level).toBe('act')
    const clean = event(sim, 'Cabin CO2 back under')!
    expect(clean.at).toBeGreaterThan(alarm.at)
    const headache = sim.tasks.find((t) => t.id === 'monitor:headache')!
    expect(headache.at).toBe(alarm.at)
    const thinking = sim.tasks.find((t) => t.id === 'monitor:cognition')!
    expect(thinking.test).toBe('cognition')
    expect(thinking.at).toBeGreaterThan(clean.at)
  })

  it('add water when the person falls behind, and the drink counts', () => {
    const sim = run('orbit')
    const task = sim.tasks.find((t) => t.id.startsWith('monitor:water'))!
    expect(task).toBeDefined()
    const i = task.doneAt! - sim.scenario.start
    expect(sim.samples[i].waterMl - sim.samples[i - 1].waterMl).toBeGreaterThanOrEqual(500)
  })

  it('end the moonwalk early on a suit CO2 warning, after a fast climb', () => {
    const sim = run('moon')
    expect(event(sim, 'Suit CO2')!.level).toBe('act')
    expect(sim.tasks.find((t) => t.id === 'monitor:airlock')!.doneAt).toBe(at('13:40'))
    const fast = event(sim, 'Heart rate')!
    expect(fast.at).toBeGreaterThanOrEqual(at('10:40'))
    expect(fast.at).toBeLessThan(at('11:40'))
    // The suit's drink bag: a sip every half hour outside.
    expect(nextDrink(sim, at('09:00'))).toBe(15)
  })

  it('keep the crew in the storm shelter and spare most of the dose', () => {
    const sim = run('cruise')
    const alarm = event(sim, 'Dose rate')!
    expect(alarm.level).toBe('act')
    const shelter = sim.tasks.find((t) => t.id === 'monitor:shelter')!
    expect(shelter.doneAt).toBe(at('16:20'))
    const outside = sim.samples.reduce((d, s) => d + s.outsideRate / 60 / 1000, 0)
    const last = sim.samples[sim.samples.length - 1]
    expect(last.doseMSv).toBeLessThan(0.6 * outside)
    expect(last.doseMSv).toBeGreaterThan(1.5 * ((sim.usualRate * 16.5) / 1000))
    // The cycling session moves to the evening when the flare is seen.
    const cycling = sim.tasks.find((t) => t.id === 'cruise:cycle')!
    expect(taskAt(cycling, at('09:00'))).toMatchObject({ state: 'upcoming', due: at('13:00'), moved: false })
    expect(taskAt(cycling, at('13:30'))).toMatchObject({ state: 'upcoming', due: at('16:40'), moved: true })
    expect(taskAt(cycling, at('17:30')).state).toBe('done')
  })

  it('bring the crew back before a dust storm on Mars', () => {
    const sim = run('mars')
    const back = sim.tasks.find((t) => t.id === 'mars:back')!
    expect(back.shownFrom).toBe(at('10:55'))
    expect(taskAt(back, at('11:10')).state).toBe('now')
    expect(taskAt(back, at('11:45')).state).toBe('done')
  })

  it('add a reaction test after a week of short nights', () => {
    const sim = run('orbit', { ...PERSON, sleepHours: 5.4 })
    expect(sim.tasks.find((t) => t.id === 'monitor:reaction')!.test).toBe('reaction')
    expect(run('orbit').tasks.some((t) => t.id === 'monitor:reaction')).toBe(false)
  })

  it('mark a task late half an hour after it is due', () => {
    const task = {
      id: 'x',
      at: 600,
      title: '',
      detail: '',
      from: 'mission' as const,
      shownFrom: 0,
      doneAt: null,
    }
    expect(taskAt(task, 590).state).toBe('upcoming')
    expect(taskAt(task, 620).state).toBe('now')
    expect(taskAt(task, 640).state).toBe('late')
  })
})

describe('the person’s own check-up', () => {
  it('places each task of the day once, inside the day', () => {
    const sim = run('moon')
    const own = sim.tasks.filter((t) => t.from === 'checkup')
    expect(own).toHaveLength(CHECKUP.length)
    for (const t of own) {
      expect(t.at).toBeGreaterThanOrEqual(sim.scenario.start)
      expect(t.at).toBeLessThan(sim.scenario.end)
    }
    expect(own.find((t) => t.id === 'checkup:routine:pulse')!.test).toBe('restingPulse')
  })

  it('runs with a real crew member’s report', () => {
    const report = dayReport(TEAM[0], 97, 'cruise')
    const sim = simulate(SCENARIOS.cruise, personOf(report.readings), planDay({ report, mission: 'cruise' }))
    expect(sim.samples.length).toBeGreaterThan(900)
    expect(sim.tasks.filter((t) => t.from === 'checkup').length).toBeGreaterThan(3)
    expect(sim.events[sim.events.length - 1].title).toBe('End of the day')
  })
})
