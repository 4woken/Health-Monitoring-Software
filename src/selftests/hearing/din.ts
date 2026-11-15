// Digits-in-noise hearing test (Smits, Kapteyn and Houtgast, International Journal of Audiology
// 2004): three spoken digits in a steady noise, 24 times. The noise stays put and the voice gets
// quieter after each right answer and louder after each wrong one, in 2 dB steps. The score is the
// speech reception threshold: the mean signal-to-noise ratio of the last 21 presentations, the 25th
// being the one the last answer leads to. Because it compares the voice with the noise, it does not
// need calibrated headphones.

export const DIN = { trials: 24, startSnr: 0, stepDb: 2, scoredFrom: 5 } as const
/** One-syllable digits only: "seven" and "zero" have two. */
export const DIGITS = [1, 2, 3, 4, 5, 6, 8, 9] as const

/** Three different digits. */
export function triplet(random = Math.random): number[] {
  const pool: number[] = [...DIGITS]
  const out: number[] = []
  while (out.length < 3) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return out
}

export interface DinState {
  /** Signal-to-noise ratio of each presentation, dB. */
  snrs: number[]
  correct: boolean[]
}

export const startDin = (): DinState => ({ snrs: [DIN.startSnr], correct: [] })

/** Records the answer to the current triplet and sets the next ratio. */
export function answer(state: DinState, right: boolean): DinState {
  const current = state.snrs[state.snrs.length - 1]
  const correct = [...state.correct, right]
  return { snrs: [...state.snrs, current + (right ? -DIN.stepDb : DIN.stepDb)], correct }
}

export const dinDone = (state: DinState) => state.correct.length >= DIN.trials

/**
 * Speech reception threshold, dB: the mean ratio of presentations 5 to 24 and of the 25th one the
 * last answer leads to. Lower is better.
 */
export function srt(state: DinState): number {
  const scored = state.snrs.slice(DIN.scoredFrom - 1, DIN.trials + 1)
  return Number((scored.reduce((s, v) => s + v, 0) / scored.length).toFixed(1))
}

/**
 * Loudness of the voice for a ratio, 0 to 1, against a fixed noise. At 0 dB the voice is at
 * `reference`; it can rise 10 dB above that before reaching full volume.
 */
export const voiceVolume = (snr: number, reference = 0.3) =>
  Math.min(1, Math.max(0, reference * 10 ** (snr / 20)))
