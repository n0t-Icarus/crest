/**
 * Quality gate for YouTube Music results.
 *
 * YouTube's own payloads for recommendation surfaces are thin: related and
 * home-feed song rows carry no duration, no view count and no badges. So the
 * "is this actually a good track?" question has to be answered here, by rules
 * instead of by trusting the response.
 *
 * Three jobs, in order of how much they matter:
 *   1. collapse variants of the same song (remasters, "Single Mix", sped-up)
 *   2. reject outright junk (spam playlists, previews, hour-long DJ sets)
 *   3. penalise the rest so ranking puts real tracks first
 *
 * Every function is pure and side-effect free.
 */

/** Words that mark a title as a derivative rather than the recording. */
const VARIANT_MARKER =
  /\b(remaster(?:ed)?|remix|sped[\s-]?up|slowed|nightcore|8d|karaoke|instrumental|mashup|reverb|bootleg|edit|extended|version|radio\s?edit|rework|vip|free\s?download|ringtone|whatsapp\s?status|jhumur|live\s?session)\b/i

/** Hard-reject: these are uploads, not tracks. */
const SPAM_TITLE =
  /\b(viral\s?(trending|songs|reels?)|top\s?\d*\s?(hits|songs|charts)|best\s?of\s?\d{4}|new\s?(songs|releases)\s?\d{4}|free\s?download|ringtone|notification\s?sound|whatsapp\s?status|status\s?trending|jhumur\s?status|all\s?albums|all\s?songs|complete\s?album|full\s?album|songs?\s?list|playlist\s?\d{2,}|lyrics?\s?video\s?\d{4}|ai\s?(song|generated|cover)|8\s?bit|lofi\s?girl\s?live|podcast|full\s?interview)\b/i

/**
 * Hard-reject: things that are not the recording itself.
 *
 * `|` is YouTube'''s marker for a mashup or two-song combo. The rest is the
 * usual pile of concert footage, re-encoded uploads and foreign-dub channels
 * that search happily returns alongside the actual song.
 */
const VIDEO_NOISE =
  /\s\|\s|\b(?:1080p|720p|4k|uhd|legend(?:a|e|ad[oa])s?|subtitulad[oa]|bootleg)\b|\bep\.\s?\d{1,3}\b|\b(?:hd|live)\b[^|]{0,40}\b(?:concert|live|show)\b/i

/** Hard-reject: channel names that are content farms posing as artists. */
/**
 * Scripts that are not allowed to become interface text.
 *
 * Crest's own chrome is English, so a shelf heading or a playlist card has no
 * business arriving in Hindi, Korean or Cyrillic — it reads as a bug, not as
 * localisation. Track titles are deliberately exempt: "Kya Mujhe Pyar Hai" is
 * a real song with a real name, and showing it exactly as it is written is
 * correct. The line is drawn at song titles, not at the interface around them.
 */
const NON_LATIN =
  /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0E00-\u0E7F\u1000-\u109F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/

/** True when the text is safe to show as a heading, card title or shelf name. */
export function isLatinText(value) {
  return !NON_LATIN.test(String(value ?? ''))
}

const SPAM_CHANNEL =
  /\b(adv\s?creations|pulse\s?planet|facts\s?factory|magazine\s?gold|viral\s?(hub|media|world)|music\s?(hub|world|factory)|playlist\s?(factory|hub)|status\s?(zone|world)|hits\s?factory)\b/i

const MIN_DURATION_SEC = 45
const MAX_DURATION_SEC = 15 * 60

/**
 * The song's real name with every trailing qualifier removed.
 *
 *   "Take on Me (1985 Single Mix) (1985 Single Mix; 2015 Remaster)"
 *     → "Take on Me"
 *
 * Trailing bracket groups are stripped repeatedly so nested annotations
 * collapse in one pass. A " - " tail is only dropped when it reads as a
 * variant marker, because plenty of real titles contain a hyphen.
 */
export function baseTitle(title) {
  let out = String(title ?? '').trim()

  let previous
  do {
    previous = out
    out = out.replace(/\s*[([][^()[\]]*[)\]]\s*$/g, ' ').trim()
  } while (out !== previous && out.length > 0)

  // "Song (Live) - Remix" leftovers, or "Song - Slowed + Sped Up"
  out = out.replace(/\s*[-–—|]\s*(.+)$/, (match, tail) => {
    const trimmed = String(tail).trim()
    const isVariant =
      VARIANT_MARKER.test(trimmed) ||
      /^\s*\d{4}\s*remaster/i.test(trimmed) ||
      /^\s*(official\s+)?(audio|video|lyrics?)\s*$/i.test(trimmed)
    return isVariant ? ' ' : match
  })

  // Leading decorations: "Official Video", "Lyrics |"
  out = out.replace(/^\s*(official\s+(music\s+)?(video|audio)|lyrics?|hd|hq|audio)\s*[:|-]\s*/i, '')
  return out.trim() || String(title ?? '').trim()
}

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
}

/** Identity used for variant collapsing: song + artist, qualifiers removed. */
export function variantKey(track) {
  return `${slug(baseTitle(track.title))}::${slug(track.artist)}`
}

/** True when the title is a derivative rather than the canonical recording. */
export function isVariantTitle(title) {
  return VARIANT_MARKER.test(String(title ?? ''))
}

/**
 * Soft-to-hard rejection.
 *
 * Returns a reason when the track should not reach the UI at all, or null when
 * it is acceptable. Kept deliberately conservative: it drops spam and broken
 * metadata, and leaves taste-level judgements to `qualityPenalty`.
 */
export function rejectReason(track) {
  const title = String(track?.title ?? '').trim()
  if (!title) return 'empty title'

  const channel = String(track?.channelName ?? track?.channelId ?? '')
  if (channel && SPAM_CHANNEL.test(channel)) return 'spam channel'

  if (SPAM_TITLE.test(title)) return 'spam title'
  if (VIDEO_NOISE.test(title)) return 'not the recording'

  // YouTube sometimes hands back a duration or a publish date where the artist
  // should be ("3:37", "Sep 24, 2025"). Those rows are not songs.
  const artist = String(track?.artist ?? '').trim()
  if (artist && (/^\d{1,2}:\d{2}/.test(artist) || /^\w+\s+\d{1,2},?\s+\d{4}$/.test(artist))) return 'bad artist field'

  const seconds = track?.durationSec
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    if (seconds < MIN_DURATION_SEC) return 'too short'
    if (seconds > MAX_DURATION_SEC) return 'too long'
  }

  // Nothing recognisable left once the qualifiers come off.
  const base = baseTitle(title)
  if (!slug(base) || slug(base).length < 2) return 'unusable title'
  if (isVariantTitle(title) && slug(base).length < 3) return 'variant only'

  return null
}

/**
 * Uploader plausibility.
 *
 * A track is suspicious when we already know which channel a given artist name
 * belongs to and this upload came from a different one. Resolving the artist
 * channel costs a network round trip, so this is only ever a *penalty*
 * (see `qualityPenalty`), never a hard reject — an unknown mapping is not
 * evidence of anything.
 */
export function uploaderSuspicion(track, knownChannelId) {
  if (!knownChannelId || !track?.channelId) return 0
  return String(track.channelId) === String(knownChannelId) ? 0 : 1
}

/**
 * Ranking penalty — lower is better, 0 is clean.
 *
 * This is what removes the "cheap" feeling without throwing anything away:
 * derivative uploads and unverifiable uploaders sink to the bottom of a
 * section, and the stuff that used to win (variants, spam, farms) no longer
 * gets picked just because it appeared first.
 */
/** Query words that could plausibly be part of an artist name. */
const QUERY_STOPWORDS = new Set([
  'song', 'songs', 'music', 'official', 'video', 'audio', 'lyrics', 'lyric',
  'hd', 'mv', 'feat', 'ft', 'the', 'new', 'full', 'album', 'version', 'live',
])

/**
 * Does this track look like the artist the search named?
 *
 * Searching "arijit singh tum hi ho" returns the real recording plus a wall of
 * covers and stage versions. Anything by (or crediting) a name the search
 * mentioned gets a bonus; anything sharing no name with it is pushed down.
 */
export function queryArtistMatch(query, track) {
  const terms = String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !QUERY_STOPWORDS.has(token))
  if (terms.length === 0) return 0
  const haystack = `${track?.artist ?? ''} ${track?.channelName ?? ''}`.toLowerCase()
  if (terms.some((term) => haystack.includes(term))) return 0
  return 1.5
}

export function qualityPenalty(track, knownChannelId) {
  let penalty = 0
  const title = String(track?.title ?? '')

  if (isVariantTitle(title)) penalty += 3

  // Parenthetical clutter: "(Official Music Video)", "(Lyrics)", "(HD)".
  const brackets = title.match(/[([]/g)?.length ?? 0
  if (brackets > 0) penalty += Math.min(brackets, 3) * 0.5

  // Year-stamped reuploads: "... (2024)", "[2023 Remaster]"
  if (/\b(19|20)\d{2}\b/.test(title) && brackets > 0) penalty += 0.5

  if (SPAM_CHANNEL.test(String(track?.channelName ?? track?.channelId ?? ''))) penalty += 5
  if (VIDEO_NOISE.test(title)) penalty += 4
  if (SPAM_TITLE.test(title)) penalty += 5

  const seconds = track?.durationSec
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    // Either side of the typical 2-6 minute song is worth a nudge.
    if (seconds < 90) penalty += 1
    else if (seconds > 8 * 60) penalty += 0.75
    else if (seconds >= 120 && seconds <= 420) penalty -= 0.5
  }

  penalty += uploaderSuspicion(track, knownChannelId) * 1.5

  return penalty
}

/**
 * Normalise a candidate list: reject junk, collapse variants of one song, cap
 * how many tracks a single artist may contribute, then rank by penalty.
 *
 * `seen` (optional) is a set of track ids to push down without removing — the
 * user should still be able to deliberately play something they have heard.
 *
 * @param {object[]}  raws             candidate tracks ({ title, artist, ... })
 * @param {object}    [options]
 * @param {Set<string>} [options.seen]      ids to demote, not drop
 * @param {number}   [options.perArtist]     max tracks per artist (default 1)
 * @param {number}   [options.limit]
 * @param {(t: object) => (string|undefined)} [options.channelFor] artist → known channel id
 * @param {boolean} [options.collapseAcrossArtists] also drop a track whose title is
 *   an exact match for one already kept, even under a different artist name — right for search, wrong for a station that may repeat a
 *   song title for two different acts
 * @returns {object[]}
 */
export function curateTracks(raws, options = {}) {
  const { seen, perArtist = 1, limit = 20, channelFor, collapseAcrossArtists = false, query = '' } = options

  const seenVariants = new Set()
  const seenIds = new Set()
  const perArtistCount = new Map()
  const kept = []

  for (const raw of raws ?? []) {
    if (!raw?.videoId && !raw?.id) continue
    if (rejectReason(raw)) continue

    const id = raw.id ?? raw.videoId
    if (seenIds.has(id)) continue

    // One recording, one slot: first (highest-ranked) variant wins.
    const key = variantKey(raw)
    if (seenVariants.has(key)) continue
    seenVariants.add(key)

    // Substring containment catches the Snowman cluster — "Snowman",
    // "Once Upon a Snowman", "The Snowman Returns" — which no keyword rule
    // would ever catch.
    //
    // `collapseAcrossArtists` additionally drops a track whose title exactly
    // matches one already kept by a *different* artist. Search is where this
    // matters: "505 arctic monkeys" otherwise returns the song, a slowed copy,
    // a techno remix and a sped-up upload all under different artist names.
    const title = slug(baseTitle(raw.title))
    const exact = slug(raw.title)
    const collides = kept.some((existing) => {
      const other = slug(baseTitle(existing.title))
      if (!title || !other) return false
      if (title === other) return true
      if (collapseAcrossArtists && slug(existing.title) === exact) return true
      return title.length >= 5 && other.length >= 5 && (title.includes(other) || other.includes(title))
    })
    if (collides) continue

    const artist = String(raw.artist ?? '').trim()
    if (perArtist > 0 && artist) {
      const count = perArtistCount.get(artist) ?? 0
      if (count >= perArtist) continue
      perArtistCount.set(artist, count + 1)
    }

    seenIds.add(id)
    const mismatch = queryArtistMatch(options.query, raw)
    kept.push({
      ...raw,
      __penalty: qualityPenalty(raw, channelFor?.(artist)) + mismatch + (seen?.has(id) ? 1.5 : 0),
    })
  }

  kept.sort((a, b) => a.__penalty - b.__penalty)

  const out = []
  for (const track of kept) {
    const { __penalty, ...rest } = track
    out.push(rest)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Playlist/album shelf cleanup — same idea, but these legitimately share artists
 * so the per-artist cap is off and only the junk rejection applies.
 */
export function curateCollections(items, limit = 20) {
  const out = []
  const seen = new Set()
  for (const item of items ?? []) {
    if (!item) continue
    const title = String(item.title ?? '')
    if (!title) continue
    if (SPAM_TITLE.test(title)) continue
    // Collections become shelf headings and cards, so they have to read as
    // English; this is what kept Hindi playlist titles out of the hero.
    if (!isLatinText(title)) continue
    if (SPAM_CHANNEL.test(String(item.owner ?? ''))) continue
    const key = `${slug(baseTitle(title))}::${slug(item.owner)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}
