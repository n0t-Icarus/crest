import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheTracks } from '@/library/useTracks'
import { getProvider } from '@/services/providers'
import { useSettingsStore } from '@/store/settingsStore'
import type { HomeFeed } from '@/services/providers/types'

/**
 * Home feed loader.
 *
 * Kept warm in module scope: returning to Home after browsing the library shows
 * content instantly and only refreshes in the background. The cache is keyed by
 * mood *and* country, so switching chips is instant in both directions, neither
 * mood clobbers the other, and changing country never shows the old market's
 * feed from cache.
 */

type CacheEntry = { feed: HomeFeed; storedAt: number }
const CACHE_TTL_MS = 5 * 60_000

const cache = new Map<string, CacheEntry>()

/** Cache key for a mood within a country. */
function cacheKey(mood: string, region: string): string {
  return `${region || 'auto'}::${mood}`
}

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

function readCache(key: string): HomeFeed | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.feed
}

export function useHomeFeed(): HomeFeedState {
  const region = useSettingsStore((state) => state.region)
  const [mood, setMood] = useState('')
  const [feed, setFeed] = useState<HomeFeed | null>(() => readCache(cacheKey('', '')) ?? readCache(cacheKey('Relax', '')))
  const [loading, setLoading] = useState(() => readCache(cacheKey('', '')) === null && readCache(cacheKey('Relax', '')) === null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  // Guards against a slow request for a mood the user already moved off of.
  const requestSeq = useRef(0)

  useEffect(() => {
    const seq = ++requestSeq.current
    const key = cacheKey(mood, region)
    const cached = readCache(key)

    if (cached) {
      setFeed(cached)
      setLoading(false)
      setError(null)
      return
    }

    // Switching country must not leave the previous market's shelves on screen
    // while the new ones load; blank beats confidently wrong.
    setFeed((current) => (current?.region === (region || undefined) ? current : null))
    if (feed) setPending(true)
    else setLoading(true)
    setError(null)

    void getProvider()
      .getHome({ mood, region })
      .then((result) => {
        if (seq !== requestSeq.current) return
        cache.set(key, { feed: result, storedAt: Date.now() })
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
  }, [mood, region, nonce])

  const selectMood = useCallback((next: string) => {
    setMood((current) => (current === next ? current : next))
  }, [])

  const reload = useCallback(() => {
    cache.clear()
    setNonce((value) => value + 1)
  }, [])

  return { feed, loading, pending, error, activeMood: mood, selectMood, reload }
}
