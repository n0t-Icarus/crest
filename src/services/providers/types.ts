/**
 * Provider contract.
 *
 * The UI only ever talks to this interface. Swapping the catalogue backend
 * (local files, an official streaming API, or an opt-in unofficial provider)
 * must not require a single change in the components — they consume these
 * models and nothing else.
 */

export type ArtworkRef =
  | { kind: 'generated'; seed: string }
  | { kind: 'remote'; url: string }
  | { kind: 'local'; path: string }
  | { kind: 'none' }

export type Artist = {
  id: string
  name: string
  artwork: ArtworkRef
  monthlyListeners?: number
  genres?: string[]
}

export type Album = {
  id: string
  title: string
  artistId: string
  artistName: string
  year?: number
  artwork: ArtworkRef
  trackIds: string[]
  kind?: 'album' | 'single' | 'ep' | 'compilation'
}

export type Track = {
  id: string
  title: string
  artistId: string
  artistName: string
  albumId: string
  albumName: string
  durationMs: number
  artwork: ArtworkRef
  explicit?: boolean
  playCount?: number
  addedAt?: number
  /** Playback is a provider-hosted short preview, not the full recording. */
  preview?: boolean
}

export type Playlist = {
  id: string
  name: string
  description?: string
  owner: string
  trackIds: string[]
  artwork: ArtworkRef
  /** Track count as reported by the source. Shelf playlists arrive empty and
   *  are counted server-side, so `trackIds.length` alone is misleading. */
  trackCount?: number | null
  /** True for playlists the user created or owns. */
  editable?: boolean
  updatedAt?: number
}

/** A generated "Made for You" style collection. */
export type Mix = {
  id: string
  title: string
  subtitle: string
  artwork: ArtworkRef
  trackIds: string[]
}

export type LyricLine = {
  text: string
  /** Present for timestamped / synced lyrics. */
  startMs?: number
}

export type Lyrics = {
  trackId: string
  lines: LyricLine[]
  synced: boolean
  source?: string
}

export type SearchType = 'tracks' | 'albums' | 'artists' | 'playlists'

export type SearchResults = {
  query: string
  tracks: Track[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
}

export type HeroContent = {
  eyebrow?: string
  title: string
  subtitle: string
  artwork: ArtworkRef
  /** What the Play button should start. */
  contextId: string
  contextKind: 'playlist' | 'mix' | 'album'
}

/** A mood chip (Relax, Feel good, Focus …) used to re-filter the home feed. */
export type MoodChip = { id: string; label: string }

export type HomeSection =
  | { id: string; kind: 'tracks'; title: string; items: Track[]; strapline?: string | null }
  | { id: string; kind: 'mixes'; title: string; items: Mix[]; strapline?: string | null }
  | { id: string; kind: 'playlists'; title: string; items: Playlist[]; strapline?: string | null }
  /** Editorial shelf as YouTube Music returns it: a caption plus its own rail. */
  | { id: string; kind: 'shelf'; title: string; strapline?: string | null; items: Playlist[] }

export type HomeFeed = {
  hero: HeroContent
  /** Extra hero slides for the banner carousel (the first slide is `hero`). */
  heroSlides?: HeroContent[]
  sections: HomeSection[]
  /** Mood chips for the rail at the top of Home. */
  moods?: MoodChip[]
  /** Mood currently applied to the feed; absent means unfiltered. */
  activeMood?: string
  /** Country the feed was built for (ISO code); absent means automatic. */
  region?: string
}

export type AudioStream =
  | { kind: 'url'; url: string; mimeType?: string }
  | { kind: 'local'; path: string }
  | { kind: 'unavailable'; reason: string }

export type ProviderCapabilities = {
  /** Provider can hand back playable media (false = metadata only). */
  streaming: boolean
  lyrics: 'none' | 'plain' | 'synced'
  search: boolean
  recommendations: boolean
  /** Shown in Settings → Advanced so the active backend is never a mystery. */
  notes?: string
}

export type ProviderErrorCode = 'network' | 'not-found' | 'unavailable' | 'rate-limited' | 'unknown'

/** Provider-level failure with a user-presentable message. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryable: boolean

  constructor(code: ProviderErrorCode, message: string, retryable = true) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryable = retryable
  }
}

export interface MusicProvider {
  readonly id: string
  readonly displayName: string
  readonly capabilities: ProviderCapabilities

  getHome(options?: { signal?: AbortSignal; mood?: string; region?: string }): Promise<HomeFeed>
  search(query: string, options?: { signal?: AbortSignal }): Promise<SearchResults>
  getTrack(id: string): Promise<Track | null>
  getTracks(ids: string[]): Promise<Track[]>
  getArtist(id: string): Promise<Artist | null>
  getArtistTracks(id: string): Promise<Track[]>
  getArtistAlbums?(id: string): Promise<Album[]>
  getAlbum(id: string): Promise<Album | null>
  getPlaylist(id: string): Promise<Playlist | null>
  getMix(id: string): Promise<Mix | null>
  getLyrics(trackId: string): Promise<Lyrics | null>
  getRecommendations(seedId: string, limit?: number): Promise<Track[]>
  /**
   * A radio queue seeded from a track. Optional: providers that can build an
   * endless queue from what is playing use this instead of `getRecommendations`,
   * so playback continues on-theme instead of stopping after a few tracks.
   */
  getRadio?(seedId: string, limit?: number): Promise<Track[]>  /**
   * Start resolving a track's audio before it is needed. Optional and
   * best-effort: providers that resolve media slowly use this to hide the
   * latency behind whatever the listener is currently playing.
   */
  prewarm?(trackId: string): Promise<void>
  /** Playable media for a track, or an explanation of why there is none. */
  getStream(trackId: string): Promise<AudioStream>
}
