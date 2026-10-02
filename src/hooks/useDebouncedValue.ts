import { useEffect, useState } from 'react'

/** Debounce a rapidly changing value (search input) without extra renders. */
export function useDebouncedValue<T>(value: T, delayMs = 160): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value)
      return
    }
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
