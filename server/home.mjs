/**
 * Home feed, moods, related tracks and radio — the surfaces that used to be
 * faked with a text search.
 *
 * Everything here is built from calls that work without a signed-in session
 * (verified against youtubei.js 18.x):
 *
 *   getHomeFeed()    → editorial shelves + the mood chip cloud
 *   applyFilter()    → the same shelves, filtered by a mood chip
 *   getRelated()     → per-track recommendations
 *   getUpNext()      → a real radio queue
 *
 * getLibrary() is deliberately absent: it requires sign-in and throws.
 *
 * The previous implementation of the home feed was `searchAll('top songs this
 * week')`, which is a global text search — the reason Home felt random.
 */

import { curateTracks, curateCollections } from './quality.mjs'
import { getInnertube } from './innertube.mjs'

const txt = (value) => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value.text === 'string') return value.text
  if (Array.isArray(value.runs)) return value.runs.map((run) => run.text ?? '').join('')
  return ''
}

const thumb = (item) => {
  if (!item) return null
  if (Array.isArray(item?.thumbnail)) return item.thumbnail.at(-1)?.url ?? null
  const list = item?.thumbnail?.contents ?? item?.thumbnails ?? []
  if (Array.isArray(list) && list.length > 0) return list.at(-1)?.url ?? null
  if (typeof item?.thumbnail === 'string') return item.thumbnail
  return null
}

const shelfTitle = (shelf) => txt(shelf?.header?.title) || txt(shelf?.header) || ''

/**
 * Playlist rows on the home feed are two-column cards (`MusicTwoRowItem`).
 * Their id is a `VL...` browse id, which `/playlist` already resolves.
 */
function toShelfPlaylist(item) {
  const browseId = item?.endpoint?.payload?.browseId ?? item?.id ?? null
  if (!browseId || typeof browseId !== 'string' || !/^VL/.test(browseId)) return null
  const title = txt(item?.title)
  if (!title) return null
  const owner = txt(item?.subtitle) || txt(item?.author?.name) || ''
  const count = Number(item?.item_count ?? 0)
  return {
    playlistId: browseId,
    title,
    owner: owner.split(' • ')[0] ?? owner,
    subtitle: txt(item?.subtitle),
    trackCount: Number.isFinite(count) && count > 0 ? count : null,
    thumbnailUrl: thumb(item),
  }
}

/**
 * Song rows inside shelves and related panels (`MusicResponsiveListItem`).
 * The video id lives in `id`; the artist is the second flex column.
 */
function toShelfTrack(item) {
  const videoId = item?.id
  if (!videoId || typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null
  const title = txt(item?.title)
  if (!title) return null
  const flex = item?.flex_columns ?? []
  const artist = txt(flex[1]?.title) || txt(item?.subtitle?.runs?.[0]?.text)
  const durationSec = item?.duration?.seconds ?? null
  return {
    videoId,
    title,
    artist: artist.split(' • ')[0] ?? artist,
    channelId: item?.author?.channel_id ?? item?.artists?.[0]?.channel_id ?? null,
    channelName: txt(item?.author?.name) || txt(item?.artists?.[0]?.name) || null,
    album: txt(item?.album) || null,
    durationSec,
    thumbnailUrl: thumb(item) ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

function readShelf(shelf) {
  const items = shelf?.contents ?? []
  const tracks = []
  const playlists = []
  for (const item of items) {
    if (!item) continue
    if (item.type === 'MusicTwoRowItem') {
      const playlist = toShelfPlaylist(item)
      if (playlist) playlists.push(playlist)
      continue
    }
    if (item.type === 'MusicResponsiveListItem' || item.type === 'MusicMultiRowListItem') {
      const track = toShelfTrack(item)
      if (track) tracks.push(track)
    }
  }
  return {
    title: shelfTitle(shelf),
    strapline: txt(shelf?.header?.strapline) || null,
    tracks: curateTracks(tracks, { perArtist: 0, limit: 20 }),
    playlists: curateCollections(playlists, 20),
  }
}

/** Drop the YouTube Music service shelves that are not music content. */
function isMusicShelf(shelf) {
  const title = shelfTitle(shelf).toLowerCase()
  if (!title) return false
  return !/podcast|podcasts|episode|episodes/.test(title)
}

/* -------------------------------------------------------------------------- */
/* Moods                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The chip rail. These are YouTube Music's own curated moods (Feel good,
 * Energize, Focus, Sleep …) — the same taxonomy the reference app shows.
 */
export async function moodChips() {
  const yt = await getInnertube()
  const cached = readHomeCache('home')
  const home = cached ?? (await yt.music.getHomeFeed())
  if (!cached) writeHomeCache('home', home)
  const chips = (home?.header?.chips ?? [])
    .map((chip) => ({ id: txt(chip?.text), label: txt(chip?.text), selected: Boolean(chip?.is_selected) }))
    .filter((chip) => chip.label && chip.id.toLowerCase() !== 'podcasts')
  return chips
}

/* -------------------------------------------------------------------------- */
/* Home shelves                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Shelf cache, keyed by mood.
 *
 * Moods are a fixed set so this cannot grow unbounded, but the entries still
 * need a lifetime: a long-running session would otherwise show the same
 * editorial rows for as long as the helper stayed alive.
 */
const HOME_CACHE_TTL_MS = 15 * 60_000
const homeCache = new Map()

function readHomeCache(key) {
  const entry = homeCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.storedAt > HOME_CACHE_TTL_MS) {
    homeCache.delete(key)
    return null
  }
  return entry.feed
}

function writeHomeCache(key, feed) {
  homeCache.set(key, { feed, storedAt: Date.now() })
}

export async function homeShelves({ mood = '', limit = 8 } = {}) {
  const yt = await getInnertube()

  let home
  const key = `home:${mood || 'default'}`
  const cached = readHomeCache(key)
  if (cached) {
    home = cached
  } else {
    home = mood ? await (await yt.music.getHomeFeed()).applyFilter(mood) : await yt.music.getHomeFeed()
    writeHomeCache(key, home)
    // The unfiltered feed is also kept so the chip cloud does not need its own
    // network call on every mood switch.
    if (!mood) writeHomeCache('home', home)
  }

  const shelves = []
  for (const shelf of home?.sections ?? []) {
    if (shelves.length >= limit) break
    if (!isMusicShelf(shelf)) continue
    const read = readShelf(shelf)
    if (!read.tracks.length && !read.playlists.length) continue
    shelves.push(read)
  }

  // The home feed is short; top up from its continuation so Home has real depth
  // instead of three shelves and a lot of empty canvas.
  if (shelves.length < limit && home?.has_continuation) {
    try {
      const more = await home.getContinuation()
      for (const shelf of more?.sections ?? []) {
        if (shelves.length >= limit) break
        if (!isMusicShelf(shelf)) continue
        const read = readShelf(shelf)
        if (!read.tracks.length && !read.playlists.length) continue
        shelves.push(read)
      }
    } catch (err) {
      console.warn('[ytmusic] home continuation failed:', err?.message)
    }
  }

  return shelves
}

/* -------------------------------------------------------------------------- */
/* Related                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Per-track recommendations. Replaces the old `"${artist} songs"` text search,
 * which could not see what the track sounded like.
 */
export async function relatedTracks(videoId, limit = 12) {
  if (!videoId) return []
  const yt = await getInnertube()
  const related = await yt.music.getRelated(videoId)

  const raws = []
  for (const shelf of related?.contents ?? []) {
    for (const item of shelf?.contents ?? []) {
      const track = toShelfTrack(item)
      if (track) raws.push(track)
      if (raws.length >= 60) break
    }
    if (raws.length >= 60) break
  }

  return curateTracks(raws, { perArtist: 1, limit })
}

/* -------------------------------------------------------------------------- */
/* Radio                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A real radio queue seeded from a track.
 *
 * `perArtist: 2` rather than 1: a radio that allows one song per artist gets
 * squeezed into a narrow genre the moment the upstream list opens with a couple
 * from the same act. Two still prevents a three-in-a-row run of one artist,
 * while leaving the queue wide enough to actually sound like a station.
 */
export async function radioTracks(videoId, limit = 50) {
  if (!videoId) return []
  const yt = await getInnertube()
  const panel = await yt.music.getUpNext(videoId)

  const raws = []
  for (const item of panel?.contents ?? []) {
    // `PlaylistPanelVideo` keeps its id on the endpoint payload, not `.id`.
    const videoId = item?.endpoint?.payload?.videoId ?? item?.id ?? null
    if (!videoId || typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue
    const title = txt(item?.title)
    if (!title) continue
    // Radio rows carry the artist as structured data (`artists[]` with the
    // channel id), which is better than parsing a subtitle string.
    const artistEntry = (item?.artists ?? [])[0] ?? null
    const artist = txt(artistEntry?.name) || (typeof item?.author === 'string' ? item.author : '')
    raws.push({
      videoId,
      title,
      artist: artist.split(' • ')[0] ?? artist,
      channelId: artistEntry?.channel_id ?? null,
      channelName: artist || null,
      album: txt(item?.album) || null,
      durationSec: item?.duration?.seconds ?? null,
      thumbnailUrl: item?.thumbnail?.at(-1)?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    })
  }

  return curateTracks(raws, { perArtist: 2, limit, collapseAcrossArtists: true })
}
