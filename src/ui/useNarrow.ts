import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 639px)'

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** True on phone-width screens, where cards beside the body would not fit. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
