# Crest

**Codename: Nabito** — a lightweight Windows desktop music client.

Phase 1 delivers the desktop shell and the complete UI, matched against the supplied
reference screenshot, running on realistic mock data. No music backend is wired up
yet, and nothing claims otherwise: feature switches that cannot work today are
disabled and labelled, not faked.

---

## 1. Stack decision

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | **Tauri 2** (Rust) | Uses the OS webview (WebView2, already present on Windows 10/11) instead of shipping a browser. Installer ~2-6 MB and idle RAM measured in tens of MB, versus ~40-50 MB / hundreds of MB for Electron. Media keys, tray, notifications, single instance and SQLite are all reachable from Rust without a Node runtime. |
| UI | **React 19 + TypeScript** | The reference is dense, stateful UI; React's component model plus strict TypeScript keeps a 60+ component surface maintainable. No UI kit: every control is written to match the reference rather than a library's default look. |
| Build | **Vite 8** | Fast dev server (sub-second HMR) and small, chunk-split production bundles. |
| State | **Zustand** (~1 kB) | Store-per-domain with selectors. Playback position deliberately lives *outside* React (see §5). |
| Audio | **`<audio>` behind an `AudioEngine` interface** | Real playback today; a native Rust pipeline (symphonia/rodio + Web Audio-style graph) drops in behind the same interface in Phase 10 for gapless, crossfade and EQ. |
| Storage | localStorage now, **SQLite** (rusqlite, bundled) in Phase 9 | Settings and library persistence work today through one adapter; the storage layer is swapped without touching call sites. |

Why not the alternatives? **Electron** cannot meet the "lightweight, low RAM, fast
startup" goal. **Native Rust GUI (egui/iced)** would be lighter still but cannot
reproduce the reference's typography, radii, shadows and hover choreography
pixel-for-pixel, which is the primary requirement for this phase. **Flutter** brings a
larger runtime and weaker Windows integration for this use case.

---

## 2. Reference analysis

Values were sampled directly from the screenshot (crops + pixel probes), and they
are encoded as design tokens in `src/styles/tokens.css`.

| Measurement | Value (reference) | Token |
| --- | --- | --- |
| Window frame / canvas | `#070A0E` | `--canvas` |
| Panel interior (sidebar, content, queue) | `#04050A` (darker than the canvas) | `--panel` |
| Sidebar width | 232 px | `--sidebar-w` |
| Queue width | 292 px | `--queue-w` |
| Top bar height | 56 px | `--header-h` |
| Player height | 78 px | `--player-h` |
| Panel gutters | 12-14 px | `--window-pad`, `--gutter` |
| Search field | 34 px tall, fully rounded, `#1D2026` | `--surface-3` |
| Active nav pill | 36 px tall, `#15181D`, r8 | `--surface-2` |
| Recently Played cards | 140 px square art, r12, 16 px gap | `--radius-md` |
| Made for You cards | 178 px tall, full-bleed art + scrim | — |
| Now playing art (queue) | 68 px, r8 | — |
| Queue rows | 40 px art, 12.5 px title / 11 px artist | — |
| Player art | 48 px, r8 | — |
| Play button | 38-40 px light circle (light-on-dark) | — |

Typography: **Manrope** for display (hero, section titles, collection titles),
**Inter** for UI and body. Both self-hosted, latin-subset only, variable weight —
**73 kB total**, no webfont CDN, works offline. Licences ship in `public/fonts`.

Colour language: near-black everywhere, one accent used sparingly (focus rings,
now-playing, active states), no neon, no big gradients, hairline borders
(`#14161C`), soft shadows only on floating surfaces (tooltips, menus, modals).

---

## 3. Architecture

```
src/
  app/            shell composition, router, appearance, error boundary
  components/     ui/ (primitives) · layout/ (chrome) · music/ (cards, song table) · brand/ · dev/
  pages/          one folder per view; home/ holds the hero + feed
  player/         PlayerBar, progress channel, controller, player store, song actions
  audio/          AudioEngine contract + HTML and simulated implementations
  queue/          queue panel and rows (drag reorder, remove)
  lyrics/         lyrics hooks, preview and full view
  search/         search hook + overlay
  services/       providers/ — MusicProvider contract and the mock implementation
  store/          settings, library, ui stores (persisted where appropriate)
  settings/       settings primitives (rows, toggles, segmented, selects)
  playlists/      playlist actions + dialogs
  library/        track resolution cache
  hooks/          hotkeys, media query, visibility, debounce, async
  utils/          formatting, class names, procedural artwork
  windows/        the only module that talks to Tauri
src-tauri/        Rust shell (window state, capabilities, icons)
```

Hard rules enforced by this layout:

- **UI never touches Tauri directly** — everything goes through `src/windows/tauri.ts`,
  which no-ops in a browser so `npm run dev` gives a fast visual loop.
- **UI never touches a backend directly** — it consumes `MusicProvider` only.
- **Player never touches `<audio>` directly** — it drives an `AudioEngine`.
- No single-file components: the largest module is well under 400 lines.

### Data provider abstraction

```ts
interface MusicProvider {
  id: string
  displayName: string
  capabilities: { streaming: boolean; lyrics: 'none' | 'plain' | 'synced'; search: boolean; recommendations: boolean }
  getHome(): Promise<HomeFeed>
  search(query): Promise<SearchResults>
  getTrack / getTracks / getAlbum / getArtist / getArtistTracks / getPlaylist / getMix
  getLyrics(trackId): Promise<Lyrics | null>
  getRecommendations(seedId, limit): Promise<Track[]>
  getStream(trackId): Promise<AudioStream>
}
```

Three backends ship today, all over the same interface:

- `MockProvider` (`services/providers/mock/`) — the bundled demo catalogue, metadata
  only. It reports `streaming: false` and returns `{ kind: 'unavailable' }` from
  `getStream()`, so the UI honestly shows a "Demo audio" chip.
- `SynthProvider` (`services/providers/synth/`) — same catalogue, but `getStream()`
  renders a deterministic waveform per track **on this machine** (`synthEngine.ts`:
  wavetable pads, bass, arpeggio and drums mixed into a 16-bit WAV, hashed from the
  track id) and hands back a `blob:` URL. No bundled audio, no network, no licensed
  recordings — yet playback, seek, volume and auto-advance all run the real
  `HtmlAudioEngine` path.
- `YtProvider` (`services/providers/yt/`) — **YouTube Music, full-length**. Metadata
  comes from YouTube Music's InnerTube API via `youtubei.js` inside a tiny local
  helper (`server/mediaHelper.mjs`); audio URLs are resolved on demand by short-lived
  `yt-dlp --get-url --format bestaudio` child processes and the helper range-proxies
  the stream into the player — nothing is ever written to disk. The helper lives and
  dies with the app: the webview heartbeats it, and it exits after 15 s without a
  beat (or on `/shutdown`/SIGINT). Personal-use pipeline — see
  docs/PROVIDERS.md §7 for the terms and reliability discussion.

The active source is switchable in Settings → Advanced → Music Source and persists.

### Audio architecture

`AudioEngine` has two implementations today:

- `HtmlAudioEngine` — real playback through the webview's media element. Position is
  reported from a `requestAnimationFrame` loop that runs **only while playing**.
- `SimulatedEngine` — a clock-only transport used when the provider has no audio. It
  reports `simulated: true`, which the player surfaces as a "Demo audio" chip.

`PlaybackController` owns the current engine, forwards engine events through an
ownership guard (a superseded engine can never move the playhead or flip transport
state), and tracks every engine it creates so replacements are always disposed.

Capability reporting (`audio/audioFeatures.ts`) drives the Settings page, so
crossfade/gapless/normalise/skip-silence/equalizer are shown as **Planned** with the
phase that delivers them instead of being decorative switches.

---

## 4. What works today

| Area | Status |
| --- | --- |
| Frameless window, custom title bar, window state persistence | ✅ |
| Three-panel layout, independent scrolling, responsive collapse | ✅ |
| Sidebar: nav, playlists, account row, hover/selected states | ✅ |
| Home: hero carousel, Recently Played, Made for You, Trending Now | ✅ |
| Player: play/pause, next/previous, seek, shuffle, repeat, queue, autoplay | ✅ |
| Queue: Now Playing / Up Next, drag reorder (and Alt+↑/↓), remove, clear | ✅ |
| Lyrics: plain + synced, active-line highlight, auto-scroll, preview + full view | ✅ |
| Search: instant overlay, tabs, ranked results | ✅ |
| Library, playlists (create/rename/delete/add/remove/reorder), liked, history | ✅ |
| Settings: appearance, playback, audio, library, privacy, keyboard, advanced, about | ✅ (persisted) |
| Keyboard shortcuts (§7) | ✅ |
| Compact player | ✅ |
| Artwork: procedural, lazy, no third-party images | ✅ |
| Real audio playback (procedural "Synth demo" source) | ✅ |
| Local files / real streaming backends | Phase 5+ |
| Gapless / crossfade / EQ / normalisation / pitch | Phase 10 |
| Tray, media keys via SMTC, toast notifications, start-with-Windows | Phase 8 |
| Discord Rich Presence | Phase 8 |
| SQLite cache + offline downloads | Phase 9 |
| `.exe` packaging (NSIS) | Phase 11 |

---

## 5. Performance strategy

- **No polling.** Playback position is written to the DOM from a frame loop that only
  exists while audio is playing; verified at **0 animation frames per second when
  idle**. Lyrics, progress bars and the debug overlay all use the same direct-DOM
  approach and never re-render React per frame.
- **Referentially stable selectors.** Store selectors return primitives or memoised
  values; slices are computed with `useMemo` so `useSyncExternalStore` never loops.
- **Windowing.** `SongTable` virtualises lists over 30 rows against the page scroller
  (`@tanstack/react-virtual`).
- **Cheap cards.** Artwork is CSS gradient layers — no image decode, no network — and
  remote images (Phase 5) mount lazily via `IntersectionObserver` with a gradient
  placeholder underneath so nothing shifts.
- **Containment.** Rows use `content-visibility: auto` with intrinsic sizing.
- **Opt-in diagnostics.** Settings → Advanced enables a debug overlay reporting FPS,
  worst frame, dropped frames, heap and node count.
- **Startup.** The window is created hidden and revealed after the first frame; the
  Tauri API is dynamically imported only when window controls are used, keeping it
  out of the initial bundle (see the separate `window` chunk in the build output).

## 6. Data & persistence

Settings, likes, playlists, play history and the queue are persisted through one
adapter (`zustand/persist`) and restored — including window geometry and maximised
state from Rust — so nothing resets between restarts. Phase 9 replaces the adapter
with the SQLite schema for library metadata, cached artwork and download records.

## 7. Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` | Focus search |
| `Space` | Play / pause |
| `Ctrl+←` / `Ctrl+→` | Previous / next track |
| `M` | Mute |
| `↑` / `↓` | Volume |
| `Esc` | Close menu / overlay / dialog |
| `Alt+↑` / `Alt+↓` | Reorder the focused queue row |

Rebinding and system-wide hotkeys arrive with the global-shortcut plugin (Phase 8).

## 8. Running it

```bash
npm install
npm run dev          # browser preview at http://127.0.0.1:5273 (fast visual loop)
npm run desktop      # Tauri dev window
npm run build        # typecheck + production frontend build
npm run desktop:build  # NSIS installer (.exe) — Phase 11
npm run icons        # regenerate the app icons (stdlib-only Python script)
```

## 9. Licensing & content notes

- **Fonts**: Inter and Manrope, SIL Open Font License 1.1 (`public/fonts/LICENSE-*`).
- **Artwork**: generated procedurally from each item's id (`utils/artwork.ts`). No
  third-party images are bundled; remote artwork is supported and cached later.
- **Lyrics**: the bundled lyric text is original placeholder copy written for
  development. No licensed lyric text ships with Crest.
- **Icons**: hand-drawn inline SVG (`components/ui/Icon.tsx`) — no icon package.

### On music backends

No backend is wired up in this phase. When one is added, the honest options are:

1. **Local library provider** — user's own files. Zero legal exposure, fully offline.
2. **Official catalogue APIs** — metadata and (where licensed) streams under the
   provider's terms; API keys stay out of the client and are never hard-coded.
3. **Unofficial YouTube Music endpoints** — technically possible, but they violate
   YouTube's Terms of Service, are subject to silent breakage, and would ship a
   legally risky client. They stay out of the default build; if wanted, they belong
   behind `services/providers/<name>/` as an explicit, opt-in module so the rest of
   the app is unaffected and the decision is visible.

## 10. Roadmap

| Phase | Scope |
| --- | --- |
| 1 ✅ | Desktop shell + reference-accurate UI on mock data |
| 2/3 ✅ | Navigation, responsive behaviour, all views |
| 4 ✅ | Player architecture (queue, shuffle, repeat, seek, autoplay, history) |
| 5 | Real `MusicProvider` (local library first) + real playback |
| 6 | Library/playlists on SQLite |
| 7 | Lyrics providers + caching |
| 8 | Windows integration: tray, SMTC media keys, toasts, start-with-Windows, Discord RPC, global shortcuts |
| 9 | Cache/offline layer, download manager, cache limits |
| 10 | Native audio pipeline: gapless, crossfade, normalisation, silence skipping, EQ, pitch |
| 11 | Packaging: NSIS `.exe`, code signing notes, auto-update |
