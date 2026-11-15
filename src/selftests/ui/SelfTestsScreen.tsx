import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle, Flask } from '@phosphor-icons/react'
import type { BreathReading } from '../../camera/breathReading'
import type { Member } from '../../crew/roster'
import type { SignalId } from '../../health/signals'
import { useDayReport } from '../../health/useDayReport'
import type { MissionId } from '../../mission/missions'
import { Button, Chip } from '../../ui'
import { EXERCISES, SELF_TESTS, TESTS, USE_LABEL } from '../catalog'
import { CAUSE_LABEL, dueTests, type DueTest } from '../due'
import type { SelfTestId } from '../ids'
import { BASELINE_RUNS, clearResults, useResults, type TestResult } from '../results'
import { ICON, VoiceToggle } from './parts'
import TestRunner from './TestRunner'

const PulseCamera = lazy(() => import('../../camera/pulse/PulseCamera'))
const FaceStudio = lazy(() => import('../../camera/FaceStudio'))
const AvatarComparison = lazy(() =>
  import('../../camera/avatarLab/AvatarComparison').then((m) => ({ default: m.AvatarComparison })),
)

type Lab = 'lab:face' | 'lab:pulse' | 'lab:avatar'

/**
 * Self-tests: short tests a crew member does on themselves, and exercises that keep them fit. Each
 * one is chosen from the person's data and NASA's schedule, says what NASA does on the same question,
 * and sends its result back to the signals on the body.
 */
export default function SelfTestsScreen({
  member,
  mission,
  day,
  initialTest,
  onBreathReading,
  onBreathUnavailable,
  onShowSignal,
  onPortraitSaved,
}: {
  member: Member
  mission: MissionId
  day: number
  initialTest?: SelfTestId
  onBreathReading: (reading: BreathReading) => void
  onBreathUnavailable: () => void
  onShowSignal: (signal: SignalId) => void
  /** A portrait fitted in the studio was saved to the profile. */
  onPortraitSaved: () => void
}) {
  const [open, setOpen] = useState<SelfTestId | Lab | null>(initialTest ?? null)
  const [confirm, setConfirm] = useState(false)
  const report = useDayReport(member, day, mission)
  const results = useResults(member.id)
  const due = dueTests(report, mission, results)

  if (open === 'lab:face' || open === 'lab:pulse' || open === 'lab:avatar')
    return (
      <div className="pb-8">
        <div className="mx-auto max-w-[1480px] px-4 pt-4 sm:px-6">
          <button
            onClick={() => setOpen(null)}
            className="press inline-flex items-center gap-1.5 text-[13px] text-white/70 hover:text-white"
          >
            <ArrowLeft size={14} />
            All self-tests
          </button>
        </div>
        <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
          {open === 'lab:face' ? (
            <FaceStudio member={member} onApplied={onPortraitSaved} />
          ) : open === 'lab:pulse' ? (
            <PulseCamera preflightRestingPulseBpm={member.preflightRestingPulseBpm} />
          ) : (
            <AvatarComparison />
          )}
        </Suspense>
      </div>
    )

  if (open)
    return (
      <TestRunner
        id={open}
        member={member}
        mission={mission}
        day={day}
        due={due.find((d) => d.test === open && !d.done)}
        onBack={() => setOpen(null)}
        onShowSignal={onShowSignal}
        onBreathReading={onBreathReading}
        onBreathUnavailable={onBreathUnavailable}
      />
    )

  const card = (id: SelfTestId) => (
    <TestCard
      key={id}
      id={id}
      results={results.filter((r) => r.test === id)}
      due={due.find((d) => d.test === id)}
      onOpen={() => setOpen(id)}
    />
  )

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-5 pb-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold">Self-tests</h1>
          <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-muted">
            Short tests you do on yourself, and exercises that keep you fit. Each one follows something NASA
            does with its crews, uses the camera, the keyboard or headphones, and sends its result back to
            your signals.
          </p>
        </div>
        <VoiceToggle />
      </header>

      <section className="mt-7" aria-label="For today">
        <h2 className="font-cond text-[15px] text-white/60">
          For {member.short} today, day {day}
        </h2>
        {due.length === 0 ? (
          <p className="mt-2 text-[15px] text-white/80">
            Nothing due today. Any test below can still be done: the first three runs of each set your usual
            result.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {due.map((d) => (
              <DueCard key={d.test} due={d} onOpen={() => setOpen(d.test)} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-9" aria-label="Tests">
        <h2 className="font-cond text-[15px] text-white/60">
          Tests: measure, and compare with your usual result
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{TESTS.map(card)}</ul>
      </section>

      <section className="mt-9" aria-label="Exercises">
        <h2 className="font-cond text-[15px] text-white/60">Exercises: keep fit, counted by the camera</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{EXERCISES.map(card)}</ul>
      </section>

      <section className="mt-9 border-t border-line-soft pt-5" aria-label="Lab">
        <h2 className="flex items-center gap-2 font-cond text-[15px] text-white/60">
          <Flask size={15} aria-hidden="true" />
          Lab: the camera tools behind the tests
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen('lab:face')}>
            Face fitting studio
          </Button>
          <Button size="sm" onClick={() => setOpen('lab:pulse')}>
            Pulse camera: POS and CHROM, CSV export
          </Button>
          <Button size="sm" onClick={() => setOpen('lab:avatar')}>
            Avatar comparison
          </Button>
        </div>
      </section>

      <footer className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5 text-[13px] text-dim">
        <p className="max-w-3xl leading-relaxed">
          The camera runs only during a test and its frames stay on this device. Results are kept in this
          browser, for each crew member. An educational prototype, not a medical device.
        </p>
        {results.length > 0 &&
          (confirm ? (
            <span className="flex items-center gap-2">
              Clear {results.length} result{results.length === 1 ? '' : 's'} of {member.short}?
              <Button
                size="sm"
                kind="danger"
                onClick={() => {
                  clearResults(member.id)
                  setConfirm(false)
                }}
              >
                Clear
              </Button>
              <Button size="sm" kind="ghost" onClick={() => setConfirm(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <button onClick={() => setConfirm(true)} className="underline underline-offset-4 hover:text-ink">
              Clear {member.short}&apos;s results
            </button>
          ))}
      </footer>
    </div>
  )
}

function DueCard({ due, onOpen }: { due: DueTest; onOpen: () => void }) {
  const t = SELF_TESTS[due.test]
  const Icon = ICON[due.test]
  return (
    <li className={`flex flex-col rounded-2xl p-4 ${due.done ? 'bg-white/[0.03]' : 'bg-white/[0.07]'}`}>
      <div className="flex items-start gap-3">
        <Icon size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-cond text-[12.5px] text-white/60">{CAUSE_LABEL[due.cause]}</p>
          <h3 className="text-[17px] leading-snug font-semibold">
            {due.cause === 'repeat' ? `${t.title}, again` : t.title}
          </h3>
          <p className="mt-1 text-[14px] leading-snug text-white/75">{due.reason}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 pl-9">
        <span className="text-[13px] text-dim">About {t.minutes} min</span>
        {due.done ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-white/75">
            <CheckCircle size={16} weight="fill" />
            Done today
          </span>
        ) : (
          <Button size="sm" kind="primary" onClick={onOpen}>
            Start
            <ArrowRight size={14} />
          </Button>
        )}
      </div>
    </li>
  )
}

function TestCard({
  id,
  results,
  due,
  onOpen,
}: {
  id: SelfTestId
  results: TestResult[]
  due?: DueTest
  onOpen: () => void
}) {
  const t = SELF_TESTS[id]
  const Icon = ICON[id]
  const last = results[results.length - 1]
  const status = !last
    ? 'Not done yet.'
    : t.family === 'exercise'
      ? `Last: ${t.score.format(last.score)}, day ${last.day}.`
      : results.length < BASELINE_RUNS
        ? `Last: ${t.score.format(last.score)}. Usual result: ${results.length} of ${BASELINE_RUNS} runs.`
        : `Last: ${t.score.format(last.score)}, day ${last.day}. Usual ${t.score.format(last.usual ?? last.score)}.`
  return (
    <li>
      <button
        onClick={onOpen}
        className="press flex h-full w-full flex-col rounded-2xl border border-line bg-panel/60 p-4 text-left hover:border-line-strong hover:bg-white/[0.04]"
      >
        <span className="flex w-full items-start gap-3">
          <Icon size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[17px] leading-snug font-semibold">{t.title}</span>
              {last && last.level !== 'ok' ? (
                <Chip level={last.level} />
              ) : due && !due.done ? (
                <span className="rounded-full bg-white/[0.1] px-2 py-0.5 font-cond text-[12px] text-white/80">
                  Due today
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-[14px] leading-snug text-white/75">{t.summary}</span>
            <span className="mt-2 block font-cond text-[12.5px] text-white/55">
              About {t.minutes} min ·{' '}
              {t.uses
                .filter((u) => u !== 'phone' && u !== 'strap')
                .map((u) => USE_LABEL[u])
                .join(' · ')}
            </span>
            <span className="mt-2 block text-[13px] text-white/70">{status}</span>
          </span>
        </span>
      </button>
    </li>
  )
}
