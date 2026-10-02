/**
 * Synth demo provider.
 *
 * Same catalogue and metadata as the demo provider, but `getStream` hands back
 * a real, playable URL: the track's waveform is rendered on this machine by
 * `synthEngine` and exposed as a `blob:` object URL. No bundled audio, no
 * network, no licensed recordings — and the HTML audio engine runs the
 * playback path end to end.
 */

import { mockProvider } from '../mock/mockProvider'
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
import { renderTrackAudio } from './synthEngine'

/** Rendered WAVs are a few MB each; keep a small LRU of object URLs alive. */
const MAX_CACHED_URLS = 4
const urlCache = new Map<string, string>()
/** In-flight renders, so a double-click on Play renders once, not twice. */
const inflight = new Map<string, Promise<string>>()

/* -------------------------------------------------------------------------- */
/* Off-thread rendering                                                       */
/* -------------------------------------------------------------------------- */

type PendingJob = { resolve: (buffer: ArrayBuffer) => void; reject: (error: unknown) => void }

let worker: Worker | null = null
let nextJobId = 1
const pendingJobs = new Map<number, PendingJob>()

function getWorker(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined') return null
  try {
    worker = new Worker(new URL('./synthWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
  worker.addEventListener('message', (event) => {
    const { id, buffer, error } = event.data as { id: number; buffer?: ArrayBuffer; error?: string }
    const job = pendingJobs.get(id)
    if (!job) return
    pendingJobs.delete(id)
    if (error || !buffer) job.reject(new Error(error ?? 'Synth render failed.'))
    else job.resolve(buffer)
  })
  worker.addEventListener('error', () => {
    // Fail everything pending and drop the worker so the next call can retry.
    for (const job of pendingJobs.values()) job.reject(new Error('Synth worker failed.'))
    pendingJobs.clear()
    worker = null
  })
  return worker
}

function renderAudio(trackId: string, durationMs: number): Promise<ArrayBuffer> {
  const w = getWorker()
  if (!w) {
    // Environments without Workers (tests, ancient webviews): render inline.
    return Promise.resolve().then(() => renderTrackAudio(trackId, durationMs))
  }
  const id = nextJobId
  nextJobId += 1
  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject })
    w.postMessage({ id, trackId, durationMs })
  })
}

async function audioUrlFor(trackId: string, durationMs: number): Promise<string> {
  const cached = urlCache.get(trackId)
  if (cached) {
    // LRU touch: re-insert so the oldest entry is evicted, not the reused one.
    urlCache.delete(trackId)
    urlCache.set(trackId, cached)
    return cached
  }

  const started = performance.now()
  const buffer = await renderAudio(trackId, durationMs)
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  urlCache.set(trackId, url)

  while (urlCache.size > MAX_CACHED_URLS) {
    const oldest = urlCache.keys().next().value
    if (oldest === undefined) break
    const stale = urlCache.get(oldest)
    urlCache.delete(oldest)
    if (stale) URL.revokeObjectURL(stale)
  }

  if (import.meta.env.DEV) {
    const ms = Math.round(performance.now() - started)
    console.info(`[synth] rendered "${trackId}" in ${ms} ms (${Math.round(buffer.byteLength / 1024)} kB)`)
  }
  return url
}

export class SynthProvider implements MusicProvider {
  readonly id = 'synth'
  readonly displayName = 'Synth demo (real audio)'

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    lyrics: 'synced',
    search: true,
    recommendations: true,
    notes: 'Demo catalogue with audio rendered procedurally on this machine. No network, no licensed recordings.',
  }

  async getStream(trackId: string): Promise<AudioStream> {
    const track = await mockProvider.getTrack(trackId)
    if (!track) return { kind: 'unavailable', reason: 'Unknown track.' }
    try {
      const existing = inflight.get(trackId)
      const url = existing ?? audioUrlFor(trackId, track.durationMs)
      if (!existing) inflight.set(trackId, url)
      const resolved = await url
      inflight.delete(trackId)
      return { kind: 'url', url: resolved, mimeType: 'audio/wav' }
    } catch {
      inflight.delete(trackId)
      return { kind: 'unavailable', reason: 'Audio could not be rendered for this track.' }
    }
  }

  getHome(options: { signal?: AbortSignal } = {}): Promise<HomeFeed> {
    return mockProvider.getHome(options)
  }

  search(query: string, options: { signal?: AbortSignal } = {}): Promise<SearchResults> {
    return mockProvider.search(query, options)
  }

  getTrack(id: string): Promise<Track | null> {
    return mockProvider.getTrack(id)
  }

  getTracks(ids: string[]): Promise<Track[]> {
    return mockProvider.getTracks(ids)
  }

  getArtist(id: string): Promise<Artist | null> {
    return mockProvider.getArtist(id)
  }

  getArtistTracks(id: string): Promise<Track[]> {
    return mockProvider.getArtistTracks(id)
  }

  getAlbum(id: string): Promise<Album | null> {
    return mockProvider.getAlbum(id)
  }

  getPlaylist(id: string): Promise<Playlist | null> {
    return mockProvider.getPlaylist(id)
  }

  getMix(id: string): Promise<Mix | null> {
    return mockProvider.getMix(id)
  }

  getLyrics(trackId: string): Promise<Lyrics | null> {
    return mockProvider.getLyrics(trackId)
  }

  getRecommendations(seedId: string, limit = 12): Promise<Track[]> {
    return mockProvider.getRecommendations(seedId, limit)
  }
}

export const synthProvider = new SynthProvider()
