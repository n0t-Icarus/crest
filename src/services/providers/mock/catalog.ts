/**
 * Mock catalogue for Phase 1.
 *
 * Metadata (titles, artists, albums, durations) is factual so the UI reads as a
 * real client; all artwork is generated procedurally (utils/artwork.ts) and all
 * lyric text is original placeholder copy, so nothing copyrighted is bundled.
 *
 * This file is the only place that knows the mock dataset. Everything else goes
 * through `MusicProvider`, so Phase 5 replaces this module — not the UI.
 */

import type { Album, Artist, Playlist, Track } from '../types'

const albumArt = (albumId: string) => ({ kind: 'generated' as const, seed: albumId })
const seedArt = (seed: string) => ({ kind: 'generated' as const, seed })

type TrackSeed = [id: string, title: string, albumId: string, seconds: number]

const ARTIST_SEED: Array<[string, string]> = [
  ['mrkitty', 'Mr.Kitty'],
  ['theweeknd', 'The Weeknd'],
  ['oneheart', 'Øneheart'],
  ['kenshi', 'Kenshi Yonezu'],
  ['coldplay', 'Coldplay'],
  ['arctic', 'Arctic Monkeys'],
  ['onedirection', 'One Direction'],
  ['neighbourhood', 'The Neighbourhood'],
  ['daftpunk', 'Daft Punk'],
  ['menitrust', 'Men I Trust'],
  ['cas', 'Cigarettes After Sex'],
  ['fujiikaze', 'Fujii Kaze'],
  ['lamp', 'Lamp'],
  ['joji', 'Joji'],
  ['tameimpala', 'Tame Impala'],
  ['mitski', 'Mitski'],
]

const ALBUM_SEED: Array<[string, string, string, number]> = [
  ['time', 'Time', 'mrkitty', 2014],
  ['starboy', 'Starboy', 'theweeknd', 2016],
  ['bleed', 'Bleed', 'oneheart', 2022],
  ['kickback', 'KICK BACK', 'kenshi', 2022],
  ['parachutes', 'Parachutes', 'coldplay', 2000],
  ['ghoststories', 'Ghost Stories', 'coldplay', 2014],
  ['fwn', 'Favourite Worst Nightmare', 'arctic', 2007],
  ['am', 'AM', 'arctic', 2013],
  ['four', 'FOUR', 'onedirection', 2014],
  ['iliwys', "I Love You.", 'neighbourhood', 2013],
  ['discovery', 'Discovery', 'daftpunk', 2001],
  ['onclevert', 'Oncle Jazz', 'menitrust', 2018],
  ['castape', 'Cigarettes After Sex', 'cas', 2017],
  ['helpever', 'HELP EVER HURT NEVER', 'fujiikaze', 2020],
  ['loveall', 'LOVE ALL SERVE ALL', 'fujiikaze', 2022],
  ['yumeutsutsu', 'Yume Utsutsu', 'lamp', 2014],
  ['smithereens', 'Smithereens', 'joji', 2022],
  ['currents', 'Currents', 'tameimpala', 2015],
  ['land', 'The Land Is Inhospitable and So Are We', 'mitski', 2023],
]

const TRACK_SEED: TrackSeed[] = [
  ['after-dark', 'After Dark', 'time', 247],
  ['i-want-to-be-software', 'I Want to Be Software', 'time', 236],
  ['insects', 'Insects', 'time', 218],
  ['xxi', 'XXI', 'time', 262],

  ['die-for-you', 'Die For You', 'starboy', 200],
  ['starboy', 'Starboy', 'starboy', 230],
  ['reminder', 'Reminder', 'starboy', 218],
  ['i-feel-it-coming', 'I Feel It Coming', 'starboy', 250],

  ['thirteen', 'thirteen', 'bleed', 176],
  ['bleed', 'bleed', 'bleed', 191],
  ['never-sleep', 'never sleep', 'bleed', 205],
  ['cold-rooms', 'cold rooms', 'bleed', 188],

  ['kick-back', 'KICK BACK', 'kickback', 194],
  ['kanden', 'Kanden', 'kickback', 190],
  ['teaspoon', 'Teaspoon', 'kickback', 205],

  ['sparks', 'Sparks', 'parachutes', 227],
  ['yellow', 'Yellow', 'parachutes', 269],
  ['trouble', 'Trouble', 'parachutes', 271],
  ['dont-panic', "Don't Panic", 'parachutes', 197],

  ['a-sky-full-of-stars', 'A Sky Full of Stars', 'ghoststories', 268],
  ['magic', 'Magic', 'ghoststories', 225],
  ['o', 'O', 'ghoststories', 216],

  ['505', '505', 'fwn', 253],
  ['fluorescent-adolescent', 'Fluorescent Adolescent', 'fwn', 212],
  ['brianstorm', 'Brianstorm', 'fwn', 150],
  ['do-me-a-favour', 'Do Me a Favour', 'fwn', 201],

  ['do-i-wanna-know', 'Do I Wanna Know?', 'am', 202],
  ['r-u-mine', 'R U Mine?', 'am', 155],
  ['why-d-you-only-call-me', "Why'd You Only Call Me When You're High?", 'am', 172],
  ['arabella', 'Arabella', 'am', 207],

  ['night-changes', 'Night Changes', 'four', 226],
  ['steal-my-girl', 'Steal My Girl', 'four', 225],
  ['eighteen', '18', 'four', 220],
  ['fireproof', 'Fireproof', 'four', 192],

  ['sweater-weather', 'Sweater Weather', 'iliwys', 240],
  ['daddy-issues', 'Daddy Issues', 'iliwys', 216],
  ['female-robbery', 'Female Robbery', 'iliwys', 206],

  ['digital-love', 'Digital Love', 'discovery', 288],
  ['one-more-time', 'One More Time', 'discovery', 320],
  ['something-about-us', 'Something About Us', 'discovery', 209],
  ['harder-better', 'Harder, Better, Faster, Stronger', 'discovery', 224],

  ['show-me-how', 'Show Me How', 'onclevert', 224],
  ['tailwhip', 'Tailwhip', 'onclevert', 232],
  ['seven', 'Seven', 'onclevert', 219],

  ['apocalypse', 'Apocalypse', 'castape', 290],
  ['nothings-gonna-hurt-you', "Nothing's Gonna Hurt You Baby", 'castape', 191],
  ['each-time-you-fall-in-love', 'Each Time You Fall in Love', 'castape', 264],
  ['sunsetz', 'Sunsetz', 'castape', 260],

  ['shinunoga-ewa', 'Shinunoga E-Wa', 'helpever', 219],
  ['matsuri', 'Matsuri', 'helpever', 213],
  ['kirari', 'Kirari', 'loveall', 200],
  ['mo-eh-wa', 'Mo-Eh-Wa', 'loveall', 232],

  ['yume-utsutsu', 'Yume Utsutsu', 'yumeutsutsu', 268],
  ['hatenaki', 'Hatenaki Tabiji', 'yumeutsutsu', 245],
  ['kodoku', 'Kodoku no Mukou', 'yumeutsutsu', 230],

  ['glimpse-of-us', 'Glimpse of Us', 'smithereens', 210],
  ['yukon', 'Yukon (Interlude)', 'smithereens', 200],
  ['die-for-you-joji', 'Die for You', 'smithereens', 205],

  ['the-less-i-know', 'The Less I Know the Better', 'currents', 297],
  ['let-it-happen', 'Let It Happen', 'currents', 300],
  ['eventually', 'Eventually', 'currents', 349],

  ['my-love-mine-all-mine', 'My Love Mine All Mine', 'land', 172],
  ['heaven', 'Heaven', 'land', 200],
  ['i-dont-like-my-mind', "I Don't Like My Mind", 'land', 210],
]

const albumById = new Map(ALBUM_SEED.map(([id, title, artistId, year]) => [id, { title, artistId, year }]))
const artistNameById = new Map(ARTIST_SEED)

export const artists: Artist[] = ARTIST_SEED.map(([id, name]) => ({
  id,
  name,
  artwork: seedArt(id),
  monthlyListeners: 400_000 + (id.length * 137_000) % 24_000_000,
}))

export const albums: Album[] = ALBUM_SEED.map(([id, title, artistId, year]) => ({
  id,
  title,
  artistId,
  artistName: artistNameById.get(artistId) ?? 'Unknown artist',
  year,
  artwork: albumArt(id),
  kind: 'album',
  trackIds: TRACK_SEED.filter(([, , albumId]) => albumId === id).map(([trackId]) => trackId),
}))

export const tracks: Track[] = TRACK_SEED.map(([id, title, albumId, seconds]) => {
  const album = albumById.get(albumId)!
  const artistId = album.artistId
  return {
    id,
    title,
    artistId,
    artistName: artistNameById.get(artistId) ?? 'Unknown artist',
    albumId,
    albumName: album.title,
    durationMs: seconds * 1000,
    artwork: albumArt(albumId),
  }
})

const pick = (...ids: string[]) => ids

export const playlists: Playlist[] = [
  {
    id: 'p-my-mix',
    name: 'My Mix',
    description: 'Everything you keep coming back to, refreshed weekly.',
    owner: 'You',
    editable: true,
    artwork: seedArt('p-my-mix'),
    updatedAt: Date.now() - 1000 * 60 * 60 * 6,
    // Order matters beyond the track list itself: this is the queue a fresh
    // install opens with, so it follows the reference's running order.
    trackIds: pick(
      'after-dark', 'die-for-you', '505', 'kick-back', 'sparks', 'night-changes', 'sweater-weather',
      'thirteen', 'apocalypse', 'yume-utsutsu', 'glimpse-of-us', 'digital-love', 'let-it-happen',
      'show-me-how', 'my-love-mine-all-mine', 'sunsetz', 'kirari', 'r-u-mine', 'cold-rooms',
      'eventually', 'do-i-wanna-know', 'magic', 'i-feel-it-coming', 'harder-better',
      'fluorescent-adolescent', 'matsuri', 'o', 'daddy-issues',
    ),
  },
  {
    id: 'p-chill-vibes',
    name: 'Chill Vibes',
    description: 'Slow, warm and unhurried.',
    owner: 'You',
    editable: true,
    artwork: seedArt('p-chill-vibes'),
    updatedAt: Date.now() - 1000 * 60 * 60 * 30,
    trackIds: pick(
      'thirteen', 'sparks', 'show-me-how', 'sunsetz', 'yume-utsutsu', 'something-about-us', 'nothings-gonna-hurt-you',
      'my-love-mine-all-mine', 'seven', 'cold-rooms', 'o', 'glimpse-of-us', 'tailwhip', 'apocalypse', 'digital-love',
      'each-time-you-fall-in-love', 'kodoku', 'let-it-happen',
    ),
  },
  {
    id: 'p-study-focus',
    name: 'Study / Focus',
    description: 'Low dynamics, no lyrics that pull your attention.',
    owner: 'You',
    editable: true,
    artwork: seedArt('p-study-focus'),
    updatedAt: Date.now() - 1000 * 60 * 60 * 52,
    trackIds: pick(
      'bleed', 'never-sleep', 'cold-rooms', 'thirteen', 'yume-utsutsu', 'kodoku', 'hatenaki', 'seven', 'show-me-how',
      'the-less-i-know', 'let-it-happen', 'something-about-us', 'digital-love', 'o', 'nothings-gonna-hurt-you',
    ),
  },
  {
    id: 'p-workout',
    name: 'Workout',
    description: 'Drive first, think later.',
    owner: 'You',
    editable: true,
    artwork: seedArt('p-workout'),
    updatedAt: Date.now() - 1000 * 60 * 60 * 80,
    trackIds: pick(
      'harder-better', 'brianstorm', 'r-u-mine', 'kick-back', 'starboy', 'arabella', 'one-more-time', 'fireproof',
      'do-me-a-favour', 'kanden', 'xxi', 'i-want-to-be-software', 'insects', 'why-d-you-only-call-me', 'steal-my-girl',
      'the-less-i-know',
    ),
  },
  {
    id: 'p-anime',
    name: 'Anime',
    description: 'Openings, endings and everything in between.',
    owner: 'You',
    editable: true,
    artwork: seedArt('p-anime'),
    updatedAt: Date.now() - 1000 * 60 * 60 * 120,
    trackIds: pick(
      'kick-back', 'kanden', 'teaspoon', 'shinunoga-ewa', 'matsuri', 'kirari', 'mo-eh-wa', 'yume-utsutsu',
      'hatenaki', 'kodoku', 'brianstorm', 'thirteen', 'i-want-to-be-software', 'xxi', 'o',
    ),
  },
  {
    id: 'p-night-drives',
    name: 'Night Drives',
    description: 'Headlights, empty roads, no destination.',
    owner: 'You',
    editable: true,
    artwork: seedArt('p-night-drives'),
    updatedAt: Date.now() - 1000 * 60 * 60 * 200,
    trackIds: pick(
      'after-dark', 'night-changes', 'sunsetz', '505', 'sweater-weather', 'magic', 'a-sky-full-of-stars',
      'do-i-wanna-know', 'digital-love', 'i-feel-it-coming', 'eventually', 'female-robbery', 'yukon', 'die-for-you-joji',
      'each-time-you-fall-in-love', 'reminder', 'eighteen', 'seven', 'trouble', 'yellow',
    ),
  },
]

export const likedTrackIds: string[] = [
  'after-dark', 'die-for-you', 'thirteen', 'kick-back', 'sparks', '505', 'sweater-weather', 'night-changes',
  'yume-utsutsu', 'glimpse-of-us', 'my-love-mine-all-mine', 'sunsetz', 'digital-love', 'shinunoga-ewa',
  'the-less-i-know', 'show-me-how', 'apocalypse', 'r-u-mine',
]

export const discoveredTrackIds: string[] = [
  'kirari', 'mo-eh-wa', 'tailwhip', 'seven', 'bleed', 'never-sleep', 'cold-rooms', 'hatenaki', 'kodoku',
  'yukon', 'heaven', 'i-dont-like-my-mind', 'eventually', 'let-it-happen', 'fireproof', 'matsuri',
]

export const mixSeed: Array<{
  id: string
  title: string
  subtitle: string
  trackIds: string[]
}> = [
  {
    id: 'm-chill',
    title: 'Chill Mix',
    subtitle: 'Chill vibes, just for you',
    trackIds: pick('thirteen', 'sparks', 'sunsetz', 'show-me-how', 'yume-utsutsu', 'my-love-mine-all-mine', 'o', 'seven'),
  },
  {
    id: 'm-lofi',
    title: 'Lo-Fi Mix',
    subtitle: 'Study, relax, repeat.',
    trackIds: pick('bleed', 'never-sleep', 'cold-rooms', 'kodoku', 'hatenaki', 'something-about-us', 'seven', 'yume-utsutsu'),
  },
  {
    id: 'm-rock',
    title: 'Rock Mix',
    subtitle: 'For the louder days',
    trackIds: pick('505', 'brianstorm', 'do-me-a-favour', 'fluorescent-adolescent', 'arabella', 'r-u-mine', 'fireproof', 'yellow'),
  },
  {
    id: 'm-anime',
    title: 'Anime Mix',
    subtitle: 'Your anime energy',
    trackIds: pick('kick-back', 'kanden', 'teaspoon', 'shinunoga-ewa', 'kirari', 'matsuri', 'mo-eh-wa', 'hatenaki'),
  },
  {
    id: 'm-workout',
    title: 'Workout Mix',
    subtitle: 'Push harder',
    trackIds: pick('harder-better', 'one-more-time', 'starboy', 'fireproof', 'kick-back', 'xxi', 'i-want-to-be-software', 'insects'),
  },
]

export const mixes = mixSeed.map((mix) => ({
  id: mix.id,
  title: mix.title,
  subtitle: mix.subtitle,
  artwork: seedArt(mix.id),
  trackIds: mix.trackIds,
}))

/** Deterministic-ish history: relative offsets from first launch. */
const HISTORY_SEED: Array<[string, number]> = [
  ['after-dark', 4], ['die-for-you', 11], ['thirteen', 26], ['kick-back', 48], ['sparks', 74], ['505', 96],
  ['sweater-weather', 130], ['night-changes', 168], ['yume-utsutsu', 205], ['glimpse-of-us', 260],
  ['my-love-mine-all-mine', 320], ['sunsetz', 400], ['digital-love', 470], ['shinunoga-ewa', 520],
  ['the-less-i-know', 610], ['show-me-how', 700], ['apocalypse', 760], ['r-u-mine', 820],
  ['bleed', 900], ['kirari', 980], ['heaven', 1050], ['eventually', 1180], ['yukon', 1290], ['matsuri', 1400],
]

const BOOT_TIME = Date.now()

export const historyEntries = HISTORY_SEED.map(([trackId, minutesAgo]) => ({
  trackId,
  playedAt: BOOT_TIME - minutesAgo * 60_000,
}))

export function findTrack(id: string): Track | undefined {
  return tracks.find((track) => track.id === id)
}

export function trackMap(): Map<string, Track> {
  return new Map(tracks.map((track) => [track.id, track]))
}
