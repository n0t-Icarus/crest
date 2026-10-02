/**
 * Demo provider.
 *
 * Implements the full `MusicProvider` contract over the bundled catalogue so
 * Phase 1 can be exercised end to end with zero network access and zero
 * licensing risk. It reports `streaming: false` honestly — there is no audio to
 * hand out yet, and the UI surfaces that instead of pretending to play files.
 */

import { greeting } from '@/utils/format'
import {
  albums,
  artists,
  discoveredTrackIds,
  findTrack,
  historyEntries,
  likedTrackIds,
  mixes,
  playlists,
  trackMap,
  tracks,
} from './catalog'
import { lyricsByTrack } from './lyrics'
import type {
  Album,
  Artist,
  AudioStream,
  HomeFeed,
  Lyrics,
  Mix,
  MusicProvider,
  Playlist,
  ProviderCapabilities,
  SearchResults,
  Track,
} from '../types'
import { ProviderError } from '../types'

/**
 * Optional artificial latency, opt-in via `?latency=120` (dev only). Lets the
 * skeleton states be inspected without slowing the normal dev loop.
 */
function latency(): number {
  if (!import.meta.env.DEV || typeof window === 'undefined') return 0
  const value = new URLSearchParams(window.location.search).get('latency')
  const parsed = value ? Number.parseInt(value, 10) : 0
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

async function settle<T>(value: T, signal?: AbortSignal): Promise<T> {
  const delay = latency()
  if (delay > 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, delay)
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timer)
        reject(new ProviderError('network', 'Request cancelled', true))
      })
    })
  }
  if (signal?.aborted) throw new ProviderError('network', 'Request cancelled', true)
  return value
}

function normalize(input: string): string {
  return input.trim().toLowerCase()
}

function matches(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(needle)
}

/** 0 = no match, 3 = exact, 2.5 = prefix, 2 = word start, 1 = substring. */
function fieldScore(haystack: string, needle: string): number {
  const value = normalize(haystack)
  if (value === needle) return 3
  if (value.startsWith(needle)) return 2.5
  if (value.split(/\s+/).some((word) => word.startsWith(needle))) return 2
  return value.includes(needle) ? 1 : 0
}

const TRACKS_BY_ID = trackMap()

function resolve(ids: string[]): Track[] {
  const out: Track[] = []
  for (const id of ids) {
    const track = TRACKS_BY_ID.get(id)
    if (track) out.push(track)
  }
  return out
}

/** Deterministic shuffle so a given seed always yields the same order. */
function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    const j = Math.abs(h) % (i + 1)
    const a = out[i]!
    out[i] = out[j]!
    out[j] = a
  }
  return out
}

export class MockProvider implements MusicProvider {
  readonly id = 'mock'
  readonly displayName = 'Crest demo library'

  readonly capabilities: ProviderCapabilities = {
    streaming: false,
    lyrics: 'synced',
    search: true,
    recommendations: true,
    notes: 'Bundled demo catalogue. No audio streams and no network access.',
  }

  async getHome(options: { signal?: AbortSignal } = {}): Promise<HomeFeed> {
    const recent = resolve(historyEntries.slice(0, 12).map((entry) => entry.trackId))
    const trending = seededOrder(tracks, 'trending').slice(0, 10)
    const madeForYou: Mix[] = mixes

    return settle(
      {
        hero: {
          eyebrow: greeting(),
          title: 'Listen to what moves you.',
          subtitle: 'Your world. Your music.',
          artwork: { kind: 'generated', seed: 'hero-primary' },
          contextId: 'p-night-drives',
          contextKind: 'playlist',
        },
        heroSlides: [
          {
            eyebrow: greeting(),
            title: 'Listen to what moves you.',
            subtitle: 'Your world. Your music.',
            artwork: { kind: 'generated', seed: 'hero-primary' },
            contextId: 'p-night-drives',
            contextKind: 'playlist',
          },
          {
            eyebrow: 'Continue where you left off',
            title: 'Night Drives',
            subtitle: 'Headlights, empty roads, no destination.',
            artwork: { kind: 'generated', seed: 'p-night-drives-hero' },
            contextId: 'p-night-drives',
            contextKind: 'playlist',
          },
          {
            eyebrow: 'Made for you',
            title: 'Chill Mix',
            subtitle: 'Chill vibes, just for you.',
            artwork: { kind: 'generated', seed: 'm-chill-hero' },
            contextId: 'm-chill',
            contextKind: 'mix',
          },
        ],
        sections: [
          { id: 'recently-played', kind: 'tracks', title: 'Recently Played', items: recent },
          { id: 'made-for-you', kind: 'mixes', title: 'Made for You', items: madeForYou },
          { id: 'trending-now', kind: 'tracks', title: 'Trending Now', items: trending },
        ],
      },
      options.signal,
    )
  }

  async search(query: string, options: { signal?: AbortSignal } = {}): Promise<SearchResults> {
    const needle = normalize(query)
    if (!needle) {
      return settle({ query, tracks: [], albums: [], artists: [], playlists: [] }, options.signal)
    }

    // Relevance, not just membership: a title hit should always outrank a hit in
    // an album name (searching "night" must not bury "Night Changes" behind
    // "Favourite Worst Nightmare").
    const trackHits = tracks
      .map((track) => ({
        track,
        score:
          Math.max(
            fieldScore(track.title, needle),
            fieldScore(track.artistName, needle) - 0.5,
            fieldScore(track.albumName, needle) - 1.5,
          ) || 0,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))
      .map((entry) => entry.track)

    const albumHits = albums
      .map((album) => ({ album, score: Math.max(fieldScore(album.title, needle), fieldScore(album.artistName, needle) - 0.5) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.album)

    const artistHits = artists
      .filter((artist) => matches(artist.name, needle))
      .sort((a, b) => fieldScore(b.name, needle) - fieldScore(a.name, needle))

    const playlistHits = playlists.filter((playlist) => matches(playlist.name, needle))

    return settle(
      {
        query,
        tracks: trackHits.slice(0, 40),
        albums: albumHits.slice(0, 20),
        artists: artistHits.slice(0, 20),
        playlists: playlistHits.slice(0, 20),
      },
      options.signal,
    )
  }

  async getTrack(id: string): Promise<Track | null> {
    return findTrack(id) ?? null
  }

  async getTracks(ids: string[]): Promise<Track[]> {
    return resolve(ids)
  }

  async getArtist(id: string): Promise<Artist | null> {
    return artists.find((artist) => artist.id === id) ?? null
  }

  async getArtistTracks(id: string): Promise<Track[]> {
    return tracks.filter((track) => track.artistId === id)
  }

  async getAlbum(id: string): Promise<Album | null> {
    return albums.find((album) => album.id === id) ?? null
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    return playlists.find((playlist) => playlist.id === id) ?? null
  }

  async getMix(id: string): Promise<Mix | null> {
    return mixes.find((mix) => mix.id === id) ?? null
  }

  async getLyrics(trackId: string): Promise<Lyrics | null> {
    return lyricsByTrack[trackId] ?? null
  }

  async getRecommendations(seedId: string, limit = 12): Promise<Track[]> {
    const pool = tracks.filter((track) => track.id !== seedId)
    const ordered = seededOrder(pool, seedId)
    const liked = new Set(likedTrackIds)
    const preferred = ordered.filter((track) => liked.has(track.id))
    const rest = ordered.filter((track) => !liked.has(track.id))
    return [...preferred, ...rest].slice(0, limit)
  }

  async getStream(): Promise<AudioStream> {
    // Honest answer: the demo catalogue ships metadata only.
    return { kind: 'unavailable', reason: 'The demo library has no audio files yet.' }
  }

  /** Extra: discovered tracks for the Library page. */
  async getDiscovered(): Promise<Track[]> {
    return resolve(discoveredTrackIds)
  }
}

export const mockProvider = new MockProvider()
