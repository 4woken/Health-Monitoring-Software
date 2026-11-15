import { useState, type FormEvent } from 'react'
import { ArrowClockwise, Check, Plus, X } from '@phosphor-icons/react'
import type { HabitatId } from '../mission/habitats'
import type { OnExerciseDemo } from '../exercises/demoVitals'
import EnvironmentExerciseDemo from '../exercises/EnvironmentExerciseDemo'
import type { Member } from '../crew/roster'
import type { SignalId } from '../health/signals'
import { useDayReport } from '../health/useDayReport'
import type { MissionId } from '../mission/missions'
import type { SelfTestId } from '../selftests/ids'
import { Button } from '../ui'
import type { Task, TaskKind } from './planner'
import { useCheckup } from './useCheckup'

const GROUPS: { kind: TaskKind; title: string }[] = [
  { kind: 'exam', title: 'Exams' },
  { kind: 'test', title: 'Self-tests' },
  { kind: 'followUp', title: 'Follow-ups' },
  { kind: 'routine', title: 'Every day' },
  { kind: 'own', title: 'Added by you' },
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
      <p className="font-cond text-[14px] text-white/60 tabular-nums">
        {total === 0
          ? 'Nothing planned yet'
          : done === total
            ? 'All done for today'
            : `${done} of ${total} done`}
      </p>
      <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div
          className="h-full rounded-full bg-white/80 transition-[width] duration-500"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>

      {checkup.planning && total === 0 && <p className="py-6 text-muted">Planning the day…</p>}
      {GROUPS.map(({ kind, title }) => {
        const tasks = checkup.tasks.filter((t) => t.kind === kind)
        if (tasks.length === 0) return null
        return (
          <section key={kind} className="mt-7" aria-label={title}>
            <h3 className="text-[13.5px] font-medium text-white/55">{title}</h3>
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

      <div className="mt-9 flex justify-end border-t border-white/[0.08] pt-3">
        <button
          onClick={() => void checkup.replan()}
          disabled={checkup.planning}
          title={checkup.credit}
          className="press flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <ArrowClockwise size={13} />
          Plan again
        </button>
      </div>
    </div>
  )
}

/**
 * One task: a circle to tick, what to do and why. The title shows the part of the body it is about;
 * a self-test has its own start, and the cross that removes it appears on hover.
 */
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
  const title = `text-left text-[15px] leading-snug ${done ? 'text-white/40' : 'font-medium'}`
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        className={`press mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-white/60 bg-white/60 text-[#0d0f12]' : 'border-white/30 hover:border-white/70'}`}
      >
        {done && <Check size={12} weight="bold" />}
      </button>
      <div className="min-w-0 flex-1">
        {onShow && !done ? (
          <button
            onClick={onShow}
            title="See it on the body"
            className={`${title} underline-offset-4 hover:underline hover:decoration-white/40`}
          >
            {task.title}
          </button>
        ) : (
          <p className={title}>{task.title}</p>
        )}
        {task.detail && !done && (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/50">{task.detail}</p>
        )}
      </div>
      {!done && onStart && (
        <button
          onClick={onStart}
          className="press h-7 shrink-0 rounded-full bg-white/10 px-3 text-[12.5px] font-medium hover:bg-white/20"
        >
          Start
        </button>
      )}
      <button
        onClick={onRemove}
        aria-label={`Remove: ${task.title}`}
        title="Remove from today"
        className="press -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <X size={13} />
      </button>
    </li>
  )
}
