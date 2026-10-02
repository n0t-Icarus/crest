import { useEffect, useState } from 'react'

/** Subscribe to a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Layout breakpoints used by the shell (documented in README → Responsiveness). */
export const BREAKPOINTS = {
  /** Below this the queue panel auto-collapses. */
  queue: '(max-width: 1239px)',
  /** Below this the sidebar becomes the 74px icon rail. */
  sidebarRail: '(max-width: 999px)',
  /** Very small windows: rail + hidden queue. */
  compact: '(max-width: 767px)',
} as const
