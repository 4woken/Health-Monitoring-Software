import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle } from '@phosphor-icons/react'
import type { HabitatId } from '../mission/habitats'
import EnvironmentExerciseDemo from './EnvironmentExerciseDemo'
import type { OnExerciseDemo } from './demoVitals'
import { Button } from '../ui'
import ExerciseCheckInForm from './ExerciseCheckInForm'
import { EXERCISES } from './exerciseCatalog'
import {
  clearExerciseHistory,
  completedToday,
  getReportedStress,
  loadExerciseHistory,
  rateExerciseResult,
  recordStressChange,
  recommendExercises,
  saveExerciseResult,
  setReportedStress,
  type ExerciseKind,
  type ExerciseCheckIn,
  type ExerciseResult,
  type ExerciseRating,
  type StressChange,
} from './exercisePlan'

const CameraExercise = lazy(() => import('./CameraExercise'))
const ReactionExercise = lazy(() => import('./ReactionExercise'))
const BreathingExercise = lazy(() => import('./BreathingExercise'))
const stressChanges = { lower: 'Lower', same: 'About the same', higher: 'Higher' } as const
const stressLevels = { none: 'None', some: 'Some', high: 'A lot' } as const
const ratings: [ExerciseRating, string][] = [
  ['hard', 'Too difficult'],
  ['right', 'About right'],
  ['easy', 'Too easy'],
]

type Run = { kind: ExerciseKind; target: number; previous?: ExerciseResult }
type Stage =
  | { step: 'intro' | 'form' | 'matches' }
  | { step: 'run'; run: Run }
  | { step: 'result'; run: Run; result: ExerciseResult }

function ResearchSource({ kind }: { kind: ExerciseKind }) {
  const activity = EXERCISES[kind]
  return (
    <details className="mt-2 text-sm text-muted">
      <summary className="w-fit cursor-pointer underline-offset-4 hover:underline">
        Research behind this mission
      </summary>
      <p className="mt-2 max-w-prose">{activity.adaptation}</p>
      <a className="underline underline-offset-4" href={activity.url} target="_blank" rel="noreferrer">
        {activity.source}
      </a>
    </details>
  )
}

export default function ExerciseMissions({
  memberId,
  person,
  interest,
  habitat,
  gravity,
  onDemo,
}: {
  memberId: string
  person: string
  interest?: ExerciseKind
  habitat: HabitatId
  gravity: number
  onDemo: OnExerciseDemo
}) {
  const [stage, setStage] = useState<Stage>({ step: interest ? 'form' : 'intro' })
  const [entry, setEntry] = useState<ExerciseCheckIn | null>(null)
  const [history, setHistory] = useState(() => loadExerciseHistory(memberId))
  const [breathingSample, setBreathingSample] = useState<number | null>(null)
  const [remember, setRemember] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const lastStep = useRef(stage.step)
  useEffect(() => {
    if (!interest) return
    const frame = requestAnimationFrame(() =>
      heading.current?.closest('section')?.scrollIntoView({ block: 'start' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [interest])
  useEffect(() => {
    if (lastStep.current !== stage.step || interest) heading.current?.focus({ preventScroll: true })
    lastStep.current = stage.step
  }, [stage.step, interest])
  const options = entry ? recommendExercises(entry, history) : []
  const results = Object.values(history).sort((a, b) => b.completedAt - a.completedAt)
  const hasResults = results.length > 0
  const reportedStress = getReportedStress(memberId)
  const toList = () => setStage({ step: 'matches' })

  const finish = (run: Run, score?: { medianMs: number; anticipations: number }) => {
    const updated = saveExerciseResult(memberId, { kind: run.kind, target: run.target, ...score }, remember)
    const result = updated[run.kind]
    if (!result) return
    setHistory(updated)
    setStage({ step: 'result', run, result })
  }
  const reportChange = (result: ExerciseResult, change: StressChange) => {
    const updated = recordStressChange(memberId, result.completedAt, change)
    setHistory(updated)
    if (stage.step === 'result' && updated.breathing) setStage({ ...stage, result: updated.breathing })
  }
  const rate = (result: ExerciseResult, rating: ExerciseRating) => {
    const next = rateExerciseResult(memberId, result.kind, result.completedAt, rating)
    setHistory(next)
    if (stage.step === 'result' && next[result.kind]) setStage({ ...stage, result: next[result.kind]! })
  }

  return (
    <section
      id="exercise-missions"
      aria-label="Personal mini-missions"
      className="scroll-mt-20 rounded-2xl border border-line bg-panel px-4 py-5 sm:px-6"
    >
      <h2 ref={heading} tabIndex={-1} className="font-cond text-[30px] leading-tight font-semibold">
        {stage.step === 'run'
          ? EXERCISES[stage.run.kind].title
          : stage.step === 'result'
            ? 'Mission complete'
            : 'Personal mini-missions'}
      </h2>
      {stage.step === 'intro' && (
        <>
          <p className="mt-2 max-w-prose text-muted">
            Check in on stress, sleep and energy to find an optional activity for {person}.
          </p>
          {reportedStress && (
            <p className="mt-2 text-sm">
              Stress you reported today: <strong>{stressLevels[reportedStress]}</strong>
            </p>
          )}
          <Button className="mt-4" onClick={() => setStage({ step: 'form' })}>
            Find a mini-mission <ArrowRight size={16} />
          </Button>
        </>
      )}
      {stage.step === 'form' && (
        <ExerciseCheckInForm
          initial={entry}
          reportedStress={reportedStress}
          initialBreathingSample={breathingSample}
          interest={interest}
          onSubmit={(value, sample) => {
            setBreathingSample(sample)
            setReportedStress(memberId, value.stress)
            setEntry(value)
            toList()
          }}
          onCancel={() => setStage({ step: entry ? 'matches' : 'intro' })}
        />
      )}
      {stage.step === 'matches' && entry && (
        <>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-muted">
              {entry.unwell
                ? 'Take a break. If you need help, follow your usual medical support procedure.'
                : options.length
                  ? 'Suggested from your check-in today.'
                  : results.some((r) => completedToday(r))
                    ? 'Your completed missions are listed below. There are no further matches for this check-in.'
                    : 'You can explore movement in your selected environment.'}
            </p>
            <button
              type="button"
              className="text-sm underline underline-offset-4"
              onClick={() => setStage({ step: 'form' })}
            >
              Edit check-in
            </button>
          </div>
          {!entry.unwell && (
            <EnvironmentExerciseDemo
              key={habitat + ':' + gravity}
              habitat={habitat}
              gravity={gravity}
              onDemo={onDemo}
            />
          )}
          {(entry.stress || breathingSample !== null) && (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              {entry.stress && (
                <div>
                  <dt className="text-muted">Stress you reported</dt>
                  <dd>{stressLevels[entry.stress]}</dd>
                </div>
              )}
              {breathingSample !== null && (
                <div>
                  <dt className="text-muted">Breathing at check-in · camera estimate</dt>
                  <dd>{breathingSample} breaths/min</dd>
                </div>
              )}
            </dl>
          )}
          {!entry.unwell && !entry.onEarth && (entry.longSitting || entry.wantsMobility) && (
            <p className="mt-2 text-sm text-muted">
              The seated knee activity is available on Earth with a stable chair.
            </p>
          )}
          {options.length > 0 && (
            <>
              <ul className="mt-4 divide-y divide-line">
                {options.map((option) => {
                  const item = EXERCISES[option.kind]
                  return (
                    <li key={option.kind} className="py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-xl font-medium">{item.title}</h3>
                        <span className="text-sm text-muted">
                          {option.target} {item.unit} · {item.input}
                        </span>
                      </div>
                      <p className="mt-1">{option.reason}</p>
                      <p className="mt-1 max-w-prose text-sm text-muted">{item.description}</p>
                      <ResearchSource kind={option.kind} />
                      <Button
                        className="mt-3"
                        size="sm"
                        onClick={() =>
                          setStage({
                            step: 'run',
                            run: { kind: option.kind, target: option.target, previous: history[option.kind] },
                          })
                        }
                        aria-label={'Open ' + item.title}
                      >
                        Open mission <ArrowRight size={15} />
                      </Button>
                    </li>
                  )
                })}
              </ul>
              <label className="mt-3 flex items-start gap-3 text-sm text-muted">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Keep completed results from these sessions on this device. Otherwise they last for this tab
                session.
              </label>
            </>
          )}
        </>
      )}
      {stage.step === 'run' && (
        <div className="mt-4">
          <Suspense fallback={<p role="status">Opening mission…</p>}>
            {stage.run.kind === 'breathing' ? (
              <BreathingExercise
                target={stage.run.target}
                onComplete={() => finish(stage.run)}
                onExit={toList}
              />
            ) : stage.run.kind === 'reaction' ? (
              <ReactionExercise
                target={stage.run.target}
                onComplete={(score) => finish(stage.run, score)}
                onExit={toList}
              />
            ) : (
              <CameraExercise
                kind={stage.run.kind}
                target={stage.run.target}
                onComplete={() => finish(stage.run)}
                onExit={toList}
              />
            )}
          </Suspense>
        </div>
      )}
      {stage.step === 'result' && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <CheckCircle size={22} />
            <p>
              {EXERCISES[stage.result.kind].title} · {stage.result.target} {EXERCISES[stage.result.kind].unit}
            </p>
          </div>
          {stage.result.medianMs !== undefined && (
            <p className="mt-2 text-muted">
              Median {stage.result.medianMs} ms · Early responses {stage.result.anticipations ?? 0}
              {stage.run.previous?.medianMs !== undefined && (
                <> · Previous session {stage.run.previous.medianMs} ms</>
              )}
            </p>
          )}
          {stage.result.kind === 'breathing' ? (
            <fieldset className="my-4">
              <legend className="mb-2 font-medium">How does your stress feel now? (optional)</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(stressChanges) as StressChange[]).map((change) => (
                  <Button
                    key={change}
                    size="sm"
                    kind={stage.result.stressChange === change ? 'primary' : 'secondary'}
                    aria-pressed={stage.result.stressChange === change}
                    onClick={() => reportChange(stage.result, change)}
                  >
                    {stressChanges[change]}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset className="my-4">
              <legend className="mb-2 font-medium">How did this feel?</legend>
              <div className="flex flex-wrap gap-2">
                {ratings.map(([id, label]) => (
                  <Button
                    key={id}
                    size="sm"
                    kind={stage.result.rating === id ? 'primary' : 'secondary'}
                    aria-pressed={stage.result.rating === id}
                    onClick={() => rate(stage.result, id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
          <Button kind="ghost" onClick={toList}>
            Back to my missions
          </Button>
        </>
      )}
      {(hasResults || reportedStress) && (stage.step === 'intro' || stage.step === 'matches') && (
        <div className="mt-5 border-t border-line pt-4">
          {hasResults && (
            <>
              <h3 className="font-medium">Latest results for {person}</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {results.map((result) => (
                  <li key={result.kind}>
                    {EXERCISES[result.kind].title} ·{' '}
                    {completedToday(result) ? 'Today' : new Date(result.completedAt).toLocaleDateString()} ·{' '}
                    {result.target} {EXERCISES[result.kind].unit}
                    {result.medianMs !== undefined && <> · {result.medianMs} ms median</>}
                    {result.stressChange && <> · Stress afterwards: {stressChanges[result.stressChange]}</>}
                    {result.rating && <> · {ratings.find(([id]) => id === result.rating)?.[1]}</>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            className="mt-2 text-sm text-muted underline underline-offset-4"
            onClick={() => {
              clearExerciseHistory(memberId)
              setHistory({})
              setRemember(false)
              setBreathingSample(null)
              setEntry((current) => current && { ...current, stress: undefined })
            }}
          >
            {hasResults ? 'Clear my exercise history' : 'Clear my stress check-in'}
          </button>
        </div>
      )}
    </section>
  )
}
