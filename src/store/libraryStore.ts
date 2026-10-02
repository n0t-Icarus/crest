import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { likedTrackIds, playlists as seedPlaylists } from '@/services/providers/mock/catalog'
import type { Playlist } from '@/services/providers/types'

/**
 * User library: liked songs, playlists and play history.
 *
 * Seeded from the demo catalogue on first run so the UI has something real to
 * render; after that the store is the source of truth. Phase 6/9 move this onto
 * SQLite — the shape of the actions stays identical.
 */

const HISTORY_LIMIT = 500

export type HistoryEntry = {
  trackId: string
  playedAt: number
}

type LibraryState = {
  likedTrackIds: string[]
  playlists: Playlist[]
  history: HistoryEntry[]
  /** Artists the user follows. */
  followedArtistIds: string[]
}

type LibraryActions = {
  toggleLike: (trackId: string) => void
  isLiked: (trackId: string) => boolean
  createPlaylist: (name: string, description?: string) => string
  renamePlaylist: (id: string, name: string) => void
  updatePlaylist: (id: string, values: Partial<Pick<Playlist, 'name' | 'description'>>) => void
  deletePlaylist: (id: string) => void
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => void
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void
  reorderPlaylist: (playlistId: string, fromIndex: number, toIndex: number) => void
  recordPlay: (trackId: string) => void
  clearHistory: () => void
  toggleFollowArtist: (artistId: string) => void
  resetLibrary: () => void
}

export type LibraryStore = LibraryState & LibraryActions

const initialState: LibraryState = {
  likedTrackIds: [...likedTrackIds],
  playlists: seedPlaylists.map((playlist) => ({ ...playlist, trackIds: [...playlist.trackIds] })),
  history: [],
  followedArtistIds: [],
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

export const LIBRARY_STORAGE_KEY = 'crest.library'
const LEGACY_LIBRARY_STORAGE_KEY = 'velune.library'

// Migrate from legacy storage key if needed
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(LIBRARY_STORAGE_KEY)) {
    const legacy = localStorage.getItem(LEGACY_LIBRARY_STORAGE_KEY)
    if (legacy) {
      localStorage.setItem(LIBRARY_STORAGE_KEY, legacy)
    }
  }
} catch {
  /* storage access failed */
}

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      toggleLike: (trackId) =>
        set((state) => ({
          likedTrackIds: state.likedTrackIds.includes(trackId)
            ? state.likedTrackIds.filter((id) => id !== trackId)
            : [trackId, ...state.likedTrackIds],
        })),

      isLiked: (trackId) => get().likedTrackIds.includes(trackId),

      createPlaylist: (name, description) => {
        const id = createId('playlist')
        const playlist: Playlist = {
          id,
          name: name.trim() || 'New playlist',
          description,
          owner: 'You',
          editable: true,
          trackIds: [],
          artwork: { kind: 'generated', seed: id },
          updatedAt: Date.now(),
        }
        set((state) => ({ playlists: [playlist, ...state.playlists] }))
        return id
      },

      renamePlaylist: (id, name) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === id ? { ...playlist, name: name.trim() || playlist.name, updatedAt: Date.now() } : playlist,
          ),
        })),

      updatePlaylist: (id, values) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === id ? { ...playlist, ...values, updatedAt: Date.now() } : playlist,
          ),
        })),

      deletePlaylist: (id) => set((state) => ({ playlists: state.playlists.filter((playlist) => playlist.id !== id) })),

      addTracksToPlaylist: (playlistId, trackIds) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) => {
            if (playlist.id !== playlistId) return playlist
            const next = [...playlist.trackIds]
            for (const trackId of trackIds) {
              if (!next.includes(trackId)) next.push(trackId)
            }
            return { ...playlist, trackIds: next, updatedAt: Date.now() }
          }),
        })),

      removeTrackFromPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId), updatedAt: Date.now() }
              : playlist,
          ),
        })),

      reorderPlaylist: (playlistId, fromIndex, toIndex) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) => {
            if (playlist.id !== playlistId) return playlist
            const next = [...playlist.trackIds]
            const [moved] = next.splice(fromIndex, 1)
            if (moved === undefined) return playlist
            next.splice(toIndex, 0, moved)
            return { ...playlist, trackIds: next, updatedAt: Date.now() }
          }),
        })),

      recordPlay: (trackId) =>
        set((state) => {
          const entry: HistoryEntry = { trackId, playedAt: Date.now() }
          return { history: [entry, ...state.history].slice(0, HISTORY_LIMIT) }
        }),

      clearHistory: () => set({ history: [] }),

      toggleFollowArtist: (artistId) =>
        set((state) => ({
          followedArtistIds: state.followedArtistIds.includes(artistId)
            ? state.followedArtistIds.filter((id) => id !== artistId)
            : [...state.followedArtistIds, artistId],
        })),

      resetLibrary: () =>
        set({
          likedTrackIds: [...initialState.likedTrackIds],
          playlists: initialState.playlists.map((playlist) => ({ ...playlist, trackIds: [...playlist.trackIds] })),
          history: [],
          followedArtistIds: [],
        }),
    }),
    {
      name: LIBRARY_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        likedTrackIds: state.likedTrackIds,
        playlists: state.playlists,
        history: state.history,
        followedArtistIds: state.followedArtistIds,
      }),
    },
  ),
)
