import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Archive,
  CheckCircle,
  DownloadSimple,
  Eye,
  GlobeHemisphereWest,
  Heartbeat,
  LockKey,
  PaperPlaneTilt,
  Radioactive,
  RocketLaunch,
  WarningCircle,
} from '@phosphor-icons/react'
import type { Member } from '../crew/roster'
import { medicalRecord } from '../health/medicalRecords'
import { useDayReport } from '../health/useDayReport'
import { MISSIONS, type MissionId } from '../mission/missions'
import { sampleAt } from '../simulation/engine'
import { useSimulation } from '../simulation/SimulationProvider'
import { Button, LEVEL_LINE } from '../ui'
import {
  createArchive,
  downloadArchive,
  listArchive,
  saveArchive,
  verifyArchive,
  type ArchiveRecord,
} from './archive'
import { healthPacket } from './packet'
import { advanceTransfers, queueTransfer, type TransferState } from './transport'

/** The five steps of a report, in order. */
const STEPS: TransferState[] = ['archived', 'queued', 'in-flight', 'received', 'acknowledged']
const STATE: Record<TransferState, string> = {
  archived: 'Ready to send',
  queued: 'Waiting for the link',
  'in-flight': 'On its way to Earth',
  received: 'Arrived on Earth',
  acknowledged: 'Earth confirmed it',
}
/** One-way light time to Earth, seconds. */
const DELAYS = [
  { seconds: 1, label: 'Orbit', time: '1 s' },
  { seconds: 3, label: 'Moon', time: '3 s' },
  { seconds: 240, label: 'Mars, close', time: '4 min' },
  { seconds: 1200, label: 'Mars, far', time: '20 min' },
]
const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`
const duration = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`)
const clockKey = 'pulsar.telemetry.clock.v1'
const loadClock = () => {
  try {
    const n = Number(localStorage.getItem(clockKey))
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}
/** The link clock moves on its own while a report travels: in real time near Earth, 60 times faster for Mars. */
const TICK_MS = 500
const tickSeconds = (delay: number) => (delay >= 60 ? 30 : 0.5)

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-line-soft bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Switch({
  on,
  onChange,
  children,
}: {
  on: boolean
  onChange: (on: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="press flex items-center gap-2.5 text-left text-[14px]"
    >
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-holo' : 'bg-white/15'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      {children}
    </button>
  )
}

/** Where a report is between the ship and Earth: 0 on board, 1 on Earth; its receipt comes back after. */
function place(r: ArchiveRecord, now: number) {
  const delay = Math.max(r.delaySeconds ?? 1, 0.001)
  if (r.state === 'in-flight' && r.sentAt !== undefined)
    return { out: Math.min(1, (now - r.sentAt) / delay), back: null }
  if (r.state === 'received' && r.receivedAt !== undefined)
    return { out: null, back: Math.min(1, (now - r.receivedAt) / delay) }
  return { out: null, back: null }
}

/**
 * Mission control: the day's health report, archived on board, encrypted and sent to Earth over a
 * link with the light-time of the destination. Earth's receipt makes the trip back.
 */
export default function ControlCenter({
  member,
  mission,
  day,
}: {
  member: Member
  mission: MissionId
  day: number
}) {
  const report = useDayReport(member, day, mission)
  const sim = useSimulation()
  const [records, setRecords] = useState<ArchiveRecord[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState(false)
  const [urgent, setUrgent] = useState(report.signals.some((s) => s.level === 'act'))
  const [available, setAvailable] = useState(true)
  const [delay, setDelay] = useState(mission === 'moon' ? 3 : mission === 'orbit' ? 1 : 1200)
  const [now, setNow] = useState(loadClock)
  const [selected, setSelected] = useState<string | null>(null)
  const latest = useRef({ records, now, available, delay })
  latest.current = { records, now, available, delay }
  const ticking = useRef(false)

  useEffect(() => {
    let active = true
    listArchive()
      .then((rows) => {
        if (!active) return
        setRecords(rows)
        setReady(true)
      })
      .catch(() => {
        if (active)
          setError('This browser will not let Pulsar save the report. Allow site storage, then try again.')
      })
    return () => {
      active = false
    }
  }, [])

  // While something is on the way, the link clock runs.
  const moving = records.some(
    (r) => r.state === 'queued' || r.state === 'in-flight' || r.state === 'received',
  )
  useEffect(() => {
    if (!moving) return
    const id = window.setInterval(async () => {
      if (ticking.current) return
      ticking.current = true
      try {
        const { records: before, now: then, available: link, delay: light } = latest.current
        // A report keeps the delay it left with: the clock runs as fast as the longest trip under way.
        const longest = Math.max(
          light,
          ...before
            .filter((r) => r.state === 'in-flight' || r.state === 'received')
            .map((r) => r.delaySeconds ?? 0),
        )
        const clock = then + tickSeconds(longest)
        const next = advanceTransfers(before, { available: link, now: clock, delaySeconds: light })
        for (const r of next) {
          const old = before.find((b) => b.id === r.id)
          if (r === old) continue
          if ((r.state === 'received' || r.state === 'acknowledged') && !(await verifyArchive(r)))
            throw new Error('A report arrived damaged, so Earth did not confirm it.')
          await saveArchive(r)
        }
        setRecords(next)
        setNow(clock)
        try {
          localStorage.setItem(clockKey, String(clock))
        } catch {
          // The clock simply starts again next time.
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The link stopped. The reports are still on board.')
      } finally {
        ticking.current = false
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [moving])

  const mine = records.filter((r) => r.subject === member.id).sort((a, b) => b.createdAt - a.createdAt)
  const picked = mine.find((r) => r.id === selected) ?? mine[0]
  const action = async (job: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await job()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. The report is still saved on board.')
    } finally {
      setBusy(false)
    }
  }
  const prepare = () =>
    action(async () => {
      const snapshot =
        sim.active && sim.sim
          ? {
              origin: 'simulated',
              minute: sim.t,
              sample: sampleAt(sim.sim, sim.t),
              history: history ? sim.sim.samples.filter((s) => s.t <= sim.t) : undefined,
            }
          : null
      const packet = await createArchive(healthPacket(report, mission, history, snapshot), {
        subject: member.id,
        mission,
        day,
        priority: urgent ? 'urgent' : 'routine',
      })
      setRecords((all) => [...all, packet])
      setSelected(packet.id)
      setNotice('Report prepared and saved on board. Send it when you are ready.')
    })
  const send = (record: ArchiveRecord) =>
    action(async () => {
      if (!(await verifyArchive(record)))
        throw new Error('This report does not match its seal, so it was not sent.')
      const next = advanceTransfers(
        records.map((r) => (r.id === record.id ? queueTransfer(r, now) : r)),
        { available, now, delaySeconds: delay },
      )
      for (const row of next) if (row !== records.find((r) => r.id === row.id)) await saveArchive(row)
      setRecords(next)
    })

  const alerts = report.signals.filter((s) => s.level !== 'ok').length
  const eyes = medicalRecord(member.id, mission).ocular
  const travelling = mine
    .map((r) => ({ r, ...place(r, now) }))
    .filter((x) => x.out !== null || x.back !== null)
  const sizes = picked
    ? [
        ['As written', picked.jsonBytes],
        ['Packed', picked.cborBytes],
        [picked.compression === 'gzip' ? 'Compressed' : 'Not compressed', picked.compressedBytes],
        ['Encrypted', picked.encrypted.byteLength],
      ]
    : []
  const largest = Math.max(1, ...sizes.map(([, n]) => n as number))

  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-4 pb-12 sm:px-6">
      <p className="font-cond text-[12px] tracking-[0.16em] text-dim uppercase">
        {member.short} · {MISSIONS[mission].name} · day {day}
      </p>
      <h2 className="mt-1 text-[clamp(24px,3vw,34px)] leading-tight font-semibold">
        Send your health report to Earth
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">
        The report is saved on board first, then sent over the link with the delay of your destination. Earth
        sends back a receipt, which makes the same trip.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title="Today's report">
          <ul className="mt-4 space-y-2.5 text-[14px]">
            <li className="flex items-center gap-2.5">
              <Heartbeat size={18} className="text-holo" />
              Vital signs and the readings of the day
            </li>
            <li className="flex items-center gap-2.5">
              <WarningCircle size={18} style={{ color: alerts ? LEVEL_LINE.watch : LEVEL_LINE.ok }} />
              {alerts ? `${alerts} signal${alerts === 1 ? '' : 's'} to check` : 'No signal to check'}
            </li>
            <li className="flex items-center gap-2.5">
              <Radioactive size={18} className="text-holo" />
              Radiation dose by organ
            </li>
            <li className="flex items-center gap-2.5">
              <Eye size={18} className="text-holo" />
              {eyes ? 'Your latest eye exam' : 'No eye exam recorded yet'}
            </li>
          </ul>
          <p className="mt-3 text-[13px] text-dim">Your portrait and camera images never go in.</p>
          <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
            <Switch on={history} onChange={setHistory}>
              {sim.active ? 'Add the day so far' : 'Add the history kept in this browser'}
            </Switch>
            <Switch on={urgent} onChange={setUrgent}>
              Mark it urgent: it leaves before the others
            </Switch>
          </div>
          <Button kind="primary" className="mt-5" disabled={!ready || busy} onClick={prepare}>
            <Archive size={17} />
            {busy ? 'Working…' : 'Prepare the report'}
          </Button>
        </Card>

        <Card
          title="Link to Earth"
          aside={
            <button
              onClick={() => setAvailable((v) => !v)}
              className="press rounded-full border border-line px-3 py-1 text-[13px] text-muted hover:text-ink"
            >
              {available ? 'Cut the link' : 'Restore the link'}
            </button>
          }
        >
          <p className="mt-1 flex items-center gap-2 text-[14px]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: available ? '#6fd0ec' : LEVEL_LINE.watch }}
              aria-hidden="true"
            />
            {available ? `Connected · ${duration(delay)} each way` : 'No contact: reports wait on board'}
          </p>
          {/* The ship on the left, Earth on the right; reports travel along the line, receipts come back under it. */}
          <div className="mt-5 flex items-center gap-3" aria-hidden="true">
            <RocketLaunch size={26} className="shrink-0 text-white/80" />
            <div className="relative h-12 flex-1">
              <div
                className={`absolute inset-x-0 top-1/2 border-t-2 border-dashed ${available ? 'border-holo/50' : 'border-check/50'}`}
              />
              <AnimatePresence>
                {travelling.map(({ r, out, back }) => (
                  <motion.span
                    key={`${r.id}:${out === null ? 'back' : 'out'}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute h-3 w-3 -translate-x-1/2 rounded-full ${out !== null ? 'top-[calc(50%-14px)] bg-holo shadow-[0_0_12px_#6fd0ec]' : 'top-[calc(50%+3px)] bg-white'}`}
                    style={{
                      left: `${(out ?? 1 - (back ?? 0)) * 100}%`,
                      transition: `left ${TICK_MS}ms linear`,
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
            <GlobeHemisphereWest size={28} className="shrink-0 text-white/80" />
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Distance to Earth">
            {DELAYS.map((d) => (
              <button
                key={d.seconds}
                onClick={() => setDelay(d.seconds)}
                aria-pressed={delay === d.seconds}
                className={`press rounded-full px-3 py-1.5 text-[13px] ${delay === d.seconds ? 'bg-white text-[#0d0f12]' : 'bg-white/[0.06] text-muted hover:text-ink'}`}
              >
                {d.label} · {d.time}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-dim">
            A report takes {duration(delay)} to reach Earth, and the receipt as long to come back.
            {delay >= 60 ? ' Time runs 60 times faster here, so you can watch it happen.' : ''}
          </p>
        </Card>
      </div>

      <div className="mt-5" />
      <Card
        title="Reports"
        aside={
          <span className="font-cond text-[13px] text-muted">
            {mine.length} on board
            {mine.length ? `, ${mine.filter((r) => r.state === 'acknowledged').length} confirmed` : ''}
          </span>
        }
      >
        {!mine.length ? (
          <p className="mt-4 rounded-xl border border-dashed border-line-strong px-5 py-6 text-[14px] text-muted">
            No report yet. Prepare one above, then send it.
          </p>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <ul className="space-y-1.5">
              {mine.map((r) => {
                const step = STEPS.indexOf(r.state)
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelected(r.id)}
                      aria-pressed={picked?.id === r.id}
                      className={`press w-full rounded-xl px-3 py-2.5 text-left ${picked?.id === r.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[14px] font-medium">
                          {new Date(r.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {MISSIONS[r.mission as MissionId]?.name ?? r.mission}, day {r.day}
                        </span>
                        {r.priority === 'urgent' && (
                          <span className="rounded-full bg-check/15 px-2 py-0.5 font-cond text-[12px] text-check">
                            Urgent
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="flex gap-1" aria-hidden="true">
                          {STEPS.map((s, i) => (
                            <span
                              key={s}
                              className={`h-1.5 w-6 rounded-full ${i <= step ? 'bg-holo' : 'bg-white/10'}`}
                            />
                          ))}
                        </span>
                        <span className="flex items-center gap-1.5 text-[13px] text-muted">
                          {r.state === 'acknowledged' && (
                            <CheckCircle size={14} weight="fill" className="text-holo" />
                          )}
                          {STATE[r.state]}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {picked && (
              <div className="rounded-xl bg-white/[0.03] p-4">
                <p className="font-cond text-[12px] tracking-[0.12em] text-dim uppercase">
                  Report {picked.id.slice(0, 8)}
                </p>
                <dl className="mt-3 space-y-2">
                  {sizes.map(([label, n]) => (
                    <div key={label as string}>
                      <div className="flex justify-between gap-4 text-[13px]">
                        <dt className="text-muted">{label}</dt>
                        <dd className="tabular-nums">{bytes(n as number)}</dd>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-holo/70"
                          style={{ width: `${(100 * (n as number)) / largest}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
                  <LockKey size={15} className="mt-0.5 shrink-0" />
                  Encrypted with AES-256 and sealed with SHA-256, so Earth can tell if anything changed on the
                  way.
                </p>
                <Button
                  kind="primary"
                  className="mt-4 w-full"
                  disabled={busy || picked.state !== 'archived'}
                  onClick={() => send(picked)}
                >
                  <PaperPlaneTilt size={16} />
                  {picked.state === 'archived' ? 'Send to Earth' : STATE[picked.state]}
                </Button>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                  <button
                    className="inline-flex items-center gap-1.5 text-muted underline-offset-4 hover:text-ink hover:underline"
                    onClick={() => downloadArchive(picked)}
                  >
                    <DownloadSimple size={14} />
                    Download, encrypted
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 text-muted underline-offset-4 hover:text-ink hover:underline"
                    onClick={() => downloadArchive(picked, true)}
                  >
                    <DownloadSimple size={14} />
                    Download, readable
                  </button>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">
                    See what is inside
                  </summary>
                  <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-ground p-3 text-[11px] break-all whitespace-pre-wrap text-muted">
                    {picked.json}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}
      </Card>

      {(error || notice) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`mt-5 flex items-center gap-2 text-[14px] ${error ? 'text-check' : 'text-ink'}`}
        >
          {error ? (
            <WarningCircle size={16} weight="fill" />
          ) : (
            <CheckCircle size={16} weight="fill" className="text-holo" />
          )}
          {error || notice}
        </p>
      )}
    </div>
  )
}
