# Crest — personalised recommendations plan

Status: **proposal, nothing implemented.**

## The actual bug

`server/ytmusic.mjs:484` is the whole problem:

```js
export async function homeTracks(limit = 15) {
  const { tracks } = await searchAll('top songs this week')
  return tracks.slice(0, limit)
}
```

Home is a global text search for "top songs this week", filtered by nothing.
`getRecommendations()` is the same idea — same artist, then `"${artist} songs"`
search. `seedInitialQueue()` seeds the queue from that same feed. So Home, the
queue, and "related" are all one flat list. That is exactly why it feels random
and cheap: it *is* random, there is no model at all.

## The good news (verified today)

`youtubei.js@18.1.0` already ships five endpoints we never call. I probed all of
them live and they work **without sign-in**:

| Call | Result |
| --- | --- |
| `yt.music.getHomeFeed()` | Real editorial shelves: `Featured playlists for you`, `Today's Global Hits`, and continuation gives `India's biggest hits`, `Hindi Hits`, `Easy Mornings`. 10 items each, all `MusicTwoRowItem` playlist cards with real `browseId`. |
| `home.header.chips` | `Podcasts, Romance, Workout, Feel good, Party, Relax, Energize, Commute, Sleep, Sad, Focus` — **the exact mood rail in your reference screenshot**, first-class data. |
| `home.applyFilter(chip)` | Works. Chip → filtered shelves. This is the mood rail, already built by YouTube. |
| `yt.music.getRelated(videoId)` | 6 shelves of real per-track recommendations (20/10/8/10/24 items) with `id`, `title`, artist in `flex_columns[1]`. |
| `yt.music.getUpNext(videoId)` | 50 real radio tracks with real durations — a proper queue. |
| `yt.music.getLibrary()` | ✗ throws `You must be signed in`. Unusable. |

So we don't need to invent a recommendation engine's data source. We need to
stop ignoring the one we already have.

## The "cheap stuff" problem is measurable

From a single `getRelated` response I got, in one list:

- `Take on Me (1985 Single Mix) (1985 Single Mix; 2015 Remaster)`
- `Take on Me`

Same song, twice, one of them a remaster with garbage title. YouTube has no
duration on these items (`duration` empty, `views` null, `badges` empty), so
quality has to be decided by **our own rules**, not by trusting the payload.

---

# The plan, in phases

## Phase 0 — provider layer: stop faking it (highest impact, ~1 day)

New helper endpoints in `server/ytmusic.mjs`, all using calls proven above:

| Endpoint | Implementation | Replaces |
| --- | --- | --- |
| `/moods` | `getHomeFeed()` → `header.chips` | nothing (new) |
| `/home-shelves` | `getHomeFeed()` sections + `getContinuation()` | `searchAll('top songs this week')` |
| `/home-shelves?mood=Relax` | `home.applyFilter(chip)` | — |
| `/related?vid=` | `getRelated(videoId)` shelves | `${artist} songs` search |
| `/radio?vid=` | `getUpNext(videoId)` → tracks | `seedInitialQueue()` feed |

`homeTracks()` gets deleted. `ytProvider.getHome()` becomes: mood chips +
shelves + a *personal* overlay built in Phase 1. `getRecommendations()` becomes
`getRelated()` on the seed, not a text search.

## Phase 1 — taste profile (the actual "revolves around your vibes" part)

New `src/store/tasteStore.ts` (persisted `crest.taste`). Built **client-side**
from what we already record — no sign-in needed, no privacy problem, and it
means the model is ours and inspectable.

**Signals available today** (`libraryStore`):
- `history: HistoryEntry[]` — 500 entries of `trackId` + `playedAt`. Real signal.
- `likedTrackIds` — explicit positive.
- `followedArtistIds` — strong positive.

**Derived model:**
- `artistWeights: Record<artistId, number>` — history counted with **exponential
  time decay** (half-life ≈ 14 days) so what you played this week dominates and
  old listening fades. Likes ×3, follows ×5.
- `recentSeeds: string[]` — last ~20 tracks, used as recommendation seeds.
- `skipSignals` — new: if a track was skipped before 20% of its duration, that is
  a *negative* weight, and its artist gets damped. Right now we can't tell a skip
  from a listen, which is why the queue keeps serving the same cheap stuff.

**The one new thing we must record:** playback progress. `playbackController`
already knows `currentTime`/`duration`; it just doesn't tell the store. One call
on pause/skip/track-end writes `{ playedMs, durationMs }` into the history entry.

**Cold start** (fresh install, no history) is unavoidable — there's no taste to
learn from. Handled honestly: chips + curated shelves + a one-tap "here's what we
think you like" taste seeder over ~8 genre/mood chips. Never fake a personalised
feed out of nothing.

## Phase 2 — quality / anti-slop filter (kills the cheap feel)

Applied to *every* track that reaches the UI, regardless of source. Pure
functions in `server/ytmusic.mjs`, unit-testable:

1. **Variant collapse** — normalise title by stripping everything in
   `(...)`/`[...]`, then dedupe on `normalisedTitle + normalisedArtist`.
   Kills Take-on-Me-vs-remaster *and* the Snowman cluster
   (`Snowman` / `Once Upon a Snowman` / `The Snowman Returns`) by capping
   **one track per artist per section**.
2. **Junk-pattern reject** — `/remix|sped ?up|slowed|nightcore|8d|karaoke|instrumental|acoustic cover|live|cover|mashup|reverb|1 hour|loop|ai|ringtone/i`
   in the title. Careful: strip these *for the dedupe key* but keep the original
   title for display, and drop only if it leaves an empty/garbage title.
3. **Duration sanity** — reject `< 45s` (previews) and `> 15min` (DJ sets).
4. **Uploader check** — this is the one that kills "ADV Creations" / "PulsePlanetCharts".
   `toTrack` already captures `channelId`, and `artistNameToChannelCache` already
   maps artist name → channel. A track is **kept only if its channel plausibly
   belongs to the named artist** (channel handle/name matches artist name, or the
   artist already resolved to that channel). Auto-generated/content-farm uploads
   fail this. This is the single highest-impact rule for your screenshot.
5. **Seen penalty** — tracks already in history or the current queue rank last,
   not get filtered (so you can still replay deliberately).

## Phase 3 — Home layout, mirroring the reference app

New `HomeSection` kinds in `src/services/providers/types.ts` (currently only
`'tracks' | 'mixes' | 'playlists'`):

```ts
| { id; kind: 'chips'; items: MoodChip[] }
| { id; kind: 'artists'; title; items: ArtistRailItem[] }   // circular, "1 song"
| { id; kind: 'shelves'; title; strapline?; items: Playlist[] }  // YTM carousel
| { id; kind: 'tracks'; title; items: Track[]; subtitle?: string; explain?: string }
```

Home becomes, top to bottom:

1. **Mood chip rail** — `Relax / Romantic / Feel good / Sleep / Party / Sad / Energy`,
   horizontally scrollable, from `/moods`. Clicking re-fetches shelves with
   `applyFilter`. *This is the app's front door and the answer to "not random".*
2. **Hero carousel** — `HeroBanner` already accepts `slides`; populate with real
   album/playlist artwork from the top shelves instead of one static gradient.
3. **Quick picks** — a ranked track list, one per top-weighted artist, deduped so
   you never see the same artist twice. `explain` line: *"because you played
   Toto"* — visible reasoning, no black box.
4. **Keep listening** — circular artist/album rail with `N song(s)` counts, from
   artists with 2+ partial plays (started but never finished) — the resume
   affordance from the reference.
5. **Because you listened to X** — shelf of real related tracks (`/related`).
6. **Made for you** — mix cards built from your top artists' radio seeds.
7. **Your playlists** (from `libraryStore`) + **YouTube playlists** (`VL...` radio
   shelves from the home feed).

## Phase 4 — queue that follows the vibe

`seedInitialQueue()` currently seeds from the generic feed — that's why the queue
was five Snowmans. Replace with `/radio?vid=<last played track>` → `getUpNext`.
AutoQueue: when the queue empties, fetch `/radio` for the track that just ended.
Queue becomes infinite, and always *related to what you were just playing* instead
of a stale snapshot.

## Phase 5 — "the whole app revolves around that vibe"

Not just Home. Every surface reads `tasteStore`:
- **Search** — ranks and filters results by taste weight.
- **Artist page** — "Fans also play" from `/related`, not a name search.
- **Album/playlist pages** — auto-queue from the last track.
- **Radio mode** — one click anywhere: pure `/radio`, uninterrupted.

---

## Honest limits (I won't pretend otherwise)

- **No sign-in** ⇒ no Google-side personalisation. `getLibrary()` throws. The
  taste model is *ours*, built from local history. That's genuinely private and
  inspectable, but it needs listening data — a brand-new install will look
  generic for the first day, by design.
- Genre labels: YouTube's chips are moods, not strict genres. We can infer genre
  from `artistDetails` + search, but that's soft. I won't claim genre accuracy
  we don't have.
- ToS/reliability caveats in `docs/PROVIDERS.md` §7 stand: personal use only,
  unofficial. Every endpoint above is a public read; none needs credentials.
- I verified the **endpoint availability and payload shapes live**, not the final
  quality of the ranking — the filters and weights need tuning against real
  listening before they feel right.

## Effort

| Phase | What | ~Time |
| --- | --- | --- |
| 0 | Provider/helper endpoints | 0.5–1 day |
| 2 | Anti-slop filters | 0.5 day |
| 1 | Taste store + play-progress hook | 1 day |
| 3 | Home layout + new section kinds | 1–2 days |
| 4 | Queue/radio | 0.5 day |
| 5 | Taste-aware search/artist/radio mode | 1–2 days |

Phases 0 + 2 alone should kill the cheap feeling. Phase 1 is what makes it *yours*.
