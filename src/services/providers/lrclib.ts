/**
 * LRCLIB lyrics client.
 *
 * Free, keyless, CORS-clean synced-lyrics database (3M+ records). Exact-match
 * first (track/artist/album/duration), then a plain search fallback — the
 * closest duration wins so the sync lines line up with our playback.
 */

import type { Lyrics, LyricLine } from './types'
import { getJson, TtlCache, withTimeout } from './net'

const BASE = 'https://lrclib.net/api'

type LrcRecord = {
  id: number
  trackName: string
  artistName: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

const cache = new TtlCache<Lyrics | null>(60 * 60_000, 300)

export function clearLyricsCache(): void {
  cache.clear()
}

/** Parses `[mm:ss.xx] text` lines; headers without text are dropped. */
function parseSynced(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const line of raw.split('\n')) {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
    if (!match) continue
    const minutes = Number(match[1])
    const seconds = Number(match[2])
    const text = match[3]!.trim()
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) continue
    lines.push({ text, startMs: Math.round((minutes * 60 + seconds) * 1000) })
  }
  return lines
}

function toLyrics(record: LrcRecord): Lyrics | null {
  if (record.instrumental) {
    return { trackId: '', lines: [{ text: '♪ Instrumental ♪' }], synced: false, source: 'LRCLIB' }
  }
  if (record.syncedLyrics) {
    const lines = parseSynced(record.syncedLyrics)
    if (lines.length > 0) return { trackId: '', lines, synced: true, source: 'LRCLIB' }
  }
  if (record.plainLyrics) {
    const lines = record.plainLyrics
      .split('\n')
      .map((text) => ({ text }))
    if (lines.length > 0) return { trackId: '', lines, synced: false, source: 'LRCLIB' }
  }
  return null
}

/**
 * Lyrics for a track, or `null` when nothing matches.
 * Cheap lookups first (cache → exact get), then a bounded search fallback.
 */
export async function lrclibLyrics(input: {
  title: string
  artist: string
  album?: string
  durationMs: number
}): Promise<Lyrics | null> {
  const key = `${input.artist}::${input.title}::${Math.round(input.durationMs / 1000)}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const params = new URLSearchParams({
    track_name: input.title,
    artist_name: input.artist,
    ...(input.album ? { album_name: input.album } : {}),
    duration: String(Math.round(input.durationMs / 1000)),
  })

  let result: Lyrics | null = null
  try {
    const exact = await withTimeout(getJson<LrcRecord>(`${BASE}/get?${params}`, {}), 5000)
    if (exact) result = toLyrics(exact)
  } catch {
    /* fall through to search */
  }

  if (!result) {
    try {
      const found = await withTimeout(
        getJson<LrcRecord[]>(`${BASE}/search?${new URLSearchParams({ track_name: input.title, artist_name: input.artist })}`, {}),
        6000,
      )
      if (found && found.length > 0) {
        // Closest duration wins: synced lines must line up with playback.
        const target = input.durationMs / 1000
        const best = [...found]
          .filter((record) => record.syncedLyrics || record.plainLyrics)
          .sort((a, b) => Math.abs((a.duration ?? 0) - target) - Math.abs((b.duration ?? 0) - target))[0]
        if (best) result = toLyrics(best)
      }
    } catch {
      /* leave result null */
    }
  }

  cache.set(key, result)
  return result
}
