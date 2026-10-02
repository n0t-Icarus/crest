import { useCallback, useEffect, useState } from 'react'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cacheTracks } from '@/library/useTracks'
import { getProvider } from '@/services/providers'
import type { SearchResults } from '@/services/providers/types'

/**
 * Search.
 *
 * Debounced, cancellable and cached for a minute, so typing stays instant and
 * the same query is never fetched twice (the overlay and the full search page
 * share this hook).
 */

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; results: SearchResults }>()

export type SearchState = {
  results: SearchResults | null
  loading: boolean
  error: string | null
  retry: () => void
  /** True when the shown results belong to the debounced query. */
  settled: boolean
}

export function useSearch(query: string, options: { debounceMs?: number } = {}): SearchState {
  const { debounceMs = 250 } = options
  const debounced = useDebouncedValue(query.trim(), debounceMs)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!debounced) {
      setResults(null)
      setError(null)
      setLoading(false)
      return
    }

    const cached = cache.get(debounced)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS && nonce === 0) {
      setResults(cached.results)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void getProvider()
      .search(debounced, { signal: controller.signal })
      .then((result) => {
        cache.set(debounced, { at: Date.now(), results: result })
        cacheTracks(result.tracks)
        setResults(result)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Search failed.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [debounced, nonce])

  const retry = useCallback(() => {
    if (debounced) cache.delete(debounced)
    setNonce((value) => value + 1)
  }, [debounced])

  return { results, loading, error, retry, settled: results?.query === debounced }
}

export function clearSearchCache(): void {
  cache.clear()
}
