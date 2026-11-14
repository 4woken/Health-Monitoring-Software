import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DayReport } from '../health/readings'
import type { Signal } from '../health/signals'
import type { MissionId } from '../mission/missions'
import { rulesPlanner, type Planner, type Task } from './planner'

/** One person's check-up for one mission day, as kept in this browser. */
interface DayPlan {
  /** Tasks from the planner; null until it has run. */
  planned: Task[] | null
  /** Tasks added by hand, or from a signal. */
  own: Task[]
  done: string[]
  /** Planned tasks someone took off the list. */
  removed: string[]
}

const EMPTY: DayPlan = { planned: null, own: [], done: [], removed: [] }
const cache = new Map<string, DayPlan>()
const listeners = new Set<() => void>()

function read(key: string): DayPlan {
  let plan = cache.get(key)
  if (!plan) {
    try {
      const raw = localStorage.getItem(key)
      plan = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<DayPlan>) } : EMPTY
    } catch {
      plan = EMPTY
    }
    cache.set(key, plan)
  }
  return plan
}

function write(key: string, plan: DayPlan) {
  cache.set(key, plan)
  try {
    localStorage.setItem(key, JSON.stringify(plan))
  } catch {
    // Storage is off: the list lasts until the page reloads.
  }
  for (const l of listeners) l()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const checkupKey = (memberId: string, mission: MissionId, day: number) =>
  `pulsar.checkup.${memberId}.${mission}.${day}`

/** Today's check-up for the person in `report`: planned on first use, then edited by hand. */
export function useCheckup(report: DayReport, mission: MissionId, planner: Planner = rulesPlanner) {
  const key = checkupKey(report.member.id, mission, report.day)
  const plan = useSyncExternalStore(subscribe, () => read(key))
  const [planning, setPlanning] = useState(false)
  const latest = useRef({ report, mission, planner })
  latest.current = { report, mission, planner }

  const replan = useCallback(async () => {
    setPlanning(true)
    try {
      const { report, mission, planner } = latest.current
      const planned = await planner.plan({ report, mission })
      write(key, { ...read(key), planned, removed: [] })
    } finally {
      setPlanning(false)
    }
  }, [key])

  useEffect(() => {
    if (read(key).planned === null) void replan()
  }, [key, replan])

  const update = (change: (plan: DayPlan) => DayPlan) => write(key, change(read(key)))
  const planned = (plan.planned ?? []).filter((t) => !plan.removed.includes(t.id))
  const tasks = [...planned, ...plan.own]

  return {
    tasks,
    done: new Set(plan.done),
    planning,
    credit: planner.credit,
    replan,
    toggle: (id: string) =>
      update((p) => ({ ...p, done: p.done.includes(id) ? p.done.filter((d) => d !== id) : [...p.done, id] })),
    add: (title: string) => {
      const text = title.trim()
      if (!text) return
      update((p) => ({
        ...p,
        own: [...p.own, { id: `own:${Date.now().toString(36)}`, kind: 'own', title: text, detail: '' }],
      }))
    },
    remove: (id: string) =>
      update((p) => ({
        ...p,
        own: p.own.filter((t) => t.id !== id),
        removed: p.planned?.some((t) => t.id === id) ? [...p.removed, id] : p.removed,
        done: p.done.filter((d) => d !== id),
      })),
    /** True when a task on the list comes from this signal. */
    covers: (signal: Signal) => tasks.some((t) => t.signal === signal.id && t.kind !== 'routine'),
    /** Puts a follow-up for this signal on the list, back if it was taken off. */
    follow: (signal: Signal) =>
      update((p) => {
        const id = `follow:${signal.id}`
        if (p.planned?.some((t) => t.id === id)) return { ...p, removed: p.removed.filter((r) => r !== id) }
        if (p.own.some((t) => t.id === id)) return p
        const task: Task = {
          id,
          kind: 'followUp',
          title: signal.advice,
          detail: `${signal.title}: ${signal.meaning}`,
          signal: signal.id,
        }
        return { ...p, own: [...p.own, task] }
      }),
  }
}

export type Checkup = ReturnType<typeof useCheckup>
