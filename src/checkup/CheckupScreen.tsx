import { useState, type FormEvent } from 'react'
import { ArrowClockwise, Check, Crosshair, Plus, X } from '@phosphor-icons/react'
import type { HabitatId } from '../mission/habitats'
import type { OnExerciseDemo } from '../exercises/demoVitals'
import EnvironmentExerciseDemo from '../exercises/EnvironmentExerciseDemo'
import type { Member } from '../crew/roster'
import type { SignalId } from '../health/signals'
import { useDayReport } from '../health/useDayReport'
import { MISSIONS, type MissionId } from '../mission/missions'
import type { SelfTestId } from '../selftests/ids'
import { Button } from '../ui'
import type { Task, TaskKind } from './planner'
import { useCheckup } from './useCheckup'

const GROUPS: { kind: TaskKind; title: string }[] = [
  { kind: 'exam', title: 'Exams and NASA schedule' },
  { kind: 'test', title: 'Self-tests' },
  { kind: 'followUp', title: 'Follow-ups from the signals' },
  { kind: 'routine', title: 'Every day' },
  { kind: 'own', title: 'Added by hand' },
]

/** Today's check-up for one person: planned from their signals and NASA's schedule, then theirs to tick, add to and trim. */
export default function CheckupScreen({
  member,
  mission,
  day,
  onShow,
  habitat,
  gravity,
  onDemo,
  onStartTest,
}: {
  member: Member
  habitat: HabitatId
  gravity: number
  onDemo: OnExerciseDemo
  mission: MissionId
  day: number
  /** Shows the part of the body a task is about. */
  onShow: (signal: SignalId) => void
  /** Opens a self-test, which ticks its task when done. */
  onStartTest: (test: SelfTestId) => void
}) {
  const report = useDayReport(member, day, mission)
  const checkup = useCheckup(report, mission)
  const [draft, setDraft] = useState('')
  const total = checkup.tasks.length
  const done = checkup.tasks.filter((t) => checkup.done.has(t.id)).length

  const add = (event: FormEvent) => {
    event.preventDefault()
    checkup.add(draft)
    setDraft('')
  }

  return (
    <div className="px-5 pb-8 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] text-white/70">{MISSIONS[mission].name}</p>
        <p className="font-cond text-[15px] tabular-nums">
          {total === 0 ? (
            <span className="text-white/55">Nothing planned yet</span>
          ) : done === total ? (
            <span className="text-holo">All done for today</span>
          ) : (
            <>
              {done} <span className="text-white/55">of {total} done</span>
            </>
          )}
        </p>
      </div>
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-500"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>

      {checkup.planning && total === 0 && <p className="py-6 text-muted">Planning the day…</p>}
      {GROUPS.map(({ kind, title }) => {
        const tasks = checkup.tasks.filter((t) => t.kind === kind)
        if (tasks.length === 0) return null
        const ticked = tasks.filter((t) => checkup.done.has(t.id)).length
        return (
          <section key={kind} className="mt-8" aria-label={title}>
            <h3 className="flex items-baseline justify-between gap-3 text-[15px] font-semibold">
              {title}
              <span className="font-cond text-[13px] font-normal text-white/45 tabular-nums">
                {ticked} of {tasks.length}
              </span>
            </h3>
            <ul className="mt-1">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  done={checkup.done.has(task.id)}
                  onToggle={() => checkup.toggle(task.id)}
                  onRemove={() => checkup.remove(task.id)}
                  onShow={task.signal ? () => onShow(task.signal!) : undefined}
                  onStart={task.test ? () => onStartTest(task.test!) : undefined}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {/* A task of one's own, written where the next one would go. */}
      <form
        onSubmit={add}
        className="mt-6 flex items-center gap-3.5 border-t border-white/[0.08] pt-4"
        aria-label="Add a task"
      >
        <span
          aria-hidden="true"
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-white/30 text-white/50"
        >
          <Plus size={11} weight="bold" />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={120}
          placeholder="Add a task for today"
          aria-label="Add a task for today"
          className="h-9 min-w-0 flex-1 border-b border-transparent bg-transparent text-[15px] placeholder:text-white/40 focus:border-white/30 focus:outline-none"
        />
        {draft.trim() && (
          <Button type="submit" size="sm">
            Add
          </Button>
        )}
      </form>

      {/* What exercise looks like here: the body beside the panel plays it for 30 seconds. */}
      <EnvironmentExerciseDemo
        key={`${habitat}:${gravity}`}
        habitat={habitat}
        gravity={gravity}
        onDemo={onDemo}
      />

      <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4 text-[12.5px] leading-relaxed text-white/45">
        <p className="max-w-[38ch]">{checkup.credit}</p>
        <Button kind="ghost" size="sm" onClick={() => void checkup.replan()} disabled={checkup.planning}>
          <ArrowClockwise size={14} />
          Plan again
        </Button>
      </div>
    </div>
  )
}

/** One task: a circle to tick, what to do and why, and the actions that go with it on the right. */
function TaskRow({
  task,
  done,
  onToggle,
  onRemove,
  onShow,
  onStart,
}: {
  task: Task
  done: boolean
  onToggle: () => void
  onRemove: () => void
  onShow?: () => void
  /** Starts the self-test that does this task. */
  onStart?: () => void
}) {
  const icon =
    'press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-white'
  return (
    <li className="group flex items-start gap-3.5 py-3">
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        className={`press mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border ${done ? 'border-white bg-white text-[#0d0f12]' : 'border-white/35 hover:border-white'}`}
      >
        {done && <Check size={13} weight="bold" />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[15.5px] leading-snug ${done ? 'text-white/40 line-through decoration-white/25' : 'font-medium'}`}
        >
          {task.title}
        </p>
        {task.detail && !done && (
          <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-white/55">{task.detail}</p>
        )}
      </div>
      <div className="-mt-1 flex shrink-0 items-center gap-0.5">
        {!done && onStart && (
          <button
            onClick={onStart}
            className="press mr-1 h-8 rounded-full bg-white px-3.5 text-[13px] font-medium text-[#0d0f12] hover:bg-white/85"
          >
            Start
          </button>
        )}
        {!done && onShow && (
          <button
            onClick={onShow}
            aria-label="See it on the body"
            title="See it on the body"
            className={icon}
          >
            <Crosshair size={16} />
          </button>
        )}
        <button
          onClick={onRemove}
          aria-label={`Remove: ${task.title}`}
          title="Remove from today"
          className={`${icon} sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100`}
        >
          <X size={14} />
        </button>
      </div>
    </li>
  )
}
