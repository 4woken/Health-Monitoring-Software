import { describe, expect, it } from 'vitest'
import { digitFor, isTarget, makeKey, nBackSequence, nextSymbol, scoreNBack } from './cognition/cognition'
import { answer, DIGITS, DIN, dinDone, srt, startDin, triplet, voiceVolume } from './hearing/din'
import { dicksonIndex, PulseTrace, ruffierBand, ruffierIndex } from './heart/ruffier'
import { parseHeartRate } from './heart/strap'
import { judgeScore } from './judge'
import { nextWait, PVT, summarize } from './reaction/pvt'
import { baselineOf, median } from './results'
import { result } from './testing'

/** A repeatable random sequence. */
function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe('usual result', () => {
  it('is the median of the first three runs, once there are three', () => {
    const runs = [result('reaction', 1, 300), result('reaction', 2, 280), result('reaction', 3, 320)]
    expect(baselineOf(runs.slice(0, 2)).usual).toBeUndefined()
    expect(baselineOf(runs)).toEqual({ runs: 3, usual: 300 })
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('flags a run that is too far from the usual one, in the right direction', () => {
    const earlier = [result('reaction', 1, 300), result('reaction', 2, 300), result('reaction', 3, 300)]
    const judge = (score: number) =>
      judgeScore({ score, earlier, better: 'lower', worse: { ratio: 0.1 }, format: (v) => `${v} ms` })
    expect(judge(329).level).toBe('ok')
    expect(judge(330).level).toBe('watch')
    expect(judge(250).note).toMatch(/Better/)
  })

  it('uses a plain limit only while the usual result is being set', () => {
    const limit = { flag: (s: number) => s > 15, note: 'Slow.' }
    const first = judgeScore({
      score: 16,
      earlier: [],
      better: 'lower',
      worse: { ratio: 0.2 },
      format: String,
      limit,
    })
    expect(first.level).toBe('watch')
    expect(first.note).toMatch(/Run 1 of 3/)
  })
})

describe('reaction test', () => {
  it('counts lapses from 355 ms and leaves out presses before the counter', () => {
    const s = summarize([250, 300, 355, 400, 60, 280], 2)
    expect(s.lapses).toBe(2)
    expect(s.trials).toBe(5)
    expect(s.medianMs).toBe(300)
    expect(s.falseStarts).toBe(2)
  })

  it('waits 1 to 4 seconds between counters', () => {
    expect(nextWait(() => 0)).toBe(PVT.waitMinMs)
    expect(nextWait(() => 0.999)).toBeLessThan(PVT.waitMaxMs)
  })
})

describe('thinking test', () => {
  it('pairs each digit with one symbol, with a new key each run', () => {
    const key = makeKey(seeded(3))
    expect([...key].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    for (let d = 1; d <= 9; d++) expect(digitFor(key, key[d - 1])).toBe(d)
    const random = seeded(5)
    let s = 0
    for (let i = 0; i < 200; i++) {
      const next = nextSymbol(s, random)
      expect(next).not.toBe(s)
      s = next
    }
  })

  it('builds a 2-back with the planned number of matches and scores it', () => {
    const seq = nBackSequence(seeded(11))
    const targets = seq.map((_, i) => isTarget(seq, i))
    expect(targets.filter(Boolean)).toHaveLength(9)
    expect(scoreNBack(seq, targets).accuracy).toBe(100)
    expect(
      scoreNBack(
        seq,
        seq.map(() => true),
      ).accuracy,
    ).toBe(50)
  })
})

describe('hearing test', () => {
  it('plays three different one-syllable digits', () => {
    const random = seeded(2)
    for (let i = 0; i < 50; i++) {
      const t = triplet(random)
      expect(new Set(t).size).toBe(3)
      for (const d of t) expect(DIGITS).toContain(d)
    }
  })

  it('steps 2 dB down after a right answer and up after a wrong one, and averages the last 21', () => {
    let s = startDin()
    s = answer(s, true)
    expect(s.snrs).toEqual([0, -2])
    s = answer(s, false)
    expect(s.snrs[2]).toBe(0)
    let all = startDin()
    for (let i = 0; i < DIN.trials; i++) all = answer(all, i % 2 === 0)
    expect(dinDone(all)).toBe(true)
    expect(srt(all)).toBeCloseTo(-1, 0)
  })

  it('scores only playable speech levels and gets quieter immediately after a correct response at the ceiling', () => {
    let state = startDin()
    for (let i = 0; i < DIN.trials; i++) state = answer(state, false)
    const peak = state.snrs.at(-1)!
    expect(peak).toBeCloseTo(20 * Math.log10(1 / 0.3))
    expect(srt(state)).toBeLessThanOrEqual(Number(peak.toFixed(1)))
    expect(voiceVolume(answer(state, true).snrs.at(-1)!)).toBeLessThan(1)
  })

  it('keeps the voice between silent and full volume', () => {
    expect(voiceVolume(0)).toBeCloseTo(0.3)
    expect(voiceVolume(30)).toBe(1)
    expect(voiceVolume(-20)).toBeCloseTo(0.03)
  })
})

describe('pulse recovery', () => {
  it('computes the Ruffier and Dickson indices', () => {
    expect(ruffierIndex(60, 110, 70)).toBe(4)
    expect(ruffierBand(4)).toBe('very good')
    expect(dicksonIndex(60, 110, 70)).toBe(6)
    expect(ruffierBand(16)).toBe('weak')
  })

  it('takes the median of pulse readings in a time window', () => {
    const trace = new PulseTrace()
    for (const [t, bpm] of [
      [0, 70],
      [500, 72],
      [1000, 200],
      [1500, 74],
      [2000, 20],
    ])
      trace.push(t, bpm)
    expect(trace.between(0, 1500)).toBe(73)
    expect(trace.between(1600, 3000)).toBeNull()
    expect(trace.firstAfter(600)).toBe(1000)
  })
})

describe('heart-rate strap', () => {
  const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)
  it('reads 8-bit and 16-bit heart rates', () => {
    expect(parseHeartRate(view([0x00, 72])).bpm).toBe(72)
    expect(parseHeartRate(view([0x01, 0x2c, 0x01])).bpm).toBe(300)
  })
  it('reads beat-to-beat intervals after the energy field', () => {
    expect(parseHeartRate(view([0x10, 70, 0x00, 0x04])).rrMs).toEqual([1000])
    expect(parseHeartRate(view([0x18, 70, 0x10, 0x00, 0x00, 0x02])).rrMs).toEqual([500])
  })
})
