import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getProvider } from '@/services/providers'
import type { Track } from '@/services/providers/types'
import { useLibraryStore } from '@/store/libraryStore'
import { useSettingsStore } from '@/store/settingsStore'
import { PlaybackController } from './playbackController'
import { getProgress, resetProgress, setProgress } from './progress'

/**
 * Playback state.
 *
 * The queue is the play order itself (already shuffled when shuffle is on) so
 * "Up Next", drag-reordering and index bookkeeping all operate on one array.
 * Turning shuffle off restores the snapshot taken when it was turned on.
 *
 * Position intentionally does *not* live here — see player/progress.ts.
 */

export type PlayerState = {
  queue: Track[]
  index: number
  contextLabel: string | null
  isPlaying: boolean
  isBuffering: boolean
  durationMs: number
  isSimulated: boolean
  /** True once an engine has actually loaded media this session. */
  loadedOnce: boolean
  error: string | null
  sessionHistory: Track[]
  preShuffle: { queue: Track[]; index: number } | null
}

export type PlayerActions = {
  playQueue: (tracks: Track[], startIndex?: number, options?: { label?: string }) => void
  playTrack: (track: Track, options?: { queue?: Track[]; label?: string }) => void
  togglePlay: () => void
  play: () => void
  pause: () => void
  next: (options?: { auto?: boolean }) => void
  previous: () => void
  seek: (positionMs: number) => void
  enqueue: (track: Track) => void
  playNext: (track: Track) => void
  removeQueueItem: (index: number) => void
  moveQueueItem: (from: number, to: number) => void
  clearUpcoming: () => void
  retry: () => void
  dismissError: () => void
}

export type PlayerStore = PlayerState & PlayerActions

const initialQueueState: PlayerState = {
  queue: [],
  index: 0,
  contextLabel: null,
  isPlaying: false,
  isBuffering: false,
  durationMs: 0,
  isSimulated: true,
  loadedOnce: false,
  error: null,
  sessionHistory: [],
  preShuffle: null,
}

export const PLAYER_STORAGE_KEY = 'crest.player'
const LEGACY_PLAYER_STORAGE_KEY = 'velune.player'

// Migrate from legacy storage key if needed
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(PLAYER_STORAGE_KEY)) {
    const legacy = localStorage.getItem(LEGACY_PLAYER_STORAGE_KEY)
    if (legacy) {
      localStorage.setItem(PLAYER_STORAGE_KEY, legacy)
    }
  }
} catch {
  /* storage access failed */
}
const MAX_PERSISTED_QUEUE = 200

/* -------------------------------------------------------------------------- */
/* Controller wiring                                                          */
/* -------------------------------------------------------------------------- */

const controller = new PlaybackController({
  onPosition: (positionMs) => setProgress(positionMs),
  onDuration: (durationMs) => {
    setProgress(getProgress().positionMs, durationMs)
    usePlayerStore.setState({ durationMs })
  },
  onPlaying: (playing) => {
    usePlayerStore.setState({ isPlaying: playing })
  },
  onBuffering: (buffering) => {
    usePlayerStore.setState({ isBuffering: buffering })
  },
  onEnded: () => {
    const { repeat } = useSettingsStore.getState()
    if (repeat === 'one') {
      controller.seek(0)
      void controller.play()
      return
    }
    usePlayerStore.getState().next({ auto: true })
  },
  onError: (message) => {
    usePlayerStore.setState({ error: message, isPlaying: false, isBuffering: false })
  },
  onSimulated: (simulated) => {
    usePlayerStore.setState({ isSimulated: simulated })
  },
})

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function shuffled<T>(items: T[], seedIndex: number): T[] {
  const head = items[seedIndex]!
  const rest = items.filter((_, position) => position !== seedIndex)
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = rest[i]!
    rest[i] = rest[j]!
    rest[j] = a
  }
  return [head, ...rest]
}

function startTrack(track: Track): void {
  useLibraryStore.getState().recordPlay(track.id)
  usePlayerStore.setState({ loadedOnce: true })
  void controller.load(track, { autoplay: true })
}

/**
 * Resolve the *next* track while this one plays.
 *
 * Stream resolution costs a yt-dlp round trip. Paying it at play time leaves a
 * dead gap on every skip; paying it here means the next track is ready before
 * the listener asks for it.
 */
function prewarmNext(): void {
  const provider = getProvider()
  if (!provider.prewarm) return
  const { queue, index } = usePlayerStore.getState()
  const next = queue[index + 1]
  if (!next) return
  void provider.prewarm(next.id)
}

/**
 * Drop long-played tracks off the head of the queue.
 *
 * The queue is topped up continuously, so without this it only ever grows. A
 * small buffer of already-played tracks is kept so "previous" still works.
 */
const PLAYED_BUFFER = 6
const MAX_QUEUED_TRACKS = 150

function trimQueue(): void {
  usePlayerStore.setState((state) => {
    if (state.queue.length <= MAX_QUEUED_TRACKS) return {}
    const excess = state.queue.length - MAX_QUEUED_TRACKS
    const drop = state.index - excess - PLAYED_BUFFER
    if (drop <= 0) return {}
    return { queue: state.queue.slice(drop), index: state.index - drop }
  })
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      ...initialQueueState,

      playQueue: (tracks, startIndex = 0, options = {}) => {
        if (tracks.length === 0) return
        const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1))
        const { shuffle } = useSettingsStore.getState()
        const ordered = shuffle ? shuffled(tracks, safeIndex) : tracks
        const index = shuffle ? 0 : safeIndex
        set({
          queue: ordered,
          index,
          contextLabel: options.label ?? null,
          preShuffle: shuffle ? { queue: tracks, index: safeIndex } : null,
          error: null,
        })
        startTrack(ordered[index]!)
        prewarmNext()
        // Playing anything builds out the queue around it, so the listener
        // never has to press play again after a short list runs out.
        void topUpQueue(ordered[index]!.id)
      },

      playTrack: (track, options = {}) => {
        const queue = options.queue ?? [track]
        const startIndex = queue.findIndex((item) => item.id === track.id)
        get().playQueue(queue, startIndex < 0 ? 0 : startIndex, { label: options.label })
      },

      togglePlay: () => {
        const { isPlaying, queue, index } = get()
        if (queue.length === 0) return
        if (isPlaying) {
          controller.pause()
        } else {
          set({ error: null })
          void controller.play().then(() => {
            // The engine had no track loaded yet (e.g. restored queue).
            if (!get().isPlaying) startTrack(queue[index]!)
          })
        }
      },

      play: () => {
        const { queue, index, isPlaying } = get()
        if (queue.length === 0 || isPlaying) return
        void controller.play().then(() => {
          if (!get().isPlaying) startTrack(queue[index]!)
        })
      },

      pause: () => controller.pause(),

      next: ({ auto = false } = {}) => {
        const { queue, index } = get()
        const { repeat, autoplay } = useSettingsStore.getState()
        if (queue.length === 0) return

        if (index + 1 < queue.length) {
          const upcoming = queue[index + 1]!
          set({ index: index + 1, error: null })
          startTrack(upcoming)
          prewarmNext()
          void topUpQueue(upcoming.id)
          return
        }
        if (repeat === 'all') {
          set({ index: 0, error: null })
          startTrack(queue[0]!)
          return
        }
        if (auto && autoplay) {
          void extendQueueWithRecommendations()
          return
        }
        controller.pause()
        set({ isPlaying: false })
      },

      previous: () => {
        const { queue, index } = get()
        if (queue.length === 0) return
        const { positionMs } = getProgress()
        if (positionMs > 3000) {
          controller.seek(0)
          return
        }
        const target = index > 0 ? index - 1 : 0
        set({ index: target, error: null })
        startTrack(queue[target]!)
      },

      seek: (positionMs) => controller.seek(Math.max(0, positionMs)),

      enqueue: (track) => set((state) => ({ queue: [...state.queue, track] })),

      playNext: (track) =>
        set((state) => {
          if (state.queue.length === 0) {
            return { queue: [track], index: 0 }
          }
          const next = [...state.queue]
          next.splice(state.index + 1, 0, track)
          return { queue: next }
        }),

      removeQueueItem: (index) =>
        set((state) => {
          if (index < 0 || index >= state.queue.length) return state
          const isCurrent = index === state.index
          const next = state.queue.filter((_, position) => position !== index)

          if (next.length === 0) {
            controller.pause()
            return { queue: [], index: 0, isPlaying: false }
          }

          let nextIndex = state.index
          if (isCurrent) {
            nextIndex = Math.min(state.index, next.length - 1)
            const replacement = next[nextIndex]
            if (replacement) startTrack(replacement)
          } else if (index < state.index) {
            nextIndex = state.index - 1
          }

          return { queue: next, index: nextIndex }
        }),

      moveQueueItem: (from, to) =>
        set((state) => {
          if (from === to || from < 0 || to < 0 || from >= state.queue.length || to >= state.queue.length) return state
          const next = [...state.queue]
          const [moved] = next.splice(from, 1)
          if (!moved) return state
          next.splice(to, 0, moved)
          let index = state.index
          if (from === state.index) index = to
          else if (from < state.index && to >= state.index) index -= 1
          else if (from > state.index && to <= state.index) index += 1
          return { queue: next, index }
        }),

      clearUpcoming: () =>
        set((state) => {
          const current = state.queue[state.index]
          return current ? { queue: [current], index: 0 } : { queue: [], index: 0 }
        }),

      retry: () => {
        const { queue, index } = get()
        const track = queue[index]
        if (!track) return
        set({ error: null })
        startTrack(track)
      },

      dismissError: () => set({ error: null }),
    }),
    {
      name: PLAYER_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        queue: state.queue.slice(0, MAX_PERSISTED_QUEUE),
        index: state.index,
        contextLabel: state.contextLabel,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<PlayerState> | undefined
        let queue = Array.isArray(saved?.queue) ? saved!.queue! : []
        // Purge legacy mock/demo catalog tracks (ids like '505', 'm-1' that do not start with 'yt:')
        queue = queue.filter((track) => track?.id && track.id.startsWith('yt:'))
        const index = queue.length > 0 ? Math.min(saved?.index ?? 0, queue.length - 1) : 0
        return { ...current, queue, index, contextLabel: queue.length > 0 ? (saved?.contextLabel ?? null) : null }
      },
    },
  ),
)

/* -------------------------------------------------------------------------- */
/* Bridges                                                                    */
/* -------------------------------------------------------------------------- */

/** Keep the engine aligned with the persisted audio settings. */
function attachSettingsBridge(): () => void {
  const apply = (state: ReturnType<typeof useSettingsStore.getState>) => {
    controller.setVolume(state.muted ? 0 : state.volume)
    controller.setMuted(state.muted)
    controller.setPlaybackRate(state.playbackSpeed)
    applyShuffle(state.shuffle)
  }
  apply(useSettingsStore.getState())

  return useSettingsStore.subscribe((state, previous) => {
    if (
      state.volume !== previous.volume ||
      state.muted !== previous.muted ||
      state.playbackSpeed !== previous.playbackSpeed
    ) {
      apply(state)
    }
    if (state.shuffle !== previous.shuffle) applyShuffle(state.shuffle)
  })
}

/** Shuffle toggling rewrites the play order and keeps the current track first. */
function applyShuffle(shuffle: boolean): void {
  const state = usePlayerStore.getState()
  if (state.queue.length === 0) return

  if (shuffle) {
    if (state.preShuffle) return
    const ordered = shuffled(state.queue, state.index)
    usePlayerStore.setState({
      preShuffle: { queue: state.queue, index: state.index },
      queue: ordered,
      index: 0,
    })
    return
  }

  if (!state.preShuffle) return
  const currentId = state.queue[state.index]?.id
  const { queue, index } = state.preShuffle
  const restoredIndex = currentId ? Math.max(0, queue.findIndex((track) => track.id === currentId)) : index
  usePlayerStore.setState({ queue, index: restoredIndex, preShuffle: null })
}

/** Keep at least this many tracks queued ahead of what is playing. */
const QUEUE_LOW_WATER = 15
/** How many tracks to pull on a top-up. */
const QUEUE_BATCH = 50

let topUpInFlight = false

/**
 * Keep the queue deep.
 *
 * The queue used to be topped up only once it ran completely dry, so playback
 * always died a few songs in and the listener had to press play again. It is
 * now topped up while there is still plenty left, which is what makes the queue
 * behave like a station instead of a five-song sample.
 *
 * The seed is whichever track just started, so the queue drifts outward from
 * what you are listening to rather than circling the first song — which is also
 * why the range stays wide instead of collapsing into a single artist.
 */
async function topUpQueue(seedTrackId?: string, options: { force?: boolean } = {}): Promise<void> {
  if (topUpInFlight) return
  const provider = getProvider()
  if (!provider.capabilities.recommendations || !provider.getRadio) return

  const state = usePlayerStore.getState()
  const remaining = state.queue.length - 1 - state.index
  if (!options.force && remaining >= QUEUE_LOW_WATER) return

  const seed = seedTrackId ?? state.queue[state.index]?.id
  if (!seed) return

  topUpInFlight = true
  try {
    const picks = await provider.getRadio(seed, QUEUE_BATCH)
    const current = usePlayerStore.getState()
    const existing = new Set(current.queue.map((track) => track.id))
    const additions = picks.filter((track) => !existing.has(track.id))
    if (additions.length === 0) return
    usePlayerStore.setState((prev) => ({ queue: [...prev.queue, ...additions] }))
    trimQueue()

    // If the queue was empty when this ran, move straight into the new tracks
    // rather than leaving playback sitting in silence.
    if (options.force && current.index >= current.queue.length - 1) {
      usePlayerStore.getState().next({ auto: false })
    }
  } catch {
    /* A failed top-up just leaves the queue as it was. */
  } finally {
    topUpInFlight = false
  }
}

/** Last resort: the queue is empty and autoplay expects playback to continue. */
async function extendQueueWithRecommendations(): Promise<void> {
  const before = usePlayerStore.getState().queue.length
  await topUpQueue(undefined, { force: true })
  if (usePlayerStore.getState().queue.length === before) {
    controller.pause()
    usePlayerStore.setState({ isPlaying: false })
  }
}

attachSettingsBridge()

/**
 * Progress bridge.
 *
 * Whenever the current track changes — including when a queue is restored from
 * disk on launch — the progress channel is re-seeded with that track's duration,
 * so timings are correct before playback has even started.
 */
function attachProgressBridge(): void {
  const initial = usePlayerStore.getState()
  const startTrack = initial.queue[initial.index]
  let lastId = startTrack?.id ?? null

  // Seed immediately: a queue restored from disk is already the current state,
  // so the subscription would never see it change.
  if (startTrack) {
    resetProgress(startTrack.durationMs)
    usePlayerStore.setState({ durationMs: startTrack.durationMs })
  }

  usePlayerStore.subscribe((state) => {
    const track = state.queue[state.index]
    const id = track?.id ?? null
    if (id === lastId) return
    lastId = id
    resetProgress(track?.durationMs ?? 0)
    // `isSimulated` is deliberately not touched here: the controller reports it
    // from the engine that actually loads the track, so a real stream keeps the
    // "Demo audio" chip off.
    usePlayerStore.setState({ durationMs: track?.durationMs ?? 0 })
  })
}

attachProgressBridge()

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * First-run queue.
 *
 * Crest opens with the previous session's queue restored. On a fresh install
 * there is nothing to restore, so a starter queue is loaded in a *paused*
 * state: the player, queue and lyrics render exactly like the reference
 * without anything pretending to play audio.
 *
 * Per provider: the demo providers seed from the "My Mix" playlist; streaming
 * providers have no fixed seed, so their home feed's first section fills in.
 */
export async function seedInitialQueue(): Promise<void> {
  if (usePlayerStore.getState().queue.length > 0) return
  const provider = getProvider()
  try {
    let tracks: Track[] = []
    let label = 'My Mix'
    if (provider.capabilities.streaming) {
      // Quick picks — curated server-side (one track per artist, variants and
      // spam filtered out). It used to seed from the generic home feed, which is
      // why a fresh queue looked like five versions of the same song.
      const feed = await provider.getHome()
      const picks = feed.sections.find((section) => section.id === 'quick-picks' && section.kind === 'tracks')
      const firstTracks = feed.sections.find((section) => section.kind === 'tracks')
      const source = picks ?? firstTracks
      tracks = source && source.kind === 'tracks' ? source.items.slice(0, 15) : []
      label = picks ? 'Quick picks' : 'For you'
    } else {
      const playlist = await provider.getPlaylist('p-my-mix')
      if (playlist) tracks = await provider.getTracks(playlist.trackIds)
    }
    if (tracks.length === 0) return
    usePlayerStore.setState({
      queue: tracks,
      index: 0,
      contextLabel: label,
      isPlaying: false,
      durationMs: tracks[0]?.durationMs ?? 0,
    })
    resetProgress(tracks[0]?.durationMs ?? 0)
  } catch {
    /* A missing seed is not an error worth surfacing. */
  }
}

export function useCurrentTrack(): Track | null {
  return usePlayerStore((state) => state.queue[state.index] ?? null)
}

export function useUpNext(): Track[] {
  // Selecting the queue and index separately (then memoising the slice) keeps the
  // snapshot referentially stable — a selector returning a fresh array would make
  // useSyncExternalStore loop.
  const queue = usePlayerStore((state) => state.queue)
  const index = usePlayerStore((state) => state.index)
  return useMemo(() => queue.slice(index + 1), [queue, index])
}

export const playerController = controller
