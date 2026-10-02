/**
 * YouTube Music metadata via youtubei.js.
 *
 * Fast, unified search and comprehensive artist/album resolution.
 * Supports complete discography and song catalogues matching Spotify's experience.
 */

import { TtlCache } from './ttl.mjs'
import { curateTracks, curateCollections } from './quality.mjs'
import { moodChips, homeShelves, relatedTracks, radioTracks } from './home.mjs'
import { getInnertube } from './innertube.mjs'


/* -------------------------------------------------------------------------- */
/* Shapers                                                                    */
/* -------------------------------------------------------------------------- */

function text(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value.text === 'string') return value.text
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text ?? '').join('')
  return String(value)
}

function pickId(item) {
  return (
    item?.on_tap?.payload?.videoId ??
    item?.on_tap?.payload?.browseId ??
    item?.endpoint?.payload?.videoId ??
    item?.endpoint?.payload?.browseId ??
    item?.videoId ??
    item?.playlistId ??
    item?.albumId ??
    item?.artistId ??
    item?.id ??
    null
  )
}

function thumbnail(item) {
  if (!item) return null
  if (Array.isArray(item?.thumbnail)) return item.thumbnail.at(-1)?.url ?? null
  const list = item?.thumbnail?.contents ?? item?.thumbnails ?? []
  if (Array.isArray(list) && list.length > 0) return list.at(-1)?.url ?? null
  if (typeof item?.thumbnail === 'string') return item.thumbnail
  return null
}

function parseDuration(textValue) {
  const matches = textValue?.match(/(\d{1,2}:\d{2}(?::\d{2})?)/g)
  if (!matches) return null
  const parts = matches.at(-1).split(':').map(Number)
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
}

function numericDuration(item, subtitle) {
  return item?.duration?.seconds ?? item?.duration_seconds ?? item?.durationSec ?? parseDuration(subtitle)
}

/** Subtitle: "Song • Coldplay • 4:33" → { kind, artist, tail } */
function splitSubtitle(item) {
  const raw = text(item?.subtitle ?? item?.flex_columns?.[1]?.title)
  const segments = raw.split(' • ').map((segment) => segment.trim())
  return { kind: segments[0] ?? '', artist: segments[1] ?? '', tail: segments.slice(2).join(' • '), raw }
}

const albumMetaCache = new TtlCache(30 * 60_000, 100)
const playlistMetaCache = new TtlCache(30 * 60_000, 100)
const artistCache = new TtlCache(30 * 60_000, 100)
const artistNameToChannelCache = new TtlCache(60 * 60_000, 200)

function flattenContents(contents) {
  const out = []
  for (const item of contents ?? []) {
    if (item?.type === 'ItemSection' && Array.isArray(item.contents)) out.push(...flattenContents(item.contents))
    else out.push(item)
  }
  return out
}

function toTrack(item) {
  const id =
    item?.on_tap?.payload?.videoId ??
    item?.endpoint?.payload?.videoId ??
    item?.title?.endpoint?.payload?.videoId ??
    item?.videoId ??
    item?.id ??
    null

  if (!id || typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null
  const title = text(item?.title ?? item?.name ?? item?.flex_columns?.[0]?.title)
  if (!title) return null

  const { kind, artist: subArtist } = splitSubtitle(item)
  if (/^(album|single|ep|artist|playlist)$/i.test(kind)) return null

  const artist =
    text(item?.artists?.[0]?.name ?? item?.author?.name ?? item?.authors?.[0]?.name) ||
    subArtist ||
    ''

  const channelId = item?.artists?.[0]?.channel_id ?? item?.author?.channel_id ?? null

  const album =
    (item?.album ? text(item.album) : null) ??
    (item?.item_type === 'song' && item?.flex_columns?.[0]?.title && text(item.flex_columns[0].title) !== title
      ? text(item.flex_columns[0].title)
      : null)

  const durationSec = numericDuration(item, item?.subtitle?.text ?? item?.flex_columns?.[1]?.title?.text)

  return {
    videoId: id,
    title,
    artist,
    channelId,
    album,
    durationSec,
    thumbnailUrl: thumbnail(item) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  }
}

function toAlbum(item) {
  const id = pickId(item)
  if (!id) return null
  const title = text(item?.title ?? item?.name ?? item?.flex_columns?.[0]?.title)
  if (!title) return null
  const { artist: subArtist, tail } = splitSubtitle(item)
  const artist = text(item?.author?.name ?? item?.artists?.[0]?.name) || subArtist || ''
  const yearMatch = (tail || text(item?.subtitle)).match(/\b(19|20)\d{2}\b/)
  const year = item?.year ? Number(item.year) : yearMatch ? Number(yearMatch[0]) : null
  return { albumId: id, title, artist, year, thumbnailUrl: thumbnail(item) }
}

function toArtist(item) {
  const id = pickId(item)
  const name = text(item?.name ?? item?.title ?? item?.flex_columns?.[0]?.title)
  if (!id || !name) return null
  return { artistId: id, name, thumbnailUrl: thumbnail(item) }
}

function toPlaylist(item) {
  const id = pickId(item)
  const title = text(item?.title ?? item?.name ?? item?.flex_columns?.[0]?.title)
  if (!id || !title) return null
  const { artist } = splitSubtitle(item)
  return { playlistId: id, title, owner: artist || text(item?.author?.name), thumbnailUrl: thumbnail(item) }
}

/* -------------------------------------------------------------------------- */
/* Unified Fast Search                                                        */
/* -------------------------------------------------------------------------- */

export async function searchAll(query) {
  const q = (query || '').trim()
  if (!q) return { tracks: [], albums: [], artists: [], playlists: [] }

  const yt = await getInnertube()
  const response = await yt.music.search(q)
  const tracks = []
  const albums = []
  const artists = []
  const playlists = []
  const seenTracks = new Set()

  for (const container of response?.contents ?? []) {
    // Top hit card (e.g. 505 by Arctic Monkeys)
    if (container?.type === 'MusicCardShelf') {
      const vid =
        container?.endpoint?.payload?.videoId ??
        container?.title?.endpoint?.payload?.videoId ??
        container?.on_tap?.payload?.videoId ??
        null

      if (vid && /^[A-Za-z0-9_-]{11}$/.test(vid)) {
        const topTrack = toTrack(container)
        if (topTrack && !seenTracks.has(topTrack.videoId)) {
          seenTracks.add(topTrack.videoId)
          tracks.push(topTrack)
        }
      }
    }

    const items = container?.contents || [container]
    for (const item of items) {
      if (!item) continue
      const type = item.item_type

      if (type === 'song' || type === 'video' || (item.id && /^[A-Za-z0-9_-]{11}$/.test(item.id))) {
        const track = toTrack(item)
        if (track && !seenTracks.has(track.videoId)) {
          seenTracks.add(track.videoId)
          tracks.push(track)
          if (track.artist && track.channelId) {
            artistNameToChannelCache.set(track.artist.toLowerCase(), track.channelId)
          }
        }
      } else if (type === 'artist' || (item.id && item.id.startsWith('UC'))) {
        const artist = toArtist(item)
        if (artist && !artists.some((a) => a.artistId === artist.artistId)) {
          artists.push(artist)
          artistNameToChannelCache.set(artist.name.toLowerCase(), artist.artistId)
        }
      } else if (type === 'album' || (item.id && item.id.startsWith('MPREb'))) {
        const album = toAlbum(item)
        if (album && !albums.some((a) => a.albumId === album.albumId)) {
          albums.push(album)
          albumMetaCache.set(album.albumId, album)
        }
      } else if (type === 'playlist' || (item.id && (item.id.startsWith('VL') || item.id.startsWith('PL')))) {
        const playlist = toPlaylist(item)
        if (playlist && !playlists.some((p) => p.playlistId === playlist.playlistId)) {
          playlists.push(playlist)
          playlistMetaCache.set(playlist.playlistId, playlist)
        }
      }
    }
  }

  return {
    // Search results used to bypass the quality gate entirely, which is how a
    // search for "505 arctic monkeys" came back with a slowed copy, a techno
    // remix, a sped-up upload and a band documentary. `perArtist: 0` keeps every
    // real song by the act you searched for; the variant collapse is what drops
    // the duplicates of the same recording.
    tracks: curateTracks(tracks, { perArtist: 0, limit: 30, collapseAcrossArtists: true, query }),
    albums: albums.slice(0, 10),
    artists: artists.slice(0, 8),
    playlists: curateCollections(playlists, 8),
  }
}

export async function searchMusics(query, limit = 20) {
  const { tracks } = await searchAll(query)
  return tracks.slice(0, limit)
}

export async function searchAlbums(query, limit = 8) {
  const { albums } = await searchAll(query)
  return albums.slice(0, limit)
}

export async function searchArtists(query, limit = 8) {
  const { artists } = await searchAll(query)
  return artists.slice(0, limit)
}

export async function searchPlaylists(query, limit = 8) {
  const { playlists } = await searchAll(query)
  return playlists.slice(0, limit)
}

/* -------------------------------------------------------------------------- */
/* Full Artist Detail & Discography                                           */
/* -------------------------------------------------------------------------- */

async function resolveArtistChannelId(nameOrId) {
  const clean = decodeURIComponent(nameOrId).replace(/^yt-a[r]?:/, '').trim()
  if (clean.startsWith('UC')) return clean

  const cached = artistNameToChannelCache.get(clean.toLowerCase())
  if (cached) return cached

  const yt = await getInnertube()
  const res = await yt.music.search(clean)
  for (const c of res?.contents ?? []) {
    for (const it of c.contents ?? [c]) {
      if (it?.item_type === 'artist' && it?.id?.startsWith('UC')) {
        artistNameToChannelCache.set(clean.toLowerCase(), it.id)
        return it.id
      }
      const chId = it?.artists?.[0]?.channel_id ?? it?.author?.channel_id
      if (chId?.startsWith('UC')) {
        artistNameToChannelCache.set(clean.toLowerCase(), chId)
        return chId
      }
    }
  }
  return null
}

export async function artistDetails(rawId) {
  const clean = decodeURIComponent(rawId).replace(/^yt-a[r]?:/, '').trim()
  const cacheKey = `artist:${clean}`
  const cached = artistCache.get(cacheKey)
  if (cached) return cached

  const channelId = await resolveArtistChannelId(clean)
  const yt = await getInnertube()

  if (channelId) {
    try {
      const artist = await yt.music.getArtist(channelId)
      const name = artist.header?.title?.text || text(artist.header?.title) || clean
      const description = artist.header?.description?.text || text(artist.header?.description) || ''
      const thumbnailUrl =
        artist.header?.thumbnail?.contents?.[0]?.url ||
        thumbnail(artist.header) ||
        null

      let tracks = []
      const s0 = artist.sections?.[0]
      // Artist full songs playlist
      if (s0?.endpoint?.payload?.browseId) {
        const plId = s0.endpoint.payload.browseId.replace(/^VL/, '')
        const pl = await yt.music.getPlaylist(plId).catch(() => null)
        if (pl?.items && pl.items.length > 0) {
          tracks = pl.items
            .map((it) => ({
              videoId: it.id,
              title: it.title?.toString() || it.name || text(it.title),
              artist: name,
              album: it.album?.name || null,
              durationSec: it.duration?.seconds ?? parseDuration(it.duration?.text),
              thumbnailUrl:
                it.thumbnail?.contents?.[0]?.url ||
                it.thumbnails?.[0]?.url ||
                (it.id ? `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg` : null),
            }))
            .filter((t) => t.videoId && t.title)
        }
      }

      if (tracks.length === 0 && s0?.contents) {
        tracks = s0.contents
          .map((it) => ({
            videoId: it.id,
            title: it.title?.toString() || it.name || text(it.title),
            artist: name,
            album: it.album?.name || null,
            durationSec: it.duration?.seconds,
            thumbnailUrl: thumbnail(it) ?? (it.id ? `https://i.ytimg.com/vi/${it.id}/hqdefault.jpg` : null),
          }))
          .filter((t) => t.videoId && t.title)
      }

      // Albums & singles
      const albSec = artist.sections?.find((s) => /albums/i.test(s.header?.title?.text || s.title?.text || ''))
      const albums = (albSec?.contents || [])
        .map((it) => ({
          albumId: it.id,
          title: it.title?.toString() || it.title?.text || text(it.title),
          artist: name,
          year: it.year ? Number(it.year) : null,
          thumbnailUrl:
            it.thumbnail?.[0]?.url ||
            it.thumbnail?.contents?.[0]?.url ||
            it.thumbnails?.[0]?.url ||
            thumbnail(it),
        }))
        .filter((a) => a.albumId && a.title)

      const singleSec = artist.sections?.find((s) => /singles|ep/i.test(s.header?.title?.text || s.title?.text || ''))
      const singles = (singleSec?.contents || [])
        .map((it) => ({
          albumId: it.id,
          title: it.title?.toString() || it.title?.text || text(it.title),
          artist: name,
          year: it.year ? Number(it.year) : null,
          thumbnailUrl:
            it.thumbnail?.[0]?.url ||
            it.thumbnail?.contents?.[0]?.url ||
            it.thumbnails?.[0]?.url ||
            thumbnail(it),
        }))
        .filter((a) => a.albumId && a.title)

      const result = {
        artistId: channelId,
        name,
        description,
        thumbnailUrl,
        tracks,
        albums,
        singles,
      }

      artistCache.set(cacheKey, result)
      return result
    } catch (err) {
      console.warn('[ytmusic] getArtist failed, falling back to search:', err)
    }
  }

  // Fallback: search tracks for this artist name
  const { tracks: searchTracks, albums: searchAlbums } = await searchAll(clean)
  const filtered = searchTracks.filter((t) => !t.artist || t.artist.toLowerCase().includes(clean.toLowerCase()))
  const result = {
    artistId: clean,
    name: clean,
    description: '',
    thumbnailUrl: filtered[0]?.thumbnailUrl ?? null,
    tracks: filtered,
    albums: searchAlbums,
    singles: [],
  }
  artistCache.set(cacheKey, result)
  return result
}

export async function artistSongs(artistId) {
  const details = await artistDetails(artistId)
  return {
    name: details.name,
    thumbnailUrl: details.thumbnailUrl,
    tracks: details.tracks,
  }
}

/* -------------------------------------------------------------------------- */
/* Track & Album Details                                                      */
/* -------------------------------------------------------------------------- */

export async function trackDetails(videoId) {
  if (!videoId) return null
  const yt = await getInnertube()
  const track = await yt.music.getInfo(videoId)
  const info = track?.basic_info ?? {}
  if (!info.title) return null
  return {
    videoId,
    title: info.title,
    artist: info.author ?? info.channel?.name ?? '',
    album: null,
    durationSec: info.duration ?? null,
    thumbnailUrl: info.thumbnail?.at(-1)?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

export async function albumTracks(albumId) {
  const yt = await getInnertube()
  const response = await yt.music.getAlbum(albumId)
  const cached = albumMetaCache.get(albumId) ?? null

  const header = response?.header
  const title = header?.title?.text || text(header?.title) || cached?.title || text(response?.title ?? '')
  const artist =
    header?.strapline_text_one?.text ||
    text(header?.strapline_text_one) ||
    cached?.artist ||
    text(response?.author?.name ?? response?.artist?.name ?? '')

  const yearMatch = (header?.subtitle?.text || text(header?.subtitle)).match(/\b(19|20)\d{2}\b/)
  const year = cached?.year ?? (yearMatch ? Number(yearMatch[0]) : response?.year ?? null)
  const thumbnailUrl =
    header?.thumbnail?.contents?.[0]?.url ||
    cached?.thumbnailUrl ||
    thumbnail(response)

  const tracks = (response?.contents ?? response?.tracks ?? [])
    .map(toTrack)
    .filter(Boolean)
    .map((track) => ({
      ...track,
      artist: track.artist || artist,
      album: track.album || title || null,
      thumbnailUrl: track.thumbnailUrl || thumbnailUrl,
    }))

  return {
    title,
    artist,
    year,
    thumbnailUrl,
    tracks,
  }
}

export async function playlistTracks(playlistId) {
  const yt = await getInnertube()
  const response = await yt.music.getPlaylist(playlistId)
  const cached = playlistMetaCache.get(playlistId) ?? null
  const items = response?.items ?? []
  const tracks = items.map(toTrack).filter(Boolean)
  return {
    title: cached?.title ?? text(response?.title ?? ''),
    owner: cached?.owner ?? text(response?.author?.name ?? response?.owner ?? ''),
    thumbnailUrl: cached?.thumbnailUrl ?? thumbnail(response),
    tracks,
  }
}

/**
 * Home feed.
 *
 * Previously `searchAll('top songs this week')` — a global text search, which is
 * why Home felt like random filler. Now it is YouTube Music's actual editorial
 * home feed, optionally filtered by a mood chip, from `home.mjs`.
 */
export async function homeFeed({ mood = '', limit = 8 } = {}) {
  const shelves = await homeShelves({ mood, limit })

  // The YTM home feed is made of playlist carousels — no song rows. Quick picks
  // needs actual tracks, so the top editorial playlists are opened and their
  // tracks pulled through the same quality gate.
  const quickPicks = await quickPicksFrom(shelves, 10).catch((err) => {
    console.warn('[ytmusic] quick picks failed:', err?.message)
    return []
  })

  return {
    moods: await moodChips(),
    shelves,
    quickPicks,
  }
}

const quickPicksCache = new TtlCache(10 * 60_000, 30)

async function quickPicksFrom(shelves, limit) {
  const sources = []
  for (const shelf of shelves) {
    for (const playlist of shelf.playlists ?? []) sources.push(playlist)
    if (sources.length >= 2) break
  }
  if (!sources.length) return []

  const key = sources.map((s) => s.playlistId).join('|')
  const cached = quickPicksCache.get(key)
  if (cached) return cached

  const batches = await Promise.all(
    sources.map(async (playlist) => {
      try {
        const { tracks } = await playlistTracks(playlist.playlistId)
        return tracks.map((track) => ({
          ...track,
          // Trust the shelf over the playlist header for attribution; the
          // header is frequently the channel that owns the compilation.
          channelName: track.artist || null,
        }))
      } catch (err) {
        console.warn('[ytmusic] quick picks source failed:', playlist.playlistId, err?.message)
        return []
      }
    }),
  )

  const curated = curateTracks(batches.flat(), { perArtist: 1, limit })
  quickPicksCache.set(key, curated)
  return curated
}

export { moodChips, homeShelves, relatedTracks, radioTracks, curateTracks, curateCollections }
