// How big a millimetre is on this screen. Web pages cannot read the physical size of a screen, so the
// person matches a bank card (ISO/IEC 7810 ID-1: 85.60 mm wide) once; the scale is kept for this
// screen and asked again when the screen or the zoom changes.

export const CARD_MM = 85.6
const KEY = 'pulsar.screen.v1'

interface Saved {
  /** CSS pixels per millimetre. */
  cssPxPerMm: number
  ratio: number
  screenWidth: number
}

const here = () => ({ ratio: window.devicePixelRatio || 1, screenWidth: window.screen?.width ?? 0 })

/** The saved scale, if it was made on this screen at this zoom; CSS pixels per mm. */
export function savedScale(): number | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    const now = here()
    if (s && s.cssPxPerMm > 1 && s.ratio === now.ratio && s.screenWidth === now.screenWidth)
      return s.cssPxPerMm
  } catch {
    // Unreadable or unavailable: measure again.
  }
  return null
}

export function saveScale(cssPxPerMm: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ cssPxPerMm, ...here() } satisfies Saved))
  } catch {
    // Kept for this visit only.
  }
}

/** A first guess before the card is matched: 96 CSS pixels to the inch. */
export const GUESS_CSS_PX_PER_MM = 96 / 25.4
