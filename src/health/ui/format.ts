import type { Freshness } from '../readings'

/** "live", "today", "yesterday" or "5 days ago". */
export function ageText(f: Freshness): string {
  if (f.ageDays === 0) return f.automatic ? 'live' : 'today'
  return f.ageDays === 1 ? 'yesterday' : `${f.ageDays} days ago`
}

/** Where a value comes from and how old it is, in one line. */
export const freshnessText = (f: Freshness) =>
  `${f.source}, ${ageText(f)}${f.outdated ? '. Out of date: measure again.' : ''}`
