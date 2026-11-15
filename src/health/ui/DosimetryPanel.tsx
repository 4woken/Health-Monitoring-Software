import { useRef, useState } from 'react'
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import {
  DOSIMETRY_SOURCE,
  ORGAN_LIMIT_SOURCE,
  ORGANS,
  RBE,
  exampleDosimetry,
  organExposure,
  validateDosimetry,
} from '../dosimetry'
import { saveMedicalRecord, useMedicalRecord } from '../medicalRecords'
import { EMPTY_EYE, OCULAR_SOURCE, reviewEye, type EyeExam, type OcularExam } from '../ocular'
import { Button, LEVEL_LINE } from '../../ui'

const PARTICLE: Record<keyof typeof RBE, string> = {
  proton: 'Protons',
  heavyIon: 'Heavy ions',
  neutronBelow1MeV: 'Neutrons under 1 MeV',
  neutron1To5MeV: 'Neutrons 1 to 5 MeV',
  neutronAbove5MeV: 'Neutrons over 5 MeV',
}

/** One dose against its limit: a bar that turns amber past half and red at the limit. */
function Gauge({
  label,
  dose,
  limit,
  partial,
}: {
  label: string
  dose: number
  limit: number | null
  partial?: boolean
}) {
  const share = limit ? dose / limit : 0
  const color = share >= 1 ? LEVEL_LINE.act : share >= 0.5 ? LEVEL_LINE.watch : '#6fd0ec'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="text-ink tabular-nums">
          {limit === null
            ? 'no limit'
            : `${dose < 10 ? dose.toFixed(1) : Math.round(dose)} of ${limit}${partial ? '+' : ''}`}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        {limit !== null && (
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100))}%`,
              background: color,
            }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The radiation each organ has taken, against NASA's limits for 30 days, a year and a career. The
 * doses can be imported from a radiation team's file; the eye panel adds the person's eye exams.
 */
export default function DosimetryPanel({
  memberId,
  mission,
  day,
  eye = false,
}: {
  memberId: string
  mission: string
  day: number
  eye?: boolean
}) {
  const record = useMedicalRecord(memberId, mission)
  const dataset = record.dosimetry ?? exampleDosimetry(day)
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const organs = eye ? ORGANS.filter((o) => o === 'lens') : ORGANS
  const exported = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'pulsar-organ-dose.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="space-y-4 border-t border-line-soft pt-5" aria-label="Dose by organ">
      <div>
        <h3 className="text-[17px] font-semibold">{eye ? 'Radiation at the eye lens' : 'Dose by organ'}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          In mGy-Eq: the dose each organ absorbs, weighted by how hard each kind of particle hits. That is why
          it differs from the badge reading in mSv.
        </p>
      </div>
      <ul className="space-y-4">
        {organs.map((organ) => {
          const r = organExposure(dataset, organ, day)
          return (
            <li key={organ} className="rounded-xl bg-white/[0.03] p-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-[14px] font-medium">{r.limits.name}</h4>
                <span className="font-cond text-[13px] text-muted tabular-nums">
                  {r.mission.dose.toFixed(1)} mGy-Eq this mission
                </span>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                <Gauge
                  label="30 days"
                  dose={r.month.dose}
                  limit={r.limits.month}
                  partial={!r.month.complete}
                />
                <Gauge label="One year" dose={r.year.dose} limit={r.limits.year} partial={!r.year.complete} />
                <Gauge
                  label="Career"
                  dose={r.career ?? r.careerLowerBound}
                  limit={r.limits.career}
                  partial={r.career === null}
                />
              </div>
              {r.exceeded && (
                <p role="alert" className="mt-3 text-[13px]" style={{ color: LEVEL_LINE.act }}>
                  At its limit. Go over the exposure and the shielding with the radiation team.
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[12.5px] leading-relaxed text-dim">
        A + means some days have no reading, so the total is a minimum. Staying under a limit lowers the risk;
        it does not remove it.
      </p>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-ink">How it is calculated</summary>
        <p className="mt-3 leading-relaxed text-muted">
          For each organ, the absorbed dose of each kind of particle is multiplied by its weight, then added
          up. Pulsar starts from doses already worked out per organ; it does not model the shielding itself.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
          {(Object.keys(RBE) as (keyof typeof RBE)[]).map((key) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-muted">{PARTICLE[key]}</dt>
              <dd className="tabular-nums">× {RBE[key]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={DOSIMETRY_SOURCE}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            NASA's organ dose model
          </a>
          <a
            href={ORGAN_LIMIT_SOURCE}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            NASA's organ limits
          </a>
        </p>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button kind="ghost" size="sm" onClick={exported}>
          <DownloadSimple size={15} />
          Export the doses
        </Button>
        <Button kind="ghost" size="sm" onClick={() => file.current?.click()}>
          <UploadSimple size={15} />
          Import organ doses
        </Button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Import organ doses from a JSON file"
        onChange={async (e) => {
          const selected = e.target.files?.[0]
          if (!selected) return
          try {
            if (selected.size > 4_000_000) throw new Error('Choose a file under 4 MB.')
            const data = validateDosimetry(JSON.parse(await selected.text()))
            saveMedicalRecord(memberId, mission, { dosimetry: data })
            setError('')
          } catch (err) {
            setError(err instanceof Error ? err.message : 'This file could not be read.')
          }
          e.target.value = ''
        }}
      />
      {error && (
        <p role="alert" className="text-[13px] text-check">
          {error}
        </p>
      )}
      {eye && <EyeExams key={`${memberId}:${mission}`} memberId={memberId} mission={mission} />}
    </section>
  )
}

const FIELDS: {
  key: keyof Pick<EyeExam, 'baselineTrtUm' | 'trtUm' | 'baselineRefractionD' | 'refractionD' | 'iopMmHg'>
  label: string
  unit: string
}[] = [
  { key: 'baselineTrtUm', label: 'Retina thickness before flight', unit: 'µm' },
  { key: 'trtUm', label: 'Retina thickness now', unit: 'µm' },
  { key: 'baselineRefractionD', label: 'Refraction before flight', unit: 'D' },
  { key: 'refractionD', label: 'Refraction now', unit: 'D' },
  { key: 'iopMmHg', label: 'Eye pressure', unit: 'mmHg' },
]
/** Findings from an exam, in plain words. */
const FINDING: Record<string, string> = {
  'OCT retinal thickness increased by at least 20 µm': 'the retina is at least 20 µm thicker',
  'Hyperopic shift of at least +0.75 D': 'a shift of +0.75 D or more toward farsightedness',
  'Chorioretinal folds recorded': 'folds at the back of the eye',
  'Posterior globe flattening recorded': 'the back of the eye is flattened',
}

function EyeExams({ memberId, mission }: { memberId: string; mission: string }) {
  const saved = useMedicalRecord(memberId, mission).ocular
  const [exam, setExam] = useState<OcularExam>(
    saved ?? {
      source: '',
      measuredAt: '',
      origin: 'entered-exam',
      left: { ...EMPTY_EYE },
      right: { ...EMPTY_EYE },
    },
  )
  const [message, setMessage] = useState('')
  const input = 'mt-1 w-full rounded-lg border border-line-strong bg-ground px-2.5 py-2 text-[14px] text-ink'
  return (
    <section className="border-t border-line-soft pt-5" aria-label="Eye exams">
      <h3 className="text-[17px] font-semibold">Eye exams</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        NASA follows the retina scan (OCT), refraction, the back of the eye, eye pressure and an ultrasound.
        Enter your latest exam here: the webcam vision test cannot measure these.
      </p>
      {saved && (
        <ul className="mt-3 space-y-1.5">
          {(['left', 'right'] as const).map((side) => {
            const review = reviewEye(saved[side])
            return (
              <li
                key={side}
                className="text-[14px]"
                style={{ color: review.needsReview ? LEVEL_LINE.watch : undefined }}
              >
                <span className="text-muted">{side === 'left' ? 'Left eye' : 'Right eye'}: </span>
                {review.needsReview
                  ? `to review with the flight surgeon: ${review.findings.map((f) => FINDING[f] ?? f).join(', ')}.`
                  : review.complete
                    ? 'nothing to review.'
                    : 'the exam is not complete.'}
              </li>
            )
          })}
        </ul>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-[14px] text-ink underline underline-offset-4">
          {saved ? 'Update the exam' : 'Record an eye exam'}
        </summary>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            try {
              if (!exam.source.trim() || !exam.measuredAt || !Number.isFinite(Date.parse(exam.measuredAt)))
                throw new Error('Add when and where the exam was done.')
              const clean = { ...exam, measuredAt: new Date(exam.measuredAt).toISOString() }
              saveMedicalRecord(memberId, mission, { ocular: clean })
              setMessage('Exam saved in this browser.')
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'The exam could not be saved.')
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12.5px] text-muted">
              Where it was done
              <input
                required
                className={input}
                value={exam.source}
                onChange={(e) => setExam({ ...exam, source: e.target.value })}
                placeholder="Device, examiner"
              />
            </label>
            <label className="block text-[12.5px] text-muted">
              When
              <input
                required
                type="datetime-local"
                className={input}
                value={
                  exam.measuredAt
                    ? new Date(
                        Date.parse(exam.measuredAt) - new Date(exam.measuredAt).getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ''
                }
                onChange={(e) => setExam({ ...exam, measuredAt: e.target.value })}
              />
            </label>
          </div>
          {(['left', 'right'] as const).map((side) => (
            <fieldset key={side} className="space-y-3 rounded-xl bg-white/[0.03] p-3.5">
              <legend className="px-1 text-[14px] font-medium">
                {side === 'left' ? 'Left eye' : 'Right eye'}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map(({ key, label, unit }) => (
                  <label key={key} className="text-[12.5px] text-muted">
                    {label} ({unit})
                    <input
                      type="number"
                      step="any"
                      min={key === 'baselineRefractionD' || key === 'refractionD' ? undefined : 0}
                      className={input}
                      value={exam[side][key] ?? ''}
                      onChange={(e) =>
                        setExam({
                          ...exam,
                          [side]: {
                            ...exam[side],
                            [key]: e.target.value === '' ? null : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
                {(['folds', 'flattening'] as const).map((key) => (
                  <label key={key} className="text-[12.5px] text-muted">
                    {key === 'folds' ? 'Folds at the back of the eye' : 'Back of the eye flattened'}
                    <select
                      className={input}
                      value={exam[side][key] === null ? '' : String(exam[side][key])}
                      onChange={(e) =>
                        setExam({
                          ...exam,
                          [side]: {
                            ...exam[side],
                            [key]: e.target.value === '' ? null : e.target.value === 'true',
                          },
                        })
                      }
                    >
                      <option value="">Not checked</option>
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <Button size="sm" type="submit">
            Save the exam
          </Button>
          {message && (
            <p role="status" className="text-[13px]">
              {message}
            </p>
          )}
        </form>
      </details>
      <p className="mt-3 text-[12.5px] leading-relaxed text-dim">
        What calls for a review: a retina 20 µm thicker or more, a shift of +0.75 D or more toward
        farsightedness, folds or flattening at the back of the eye. A review is not a diagnosis.{' '}
        <a href={OCULAR_SOURCE} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          NASA's clinical update
        </a>
      </p>
    </section>
  )
}
