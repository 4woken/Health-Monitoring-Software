import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CaretDown, CheckCircle, ListPlus, X } from '@phosphor-icons/react'
import BodyViewer, { type Hotspot, type Layer, type Pin } from './BodyViewer'
import { ORGAN_SIGNALS } from './anatomy/loadAnatomy'
import { regionOf } from './anatomy/bodyShape'
import { anatomyChoices, organNote } from './anatomy/organs'
import type { PersonalAvatar } from '../camera/face/portrait'
import type { BreathReading } from '../camera/breathReading'
import { useCheckup } from '../checkup/useCheckup'
import type { Member } from '../crew/roster'
import { KIND_LABEL, advise, type Advice } from '../health/advice'
import { requirementsFor, type Phase } from '../health/exams'
import { SIGNAL_METRICS, type MetricId } from '../health/metrics'
import { history } from '../health/readings'
import { useDayReport } from '../health/useDayReport'
import { LIMITS, type Signal, type SignalId } from '../health/signals'
import NasaReference from '../health/ui/NasaReference'
import SignalPanel from '../health/ui/SignalPanel'
import SignalRow from '../health/ui/SignalRow'
import TrendChart from '../health/ui/TrendChart'
import VitalsStrip from '../health/ui/VitalsStrip'
import { HABITATS, type HabitatId } from '../mission/habitats'
import MissionLab, { type ProfileId, type SimInput } from '../mission/MissionLab'
import { MISSIONS, type MissionId } from '../mission/missions'
import { MISSION_PROFILES, simulateProfile, type MissionPhase } from '../mission/physiology'
import { SELF_TESTS, testsFor } from '../selftests/catalog'
import { liveReport, liveVitals } from '../simulation/live'
import MissionLog from '../simulation/MissionLog'
import { useSimulation } from '../simulation/SimulationProvider'
import type { SelfTestId } from '../selftests/ids'
import { Button, Chip, EASE, LEVEL_LINE, Sparkline, StatusDot } from '../ui'
import { useNarrow } from '../ui/useNarrow'

type SheetKind = 'signal' | 'list' | 'organ' | 'mission' | 'nasa' | 'trends'
const SHEET_WIDTH: Record<SheetKind, number> = {
  signal: 440,
  list: 440,
  organ: 440,
  mission: 640,
  nasa: 480,
  trends: 640,
}
/** Recommendations drawn on the body at once. The list on the left has all of them. */
const PINNED = 3
/** Rows in the list on the left before "more"; fewer while the simulation's log sits above it. */
const LISTED = 6
const LISTED_LIVE = 3

const LEVEL_WORD = { ok: 'Normal', watch: 'Needs a check today', act: 'Act now' } as const
/** The self-test offered beside an organ shown on its own. */
const ORGAN_TEST: Record<string, SelfTestId> = {
  brain: 'reaction',
  'right eyeball': 'vision',
  'left eyeball': 'vision',
  heart: 'restingPulse',
  'right lung': 'breathingRate',
  'left lung': 'breathingRate',
  lungs: 'breathingRate',
  'arm bones': 'dexterity',
  'leg bones': 'sitToStand',
  pelvis: 'squats',
  'vertebral column': 'squats',
}
const PIN_STYLE = { act: 'bg-[#cd3a3a] text-white', watch: 'bg-[#f0a73a] text-[#1b1204]' } as const
const PHASE_WORD: Record<Phase, string> = {
  flight: 'NASA in flight',
  ground: 'NASA before and after flight',
  career: 'NASA after the career',
}

import AvatarDemoVitals from '../exercises/AvatarDemoVitals'
import type { DemoPlayback } from '../exercises/demoVitals'

interface Props {
  member: Member
  face: PersonalAvatar | null
  mission: MissionId
  day: number
  setDay: (day: number) => void
  habitat: HabitatId
  onGravity: (value: number) => void
  exerciseDemo: DemoPlayback | null
  /** Opens the self-tests, on one test when given. */
  onOpenTest: (test?: SelfTestId) => void
  breath: BreathReading | null
  /** Width covered on the right by a panel of the app, such as the check-up. */
  covered: number
  /** Something covers the whole scene: the body stops drawing. */
  paused: boolean
  /** A signal to show on the body, asked from elsewhere (the check-up). */
  request: { signal: SignalId; at: number } | null
  /** Opens today's check-up. */
  onOpenCheckup: () => void
  /** A panel or a pop-up of this screen opens: the app closes its own panel, so they do not overlap. */
  onOpenPanel: () => void
}

/**
 * The one screen: a person's body in the place they live. What to do today points at the body; a
 * click on the body or on a recommendation opens what that part says, and the details open beside it.
 */
export default function BodyScreen({
  member,
  face,
  mission,
  day,
  setDay,
  habitat,
  onGravity,
  exerciseDemo,
  onOpenTest,
  breath,
  covered,
  paused,
  request,
  onOpenCheckup,
  onOpenPanel,
}: Props) {
  const narrow = useNarrow()
  const demonstrating = exerciseDemo !== null
  const gauges = useRef<HTMLDivElement>(null)
  // The list of the day, at the top left: pins keep clear of it.
  const todo = useRef<HTMLDivElement>(null)
  const [todoBox, setTodoBox] = useState({ right: 0, bottom: 0 })
  useEffect(() => {
    const el = todo.current
    if (!el) return
    const measure = () =>
      setTodoBox({ right: el.offsetLeft + el.offsetWidth + 12, bottom: el.offsetTop + el.offsetHeight + 12 })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [demonstrating])
  const [gaugeHeight, setGaugeHeight] = useState(160)
  useEffect(() => {
    const el = gauges.current
    if (!el) return
    const measure = () => setGaugeHeight(Math.ceil(el.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [demonstrating])

  /** The part whose pop-up is open; the camera moves to it. */
  const [selected, setSelected] = useState<SignalId | null>(null)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [openId, setOpenId] = useState<SignalId | null>(null)
  const [openMetric, setOpenMetric] = useState<MetricId | undefined>()
  /** Organ isolated in the body view (mesh name). */
  const [organ, setOrgan] = useState<string | null>(null)
  const [inventory, setInventory] = useState<string[]>([])
  const [hoverId, setHoverId] = useState<SignalId | null>(null)
  const [layer, setLayer] = useState<Layer>('signals')
  /** On phones the list of the day folds away. */
  const [todoOpen, setTodoOpen] = useState(false)

  const base = useDayReport(member, day, mission)
  // While the mission simulation runs, the signals are judged on its minute: the markers and the
  // list of the day follow it, and the vital signs and the heart show its values.
  const simulation = useSimulation()
  const running = simulation.active && simulation.sim ? simulation.sim : null
  const report = useMemo(
    () => (running ? liveReport(base, running, mission, simulation.t) : base),
    [base, running, mission, simulation.t],
  )
  const vitals = running ? liveVitals(running, simulation.t) : null
  const listed = running ? LISTED_LIVE : LISTED
  const signals = report.signals
  const levelKey = signals.map((s) => `${s.id}:${s.level}`).join(',')
  const checkup = useCheckup(base, mission)
  // A signal whose tasks are all ticked in the check-up is handled for today: its marker turns back
  // to normal and it leaves the list of things to do.
  const handled = new Set<SignalId>()
  const pending = new Set<SignalId>()
  for (const t of checkup.tasks) {
    if (!t.signal || t.kind === 'routine') continue
    if (checkup.done.has(t.id)) handled.add(t.signal)
    else pending.add(t.signal)
  }
  for (const id of pending) handled.delete(id)
  const handledKey = [...handled].sort().join(',')
  const advice = useMemo(() => {
    const done = new Set(handledKey.split(','))
    return advise(report, mission).filter((a) => !done.has(a.signal))
  }, [report, mission, handledKey])
  const m = MISSIONS[mission]
  const place = HABITATS[habitat]
  const focused = sheet === 'signal' ? signals.find((s) => s.id === openId) : undefined
  const picked = selected ? signals.find((s) => s.id === selected) : undefined

  // Another person: start again from the whole body.
  useEffect(() => {
    setSelected(null)
    setSheet(null)
    setOrgan(null)
    setLayer('signals')
  }, [member.id])

  // The check-up opens on the right: what this screen had open there closes.
  useEffect(() => {
    if (!covered) return
    setSheet(null)
    setSelected(null)
  }, [covered])

  // Asked from the check-up: show that part.
  useEffect(() => {
    if (!request) return
    setLayer('signals')
    setSheet(null)
    setOrgan(null)
    setSelected(request.signal)
  }, [request])

  useEffect(() => {
    if (!selected) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [selected])

  const pinned = narrow || covered || sheet || picked || layer !== 'signals' ? [] : advice.slice(0, PINNED)
  const pinnedKey = pinned.map((a) => a.signal).join(',')
  const hotspots = useMemo<Hotspot[]>(() => {
    const quiet = new Set(pinnedKey.split(','))
    const done = new Set(handledKey.split(','))
    return signals.flatMap((s) => {
      const region = regionOf(s.id, member.build)
      return region
        ? [
            {
              id: s.id,
              label: region.label,
              pos: region.pos,
              level: done.has(s.id) ? 'ok' : s.level,
              quiet: quiet.has(s.id) || s.id === selected,
            },
          ]
        : []
    })
    // Keyed on the levels, not the report: during the simulation the report is new every few frames.
  }, [levelKey, member.build, pinnedKey, selected, handledKey])

  // Physiology engine. It follows the destination and this person's exercise log; moving a slider
  // switches to what-if values until reset.
  const plannedExercise = Math.min(1, report.readings.resistanceSessions / LIMITS.resistanceMinSessions)
  const defaults = useMemo<SimInput>(
    () => ({ gravity: m.gravity, doseRateMSvDay: m.radiationMSvDay, exercise: plannedExercise }),
    [m, plannedExercise],
  )
  const [override, setOverride] = useState<SimInput | null>(null)
  const [profile, setProfile] = useState<ProfileId>('setting')
  const [localCursor, setLocalCursor] = useState<number | null>(null)
  useEffect(() => setOverride(null), [mission, member.id])
  const input = override ?? defaults
  const phases = useMemo<MissionPhase[]>(
    () =>
      profile === 'setting'
        ? [
            {
              label: m.name,
              days: m.days,
              gravity: input.gravity,
              doseRateMSvDay: input.doseRateMSvDay,
            },
          ]
        : MISSION_PROFILES[profile].phases,
    [profile, m, input.gravity, input.doseRateMSvDay],
  )
  const points = useMemo(() => simulateProfile(phases, input.exercise), [phases, input.exercise])
  const cursor = profile === 'setting' ? day : Math.min(points.length - 1, localCursor ?? points.length - 1)
  const physiology = points[Math.min(points.length - 1, cursor)]

  const activeGravity = phases[physiology.phase].gravity
  useEffect(() => onGravity(activeGravity), [activeGravity, onGravity])

  /** Open the pop-up of one part: the camera moves to it. */
  const select = (id: SignalId) => {
    onOpenPanel()
    setLayer('signals')
    setSheet(null)
    setOrgan(null)
    setSelected(id)
  }
  /** Everything about one signal, in the panel on the right. */
  const details = (id: SignalId, metric?: MetricId) => {
    onOpenPanel()
    setOpenMetric(metric)
    setLayer('signals')
    setOrgan(null)
    setSelected(null)
    setOpenId(id)
    setSheet('signal')
  }
  const closeSheet = () => {
    if (sheet === 'mission') setLayer('signals')
    setSheet(null)
    setOrgan(null)
  }
  const showMission = (on: boolean) => {
    if (on) onOpenPanel()
    setSelected(null)
    setOrgan(null)
    setLayer(on ? 'physiology' : 'signals')
    setSheet(on ? 'mission' : null)
  }

  /** Last 30 days of the main number behind a signal; none for neck vein flow, which is a category. */
  const trendOf = (id: SignalId) => {
    const metric = SIGNAL_METRICS[id][0]
    return metric ? history(member, metric, day, mission, 30) : { values: [] }
  }

  const note = organ ? organNote(organ) : null
  /** The self-test offered under the note of an organ shown on its own. */
  const offered: SelfTestId | null = organ ? (ORGAN_TEST[organ] ?? null) : null
  const organSignals = organ ? signals.filter((s) => (ORGAN_SIGNALS[organ] ?? []).includes(s.id)) : []
  const caption =
    place.kind === 'generated'
      ? `${place.description}: a generated illustration based on NASA images, not a NASA design.`
      : `Photo: ${place.credit}, ${place.description}.`
  const heading =
    advice.length === 0
      ? 'Nothing to do today'
      : `${advice.length} thing${advice.length === 1 ? '' : 's'} to do today`

  const partCard = picked && (
    <PartCard
      signal={picked}
      advice={advice.find((a) => a.signal === picked.id)}
      trend={trendOf(picked.id).values}
      planned={checkup.covers(picked)}
      handled={handled.has(picked.id)}
      onPlan={() => checkup.follow(picked)}
      onOpenCheckup={onOpenCheckup}
      onDetails={() => details(picked.id)}
      onClose={() => setSelected(null)}
      test={
        testsFor(picked.id)[0] && {
          label: SELF_TESTS[testsFor(picked.id)[0]].action,
          onOpen: () => onOpenTest(testsFor(picked.id)[0]),
        }
      }
    />
  )
  const pins: Pin[] = []
  if (picked && partCard && !narrow)
    pins.push({
      id: `part:${picked.id}`,
      at: picked.id,
      side: 'right',
      tone: LEVEL_LINE[picked.level],
      children: partCard,
    })
  for (const a of pinned)
    pins.push({
      id: a.id,
      at: a.signal,
      tone: LEVEL_LINE[a.level],
      children: (
        <AdvicePin
          advice={a}
          onOpen={() => select(a.signal)}
          onHover={(on) => setHoverId(on ? a.signal : null)}
        />
      ),
    })

  const sheetTitle =
    sheet === 'nasa'
      ? 'NASA reference'
      : sheet === 'trends'
        ? 'Trends'
        : sheet === 'mission'
          ? 'Mission effects'
          : note
            ? note.name
            : focused
              ? focused.title
              : 'All signals'
  const sheetSubtitle =
    sheet === 'nasa'
      ? m.name
      : sheet === 'trends'
        ? `${member.short}, days 1 to ${day}`
        : sheet === 'mission'
          ? `${m.name}, ${member.short}`
          : note
            ? `${member.short}, reference anatomy`
            : `${member.short}, day ${day}`

  const overlays = (
    <>
      {/* What to do today. */}
      <div
        ref={todo}
        hidden={sheet === 'organ'}
        className="absolute top-20 left-4 z-[6] w-[min(21rem,calc(100%-2rem))] lg:top-24 lg:left-8"
      >
        <MissionLog />
        <p className="on-photo font-cond text-[13px] text-white/65">
          {m.name}, day {day}
        </p>
        <button
          onClick={() => setTodoOpen((o) => !o)}
          aria-expanded={todoOpen}
          className="press on-photo mt-0.5 flex items-center gap-1.5 text-[18px] font-semibold text-white sm:hidden"
        >
          {heading}
          {advice.length > 0 && (
            <CaretDown size={13} weight="bold" className={todoOpen ? 'rotate-180' : ''} />
          )}
        </button>
        <h2 className="on-photo mt-0.5 hidden text-[20px] leading-tight font-semibold text-white sm:block">
          {heading}
        </h2>
        {advice.length > 0 && (
          <ul className={`mt-3 flex-col gap-1.5 ${todoOpen ? 'flex' : 'hidden'} sm:flex`}>
            {advice.slice(0, listed).map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => {
                    setTodoOpen(false)
                    select(a.signal)
                  }}
                  onPointerEnter={() => setHoverId(a.signal)}
                  onPointerLeave={() => setHoverId(null)}
                  aria-current={selected === a.signal ? 'true' : undefined}
                  className={`press flex w-full items-stretch gap-3 rounded-xl px-3 py-2 text-left backdrop-blur-md ${selected === a.signal ? 'bg-white/[0.16]' : 'bg-black/40 hover:bg-black/55'}`}
                >
                  <span
                    className="w-1 shrink-0 rounded-full"
                    style={{ background: LEVEL_LINE[a.level] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium" style={{ color: LEVEL_LINE[a.level] }}>
                      {KIND_LABEL[a.kind]}, {a.level === 'act' ? 'now' : 'today'}
                    </span>
                    <span className="block text-[15px] leading-snug font-medium text-white">{a.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              onOpenPanel()
              setSelected(null)
              setOrgan(null)
              setLayer('signals')
              setSheet('list')
            }}
            className="press rounded-full bg-black/40 px-3.5 py-1.5 text-[13px] text-white/85 backdrop-blur-md hover:text-white"
          >
            {advice.length > listed ? `${advice.length - listed} more, and` : 'See'} all {signals.length}{' '}
            signals
          </button>
          <button
            onClick={() => {
              onOpenPanel()
              setSelected(null)
              setOrgan(null)
              setLayer('signals')
              setSheet('nasa')
            }}
            className="press rounded-full bg-black/40 px-3.5 py-1.5 text-[13px] text-white/85 backdrop-blur-md hover:text-white"
          >
            NASA reference
          </button>
        </div>
      </div>

      {/* On phones the pop-up sits above the vitals instead of beside the body. */}
      {narrow && partCard && (
        <div className="absolute inset-x-3 z-[8]" style={{ bottom: gaugeHeight + 8 }}>
          {partCard}
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 z-[6] items-end px-4 pb-6 lg:px-8 ${sheet === 'organ' ? 'hidden' : 'flex'}`}
        ref={gauges}
      >
        <VitalsStrip
          readings={report.readings}
          live={vitals}
          breath={breath}
          onPick={details}
          onOpenCamera={() => onOpenTest('restingPulse')}
          onBreathing={() => onOpenTest('breathingRate')}
        />
      </div>

      <AnimatePresence>
        {sheet && (
          <motion.aside
            key="sheet"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.35, ease: EASE }}
            className={`veil z-[8] flex flex-col overflow-hidden ${narrow && sheet === 'organ' ? 'fixed inset-x-3 bottom-2 h-[45dvh]' : 'absolute top-20 right-3 bottom-3 lg:top-24 lg:right-8'}`}
            style={{ width: `min(${SHEET_WIDTH[sheet]}px, calc(100% - 1.5rem))` }}
            aria-label={sheetTitle}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
              <div className="min-w-0">
                <p className="font-cond text-[13px] text-white/60">{sheetSubtitle}</p>
                <h2 className="mt-0.5 text-[22px] leading-tight font-semibold">{sheetTitle}</h2>
              </div>
              <button
                onClick={closeSheet}
                aria-label="Close"
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {sheet === 'nasa' ? (
                <NasaReference
                  mission={mission}
                  signals={signals}
                  onSignal={(id) => details(id)}
                  onSimulate={() => showMission(true)}
                  onTest={onOpenTest}
                />
              ) : sheet === 'trends' ? (
                <div className="px-5 pb-6">
                  <TrendChart key={member.id} member={member} mission={mission} signals={signals} day={day} />
                </div>
              ) : sheet === 'mission' ? (
                <div className="px-5 pb-6">
                  <MissionLab
                    settingName={m.name}
                    profile={profile}
                    onProfile={(p) => {
                      setProfile(p)
                      setLocalCursor(null)
                    }}
                    input={input}
                    onInput={setOverride}
                    linked={override === null}
                    onReset={() => setOverride(null)}
                    person={member.short}
                    phases={phases}
                    points={points}
                    cursor={cursor}
                    onCursor={(d) => {
                      if (profile === 'setting') setDay(Math.max(1, d))
                      else setLocalCursor(d)
                    }}
                  />
                </div>
              ) : note ? (
                <div className="space-y-5 px-5 pb-6">
                  <label className="block font-cond text-sm text-white/70">
                    Explore this system
                    <select
                      aria-label="Selected structure"
                      value={organ ?? ''}
                      onChange={(e) => setOrgan(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-white/20 bg-[#202226] p-2 text-white"
                    >
                      {anatomyChoices(inventory, note.layer).map((name) => (
                        <option key={name} value={name}>
                          {organNote(name).name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <h3 className="font-cond text-[13px] text-white/60">What it does</h3>
                    <p className="mt-1 text-[16px] leading-relaxed">{note.role}</p>
                  </div>
                  <div>
                    <h3 className="font-cond text-[13px] text-white/60">In space</h3>
                    <p className="mt-1 text-[16px] leading-relaxed">{note.inSpace}</p>
                  </div>
                  <div>
                    <h3 className="font-cond text-[13px] text-white/60">Signals followed here</h3>
                    {organSignals.length === 0 ? (
                      <p className="mt-1 text-[15px] text-white/70">None for this organ.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-white/[0.08]">
                        {organSignals.map((s) => (
                          <li key={s.id}>
                            <button
                              onClick={() => details(s.id, organ === 'pancreas' ? 'glucose' : undefined)}
                              className="press flex w-full items-center gap-3 py-3 text-left hover:text-white"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium">{s.title}</span>
                                <span className="block font-cond text-[14px] text-white/65">{s.value}</span>
                              </span>
                              <Chip level={s.level} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="text-[13px] leading-relaxed text-white/55">
                    The model is a reference body, not a scan of {member.short}. Click empty space or close
                    this panel to see the whole body again.
                  </p>
                </div>
              ) : focused ? (
                <SignalPanel
                  report={report}
                  signal={focused}
                  mission={mission}
                  metric={openMetric}
                  planned={checkup.covers(focused)}
                  onPlan={() => checkup.follow(focused)}
                  onOpenCheckup={onOpenCheckup}
                  onReference={() => setSheet('nasa')}
                  onTest={onOpenTest}
                />
              ) : (
                <>
                  <div className="mx-5 mb-3 grid grid-cols-2 gap-2">
                    {(
                      [
                        ['trends', 'Trends', 'Every value over the mission'],
                        ['nasa', 'NASA reference', 'What this place does, and what NASA does'],
                      ] as const
                    ).map(([kind, title, detail]) => (
                      <button
                        key={kind}
                        onClick={() => setSheet(kind)}
                        className="press rounded-xl bg-white/[0.06] px-3.5 py-3 text-left hover:bg-white/[0.1]"
                      >
                        <span className="block text-[15px] font-medium">{title}</span>
                        <span className="block text-[12.5px] leading-snug text-white/60">{detail}</span>
                      </button>
                    ))}
                  </div>
                  {signals.map((s, i) => (
                    <SignalRow
                      key={s.id}
                      index={i}
                      signal={s}
                      freshness={report.freshness[s.id]}
                      trend={trendOf(s.id)}
                      onOpen={() => select(s.id)}
                      onHover={(on) => setHoverId(on ? s.id : null)}
                    />
                  ))}
                </>
              )}
              {offered && note && (
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    className="press min-h-10 rounded-full border border-white/30 px-4 text-sm hover:bg-white/10"
                    onClick={() => onOpenTest(offered)}
                  >
                    {SELF_TESTS[offered].action}
                  </button>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )

  return (
    <section
      className={`relative ${demonstrating ? 'body-for-exercise' : narrow && sheet === 'organ' ? 'mt-16 h-[calc(55dvh-4rem)]' : 'h-[100dvh] min-h-[600px]'}`}
      style={demonstrating ? ({ '--checkup-width': `${covered}px` } as CSSProperties) : undefined}
      aria-label={`${member.name}, body view`}
    >
      <BodyViewer
        build={member.build}
        hotspots={demonstrating ? [] : hotspots}
        activeId={hoverId ?? selected ?? openId}
        focusId={layer === 'signals' ? (selected ?? (sheet === 'signal' ? openId : null)) : null}
        onPick={(id) => select(id as SignalId)}
        organ={organ}
        onInventory={setInventory}
        onOrgan={(name) => {
          setOrgan(name)
          if (name) {
            onOpenPanel()
            setSelected(null)
            setSheet('organ')
          } else setSheet((s) => (s === 'organ' ? null : s))
        }}
        physiology={physiology}
        restingBpm={vitals?.bpm ?? report.readings.restingPulseBpm}
        exerciseMotion={exerciseDemo?.mode}
        exerciseStartedAt={exerciseDemo?.startedAt}
        layer={layer}
        onLayer={(l) => showMission(l === 'physiology')}
        avatar={face}
        insetBottom={gaugeHeight + 12}
        breathingRate={breath?.breathsPerMinute}
        backdrop={{ src: place.image, position: place.imagePosition, caption, href: place.sourceUrl }}
        pins={demonstrating ? [] : pins}
        sideInset={demonstrating ? 0 : covered || (sheet && !narrow ? SHEET_WIDTH[sheet] : 0)}
        paused={paused}
        pinAvoid={narrow ? undefined : todoBox}
      >
        {exerciseDemo ? <AvatarDemoVitals playback={exerciseDemo} /> : overlays}
      </BodyViewer>
    </section>
  )
}

/** What one part of the body says today, pointed at that part. */
function PartCard({
  signal,
  advice,
  trend,
  planned,
  handled,
  onPlan,
  onOpenCheckup,
  onDetails,
  onClose,
  test,
}: {
  signal: Signal
  advice?: Advice
  trend: number[]
  planned: boolean
  /** Every task of the check-up about this signal is ticked. */
  handled: boolean
  onPlan: () => void
  onOpenCheckup: () => void
  onDetails: () => void
  onClose: () => void
  /** The self-test on the same question. */
  test?: { label: string; onOpen: () => void }
}) {
  const nasa = requirementsFor(signal.id)
  const reference = nasa.find((r) => r.phase === 'flight') ?? nasa[0]
  const color = LEVEL_LINE[handled ? 'ok' : signal.level]
  return (
    <motion.div
      role="dialog"
      aria-label={signal.title}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="w-[min(21rem,calc(100vw-1.5rem))] rounded-2xl border border-white/[0.12] bg-[#101317]/95 p-4 text-left shadow-[0_18px_48px_rgb(0_0_0/0.5)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color }}>
            {handled ? <CheckCircle size={14} weight="fill" /> : <StatusDot level={signal.level} />}
            {handled ? 'Checked today' : LEVEL_WORD[signal.level]}
          </p>
          <h3 className="mt-1 text-[18px] leading-tight font-semibold text-white">{signal.title}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="press -mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="min-w-0 font-cond text-[15px] text-white/85">{signal.value}</p>
        {trend.length > 1 && <Sparkline values={trend} color={color} width={92} height={26} fill />}
      </div>
      <p className="mt-3 text-[15px] leading-snug font-medium text-white">{advice?.title ?? signal.advice}</p>
      <p className="mt-1 text-[13px] leading-snug text-white/65">{signal.meaning}</p>
      {reference && (
        <p className="mt-3 border-t border-white/[0.08] pt-2.5 text-[12.5px] leading-snug text-white/65">
          <span className="text-white/85">
            {PHASE_WORD[reference.phase]}: {reference.name} ({reference.code.split(',')[0]}),
          </span>{' '}
          {reference.when.charAt(0).toLowerCase() + reference.when.slice(1)}.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onDetails}>
          Details
        </Button>
        {signal.level !== 'ok' && (
          <Button
            size="sm"
            kind={planned ? 'secondary' : 'ghost'}
            onClick={planned ? onOpenCheckup : onPlan}
            title={planned ? 'Open today’s check-up' : undefined}
          >
            {planned ? <CheckCircle size={15} weight="fill" /> : <ListPlus size={15} />}
            {planned ? 'In the check-up' : 'Add to the check-up'}
            {planned && <ArrowRight size={13} />}
          </Button>
        )}
        {test && (
          <Button size="sm" kind="ghost" onClick={test.onOpen}>
            {test.label}
          </Button>
        )}
      </div>
    </motion.div>
  )
}

/** A recommendation pointed at the part it is about: red to act now, amber for today. */
function AdvicePin({
  advice,
  onOpen,
  onHover,
}: {
  advice: Advice
  onOpen: () => void
  onHover: (on: boolean) => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      onClick={onOpen}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`press block w-[min(15rem,34vw)] rounded-xl px-3 py-2 text-left shadow-[0_10px_28px_rgb(0_0_0/0.45)] ${PIN_STYLE[advice.level]}`}
    >
      <span className="block text-[12px] font-medium opacity-80">
        {KIND_LABEL[advice.kind]}, {advice.level === 'act' ? 'now' : 'today'}
      </span>
      <span className="block text-[14px] leading-snug font-semibold">{advice.title}</span>
    </motion.button>
  )
}
