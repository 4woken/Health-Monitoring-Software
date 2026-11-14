import { describe, expect, it } from 'vitest'
import {
  BpmSmoother,
  RPPG,
  bandpass,
  detrend,
  estimate,
  fft,
  findBeats,
  pos,
  qualityFromSnr,
  resample,
  spectralPeak,
  type RgbSample,
} from './rppg'

/** Small seeded generator, so every run sees the same "random" camera. */
function rng(seed: number) {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform())
  return { uniform, gauss }
}

interface Camera {
  bpm?: number
  seconds?: number
  seed?: number
  /** Relative pulse amplitude in the green channel. */
  amplitude?: number
  /** Sensor noise, in 0-255 units, after averaging the skin pixels. */
  noise?: number
}

/**
 * A webcam watching skin: average colour of a face region, a pulse shared out between the
 * channels like blood absorption (green strongest), slow light drift, sensor noise, frame
 * times that wobble and the odd dropped frame.
 */
function camera({ bpm, seconds = 12, seed = 1, amplitude = 0.0025, noise = 0.12 }: Camera): RgbSample[] {
  const { uniform, gauss } = rng(seed)
  const base = { r: 172, g: 124, b: 104 }
  const share = { r: 0.33, g: 0.77, b: 0.53 }
  const out: RgbSample[] = []
  const f = (bpm ?? 0) / 60
  for (let i = 0; i < seconds * 30; i++) {
    if (uniform() < 0.03) continue // dropped frame
    const t = i * (1000 / 30) + (uniform() - 0.5) * 16
    const s = t / 1000
    const pulse = bpm ? Math.sin(2 * Math.PI * f * s) + 0.3 * Math.sin(4 * Math.PI * f * s + 0.6) : 0
    const light = 1 + 0.04 * Math.sin(2 * Math.PI * 0.07 * s) + 0.01 * s
    const px = (c: 'r' | 'g' | 'b') =>
      base[c] * light * (1 + (amplitude / share.g) * share[c] * pulse) + noise * gauss()
    out.push({ t: 5000 + t, r: px('r'), g: px('g'), b: px('b') })
  }
  return out
}

const std = (x: ArrayLike<number>) => {
  const a = Array.from(x)
  const m = a.reduce((s, v) => s + v, 0) / a.length
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length)
}

describe('pulse estimate on a simulated camera', () => {
  it('estimates the injected rate with CHROM using the same uneven RGB samples', () => {
    for (const bpm of [60, 72, 90, 130]) {
      const measured = estimate(camera({ bpm, seed: 7 }), 'chrom')
      expect(measured.bpm).not.toBeNull()
      expect(Math.abs(measured.bpm! - bpm)).toBeLessThan(2)
      expect(measured.quality).toBeGreaterThanOrEqual(RPPG.qualityThreshold)
    }
  })

  it('keeps CHROM empty on a static face or an incomplete capture', () => {
    const stable = camera({ bpm: 72 }).map(({ t }) => ({ t, r: 70, g: 50, b: 30 }))
    expect(estimate(stable, 'chrom').bpm).toBeNull()
    expect(estimate(camera({ seconds: 2, bpm: 72 }), 'chrom').bpm).toBeNull()
  })

  it('finds 72 bpm with good quality despite noise, light drift and uneven frames', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = estimate(camera({ bpm: 72, seed }))
      expect(e.bpm, `seed ${seed}`).not.toBeNull()
      expect(Math.abs(e.bpm! - 72), `seed ${seed}`).toBeLessThanOrEqual(2)
      expect(e.quality, `seed ${seed}`).toBeGreaterThanOrEqual(RPPG.qualityThreshold)
    }
  })

  it('follows other rates across the band', () => {
    for (const bpm of [48, 60, 95, 130, 165]) {
      const e = estimate(camera({ bpm, seed: bpm }))
      expect(Math.abs(e.bpm! - bpm), `${bpm} bpm`).toBeLessThanOrEqual(2)
    }
  })

  it('gives low quality when there is no pulse at all', () => {
    const q = [11, 12, 13, 14, 15, 16, 17, 18].map((seed) => estimate(camera({ seed })).quality)
    expect(Math.max(...q)).toBeLessThan(RPPG.qualityThreshold)
  })

  it('returns a display wave between -1 and 1 and beats about once per period', () => {
    const e = estimate(camera({ bpm: 72, seed: 7 }))
    expect(e.wave.length).toBeGreaterThan(RPPG.waveSeconds * 30 - 5)
    expect(Math.max(...e.wave.map(Math.abs))).toBeLessThanOrEqual(1)
    // About 12 beats in the 10 s analysed at 72 bpm.
    expect(e.beats.length).toBeGreaterThanOrEqual(10)
    expect(e.beats.length).toBeLessThanOrEqual(14)
    const gaps = e.beats.slice(1).map((t, i) => t - e.beats[i])
    const median = [...gaps].sort((a, b) => a - b)[gaps.length >> 1]
    expect(median).toBeGreaterThan(780)
    expect(median).toBeLessThan(880)
  })

  it('needs a few seconds of signal before giving a rate', () => {
    const e = estimate(camera({ bpm: 72, seconds: 2 }))
    expect(e.bpm).toBeNull()
    expect(e.quality).toBe(0)
  })

  it('never throws on empty, tiny, flat or broken input', () => {
    const cases: RgbSample[][] = [
      [],
      [{ t: 0, r: 100, g: 100, b: 100 }],
      [
        { t: 0, r: 100, g: 100, b: 100 },
        { t: 0, r: 100, g: 100, b: 100 },
      ],
      Array.from({ length: 400 }, (_, i) => ({ t: i * 33, r: 120, g: 120, b: 120 })),
      Array.from({ length: 400 }, (_, i) => ({ t: i * 33, r: Number.NaN, g: 1, b: 1 })),
      Array.from({ length: 400 }, (_, i) => ({ t: i * 33, r: 0, g: 0, b: 0 })),
    ]
    for (const c of cases) {
      const e = estimate(c)
      expect(Number.isFinite(e.quality)).toBe(true)
      expect(e.bpm === null || Number.isFinite(e.bpm)).toBe(true)
      expect(e.wave.every(Number.isFinite)).toBe(true)
    }
  })
})

describe('signal steps', () => {
  it('resamples uneven samples by linear interpolation', () => {
    const u = resample(
      [
        { t: 0, r: 0, g: 10, b: 20 },
        { t: 100, r: 30, g: 10, b: 50 },
      ],
      30,
    )!
    expect(u.r.length).toBe(4)
    expect(u.r[1]).toBeCloseTo(10, 6)
    expect(u.b[3]).toBeCloseTo(50, 6)
    expect(u.g.every((v) => v === 10)).toBe(true)
  })

  it('skips broken and repeated timestamps', () => {
    const u = resample(
      [
        { t: 0, r: 1, g: 1, b: 1 },
        { t: Number.NaN, r: 9, g: 9, b: 9 },
        { t: 0, r: 5, g: 5, b: 5 },
        { t: 200, r: 1, g: 1, b: 1 },
      ],
      30,
    )!
    expect(u.r.every((v) => v === 1)).toBe(true)
  })

  it('POS cancels a change of light that hits all channels equally', () => {
    const n = 300
    const r = new Float64Array(n)
    const g = new Float64Array(n)
    const b = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const light = 1 + 0.05 * Math.sin((2 * Math.PI * 1.1 * i) / 30)
      r[i] = 170 * light
      g[i] = 120 * light
      b[i] = 100 * light
    }
    expect(std(pos(r, g, b, 30))).toBeLessThan(1e-9)
  })

  it('POS keeps a colour change shaped like blood volume', () => {
    const n = 300
    const r = new Float64Array(n)
    const g = new Float64Array(n)
    const b = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const p = 0.002 * Math.sin((2 * Math.PI * 1.1 * i) / 30)
      r[i] = 170 * (1 + 0.43 * p)
      g[i] = 120 * (1 + p)
      b[i] = 100 * (1 + 0.69 * p)
    }
    expect(std(pos(r, g, b, 30))).toBeGreaterThan(1e-4)
  })

  it('band-pass keeps the pulse band and removes slow drift', () => {
    const n = 600
    const fast = new Float64Array(n)
    const slow = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      fast[i] = Math.sin((2 * Math.PI * 1.5 * i) / 30)
      slow[i] = Math.sin((2 * Math.PI * 0.15 * i) / 30)
    }
    const mid = (x: Float64Array) => x.subarray(120, 480)
    expect(std(mid(bandpass(fast))) / std(mid(fast))).toBeGreaterThan(0.95)
    expect(std(mid(bandpass(slow))) / std(mid(slow))).toBeLessThan(0.05)
  })

  it('detrend removes a straight line', () => {
    const x = Float64Array.from({ length: 50 }, (_, i) => 3 + 0.5 * i)
    expect(std(detrend(x))).toBeLessThan(1e-9)
  })

  it('FFT matches a direct Fourier transform', () => {
    const { gauss } = rng(42)
    const n = 16
    const x = Array.from({ length: n }, gauss)
    const re = Float64Array.from(x)
    const im = new Float64Array(n)
    fft(re, im)
    for (let k = 0; k < n; k++) {
      let sr = 0
      let si = 0
      for (let t = 0; t < n; t++) {
        sr += x[t] * Math.cos((-2 * Math.PI * k * t) / n)
        si += x[t] * Math.sin((-2 * Math.PI * k * t) / n)
      }
      expect(re[k]).toBeCloseTo(sr, 9)
      expect(im[k]).toBeCloseTo(si, 9)
    }
  })

  it('reads the peak frequency between FFT bins', () => {
    const x = Float64Array.from({ length: 300 }, (_, i) => Math.sin((2 * Math.PI * 1.234 * i) / 30))
    const peak = spectralPeak(x, 30)!
    expect(peak.hz).toBeCloseTo(1.234, 2)
    expect(peak.snrDb).toBeGreaterThan(10)
  })

  it('maps SNR to quality between 0 and 1', () => {
    expect(qualityFromSnr(-20)).toBe(0)
    expect(qualityFromSnr(30)).toBe(1)
    expect(qualityFromSnr(Number.NaN)).toBe(0)
    expect(qualityFromSnr((RPPG.snrFloorDb + RPPG.snrGoodDb) / 2)).toBeCloseTo(0.5, 6)
  })

  it('finds beats at least the minimum gap apart', () => {
    const x = Float64Array.from({ length: 300 }, (_, i) => Math.sin((2 * Math.PI * 1 * i) / 30))
    const beats = findBeats(x, 15)
    expect(beats.length).toBe(10)
    for (let i = 1; i < beats.length; i++) expect(beats[i] - beats[i - 1]).toBeGreaterThanOrEqual(15)
  })

  it('smooths the shown rate with a running median', () => {
    const s = new BpmSmoother(3)
    expect(s.value()).toBeNull()
    s.push(70)
    s.push(90)
    expect(s.push(72)).toBe(72)
    expect(s.push(Number.NaN)).toBe(72)
    s.reset()
    expect(s.value()).toBeNull()
  })
})
