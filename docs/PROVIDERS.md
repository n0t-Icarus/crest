# Real music provider investigation (no implementation)

**Status: investigation only.** This document is the decision record for the
"real music provider" milestone. Nothing in `src/` changed as part of it; the
synth and mock providers remain exactly as shipped. No packaging work was
touched.

---

## 1. The chain we must preserve (verified in code)

```
UI components
  ↓  (consume MusicProvider only — search, catalogue, artwork refs)
MusicProvider abstraction          services/providers/types.ts (L162: getStream)
  ↓
Provider registry / switch         services/providers/index.ts (L26/31/42)
  ↓
Real provider getStream()          services/providers/<impl>/…  → AudioStream
  ↓
PlaybackController.load()          player/playbackController.ts (L124 resolveStream, L63 createEngineFor)
  ↓
createEngineFor({ url })           audio/engine.ts (L10) → url ? HtmlAudioEngine : SimulatedEngine
  ↓
HtmlAudioEngine                    audio/HtmlAudioEngine.ts (new Audio(), crossOrigin='anonymous')
  ↓
playerStore / queue / PlayerBar    player/playerStore.ts (playQueue, next, autoplay bridge)
```

Empirical confirmation this session (same engine config as production):
`new Audio()` with `crossOrigin='anonymous'` successfully loads metadata from
both an iTunes preview CDN and an Audius content node through their redirect
chains. **No architectural change is needed for real playback.**

---

## 2. Candidate comparison

Legend: ✅ good · 🟡 partial/conditional · ❌ no.

| # | Criterion | Spotify Web API | Apple Music API (JWT) | iTunes Search API | Deezer public API | Audius | Jamendo | SoundCloud API | Internet Archive | Subsonic/Navidrome | LRCLIB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Search (tracks/artists/albums/playlists) | ✅ all four | ✅ all four | 🟡 tracks/albums/artists only, 100-result cap | ✅ all four | 🟡 tracks/users/playlists (no album entity) | 🟡 tracks/artists/albums/playlists | ✅ all four | 🟡 scraper-style | ✅ (own server) | 🟡 lyrics only |
| 2 | Song metadata | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 lyrics only |
| 3 | Artist metadata | 🟡 (related-artists deprecated Nov 2024) | ✅ | 🟡 basic | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | — |
| 4 | Album metadata | ✅ | ✅ | ✅ | ✅ | 🟡 (no album entity) | ✅ | ✅ | 🟡 | ✅ | — |
| 5 | Playlists | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | — |
| 6 | Artwork | ✅ 640px | ✅ | ✅ up to 100k(?) via URL template | ✅ | ✅ 1000px, 1500px | ✅ | ✅ | ✅ | ✅ | — |
| 7 | Lyrics | ❌ | ✅ licensed (MV API) | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | 🟡 (.lrc sidecar) | ✅ synced, 3M+ |
| 8 | Playable audio | ❌ 30s preview_url removed for new apps (Nov 2024) | ✅ 90s / full w/ subscription | 🟡 30s previews, m4a | 🟡 30s previews (cdns-preview); full streams require sub + obfuscated pipe | ✅ full-length, artist-uploaded | ✅ full-length CC tracks | 🟡 per-track if authorizable, app reg. effectively closed | 🟡 public-domain files, spotty | ✅ (own files) | — |
| 9 | Auth | OAuth PKCE + dev-mode 25-user cap | JWT (team key) | none | none | none (app_name param) | client_id (free registration) | OAuth 2.1, invite/approval | none | user/pass or token | none |
| 10 | Rate limits | ~180 req/30s rolling | generous | **~20/min** | undocumented | documented tiers, generous free tier | ~35k/month free | undocumented | generous | server-dependent | generous, no key |
| 11 | Desktop compatibility | ✅ | ✅ | ✅ | 🟡 no CORS on api.deezer.com → needs server proxy | ✅ CORS-clean incl. media | ✅ | 🟡 untested, gated first | ✅ | ✅ | ✅ CORS-clean |
| 12 | Reliability | high but API access unstable (Nov 2024 cull without notice) | high | very high, stable for 15+ years | medium; CDN preview links have churned before | good; decentralized, multiple discovery hosts | good | gated | medium; item-level variance | excellent (self-hosted) | good |
| 13 | Licensing / terms | Playback is out of scope for 3rd-party players by design; new apps = 25-user dev mode | Full playback = subscription entitlement, NMLS keys, review | Affiliate ToU; previews are promotional 30s clips; attribution expected; commercial use needs affiliate care | Catalogue data OK with attribution; **audio playback beyond previews violates ToS** | Artists upload; per-track license displayed; API terms permit streaming apps with app_name; "open" API | CC-licensed catalogue; commercial use of content requires Jamendo's paid licence | Per-track rights; approval gate | Public domain / CC0 items; per-item verification needed | Your own media; no third-party rights involved | CC-sourced lyrics; per-record license field |
| 14 | Implementation complexity | medium (OAuth + refresh, unstable scope) | high (JWT, MW keys, review) | **low** (keyless JSON GET) | medium + proxy | **low-medium** (host resolution + REST + 302 stream URLs) | low (client_id GET) | high (gated) | medium (messy metadata) | medium (needs a server to exist) | low (keyless GET) |
| 15 | Works with HtmlAudioEngine | n/a (no URL to play) | ✅ (preview URLs) | ✅ verified this session | 🟡 previews via proxy only | ✅ **verified this session (full-length, CORS-clean, 227s track)** | ✅ likely (mp31 CDN sends CORS per docs; unverified) | untested | ✅ | ✅ | n/a (lyrics only) |

---

## 3. Ruled out, and why

- **Spotify Web API** — playback by third parties is not part of the current
  offering: `preview_url` is gone for new apps and the November 2024 endpoint
  cull (recommendations, related artists, audio features, featured playlists)
  hit without notice. A desktop client would also sit in the 25-user dev-mode
  cap until (uncertain) extended approval. Not a foundation.
- **Deezer public API** — good metadata, but `api.deezer.com` sends no
  `Access-Control-Allow-Origin` (verified by fetch from the app's own browser
  context), so every call needs a server proxy; full-length playback would
  additionally violate their ToS. Rejected for now.
- **SoundCloud** — registration effectively closed to new apps (apply via an
  approval flow with no published SLA). Unknowable timeline; excluded.
- **Apple Music API (full)** — real playback requires an Apple-issued music
  key + subscription entitlement; a heavyweight path aimed at different apps.
- **YouTube / YT Music unofficial clients** — undocumented, ToS-prohibited
  extraction; explicitly out of scope per the brief.

## 4. Viable candidates (ranked)

1. **Audius — primary real-audio source.** Keyless REST (only an `app_name`
   param), CORS-clean end to end *including the media response* (verified:
   full-length track, 227 s, through `HtmlAudioEngine`'s exact config),
   documented rate-limit tiers, real search for tracks/users/playlists, good
   artwork sizes, per-track license metadata. Catalogue is independent
   artists — not the mainstream catalogue, which is honest and fine for a
   real-audio source. Gaps to design around: no album entity (group tracks by
   playlist/artist), lyrics absent.
2. **iTunes Search API — mainstream metadata + legit 30 s previews.** Keyless,
   CORS-clean, rock-stable for 15+ years, superb artwork via URL templates.
   Constraints: ~20 calls/min (needs client-side throttle + cache), 100-result
   ceiling, previews only (30 s, m4a) — honest labeling required ("Preview").
   Music-video/licensing lookups also possible.
3. **LRCLIB — lyrics for any source.** Keyless, CORS-clean, synced + plain,
   generous limits. Slots into `getLyrics` regardless of which catalogue feeds
   the UI.
4. **Jamendo — optional CC catalogue.** Keyless-with-client_id, full-length CC
   streams; commercial use of the *content* needs Jamendo's paid licence, so
   it fits as an opt-in source rather than the default.
5. **Subsonic/Navidrome — Phase-later "bring your own server" source.** Maps
   1:1 onto `MusicProvider` (search/albums/artists/playlists/streams) but
   presumes the user runs a media server; complements the local-files plan.

## 5. Recommended architecture for Nabito

**Composite provider, one new folder, zero changes to the abstraction:**

```
src/services/providers/real/
  audiusProvider.ts     // catalogue + full-length streams (getStream → blob/redirect URL)
  itunesMetadata.ts     // mainstream search/metadata/artwork + 30s previews (throttled)
  lrclibLyrics.ts       // synced lyrics lookup for whatever is playing
  realProvider.ts       // facade implementing MusicProvider; merges results
```

- **Search** queries Audius and iTunes in parallel, tags each hit with its
  origin, and merges (iTunes first for mainstream matches, Audius interleaved
  for playable results).
- **`getStream(trackId)`** dispatches on the origin tag: Audius id → Audius
  stream endpoint; iTunes id → its 30s preview URL. Both are `{ kind: 'url' }`,
  both verified against `HtmlAudioEngine` today. `AudioStream` already has the
  right shape; a `preview: true` flag can ride along in `mimeType`/notes if we
  want a "Preview" badge.
- **Lyrics** always via LRCLIB (title/artist/album/duration match), falling
  back to `null`.
- **Artwork** comes from the providers' own CDN URLs (both send CORS), so
  `ArtworkRef = { kind: 'remote', url }` works as already implemented.
- **Rate-limit hygiene:** iTunes gets a serialized queue at ~1 req/3.5s with a
  small TTL cache; Audius requests carry `app_name=Nabito` and reuse resolved
  discovery hosts.
- **Honesty rules preserved:** previews are labelled, unavailable streams say
  why, synth/mock remain in Settings → Advanced → Music Source (Synth Demo /
  Real Music Provider / Mock Demo Library), which needs only `ProviderId`
  widened to include the new id — the switch itself already works.

No changes to `MusicProvider`, `PlaybackController`, `createEngineFor`,
`HtmlAudioEngine`, `playerStore` or the queue. The composite provider is a new
leaf in the registry, activated like synth was.

## 6. Risks / open questions

- Audius discovery-host list is dynamic; needs a cached resolver with fallback
  hosts (implementation detail, no design risk).
- iTunes' 20 calls/min makes type-ahead search awkward; mitigation is the
  350 ms debounce we already have + cache + serialized queue.
- Jamendo CC licensing is per-track; if we ever surface it by default we must
  display the license line (the API provides it).
- Audius catalogue skews electronic/remix; mainstream discovery (charts, "Made
  for You") will lean on iTunes metadata + previews. Acceptable for v1 of the
  real provider.

---

## 7. Update: the active provider is now YouTube Music (yt-dlp pipeline)

**Decision (supersedes §4/§5 as the default source):** the user explicitly chose a
personal-use, local-machine pipeline for full-length mainstream playback.

**What ships**

- `server/mediaHelper.mjs` — a local-only HTTP helper on `127.0.0.1:5267`:
  - metadata via `youtubei.js` against YouTube Music (search, albums, artists,
    playlists, home) — verified working;
  - `/resolve` spawns **short-lived** `yt-dlp --get-url --format bestaudio` children
    (no download, no disk writes, 30 s kill timer);
  - `/audio` range-proxies googlevideo bytes into the player (seek works;
    upstream fetch is cancelled on abort);
  - lifecycle: the webview heartbeats `/health`; **15 s without a beat → exit**
    (also `/shutdown`, SIGINT/SIGTERM). No orphans.
  - spawned by a Vite plugin (`scripts/vite-media-helper.ts`) in dev, and by the
    Tauri shell in production — it always dies with the app.
- `src/services/providers/yt/ytProvider.ts` — full `MusicProvider` mapping ids
  `yt:`, `yt-a:`, `yt-al:`, `yt-pl:`; `getStream` returns the helper's proxied
  `/audio` URL after a health check, so a dead helper surfaces as an honest error.
- The composite Audius+iTunes provider was removed; LRCLIB stays for lyrics.

**Terms & reliability (on record)**

- Stream extraction bypasses YouTube's player surface → **violates YouTube's ToS**.
  This is a personal-use tool at the user's explicit request; it must never be
  shipped as a distributed product without a licensed source.
- Empirically (Oct 2026): every JS library path (`ytdl-core`, `@distube/ytdl-core`,
  `youtubei.js` stream URLs) is broken by the PO-token/BotGuard gate; `yt-dlp`
  absorbs those changes upstream, which is why the child-process approach was
  chosen. Expect breakage windows after big YouTube rotations until yt-dlp updates.
- The first playback of a track costs one ~2–5 s yt-dlp spawn (cached ~10 min per
  video id).

**Library note:** `ytdl-core`/`@distube/ytdl-core`/`node-youtube-music` were probed
and uninstalled (all dead); `youtubei.js` is the only YouTube dependency.
