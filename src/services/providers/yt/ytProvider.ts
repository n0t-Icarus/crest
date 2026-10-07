/**
 * YouTube Music provider.
 *
 * Metadata (search, albums, artists, playlists) comes from YouTube Music via
 * the local media helper (`server/mediaHelper.mjs`, youtubei.js). Audio comes
 * from the same helper's `/audio` endpoint: a short-lived `yt-dlp --get-url
 * --format bestaudio` child process resolves the direct googlevideo URL and
 * the helper range-proxies the bytes — full length, no downloads, no API keys.
 *
 * Everything rides on one local URL so artwork can also be served through the
 * helper's origin without mixed-content or CORS surprises.
 *
 * Personal-use pipeline: playback hits YouTube's servers the same way the
 * user's own browser does; the helper only exists while Crest runs.
 */

import type {
  Album,
  Artist,
  AudioStream,
  HeroContent,
  HomeFeed,
  Lyrics,
  Mix,
  MusicProvider,
  Playlist,
  ProviderCapabilities,
  SearchResults,
  Track,
} from '../types'
import { lrclibLyrics } from '../lrclib'
import { TtlCache } from '../net'

const HELPER_BASE = 'http://127.0.0.1:5267'

/**
 * What to actually tell the user when a track will not stream.
 *
 * The media element cannot tell "this track is broken" from "YouTube refused
 * to hand over the audio", so it reports both as an unsupported source. Sending
 * the player a URL we have not checked meant users were told to skip a song
 * that was perfectly playable, with no clue that the network was the problem.
 */
const STREAM_REASONS: Record<string, string> = {
  rate_limited: 'YouTube is rate-limiting this network right now, so this track cannot stream. It usually clears in a few minutes — try Retry.',
  private: 'This track is private, so it cannot be played.',
  age_restricted: 'This track is age-restricted and cannot be played here.',
  geo_blocked: 'This track is not available in your country.',
  unavailable: 'This track is no longer available on YouTube.',
  no_stream: 'YouTube returned no playable audio for this track.',
  client_needs_token: 'YouTube would not hand over this track to any available playback client. Try Retry.',
  timeout: 'Resolving this track took too long. Try Retry.',
  error: 'YouTube would not hand over this track right now. Try Retry.',
  helper_down: 'Lost contact with the local media helper. Retrying — if it keeps up, restart Crest.',
}

/**
 * How long the pre-flight probe may take.
 *
 * Longer than the helper's own yt-dlp timeout, because the first request for a
 * track is the one that pays for resolving the googlevideo URL. Probing too
 * tightly turned a slow-but-working track into a failure.
 */
const PROBE_TIMEOUT_MS = 35_000

/**
 * Stream URLs already proven to work, keyed by track id.
 *
 * A resolved URL is good for hours and the helper serves it from cache, so
 * re-playing a track (Previous, Retry, a repeat) can skip the probe entirely.
 * Capping the age well below the helper's own TTL keeps a URL that upstream has
 * since revoked from being handed out twice.
 */
const streamCache = new TtlCache<string>(20 * 60_000, 24)

function helperUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return `${HELPER_BASE}${path}${query ? `?${query}` : ''}`
}

/**
 * How long to wait for the helper to answer before telling the user to restart.
 *
 * On launch the webview mounts and fetches straight away, but the Rust shell is
 * still spawning Node: binding the port takes ~160ms, and longer while the
 * helper retries a port a dying process still holds. The browser reports that
 * window as `TypeError: Failed to fetch`, which is how a freshly installed
 * Crest opened on an empty Home page while the helper came up moments later.
 */
const HELPER_READY_TIMEOUT_MS = 8_000
const HELPER_POLL_MS = 60

let helperReady: Promise<void> | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollForHelper(): Promise<void> {
  const deadline = Date.now() + HELPER_READY_TIMEOUT_MS
  let reason = 'no response'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(helperUrl('/health'), { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
      reason = `status ${response.status}`
    } catch (cause) {
      reason = cause instanceof Error ? cause.message : String(cause)
    }
    await sleep(HELPER_POLL_MS)
  }
  throw new Error(`The local media helper did not start (${reason}).`)
}

/**
 * Memoized so the handful of requests a cold start fires all share one wait
 * instead of each polling on its own. A failure is never cached, so the Retry
 * button — or the next page — can still win once the helper recovers.
 */
function ensureHelperReady(): Promise<void> {
  if (!helperReady) {
    helperReady = pollForHelper().catch((error: unknown) => {
      helperReady = null
      throw error
    })
  }
  return helperReady
}

/**
 * Requests to the helper, after proving it is listening.
 *
 * Only connection failures are retried, and only once: an upstream error (a
 * rate-limited YouTube lookup, say) already came back as a real response and
 * repeating it would just double the wait.
 */
async function fetchHelper(
  path: string,
  params: Record<string, string | number | undefined> = {},
  init: RequestInit = {},
): Promise<Response> {
  await ensureHelperReady()
  try {
    return await fetch(helperUrl(path, params), init)
  } catch (cause) {
    // The helper can also die mid-session — a crash, or the port being taken.
    // Re-checking readiness recovers that without making the user restart.
    helperReady = null
    await ensureHelperReady()
    return await fetch(helperUrl(path, params), init)
  }
}

async function helperGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const response = await fetchHelper(path, params)
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error((detail as { error?: string } | null)?.error ?? `Media helper ${response.status}`)
  }
  return (await response.json()) as T
}

/**
 * Runtime heartbeat: proves the app is alive so the helper shuts down when it
 * is not. Dev also heartbeats from the Vite plugin; production's Tauri shell
 * will send this same request alongside the webview.
 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
export function startHelperHeartbeat(): void {
  if (heartbeatTimer) return
  const beat = () => {
    // Always a real request. The helper counts these and exits after a missed
    // window, so this must never be routed through `ensureHelperReady` — a
    // memoized success would short-circuit it and the helper would shut itself
    // down underneath a running app.
    void fetch(helperUrl('/health'), { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
  }
  // Prime the shared gate in the background at mount so the first content
  // request finds the helper already listening instead of waiting it out.
  void ensureHelperReady().catch(() => undefined)
  beat()
  heartbeatTimer = setInterval(beat, 5_000)
}

/* -------------------------------------------------------------------------- */
/* Mapping to Crest models                                                    */
/* -------------------------------------------------------------------------- */

type HelperTrack = {
  videoId: string
  title: string
  artist: string
  channelId?: string | null
  album?: string | null
  durationSec?: number | null
  thumbnailUrl?: string | null
}

/** True when the page's origin matches where artwork would come from. */
function artworkFor(track: HelperTrack, fallbackSeed: string): Track['artwork'] {
  if (track.thumbnailUrl) return { kind: 'remote', url: track.thumbnailUrl }
  return { kind: 'generated', seed: fallbackSeed }
}

const trackCache = new TtlCache<Track>(60 * 60_000, 400)

function cacheTrack(track: Track): void {
  trackCache.set(track.id, track)
}

export function cachedTrack(id: string): Track | undefined {
  return trackCache.get(id)
}

function mapTrack(raw: HelperTrack): Track | null {
  if (!raw.videoId || !raw.title) return null
  const id = `yt:${raw.videoId}`
  const cached = trackCache.get(id)
  if (cached) return cached
  const artistKey = raw.channelId || encodeURIComponent(raw.artist || 'Unknown artist')
  const track: Track = {
    id,
    title: raw.title,
    artistId: `yt-a:${artistKey}`,
    artistName: raw.artist || 'Unknown artist',
    albumId: raw.album ? `yt-al:${encodeURIComponent(raw.album)}|${encodeURIComponent(raw.artist)}` : '',
    albumName: raw.album ?? raw.title,
    durationMs: Math.round((raw.durationSec ?? 0) * 1000),
    artwork: artworkFor(raw, id),
  }
  trackCache.set(id, track)
  return track
}

function mapTracks(raws: HelperTrack[]): Track[] {
  return raws.map(mapTrack).filter((track): track is Track => track !== null)
}

/** A playlist card as it arrives on a home-feed shelf (a `VL...` browse id). */
type HelperPlaylistShelf = {
  playlistId: string
  title: string
  owner: string
  subtitle?: string
  trackCount?: number | null
  thumbnailUrl?: string | null
}

function mapShelfPlaylist(raw: HelperPlaylistShelf): Playlist | null {
  if (!raw?.playlistId || !raw.title) return null
  const id = `yt-pl:${raw.playlistId}`
  return {
    id,
    name: raw.title,
    owner: raw.owner || 'YouTube Music',
    description: raw.subtitle,
    trackIds: [],
    trackCount: raw.trackCount ?? null,
    artwork: raw.thumbnailUrl
      ? { kind: 'remote', url: raw.thumbnailUrl }
      : { kind: 'generated', seed: raw.playlistId },
  }
}

function mapShelfPlaylists(raws: HelperPlaylistShelf[]): Playlist[] {
  const seen = new Set<string>()
  return raws
    .map(mapShelfPlaylist)
    .filter((playlist): playlist is Playlist => playlist !== null)
    .filter((playlist) => {
      if (seen.has(playlist.id)) return false
      seen.add(playlist.id)
      return true
    })
}

/**
 * The hero carousel used to show one fixed headline over whatever thumbnail
 * happened to be first in the list — which is why it read as filler. It is now
 * built from the editorial shelves: real artwork, a real title, and a Play
 * button that opens the actual playlist.
 */
function buildHeroSlides(shelves: Array<{ title: string; strapline?: string | null; playlists: HelperPlaylistShelf[] }>): HeroContent[] {
  const slides: HeroContent[] = []
  const seen = new Set<string>()

  for (const shelf of shelves) {
    for (const playlist of shelf.playlists ?? []) {
      if (!playlist.playlistId || !playlist.title || seen.has(playlist.playlistId)) continue
      seen.add(playlist.playlistId)
      slides.push({
        eyebrow: shelf.strapline || shelf.title,
        title: playlist.title,
        subtitle: playlist.owner || 'YouTube Music',
        artwork: playlist.thumbnailUrl
          ? { kind: 'remote', url: playlist.thumbnailUrl }
          : { kind: 'generated', seed: playlist.playlistId },
        contextId: `yt-pl:${playlist.playlistId}`,
        contextKind: 'playlist',
      })
      if (slides.length >= 6) return slides
    }
  }
  return slides
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

type HelperAlbum = { title: string; artist: string; year?: number | null; thumbnailUrl?: string | null; tracks: HelperTrack[] }
type HelperPlaylist = { title: string; owner: string; thumbnailUrl?: string | null; tracks: HelperTrack[] }
type HelperArtistDetail = {
  artistId: string
  name: string
  description?: string
  thumbnailUrl?: string | null
  tracks: HelperTrack[]
  albums: Array<{ albumId: string; title: string; artist: string; year?: number | null; thumbnailUrl?: string | null }>
  singles: Array<{ albumId: string; title: string; artist: string; year?: number | null; thumbnailUrl?: string | null }>
}

export class YtProvider implements MusicProvider {
  readonly id = 'yt'
  readonly displayName = 'YouTube Music'

  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    lyrics: 'synced',
    search: true,
    recommendations: true,
    notes: 'Full-length playback via a local yt-dlp pipeline (personal use). Requires the media helper on port 5267.',
  }

  async getHome(options: { mood?: string; region?: string } = {}): Promise<HomeFeed> {
    const mood = options.mood ?? ''
    const region = options.region ?? ''
    const { moods, shelves, quickPicks } = await helperGet<{
      moods: Array<{ id: string; label: string }>
      shelves: Array<{ title: string; strapline?: string | null; tracks: HelperTrack[]; playlists: HelperPlaylistShelf[] }>
      quickPicks: HelperTrack[]
    }>('/home', { mood, region, limit: 8 })

    const sections: HomeFeed['sections'] = []

    // Quick picks — the same list the player should start from. One track per
    // artist, worst uploads already filtered out server-side.
    const picks = mapTracks(quickPicks ?? [])
    if (picks.length > 0) {
      sections.push({ id: 'quick-picks', kind: 'tracks', title: 'Quick picks', items: picks })
    }

    // Editorial shelves, exactly as YouTube Music curates them.
    for (const shelf of shelves ?? []) {
      const playlists = mapShelfPlaylists(shelf.playlists ?? [])
      const tracks = mapTracks(shelf.tracks ?? [])
      if (playlists.length > 0) {
        sections.push({
          id: `shelf:${shelf.title}`,
          kind: 'shelf',
          title: shelf.title,
          strapline: shelf.strapline ?? null,
          items: playlists,
        })
      } else if (tracks.length > 0) {
        sections.push({
          id: `shelf:${shelf.title}`,
          kind: 'tracks',
          title: shelf.title,
          strapline: shelf.strapline ?? null,
          items: tracks,
        })
      }
    }

    const heroSlides = buildHeroSlides(shelves ?? [])

    return {
      hero: heroSlides[0] ?? {
        eyebrow: mood ? mood : 'YouTube Music',
        title: 'Listen to what moves you.',
        subtitle: 'Pick a mood to shape the whole feed.',
        artwork: { kind: 'generated', seed: 'hero-yt' },
        contextId: 'yt-home',
        contextKind: 'mix',
      },
      heroSlides,
      sections,
      moods: moods ?? [],
      activeMood: mood || undefined,
      region: region || undefined,
    }
  }

  /**
   * Countries the home feed can be localized to.
   *
   * Static rather than fetched: the list is part of the app, not of YouTube,
   * and the Settings picker must render before anything is loaded. The helper
   * ignores codes it does not know and falls back to automatic.
   */
  async getRegions(): Promise<Array<{ code: string; name: string }>> {
    return [
      { code: '', name: 'Automatic (my location)' },
      { code: 'US', name: 'United States' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'NZ', name: 'New Zealand' },
      { code: 'IE', name: 'Ireland' },
      { code: 'IN', name: 'India' },
      { code: 'PK', name: 'Pakistan' },
      { code: 'BD', name: 'Bangladesh' },
      { code: 'LK', name: 'Sri Lanka' },
      { code: 'NP', name: 'Nepal' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'EG', name: 'Egypt' },
      { code: 'MA', name: 'Morocco' },
      { code: 'DZ', name: 'Algeria' },
      { code: 'NG', name: 'Nigeria' },
      { code: 'GH', name: 'Ghana' },
      { code: 'KE', name: 'Kenya' },
      { code: 'ZA', name: 'South Africa' },
      { code: 'DE', name: 'Germany' },
      { code: 'AT', name: 'Austria' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'FR', name: 'France' },
      { code: 'BE', name: 'Belgium' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'ES', name: 'Spain' },
      { code: 'PT', name: 'Portugal' },
      { code: 'BR', name: 'Brazil' },
      { code: 'IT', name: 'Italy' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'DK', name: 'Denmark' },
      { code: 'FI', name: 'Finland' },
      { code: 'IS', name: 'Iceland' },
      { code: 'PL', name: 'Poland' },
      { code: 'CZ', name: 'Czechia' },
      { code: 'SK', name: 'Slovakia' },
      { code: 'HU', name: 'Hungary' },
      { code: 'RO', name: 'Romania' },
      { code: 'GR', name: 'Greece' },
      { code: 'TR', name: 'Türkiye' },
      { code: 'UA', name: 'Ukraine' },
      { code: 'RU', name: 'Russia' },
      { code: 'IL', name: 'Israel' },
      { code: 'KR', name: 'South Korea' },
      { code: 'JP', name: 'Japan' },
      { code: 'CN', name: 'China' },
      { code: 'TW', name: 'Taiwan' },
      { code: 'HK', name: 'Hong Kong' },
      { code: 'TH', name: 'Thailand' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'SG', name: 'Singapore' },
      { code: 'PH', name: 'Philippines' },
      { code: 'MX', name: 'Mexico' },
      { code: 'AR', name: 'Argentina' },
      { code: 'CO', name: 'Colombia' },
      { code: 'CL', name: 'Chile' },
      { code: 'PE', name: 'Peru' },
    ]
  }

  async search(query: string): Promise<SearchResults> {
    const needle = query.trim()
    if (!needle) return { query, tracks: [], albums: [], artists: [], playlists: [] }
    const { tracks, albums, artists, playlists } = await helperGet<{
      tracks: HelperTrack[]
      albums: Array<{ albumId: string; title: string; artist: string; year?: number | null; thumbnailUrl?: string | null }>
      artists: Array<{ artistId: string; name: string; thumbnailUrl?: string | null }>
      playlists: Array<{ playlistId: string; title: string; owner: string; thumbnailUrl?: string | null }>
    }>('/search-all', { q: needle })

    const mappedTracks = mapTracks(tracks)
    for (const track of mappedTracks) cacheTrack(track)

    return {
      query,
      tracks: mappedTracks,
      albums: albums.map((raw) => ({
        id: `yt-al:${raw.albumId}`,
        title: raw.title,
        artistId: `yt-a:${encodeURIComponent(raw.artist)}`,
        artistName: raw.artist,
        year: raw.year ?? undefined,
        artwork: raw.thumbnailUrl ? { kind: 'remote', url: raw.thumbnailUrl } : { kind: 'generated', seed: raw.albumId },
        trackIds: [],
        kind: 'album' as const,
      })),
      artists: artists.map((raw) => ({
        id: `yt-a:${raw.artistId}`,
        name: raw.name,
        artwork: raw.thumbnailUrl ? { kind: 'remote', url: raw.thumbnailUrl } : { kind: 'generated', seed: raw.artistId },
      })),
      playlists: playlists.map((raw) => ({
        id: `yt-pl:${raw.playlistId}`,
        name: raw.title,
        owner: raw.owner,
        artwork: raw.thumbnailUrl ? { kind: 'remote', url: raw.thumbnailUrl } : { kind: 'generated', seed: raw.playlistId },
        trackIds: [],
      })),
    }
  }

  async getTrack(id: string): Promise<Track | null> {
    const cached = cachedTrack(id)
    if (cached) return cached
    if (!id.startsWith('yt:')) return null
    const { track } = await helperGet<{ track: HelperTrack | null }>('/track', { vid: id.slice(3) })
    return track ? mapTrack(track) : null
  }

  async getTracks(ids: string[]): Promise<Track[]> {
    const settled = await Promise.all(ids.map((id) => this.getTrack(id)))
    return settled.filter((track): track is Track => track !== null)
  }

  private artistDetailCache = new TtlCache<HelperArtistDetail>(30 * 60_000, 50)

  private async fetchArtistDetail(id: string): Promise<HelperArtistDetail | null> {
    const clean = id.startsWith('yt-a:') ? id.slice(5) : id.startsWith('yt-ar:') ? id.slice(6) : id
    if (!clean) return null
    const cached = this.artistDetailCache.get(clean)
    if (cached) return cached
    try {
      const detail = await helperGet<HelperArtistDetail>('/artist', { id: clean })
      if (detail && detail.name) {
        this.artistDetailCache.set(clean, detail)
        if (detail.artistId) this.artistDetailCache.set(detail.artistId, detail)
        return detail
      }
    } catch {
      /* ignore */
    }
    return null
  }

  async getArtist(id: string): Promise<Artist | null> {
    const detail = await this.fetchArtistDetail(id)
    if (detail) {
      return {
        id,
        name: detail.name,
        artwork: detail.thumbnailUrl ? { kind: 'remote', url: detail.thumbnailUrl } : { kind: 'generated', seed: id },
        genres: undefined,
      }
    }
    const clean = id.startsWith('yt-a:') ? id.slice(5) : id.startsWith('yt-ar:') ? id.slice(6) : id
    const name = decodeURIComponent(clean)
    if (!name) return null
    return { id, name, artwork: { kind: 'generated', seed: id }, genres: undefined }
  }

  async getArtistTracks(id: string): Promise<Track[]> {
    const detail = await this.fetchArtistDetail(id)
    if (detail && detail.tracks.length > 0) {
      const mapped = mapTracks(detail.tracks)
      for (const track of mapped) cacheTrack(track)
      return mapped
    }
    const clean = id.startsWith('yt-a:') ? id.slice(5) : id.startsWith('yt-ar:') ? id.slice(6) : id
    const name = decodeURIComponent(clean)
    if (!name) return []
    const { tracks } = await helperGet<{ tracks: HelperTrack[] }>('/search', { q: name, limit: 25 })
    return mapTracks(tracks)
  }

  async getArtistAlbums(id: string): Promise<Album[]> {
    const detail = await this.fetchArtistDetail(id)
    if (!detail) return []
    const all = [...(detail.albums || []), ...(detail.singles || [])]
    return all.map((raw) => ({
      id: `yt-al:${raw.albumId}`,
      title: raw.title,
      artistId: id,
      artistName: raw.artist || detail.name,
      year: raw.year ?? undefined,
      artwork: raw.thumbnailUrl ? { kind: 'remote', url: raw.thumbnailUrl } : { kind: 'generated', seed: raw.albumId },
      trackIds: [],
      kind: 'album' as const,
    }))
  }

  async getAlbum(id: string): Promise<Album | null> {
    if (!id.startsWith('yt-al:')) return null
    // Album ids from search are `yt-al:MPREb…`; the encoded composite form is
    // only used for name-only albums (no detail page) — resolve those from cache.
    const rawId = id.slice(6)
    if (rawId.startsWith('MPREb') || rawId.startsWith('VL')) {
      const { title, artist, year, thumbnailUrl, tracks } = await helperGet<HelperAlbum>('/album', { id: rawId })
      const mapped = mapTracks(tracks)
      for (const track of mapped) cacheTrack(track)
      return {
        id,
        title,
        artistId: `yt-a:${encodeURIComponent(artist)}`,
        artistName: artist,
        year: year ?? undefined,
        artwork: thumbnailUrl ? { kind: 'remote', url: thumbnailUrl } : { kind: 'generated', seed: id },
        trackIds: mapped.map((track) => track.id),
        kind: 'album',
      }
    }
    return null
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    if (!id.startsWith('yt-pl:')) return null
    const rawId = id.slice(6)
    const { title, owner, thumbnailUrl, tracks } = await helperGet<HelperPlaylist>('/playlist', { id: rawId })
    const mapped = mapTracks(tracks)
    for (const track of mapped) cacheTrack(track)
    return {
      id,
      name: title,
      owner,
      description: undefined,
      artwork: thumbnailUrl ? { kind: 'remote', url: thumbnailUrl } : { kind: 'generated', seed: id },
      trackIds: mapped.map((track) => track.id),
    }
  }

  async getMix(id: string): Promise<Mix | null> {
    if (id === 'yt-trending') {
      const feed = await this.getHome()
      const section = feed.sections.find((entry) => entry.kind === 'tracks')
      const items = section && section.kind === 'tracks' ? section.items : []
      return {
        id,
        title: 'Popular on YouTube Music',
        subtitle: 'What the world is listening to',
        artwork: items[0]?.artwork ?? { kind: 'generated', seed: id },
        trackIds: items.map((track) => track.id),
      }
    }
    const playlist = await this.getPlaylist(id)
    if (!playlist) return null
    return {
      id: playlist.id,
      title: playlist.name,
      subtitle: `Playlist · ${playlist.owner}`,
      artwork: playlist.artwork,
      trackIds: playlist.trackIds,
    }
  }

  async getLyrics(trackId: string): Promise<Lyrics | null> {
    const track = await this.getTrack(trackId)
    if (!track) return null
    return lrclibLyrics({
      title: track.title,
      artist: track.artistName,
      album: track.albumName,
      durationMs: track.durationMs,
    })
  }

  async getRecommendations(seedId: string, limit = 12): Promise<Track[]> {
    const videoId = seedId.startsWith('yt:') ? seedId.slice(3).trim() : ''
    if (!videoId) return []
    // YouTube Music's own per-track recommendations, filtered server-side. The
    // old implementation searched `"${artist} songs"`, which could only ever
    // return more of the same artist and had nothing to do with the track.
    const { tracks } = await helperGet<{ tracks: HelperTrack[] }>('/related', { vid: videoId, limit })
    return mapTracks(tracks).filter((track) => track.id !== seedId)
  }

  /**
   * Resolve a track's audio URL ahead of time.
   *
   * Playback resolves through yt-dlp, a child process that takes a second or
   * two. Doing that when a track *starts* is what makes every skip feel dead.
   * Doing it for the next track while the current one plays means the URL is
   * already cached by the time it is needed.
   */
  async prewarm(trackId: string): Promise<void> {
    const videoId = trackId.startsWith('yt:') ? trackId.slice(3).trim() : ''
    if (!videoId) return
    // Fire and forget: a failed prewarm is invisible, and the player falls back
    // to resolving on demand exactly as it did before. It goes through
    // `fetchHelper` so a cold helper is waited out rather than dropped — the
    // old raw `fetch` threw at a helper that was still binding its port and the
    // next track started cold.
    await fetchHelper('/prewarm', { vid: videoId }).catch(() => undefined)
  }

  /**
   * A radio queue seeded from a track.
   *
   * Used to refill the queue when it runs dry, so playback continues from what
   * was just playing instead of replaying whatever Home happened to load.
   */
  async getRadio(seedId: string, limit = 50): Promise<Track[]> {
    const videoId = seedId.startsWith('yt:') ? seedId.slice(3).trim() : ''
    if (!videoId) return []
    const { tracks } = await helperGet<{ tracks: HelperTrack[] }>('/radio', { vid: videoId, limit })
    return mapTracks(tracks).filter((track) => track.id !== seedId)
  }

  async getStream(trackId: string): Promise<AudioStream> {
    if (!trackId.startsWith('yt:')) {
      return { kind: 'unavailable', reason: 'Not a YouTube Music track.' }
    }
    const videoId = trackId.slice(3).trim()
    if (!videoId) {
      return { kind: 'unavailable', reason: 'Invalid track ID.' }
    }
    // Already proven playable and the URL has not aged out: hand it straight
    // back. Skipping back to a track, or hitting Retry, costs nothing.
    const known = streamCache.get(trackId)
    if (known) return { kind: 'url', url: known, mimeType: 'audio/mp4' }
    // Confirm the helper is listening before handing the player a URL that
    // would 404; the error message keeps the UI honest about what is wrong.
    // `ensureHelperReady` already waits out the startup window and retries a
    // single mid-session death, so this is a cheap check in the common case.
    try {
      await ensureHelperReady()
    } catch {
      return { kind: 'unavailable', reason: STREAM_REASONS.helper_down }
    }

    // Ask for two bytes before committing to playback. If the audio cannot be
    // resolved we find out here, where the failure can still be explained,
    // instead of inside the media element, which can only say "unsupported
    // source". The resolution is cached, so the element's own request for the
    // full track is served without a second yt-dlp run.
    //
    // `fetchHelper` (not a raw `fetch`) because this used to go around the
    // readiness gate: the gate is memoized, so after the helper died
    // mid-session it still reported "ready", this request failed as a bare
    // connection error, and every track came back "lost contact with the
    // media helper" until the app was restarted. `fetchHelper` re-checks
    // readiness once on exactly that failure.
    try {
      const probe = await fetchHelper('/audio', { vid: videoId }, {
        headers: { Range: 'bytes=0-1' },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (!probe.ok) {
        const detail = (await probe.json().catch(() => null)) as { reason?: string } | null
        const reason = detail?.reason ?? 'error'
        if (reason === 'rate_limited') {
          return { kind: 'unavailable', reason: STREAM_REASONS.rate_limited }
        }
        return { kind: 'unavailable', reason: STREAM_REASONS[reason] ?? STREAM_REASONS.error }
      }
      await probe.arrayBuffer()
    } catch {
      return { kind: 'unavailable', reason: STREAM_REASONS.helper_down }
    }

    // The proxied URL never expires and supports Range; the player seeks freely.
    const streamUrl = helperUrl('/audio', { vid: videoId }).trim()
    streamCache.set(trackId, streamUrl)
    return { kind: 'url', url: streamUrl, mimeType: 'audio/mp4' }
  }
}

export const ytProvider = new YtProvider()
