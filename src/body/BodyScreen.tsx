import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Plus, UserFocus, X } from '@phosphor-icons/react'
import BodyViewer, { type Hotspot, type Layer } from './BodyViewer'
import SignalMap from './SignalMap'
import { ORGAN_SIGNALS } from './anatomy/loadAnatomy'
import { regionOf } from './anatomy/bodyShape'
import { organNote } from './anatomy/organs'
import type { PersonalAvatar } from '../camera/face/portrait'
import { useCheckup } from '../checkup/useCheckup'
import type { Member } from '../crew/roster'
import { BodySizeControl } from '../crew/BodySizeControl'
import { SIGNAL_METRICS, type MetricId } from '../health/metrics'
import { dayReport, history } from '../health/readings'
import { LIMITS, worstLevel, type SignalId } from '../health/signals'
import { MISSION_DAYS } from '../health/simulation'
import SignalPanel from '../health/ui/SignalPanel'
import SignalRow from '../health/ui/SignalRow'
import TrendChart from '../health/ui/TrendChart'
import VitalsStrip from '../health/ui/VitalsStrip'
import { HABITATS, type HabitatId } from '../mission/habitats'
import MissionLab, { type ProfileId, type SimInput } from '../mission/MissionLab'
import { MISSIONS, type MissionId } from '../mission/missions'
import { MISSION_PROFILES, simulateProfile, type MissionPhase } from '../mission/physiology'
import { Chip, EASE, StatusDot } from '../ui'

import type { BreathReading } from '../camera/breathReading'
import type { CameraView } from '../camera/CameraScreen'

import type { ExerciseKind } from '../exercises/exercisePlan'

interface Props {
  member: Member
  members: Member[]
  onSwitch: (id: string) => void
  onAddMember: () => void
  face: PersonalAvatar | null
  mission: MissionId
  day: number
  setDay: (day: number) => void
  habitat: HabitatId
  onOpenCamera: (view?: CameraView) => void
  onOpenExercises: (kind: ExerciseKind) => void
  breath: BreathReading | null
}

/** One person's body in the place they live, with what their signals say and what the mission does. */
export default function BodyScreen({
  member,
  members,
  onSwitch,
  onAddMember,
  face,
  mission,
  day,
  setDay,
  habitat,
  onOpenCamera,
  onOpenExercises,
  breath,
}: Props) {
  const gauges = useRef<HTMLDivElement>(null)
  const [gaugeHeight, setGaugeHeight] = useState(160)
  useEffect(() => {
    const el = gauges.current
    if (!el) return
    const measure = () => setGaugeHeight(Math.ceil(el.getBoundingClientRect().height))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [openId, setOpenId] = useState<SignalId | null>(null)
  const [openMetric, setOpenMetric] = useState<MetricId | undefined>()
  const [listOpen, setListOpen] = useState(false)
  /** Organ isolated in the body view (mesh name). */
  const [organ, setOrgan] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<SignalId | null>(null)
  const [layer, setLayer] = useState<Layer>('signals')

  const report = useMemo(() => dayReport(member, day, mission), [member, day, mission])
  const signals = report.signals
  const attention = signals.filter((s) => s.level !== 'ok')
  const focused = signals.find((s) => s.id === openId)
  const checkup = useCheckup(report, mission)
  const m = MISSIONS[mission]
  const place = HABITATS[habitat]

  const hotspots = useMemo<Hotspot[]>(
    () =>
      signals.flatMap((s) => {
        const region = regionOf(s.id, member.build)
        return region ? [{ id: s.id, label: region.label, pos: region.pos, level: s.level }] : []
      }),
    [signals, member.build],
  )

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
              days: MISSION_DAYS,
              gravity: input.gravity,
              doseRateMSvDay: input.doseRateMSvDay,
            },
          ]
        : MISSION_PROFILES[profile].phases,
    [profile, m.name, input.gravity, input.doseRateMSvDay],
  )
  const points = useMemo(() => simulateProfile(phases, input.exercise), [phases, input.exercise])
  const cursor = profile === 'setting' ? day : Math.min(points.length - 1, localCursor ?? points.length - 1)
  const physiology = points[Math.min(points.length - 1, cursor)]

  const closeSheet = () => {
    setOpenId(null)
    setListOpen(false)
    setOrgan(null)
  }
  const switchTo = (id: string) => {
    closeSheet()
    onSwitch(id)
  }
  /** Focus a signal: the camera moves to it and the sheet on the right explains it. */
  const inspect = (id: SignalId, metric?: MetricId) => {
    setOpenMetric(metric)
    setLayer('signals')
    setListOpen(false)
    setOrgan(null)
    setOpenId(id)
  }

  /** Last 30 days of the main number behind a signal; none for neck vein flow, which is a category. */
  const trendOf = (id: SignalId) => {
    const metric = SIGNAL_METRICS[id][0]
    return metric ? history(member, metric, day, mission, 30) : { values: [] }
  }

  const sheetOpen = Boolean(focused) || listOpen || Boolean(organ)
  const note = organ ? organNote(organ) : null
  const exercise =
    organ === 'arm bones'
      ? 'assembly'
      : organ === 'leg bones'
        ? 'knee'
        : focused?.id === 'sleep'
          ? 'reaction'
          : focused?.id === 'mood'
            ? 'breathing'
            : null
  const organSignals = organ ? signals.filter((s) => (ORGAN_SIGNALS[organ] ?? []).includes(s.id)) : []
  const caption =
    place.kind === 'generated'
      ? `${place.description}: a generated illustration based on NASA images, not a NASA design.`
      : `Photo: ${place.credit}, ${place.description}.`

  const priorFlights = [
    member.previousFlights !== undefined &&
      `${member.previousFlights} completed spaceflight${member.previousFlights === 1 ? '' : 's'}`,
    member.previousDaysInSpace !== undefined &&
      `${member.previousDaysInSpace} prior ${member.previousDaysInSpace === 1 ? 'day' : 'days'} in space`,
  ]
    .filter(Boolean)
    .join(' · ')
  const overlays = (
    <>
      <div className="on-photo absolute top-20 left-4 z-[6] max-w-[min(34rem,calc(100%-2rem))] lg:top-24 lg:left-8">
        <nav aria-label="Crew" className="no-scrollbar flex gap-1 overflow-x-auto">
          {members.map((p) => {
            const on = p.id === member.id
            const level = worstLevel(dayReport(p, day, mission).signals)
            return (
              <button
                key={p.id}
                onClick={() => switchTo(p.id)}
                aria-pressed={on}
                className={`press flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-medium ${on ? 'bg-white text-[#0d0f12]' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
              >
                {level !== 'ok' && <StatusDot level={level} />}
                {p.short}
              </button>
            )
          })}
          <button
            onClick={onAddMember}
            aria-label="Add a crew member"
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/75 hover:bg-white/10 hover:text-white"
          >
            <Plus size={15} />
          </button>
        </nav>
        <AnimatePresence mode="wait">
          <motion.div
            key={member.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <h1 className="mt-5 break-words font-cond text-[clamp(44px,5.6vw,84px)] leading-[0.92] font-semibold tracking-[-0.01em] text-white">
              {member.name}
            </h1>
            {(member.callSign || member.specialty) && (
              <p className="mt-2 break-words text-[14px] text-white/85">
                {[member.callSign && `Call sign: ${member.callSign}`, member.specialty]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            <p className="mt-2 text-[16px] text-white/80">
              {member.role}. {m.name}, day {day}.{' '}
              {attention.length === 0
                ? 'Nothing needs attention.'
                : `${attention.length} signal${attention.length === 1 ? ' needs' : 's need'} attention.`}
            </p>
            {priorFlights && <p className="mt-1 text-[14px] text-white/75">{priorFlights}</p>}
          </motion.div>
        </AnimatePresence>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setOpenId(null)
              setOrgan(null)
              setListOpen(true)
            }}
            className="press rounded-full bg-black/40 px-3.5 py-1.5 text-[13px] text-white/85 backdrop-blur-md hover:text-white"
          >
            All {signals.length} signals
          </button>
          <button
            onClick={() => onOpenCamera('portrait')}
            className="press flex items-center gap-1.5 rounded-full bg-black/40 px-3.5 py-1.5 text-[13px] text-white/85 backdrop-blur-md hover:text-white"
          >
            <UserFocus size={14} />
            {face ? 'Change the face' : 'Put my face on it'}
          </button>
        </div>
        <BodySizeControl key={member.id} member={member} />
        {face && (
          <p className="on-photo mt-3 text-[13px] text-white/75">
            {face.sample
              ? 'Fictional sample face, this session only.'
              : 'Face from the camera, this session only.'}
          </p>
        )}
        {attention.length > 0 && !sheetOpen && (
          <ul className="mt-6 hidden max-w-[24rem] flex-col gap-1 md:flex">
            {attention.slice(0, 4).map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => inspect(s.id)}
                  onPointerEnter={() => setHoverId(s.id)}
                  onPointerLeave={() => setHoverId(null)}
                  className="press group flex w-full items-start gap-3 py-1.5 text-left"
                >
                  <StatusDot level={s.level} className="mt-2" />
                  <span>
                    <span className="block text-[16px] font-medium text-white group-hover:underline">
                      {s.title}
                    </span>
                    <span className="block font-cond text-[14px] text-white/70">{s.value}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-[6] flex items-end px-4 pb-6 lg:px-8" ref={gauges}>
        <VitalsStrip
          readings={report.readings}
          breath={breath}
          onPick={inspect}
          onOpenCamera={() => onOpenCamera('pulse')}
          onBreathing={() => onOpenCamera('respiration')}
        />
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <motion.aside
            key="sheet"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="veil absolute top-20 right-3 bottom-3 z-[7] flex w-[min(440px,calc(100%-1.5rem))] flex-col overflow-hidden lg:top-24 lg:right-8"
            aria-label={note ? note.name : focused ? focused.title : 'All signals'}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
              <div className="min-w-0">
                <p className="font-cond text-[13px] text-white/60">
                  {note
                    ? `${member.short}, reference anatomy`
                    : focused
                      ? member.short
                      : `${member.short}, all signals`}
                </p>
                <h2 className="mt-0.5 text-[22px] leading-tight font-semibold">
                  {note
                    ? note.name
                    : focused
                      ? focused.title
                      : attention.length === 0
                        ? 'Nothing needs attention'
                        : `${attention.length} need${attention.length === 1 ? 's' : ''} attention`}
                </h2>
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
              {note ? (
                <div className="space-y-5 px-5 pb-6">
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
                              onClick={() => inspect(s.id)}
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
                />
              ) : (
                signals.map((s, i) => (
                  <SignalRow
                    key={s.id}
                    index={i}
                    signal={s}
                    freshness={report.freshness[s.id]}
                    trend={trendOf(s.id)}
                    onOpen={() => inspect(s.id)}
                    onHover={(on) => setHoverId(on ? s.id : null)}
                  />
                ))
              )}
              {exercise && (
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    className="press min-h-10 rounded-full border border-white/30 px-4 text-sm hover:bg-white/10"
                    onClick={() => onOpenExercises(exercise)}
                  >
                    {exercise === 'assembly'
                      ? 'Explore hand coordination'
                      : exercise === 'knee'
                        ? 'Explore seated mobility'
                        : exercise === 'breathing'
                          ? 'Check in on my stress'
                          : 'Check my sleep and reaction'}
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
    <>
      <section className="relative h-[100dvh] min-h-[640px]" aria-label={`${member.name}, body view`}>
        <BodyViewer
          build={member.build}
          hotspots={hotspots}
          activeId={hoverId ?? openId}
          focusId={layer === 'signals' ? openId : null}
          onPick={(id) => inspect(id as SignalId)}
          organ={organ}
          onOrgan={(name) => {
            setOrgan(name)
            if (name) {
              setOpenId(null)
              setListOpen(false)
            }
          }}
          physiology={physiology}
          restingBpm={report.readings.restingPulseBpm}
          layer={layer}
          onLayer={setLayer}
          avatar={face}
          insetBottom={gaugeHeight + 12}
          breathingRate={breath?.breathsPerMinute}
          backdrop={{ src: place.image, position: place.imagePosition, caption, href: place.sourceUrl }}
        >
          {overlays}
        </BodyViewer>
      </section>

      <div className="mx-auto max-w-[1480px] px-4 sm:px-6">
        <MissionLab
          settingName={m.name}
          profile={profile}
          onProfile={(p) => {
            setProfile(p)
            setLocalCursor(null)
            setLayer('physiology')
          }}
          input={input}
          onInput={(i) => {
            setOverride(i)
            setLayer('physiology')
          }}
          linked={override === null}
          onReset={() => setOverride(null)}
          person={member.short}
          phases={phases}
          points={points}
          cursor={cursor}
          onCursor={(d) => {
            if (profile === 'setting') setDay(Math.min(MISSION_DAYS, Math.max(1, d)))
            else setLocalCursor(d)
            setLayer('physiology')
          }}
        />
        <SignalMap
          build={member.build}
          signals={signals}
          activeId={openId}
          onPick={(id) => {
            inspect(id)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
        <TrendChart key={member.id} member={member} mission={mission} signals={signals} day={day} />
        <p className="py-10 text-center text-[13px] text-dim">
          Educational prototype with simulated data. It is not a medical device.
        </p>
      </div>
    </>
  )
}
