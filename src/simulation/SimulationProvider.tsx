import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { planDay } from '../checkup/planner'
import type { Member } from '../crew/roster'
import { useDayReport } from '../health/useDayReport'
import type { MissionId } from '../mission/missions'
import { personOf, simulate, type Simulation } from './engine'
import { cabinCo2Of } from './live'
import { SCENARIOS } from './scenarios'

/** Simulated minutes per second of playback, in the order the speed button goes through them. */
export const SPEEDS = [5, 15, 2]
/** How often the screen follows the clock, ms: often enough for the numbers, light for the 3D body. */
const PAINT_MS = 200

export interface SimulationApi {
  active: boolean
  sim: Simulation | null
  /** Minutes since midnight. */
  t: number
  playing: boolean
  speed: number
  start: () => void
  stop: () => void
  togglePlay: () => void
  seek: (t: number) => void
  /** Jumps to the next event of the day. */
  next: () => void
  cycleSpeed: () => void
}

const OFF: SimulationApi = {
  active: false,
  sim: null,
  t: 0,
  playing: false,
  speed: SPEEDS[0],
  start: () => {},
  stop: () => {},
  togglePlay: () => {},
  seek: () => {},
  next: () => {},
  cycleSpeed: () => {},
}

const SimulationContext = createContext<SimulationApi>(OFF)

/** The mission simulation, read by the dashboard: the body, the list of the day, the visor. */
export const useSimulation = () => useContext(SimulationContext)

/**
 * Plays one day of the destination for the person shown, over the whole dashboard. The day is
 * computed once; the clock moves on its own and everything else reads the minute it is at.
 */
export function SimulationProvider({
  member,
  mission,
  day,
  children,
}: {
  member: Member
  mission: MissionId
  day: number
  children: ReactNode
}) {
  const [active, setActive] = useState(false)
  const scenario = SCENARIOS[mission]
  const report = useDayReport(member, day, mission)
  const sim = useMemo(
    () =>
      active
        ? simulate(
            scenario,
            personOf(report.readings),
            planDay({ report, mission }),
            cabinCo2Of(report, mission),
          )
        : null,
    [active, scenario, report, mission],
  )
  const [t, setT] = useState(scenario.start)
  const time = useRef(scenario.start)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS[0])

  const seek = useCallback(
    (to: number) => {
      time.current = Math.min(scenario.end, Math.max(scenario.start, to))
      setT(time.current)
    },
    [scenario],
  )
  // Another destination or person: the day starts again.
  useEffect(() => {
    time.current = scenario.start
    setT(scenario.start)
  }, [scenario, member.id])

  useEffect(() => {
    if (!active || !playing) return
    let raf = 0
    let last = performance.now()
    let painted = 0
    const step = (now: number) => {
      time.current = Math.min(scenario.end, time.current + ((now - last) / 1000) * speed)
      last = now
      const done = time.current >= scenario.end
      if (now - painted >= PAINT_MS || done) {
        painted = now
        setT(time.current)
      }
      if (done) setPlaying(false)
      else raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, playing, speed, scenario.end])

  const api = useMemo<SimulationApi>(
    () => ({
      active,
      sim,
      t,
      playing,
      speed,
      start: () => {
        time.current = scenario.start
        setT(scenario.start)
        setActive(true)
        setPlaying(true)
      },
      stop: () => {
        setActive(false)
        setPlaying(false)
      },
      togglePlay: () => {
        if (time.current >= scenario.end) {
          seek(scenario.start)
          setPlaying(true)
        } else setPlaying((p) => !p)
      },
      seek,
      next: () => {
        const upcoming = sim?.events.find((e) => e.at > time.current + 0.5)
        if (upcoming) seek(upcoming.at)
      },
      cycleSpeed: () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]),
    }),
    [active, sim, t, playing, speed, scenario, seek],
  )
  return <SimulationContext.Provider value={api}>{children}</SimulationContext.Provider>
}
