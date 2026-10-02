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

function helperUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return `${HELPER_BASE}${path}${query ? `?${query}` : ''}`
}

async function helperGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const response = await fetch(helperUrl(path, params))
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
    void fetch(helperUrl('/health'), { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
  }
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

  async getHome(options: { mood?: string } = {}): Promise<HomeFeed> {
    const mood = options.mood ?? ''
    const { moods, shelves, quickPicks } = await helperGet<{
      moods: Array<{ id: string; label: string }>
      shelves: Array<{ title: string; strapline?: string | null; tracks: HelperTrack[]; playlists: HelperPlaylistShelf[] }>
      quickPicks: HelperTrack[]
    }>('/home', { mood, limit: 8 })

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
    }
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
    // to resolving on demand exactly as it did before.
    await fetch(helperUrl('/prewarm', { vid: videoId })).catch(() => undefined)
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
    // Confirm the helper is alive before handing the player a URL that will
    // 404; the error message keeps the UI honest about what's wrong. Retry once
    // to cover the helper's port-retry window after a crash.
    let helperAlive = false
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const health = await fetch(helperUrl('/health'), { signal: AbortSignal.timeout(4000) })
        if (health.ok) { helperAlive = true; break }
      } catch { /* retry */ }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000))
    }
    if (!helperAlive) {
      return { kind: 'unavailable', reason: 'The local media helper is not running. Restart Crest to start it.' }
    }
    // The proxied URL never expires and supports Range; the player seeks freely.
    const streamUrl = helperUrl('/audio', { vid: videoId }).trim()
    return { kind: 'url', url: streamUrl, mimeType: 'audio/mp4' }
  }
}

export const ytProvider = new YtProvider()
