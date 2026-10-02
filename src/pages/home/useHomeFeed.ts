import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheTracks } from '@/library/useTracks'
import { getProvider } from '@/services/providers'
import type { HomeFeed } from '@/services/providers/types'

/**
 * Home feed loader.
 *
 * Kept warm in module scope: returning to Home after browsing the library shows
 * content instantly and only refreshes in the background. The cache is keyed by
 * mood, so switching chips is instant in both directions and neither mood
 * clobbers the other.
 */

type CacheEntry = { feed: HomeFeed; storedAt: number }
const CACHE_TTL_MS = 5 * 60_000

const cache = new Map<string, CacheEntry>()

export type HomeFeedState = {
  feed: HomeFeed | null
  loading: boolean
  /** True while a mood switch is in flight with a feed already on screen. */
  pending: boolean
  error: string | null
  activeMood: string
  selectMood: (mood: string) => void
  reload: () => void
}

function prewarm(feed: HomeFeed): void {
  for (const section of feed.sections) {
    if (section.kind === 'tracks') cacheTracks(section.items)
  }
}

function readCache(mood: string): HomeFeed | null {
  const entry = cache.get(mood)
  if (!entry) return null
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    cache.delete(mood)
    return null
  }
  return entry.feed
}

export function useHomeFeed(): HomeFeedState {
  const [mood, setMood] = useState('')
  const [feed, setFeed] = useState<HomeFeed | null>(() => readCache('') ?? readCache('Relax'))
  const [loading, setLoading] = useState(() => readCache('') === null && readCache('Relax') === null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  // Guards against a slow request for a mood the user already moved off of.
  const requestSeq = useRef(0)

  useEffect(() => {
    const seq = ++requestSeq.current
    const cached = readCache(mood)

    if (cached) {
      setFeed(cached)
      setLoading(false)
      setError(null)
      return
    }

    if (feed) setPending(true)
    else setLoading(true)
    setError(null)

    void getProvider()
      .getHome({ mood })
      .then((result) => {
        if (seq !== requestSeq.current) return
        cache.set(mood, { feed: result, storedAt: Date.now() })
        prewarm(result)
        setFeed(result)
      })
      .catch((cause: unknown) => {
        if (seq !== requestSeq.current) return
        setError(cause instanceof Error ? cause.message : 'Unable to load your home feed.')
      })
      .finally(() => {
        if (seq !== requestSeq.current) return
        setLoading(false)
        setPending(false)
      })
  }, [mood, nonce])

  const selectMood = useCallback((next: string) => {
    setMood((current) => (current === next ? current : next))
  }, [])

  const reload = useCallback(() => {
    cache.clear()
    setNonce((value) => value + 1)
  }, [])

  return { feed, loading, pending, error, activeMood: mood, selectMood, reload }
}
