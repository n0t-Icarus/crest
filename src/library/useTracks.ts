import { useEffect, useState } from 'react'
import { getProvider } from '@/services/providers'
import type { Track } from '@/services/providers/types'

/**
 * Track resolution.
 *
 * Lists in Crest store ids (playlists, liked songs, history), so anything that
 * needs full tracks goes through here. Results are cached per id, which keeps
 * navigation instant and prevents duplicate provider round-trips.
 */

const trackCache = new Map<string, Track>()

export function cacheTrack(track: Track): void {
  trackCache.set(track.id, track)
}

export function cacheTracks(tracks: Track[]): void {
  for (const track of tracks) trackCache.set(track.id, track)
}

export function getCachedTrack(id: string): Track | undefined {
  return trackCache.get(id)
}

export function getCachedTracks(ids: string[]): Track[] | null {
  const out: Track[] = []
  for (const id of ids) {
    const track = trackCache.get(id)
    if (!track) return null
    out.push(track)
  }
  return out
}

/** Resolve ids to tracks; returns `null` while the first lookup is in flight. */
export function useTracks(ids: string[]): Track[] | null {
  const key = ids.join('|')
  const [tracks, setTracks] = useState<Track[] | null>(() => getCachedTracks(ids))

  useEffect(() => {
    if (ids.length === 0) {
      setTracks([])
      return
    }
    const cached = getCachedTracks(ids)
    if (cached) {
      setTracks(cached)
      return
    }

    let active = true
    void getProvider()
      .getTracks(ids)
      .then((result) => {
        cacheTracks(result)
        if (active) setTracks(result)
      })
      .catch(() => {
        if (active) setTracks([])
      })

    return () => {
      active = false
    }
    // `key` captures the id list; using it avoids re-running on array identity.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return tracks
}

/** Resolve a single track id. */
export function useTrack(id: string | undefined): Track | null {
  const [track, setTrack] = useState<Track | null>(() => (id ? getCachedTrack(id) ?? null : null))

  useEffect(() => {
    if (!id) {
      setTrack(null)
      return
    }
    const cached = getCachedTrack(id)
    if (cached) {
      setTrack(cached)
      return
    }
    let active = true
    void getProvider()
      .getTrack(id)
      .then((result) => {
        if (result) cacheTrack(result)
        if (active) setTrack(result)
      })
      .catch(() => {
        if (active) setTrack(null)
      })
    return () => {
      active = false
    }
  }, [id])

  return track
}
