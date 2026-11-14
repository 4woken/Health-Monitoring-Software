// Remote photoplethysmography (rPPG): the pulse read from tiny colour changes of the skin
// filmed by a webcam. Pure functions, no DOM, so every step can be tested.
//
// Pipeline
//   1. Resample the uneven camera samples (time, mean R, G, B of the skin) to a fixed rate.
//   2. POS, "plane orthogonal to skin": Wang, den Brinker, Stuijk and de Haan, "Algorithmic
//      Principles of Remote PPG", IEEE Trans. Biomed. Eng. 64(7):1479-1491, 2017.
//   3. Remove the linear trend, then a zero-phase band-pass of 0.7 to 3.0 Hz (42 to 180 bpm).
//   4. Strongest frequency of the last 10 seconds (Hann window, zero padding, interpolated peak).
//   5. Quality from the spectral signal-to-noise ratio, in the style of de Haan and Jeanne
//      (IEEE Trans. Biomed. Eng. 60(10), 2013): power at the pulse and its first harmonic
//      against the rest of the band.
// This is an estimate for education and demos, not a medical measurement.

export type PulseMethod = 'pos' | 'chrom'

export interface RgbSample {
  /** Time in milliseconds (any monotonic clock). */
  t: number
  r: number
  g: number
  b: number
}

export const RPPG = {
  /** Fixed rate the samples are resampled to, Hz. */
  sampleRateHz: 30,
  /** POS sliding window, seconds. */
  posWindowS: 1.6,
  /** Pass band, Hz: 0.7 to 3.0 Hz is 42 to 180 beats per minute. */
  lowHz: 0.7,
  highHz: 3.0,
  /** Length of signal the pulse rate is read from, seconds. */
  spectrumWindowS: 10,
  /** Shortest signal worth analysing, seconds. */
  minSeconds: 4,
  /** Signal collected before the first estimate is shown, seconds. */
  warmupSeconds: 8,
  /** Waveform kept for display, seconds. */
  waveSeconds: 6,
  /** SNR (dB) mapped to quality 0 and quality 1. */
  snrFloorDb: -1,
  snrGoodDb: 7,
  /** Band-limited log-brightness RMS above which exposure correction starts. */
  exposureNoiseFloor: 0.005,
  /** Quality needed before a pulse rate is shown. */
  qualityThreshold: 0.35,
} as const

export interface Uniform {
  /** Time of the first resampled point, ms. */
  t0: number
  /** Step between points, ms. */
  dt: number
  r: Float64Array
  g: Float64Array
  b: Float64Array
}

const finite = (s: RgbSample) =>
  Number.isFinite(s.t) && Number.isFinite(s.r) && Number.isFinite(s.g) && Number.isFinite(s.b)

/** Linear interpolation of uneven samples onto a fixed grid. Null when there is too little. */
export function resample(samples: readonly RgbSample[], rateHz: number = RPPG.sampleRateHz): Uniform | null {
  const pts: RgbSample[] = []
  for (const s of samples) if (finite(s) && (pts.length === 0 || s.t > pts[pts.length - 1].t)) pts.push(s)
  if (pts.length < 2 || !(rateHz > 0)) return null
  const dt = 1000 / rateHz
  const t0 = pts[0].t
  const n = Math.floor((pts[pts.length - 1].t - t0) / dt + 1e-9) + 1
  if (n < 2) return null
  const r = new Float64Array(n)
  const g = new Float64Array(n)
  const b = new Float64Array(n)
  let j = 0
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt
    while (j < pts.length - 2 && pts[j + 1].t < t) j++
    const a = pts[j]
    const c = pts[j + 1]
    const u = Math.min(1, Math.max(0, (t - a.t) / (c.t - a.t)))
    r[i] = a.r + (c.r - a.r) * u
    g[i] = a.g + (c.g - a.g) * u
    b[i] = a.b + (c.b - a.b) * u
  }
  return { t0, dt, r, g, b }
}

function std(x: Float64Array, n = x.length): number {
  let m = 0
  for (let i = 0; i < n; i++) m += x[i]
  m /= n
  let v = 0
  for (let i = 0; i < n; i++) v += (x[i] - m) ** 2
  return Math.sqrt(v / n)
}

/**
 * POS: in each short window, divide every channel by its mean (so skin tone and light level
 * cancel), project onto the two axes orthogonal to the skin-tone direction, mix them so the
 * remaining distortion cancels, and add the windows up (overlap-add).
 */
export function pos(
  r: Float64Array,
  g: Float64Array,
  b: Float64Array,
  rateHz: number = RPPG.sampleRateHz,
  windowS: number = RPPG.posWindowS,
): Float64Array {
  const n = Math.min(r.length, g.length, b.length)
  const h = new Float64Array(n)
  const L = Math.max(2, Math.round(windowS * rateHz))
  if (n < L) return h
  const s1 = new Float64Array(L)
  const s2 = new Float64Array(L)
  const part = new Float64Array(L)
  for (let start = 0; start + L <= n; start++) {
    let mr = 0
    let mg = 0
    let mb = 0
    for (let k = 0; k < L; k++) {
      mr += r[start + k]
      mg += g[start + k]
      mb += b[start + k]
    }
    mr /= L
    mg /= L
    mb /= L
    if (!(mr > 0 && mg > 0 && mb > 0)) continue
    for (let k = 0; k < L; k++) {
      const cr = r[start + k] / mr
      const cg = g[start + k] / mg
      const cb = b[start + k] / mb
      s1[k] = cg - cb
      s2[k] = cg + cb - 2 * cr
    }
    const sd2 = std(s2)
    const alpha = sd2 > 1e-12 ? std(s1) / sd2 : 0
    let mean = 0
    for (let k = 0; k < L; k++) {
      part[k] = s1[k] + alpha * s2[k]
      mean += part[k]
    }
    mean /= L
    for (let k = 0; k < L; k++) h[start + k] += part[k] - mean
  }
  return h
}

/** CHROM (de Haan & Jeanne, 2013). Normalize per window, filter the two
 * chrominance channels, then overlap-add their variance-balanced difference. */
export function chrom(r: Float64Array, g: Float64Array, b: Float64Array, fs: number): Float64Array {
  const n = Math.min(r.length, g.length, b.length)
  const result = new Float64Array(n)
  const half = Math.max(2, Math.round(0.8 * fs))
  const width = 2 * half
  if (n < width) return result
  const x = new Float64Array(width)
  const y = new Float64Array(width)
  const hann = Float64Array.from({ length: width }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / width))
  // Mirror the window edges so every real sample, including the newest one, gets full overlap.
  const channels = [r, g, b].map((channel) =>
    Float64Array.from({ length: half + n + width - 1 }, (_, i) => {
      const at = i - half
      return channel[at < 0 ? -at : at >= n ? 2 * (n - 1) - at : at]
    }),
  )
  for (let start = 0; start < half + n; start += half) {
    const means = channels.map(
      (channel) => channel.subarray(start, start + width).reduce((sum, value) => sum + value, 0) / width,
    )
    if (means.some((mean) => mean <= 0)) continue
    for (let k = 0; k < width; k++) {
      const red = channels[0][start + k] / means[0] - 1
      const green = channels[1][start + k] / means[1] - 1
      const blue = channels[2][start + k] / means[2] - 1
      x[k] = 3 * red - 2 * green
      y[k] = 1.5 * red + green - 1.5 * blue
    }
    const filteredX = bandpass(x, fs)
    const filteredY = bandpass(y, fs)
    const spread = std(filteredY)
    if (spread <= 1e-12) continue
    const alpha = std(filteredX) / spread
    const first = start - half
    for (let k = Math.max(0, -first); k < Math.min(width, n - first); k++)
      result[first + k] += hann[k] * (filteredX[k] - alpha * filteredY[k])
  }
  return result
}

/** Removes the least-squares straight line. */
export function detrend(x: Float64Array): Float64Array {
  const n = x.length
  const out = new Float64Array(n)
  if (n < 2) return out
  const mt = (n - 1) / 2
  let mx = 0
  for (let i = 0; i < n; i++) mx += x[i]
  mx /= n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - mt) * (x[i] - mx)
    den += (i - mt) ** 2
  }
  const slope = den > 0 ? num / den : 0
  for (let i = 0; i < n; i++) out[i] = x[i] - mx - slope * (i - mt)
  return out
}

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** RBJ cookbook biquad, normalised by a0. */
function biquad(kind: 'low' | 'high', hz: number, rateHz: number, q: number): Biquad {
  const w = (2 * Math.PI * hz) / rateHz
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha
  const k = kind === 'low' ? (1 - cos) / 2 : (1 + cos) / 2
  return {
    b0: k / a0,
    b1: (kind === 'low' ? 1 - cos : -(1 + cos)) / a0,
    b2: k / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  }
}

/** Fourth-order Butterworth = two biquads with these Q values. */
const BUTTER4_Q = [1 / (2 * Math.cos(Math.PI / 8)), 1 / (2 * Math.cos((3 * Math.PI) / 8))]

function runBiquad(x: Float64Array, f: Biquad): void {
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2
    x2 = x1
    x1 = x0
    y2 = y1
    y1 = y0
    x[i] = y0
  }
}

/**
 * Zero-phase band-pass: fourth-order Butterworth high-pass and low-pass, run forward and then
 * backward, with odd reflection at both ends so the edges do not ring.
 */
export function bandpass(
  x: Float64Array,
  rateHz: number = RPPG.sampleRateHz,
  lowHz: number = RPPG.lowHz,
  highHz: number = RPPG.highHz,
): Float64Array {
  const n = x.length
  if (n < 4) return new Float64Array(n)
  const sections = BUTTER4_Q.flatMap((q) => [
    biquad('high', lowHz, rateHz, q),
    biquad('low', highHz, rateHz, q),
  ])
  const pad = Math.min(n - 1, Math.round(2 * rateHz))
  const y = new Float64Array(n + 2 * pad)
  for (let i = 0; i < pad; i++) y[i] = 2 * x[0] - x[pad - i]
  y.set(x, pad)
  for (let i = 0; i < pad; i++) y[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i]
  for (const s of sections) runBiquad(y, s)
  y.reverse()
  for (const s of sections) runBiquad(y, s)
  y.reverse()
  return y.slice(pad, pad + n)
}

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const next = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = next
      }
    }
  }
}

export interface Peak {
  /** Frequency of the strongest component in the band, Hz. */
  hz: number
  /** Power at the pulse and its harmonic against the rest of the band, dB. */
  snrDb: number
}

/** Strongest frequency in [lowHz, highHz] and its signal-to-noise ratio. */
export function spectralPeak(
  x: Float64Array,
  rateHz: number = RPPG.sampleRateHz,
  lowHz: number = RPPG.lowHz,
  highHz: number = RPPG.highHz,
): Peak | null {
  const n = x.length
  if (n < 2 * rateHz) return null
  let nfft = 1
  while (nfft < Math.max(2048, 4 * n)) nfft <<= 1
  const re = new Float64Array(nfft)
  const im = new Float64Array(nfft)
  let energy = 0
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    re[i] = x[i] * w
    energy += re[i] ** 2
  }
  if (!(energy > 1e-20) || !Number.isFinite(energy)) return null
  fft(re, im)
  const power = new Float64Array(nfft / 2 + 1)
  for (let k = 0; k < power.length; k++) power[k] = re[k] ** 2 + im[k] ** 2
  const hzPerBin = rateHz / nfft
  const kLo = Math.max(1, Math.ceil(lowHz / hzPerBin))
  const kHi = Math.min(power.length - 2, Math.floor(highHz / hzPerBin))
  if (kHi <= kLo) return null
  let best = kLo
  for (let k = kLo; k <= kHi; k++) if (power[k] > power[best]) best = k
  // Gaussian (log-parabolic) interpolation of the peak position.
  const la = Math.log(power[best - 1] + 1e-30)
  const lb = Math.log(power[best] + 1e-30)
  const lc = Math.log(power[best + 1] + 1e-30)
  const den = la - 2 * lb + lc
  const shift = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (la - lc)) / den)) : 0
  const hz = (best + shift) * hzPerBin
  // Signal: the main lobe around the pulse and around its first harmonic.
  const half = (1.2 * rateHz) / n
  let signal = 0
  let noise = 0
  for (let k = kLo; k <= kHi; k++) {
    const f = k * hzPerBin
    if (Math.abs(f - hz) <= half || Math.abs(f - 2 * hz) <= 2 * half) signal += power[k]
    else noise += power[k]
  }
  const snrDb = 10 * Math.log10((signal + 1e-30) / (noise + 1e-30))
  return { hz, snrDb }
}

/** Maps a signal-to-noise ratio to a quality between 0 and 1. */
export function qualityFromSnr(snrDb: number): number {
  if (!Number.isFinite(snrDb)) return 0
  return Math.min(1, Math.max(0, (snrDb - RPPG.snrFloorDb) / (RPPG.snrGoodDb - RPPG.snrFloorDb)))
}

/** Indices of beats: local maxima above a small threshold, at least `minGap` samples apart. */
export function findBeats(x: Float64Array, minGap: number): number[] {
  const n = x.length
  if (n < 3) return []
  const threshold = 0.3 * std(x)
  const beats: number[] = []
  for (let i = 1; i < n - 1; i++) {
    if (!(x[i] > threshold && x[i] > x[i - 1] && x[i] >= x[i + 1])) continue
    const last = beats[beats.length - 1]
    if (last !== undefined && i - last < minGap) {
      if (x[i] > x[last]) beats[beats.length - 1] = i
    } else beats.push(i)
  }
  return beats
}

export interface Estimate {
  /** Strongest pulse frequency in beats per minute, or null when there is too little signal. */
  bpm: number | null
  snrDb: number
  /** 0 to 1. Compare with RPPG.qualityThreshold before showing bpm. */
  quality: number
  /** Seconds of signal analysed. */
  seconds: number
  /** Last RPPG.waveSeconds of the filtered pulse wave, about -1 to 1, oldest first. */
  wave: number[]
  /** Times (ms, same clock as the samples) of beats found in the analysed window. */
  beats: number[]
}

const EMPTY: Estimate = { bpm: null, snrDb: -Infinity, quality: 0, seconds: 0, wave: [], beats: [] }

/**
 * Estimate the common exposure change from the mean log RGB. Under a moving
 * shadow or auto-exposure, cameras can apply a different gain to each channel.
 * Regress only this in-band, shared component out of the channel differences.
 * On a steady face the small natural pulse modulation is left untouched.
 */
function correctExposure(u: Uniform, fs: number): Float64Array | null {
  const channels = [u.r, u.g, u.b]
  if (channels.some((channel) => channel.some((value) => value <= 0))) return null
  const logs = channels.map((channel) => channel.map(Math.log))
  const common = logs[0].map((r, i) => (r + logs[1][i] + logs[2][i]) / 3)
  const reference = bandpass(detrend(common), fs)
  const mean = reference.reduce((sum, value) => sum + value, 0) / reference.length
  const centered = reference.map((value) => value - mean)
  const power = centered.reduce((sum, value) => sum + value * value, 0)
  const rms = Math.sqrt(power / centered.length)
  if (rms <= RPPG.exposureNoiseFloor) return null
  const strength = Math.min(1, (rms - RPPG.exposureNoiseFloor) / RPPG.exposureNoiseFloor)
  for (const [channel, signal] of channels.entries()) {
    const filtered = bandpass(detrend(logs[channel]), fs)
    const covariance = filtered.reduce((sum, value, i) => sum + value * centered[i], 0)
    // Match channel gain to the average. Bound the correction if colour
    // variation or poor light makes the estimate unreliable.
    const excess = Math.max(-0.75, Math.min(1.5, covariance / power - 1))
    for (let i = 0; i < signal.length; i++) signal[i] *= Math.exp(-strength * excess * centered[i])
  }
  return centered
}

/** Whole pipeline, from raw camera samples to a pulse estimate. Never throws. */
export function estimate(samples: readonly RgbSample[], method: PulseMethod = 'pos'): Estimate {
  const fs = RPPG.sampleRateHz
  const u = resample(samples, fs)
  if (!u) return EMPTY
  const seconds = (u.r.length - 1) / fs
  const exposure = seconds >= RPPG.minSeconds ? correctExposure(u, fs) : null
  const filtered =
    method === 'chrom' ? chrom(u.r, u.g, u.b, fs) : bandpass(detrend(pos(u.r, u.g, u.b, fs)), fs)
  const n = filtered.length
  // Display wave, normalised by a robust amplitude so one spike does not flatten the rest.
  const waveN = Math.min(n, Math.round(RPPG.waveSeconds * fs))
  const tail = filtered.subarray(n - waveN)
  const scale = 2.2 * std(tail) || 1
  const wave = Array.from(tail, (v) => Math.max(-1, Math.min(1, v / scale)))
  if (seconds < RPPG.minSeconds) return { ...EMPTY, seconds, wave }
  const specN = Math.min(n, Math.round(RPPG.spectrumWindowS * fs))
  const start = n - specN
  const segment = filtered.slice(start)
  const peak = spectralPeak(segment, fs, RPPG.lowHz, RPPG.highHz)
  if (!peak) return { ...EMPTY, seconds, wave }
  // A strong lighting oscillation at the candidate pulse frequency cannot
  // be separated from a heartbeat at this window's frequency resolution.
  if (exposure) {
    const lighting = spectralPeak(exposure.subarray(start), fs)
    if (
      lighting &&
      qualityFromSnr(lighting.snrDb) >= RPPG.qualityThreshold &&
      Math.abs(lighting.hz - peak.hz) < fs / specN
    )
      return { ...EMPTY, seconds, wave, snrDb: peak.snrDb }
  }
  const minGap = Math.max(Math.round(0.3 * fs), Math.round((0.6 * fs) / peak.hz))
  const beats = findBeats(segment, minGap).map((i) => u.t0 + (start + i) * u.dt)
  return {
    bpm: peak.hz * 60,
    snrDb: peak.snrDb,
    quality: qualityFromSnr(peak.snrDb),
    seconds,
    wave,
    beats,
  }
}

/** Median of the last few accepted estimates, so the shown number does not flicker. */
export class BpmSmoother {
  private recent: number[] = []
  private readonly size: number
  constructor(size = 5) {
    this.size = Math.max(1, Math.round(size))
  }

  push(bpm: number): number {
    if (Number.isFinite(bpm)) {
      this.recent.push(bpm)
      if (this.recent.length > this.size) this.recent.shift()
    }
    return this.value() ?? bpm
  }

  value(): number | null {
    if (this.recent.length === 0) return null
    const sorted = [...this.recent].sort((a, b) => a - b)
    const mid = sorted.length >> 1
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  reset(): void {
    this.recent = []
  }
}
