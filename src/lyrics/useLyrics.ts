import { useCallback, useEffect, useState } from 'react'
import { getProvider } from '@/services/providers'
import type { Lyrics } from '@/services/providers/types'

/**
 * Lyrics lookup.
 *
 * Results are memoised per track so switching back and forth between the queue
 * preview and the full lyrics view never refetches, and a missing lyric is a
 * normal, quiet outcome rather than an error.
 */

const cache = new Map<string, Lyrics | null>()

export type LyricsState = {
  lyrics: Lyrics | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useLyrics(trackId: string | undefined): LyricsState {
  const [lyrics, setLyrics] = useState<Lyrics | null>(() => (trackId ? cache.get(trackId) ?? null : null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!trackId) {
      setLyrics(null)
      return
    }
    if (cache.has(trackId) && nonce === 0) {
      setLyrics(cache.get(trackId) ?? null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    void getProvider()
      .getLyrics(trackId)
      .then((result) => {
        cache.set(trackId, result)
        if (!active) return
        setLyrics(result)
      })
      .catch(() => {
        if (active) setError('Unable to load lyrics for this track.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [trackId, nonce])

  const reload = useCallback(() => {
    if (trackId) cache.delete(trackId)
    setNonce((value) => value + 1)
  }, [trackId])

  return { lyrics, loading, error, reload }
}
