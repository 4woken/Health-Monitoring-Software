import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, CaretRight, Check, Flask } from '@phosphor-icons/react'
import type { BreathReading } from '../../camera/breathReading'
import type { Member } from '../../crew/roster'
import type { SignalId } from '../../health/signals'
import { useDayReport } from '../../health/useDayReport'
import type { MissionId } from '../../mission/missions'
import { Button, LEVEL_LINE, Sparkline } from '../../ui'
import { SELF_TESTS } from '../catalog'
import { TEST_GROUPS } from '../groups'
import { CAUSE_LABEL, dueTests, type DueTest } from '../due'
import type { SelfTestId } from '../ids'
import { BASELINE_RUNS, baselineOf, clearResults, useResults, type TestResult } from '../results'
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

  const done = due.filter((d) => d.done).length

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-2 pb-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <p className="max-w-[66ch] text-[15px] leading-relaxed text-white/65">
          Short checks on yourself, and exercises that keep you fit. Each follows a NASA practice, and its
          result goes back to your signals on the body.
        </p>
        <VoiceToggle />
      </div>

      <div className="mt-7 grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        {/* The day's plan: the one block of the page, a checklist to work down. */}
        <section aria-labelledby="today" className="rounded-2xl bg-white/[0.05] p-5 lg:sticky lg:top-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="today" className="text-[18px] font-semibold">
              Today
            </h2>
            {due.length > 0 && (
              <span className="font-cond text-[14px] text-white/60 tabular-nums">
                {done} of {due.length} done
              </span>
            )}
          </div>
          {due.length > 0 && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-500"
                style={{ width: `${(done / due.length) * 100}%` }}
              />
            </div>
          )}
          {due.length === 0 ? (
            <p className="mt-3 text-[14.5px] leading-relaxed text-white/70">
              Nothing is due on day {day}. Every test sets your usual result over its first {BASELINE_RUNS}{' '}
              runs, so any of them is worth a first go.
            </p>
          ) : (
            <ol className="mt-5 space-y-5">
              {due.map((d) => (
                <TodayItem
                  key={d.test}
                  due={d}
                  first={d === due.find((x) => !x.done)}
                  onOpen={() => setOpen(d.test)}
                />
              ))}
            </ol>
          )}
        </section>

        <div>
          {TEST_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title} className="mb-9 last:mb-0">
              <h2 className="text-[17px] font-semibold">{group.title}</h2>
              <ul className="mt-1.5 divide-y divide-white/[0.07]">
                {group.tests.map((id) => (
                  <TestRow
                    key={id}
                    id={id}
                    results={results.filter((r) => r.test === id)}
                    due={due.find((d) => d.test === id && !d.done)}
                    onOpen={() => setOpen(id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <section aria-label="Camera lab" className="mt-10 border-t border-white/[0.07] pt-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <Flask size={16} aria-hidden="true" />
              Camera lab
            </h2>
            <p className="mt-1 text-[14px] text-white/60">The tools behind the camera tests.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" kind="ghost" onClick={() => setOpen('lab:face')}>
                Face fitting studio
              </Button>
              <Button size="sm" kind="ghost" onClick={() => setOpen('lab:pulse')}>
                Pulse camera
              </Button>
              <Button size="sm" kind="ghost" onClick={() => setOpen('lab:avatar')}>
                Avatar comparison
              </Button>
            </div>
          </section>
        </div>
      </div>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[13px] text-dim">
        <p className="max-w-[70ch] leading-relaxed">
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

/** A test due today, ticked once done; the next one to do carries the main button. */
function TodayItem({ due, first, onOpen }: { due: DueTest; first: boolean; onOpen: () => void }) {
  const t = SELF_TESTS[due.test]
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${due.done ? 'border-white bg-white text-[#0d0f12]' : 'border-white/35'}`}
      >
        {due.done && <Check size={13} weight="bold" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3">
          <span className={`text-[16px] leading-snug font-medium ${due.done ? 'text-white/50' : ''}`}>
            {due.cause === 'repeat' ? `${t.title}, again` : t.title}
          </span>
          <span className="shrink-0 font-cond text-[13px] text-white/50">
            {due.done ? 'Done' : `${t.minutes} min`}
          </span>
        </p>
        {!due.done && (
          <>
            <p className="mt-1 text-[13.5px] leading-snug text-white/65">{due.reason}</p>
            <p className="mt-1 font-cond text-[12.5px] text-white/45">{CAUSE_LABEL[due.cause]}</p>
            <div className="mt-2.5">
              <Button size="sm" kind={first ? 'primary' : 'secondary'} onClick={onOpen}>
                Start
              </Button>
            </div>
          </>
        )}
      </div>
    </li>
  )
}

/**
 * One test in the list: what it looks at, the last result against the usual one, and the runs so
 * far as a small line, so a drift shows before it is opened.
 */
function TestRow({
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
  const usual = last?.usual ?? baselineOf(results).usual
  const flagged = !!last && last.level !== 'ok' && t.family === 'test'
  const color = LEVEL_LINE[flagged ? last.level : 'ok']
  return (
    <li>
      <button
        onClick={onOpen}
        className="press group grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-4 py-3.5 text-left sm:grid-cols-[24px_minmax(0,1fr)_7.5rem_6rem_3.5rem_14px]"
      >
        <Icon size={20} className="text-white/55 group-hover:text-white" aria-hidden="true" />
        <span className="min-w-0">
          <span className="flex items-baseline gap-2.5">
            <span className="text-[16px] font-medium">{t.title}</span>
            {due && <span className="font-cond text-[13px] text-holo">Due today</span>}
          </span>
          <span className="mt-0.5 block truncate text-[13.5px] text-white/55">{t.summary}</span>
        </span>
        <span className="text-right">
          {last ? (
            <>
              <span
                className="block font-cond text-[17px] leading-tight font-medium tabular-nums"
                style={{ color: flagged ? color : undefined }}
              >
                {t.score.format(last.score)}
              </span>
              <span className="block font-cond text-[12.5px] text-white/45">
                {t.family === 'exercise'
                  ? `Day ${last.day}`
                  : usual !== undefined
                    ? `Usual ${t.score.format(usual)}`
                    : `${results.length} of ${BASELINE_RUNS} first runs`}
              </span>
            </>
          ) : (
            <span className="font-cond text-[13.5px] text-white/40">Not done yet</span>
          )}
        </span>
        <span className="hidden justify-end sm:flex" aria-hidden="true">
          {results.length > 1 && (
            <Sparkline
              values={results.slice(-12).map((r) => r.score)}
              baseline={t.family === 'test' ? usual : undefined}
              color={color}
              width={88}
              height={26}
            />
          )}
        </span>
        <span className="hidden text-right font-cond text-[13px] text-white/45 sm:block">
          {t.minutes} min
        </span>
        <CaretRight
          size={14}
          className="hidden text-white/30 group-hover:text-white/70 sm:block"
          aria-hidden="true"
        />
      </button>
    </li>
  )
}
