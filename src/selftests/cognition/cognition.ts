// Two short tests from NASA's Cognition battery (Basner et al., Aerospace Medicine and Human
// Performance 2015): Digit Symbol Substitution, for processing speed, and a 2-back, for working memory.

export const DSST_SECONDS = 90
/** Symbols of the key, drawn as SVG paths in a 24-unit box. */
export const SYMBOL_PATHS = [
  'M4 12h16M12 4v16',
  'M5 5l14 14M19 5L5 19',
  'M12 3l9 18H3z',
  'M4 4h16v16H4z',
  'M12 3a9 9 0 1 0 .01 0z',
  'M3 12h7l2-7 2 14 2-7h5',
  'M5 19V5l7 7 7-7v14',
  'M6 4v16M18 4v16M6 12h12',
  'M4 8c4-6 12 6 16 0M4 16c4-6 12 6 16 0',
] as const

/** A new key for each run: which symbol goes with each digit 1 to 9 (index 0 is digit 1). */
export function makeKey(random = Math.random): number[] {
  const key = SYMBOL_PATHS.map((_, i) => i)
  for (let i = key.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[key[i], key[j]] = [key[j], key[i]]
  }
  return key
}

/** The digit that goes with a symbol in this key. */
export const digitFor = (key: number[], symbol: number) => key.indexOf(symbol) + 1

/** A symbol to match, never the same twice in a row. */
export function nextSymbol(previous: number | null, random = Math.random): number {
  let s = Math.floor(random() * SYMBOL_PATHS.length)
  if (s === previous) s = (s + 1 + Math.floor(random() * (SYMBOL_PATHS.length - 1))) % SYMBOL_PATHS.length
  return s
}

export const N_BACK = { trials: 30, targets: 9, showMs: 1500, gapMs: 500 } as const
const LETTERS = ['B', 'F', 'H', 'K', 'M', 'P', 'R', 'T'] as const

/** Letters where exactly `targets` of them repeat the letter two places before. */
export function nBackSequence(
  random = Math.random,
  trials: number = N_BACK.trials,
  targets: number = N_BACK.targets,
) {
  const positions = new Set<number>()
  while (positions.size < targets) positions.add(2 + Math.floor(random() * (trials - 2)))
  const seq: string[] = []
  for (let i = 0; i < trials; i++) {
    if (positions.has(i)) {
      seq.push(seq[i - 2])
      continue
    }
    let letter: string
    do letter = LETTERS[Math.floor(random() * LETTERS.length)]
    while (i >= 2 && letter === seq[i - 2])
    seq.push(letter)
  }
  return seq
}

export const isTarget = (seq: string[], i: number) => i >= 2 && seq[i] === seq[i - 2]

export interface NBackScore {
  hits: number
  misses: number
  falseAlarms: number
  /** Mean of the hit rate and the correct-rejection rate, %. A press on every letter scores 50. */
  accuracy: number
}

export function scoreNBack(seq: string[], pressed: boolean[]): NBackScore {
  let hits = 0
  let misses = 0
  let falseAlarms = 0
  let rejections = 0
  for (let i = 0; i < seq.length; i++) {
    const target = isTarget(seq, i)
    if (target && pressed[i]) hits++
    else if (target) misses++
    else if (pressed[i]) falseAlarms++
    else rejections++
  }
  const targets = hits + misses
  const others = falseAlarms + rejections
  const accuracy = (100 * ((targets ? hits / targets : 1) + (others ? rejections / others : 1))) / 2
  return { hits, misses, falseAlarms, accuracy: Math.round(accuracy) }
}
