import { navigate } from '@/app/router'
import type { Track } from '@/services/providers/types'
import { useLibraryStore } from '@/store/libraryStore'
import { openMenu, toast, useUiStore, type MenuItem } from '@/store/uiStore'
import { usePlayerStore } from './playerStore'

/**
 * Song actions.
 *
 * One module builds every track menu in the app, so a song behaves identically
 * in the search results, the queue, a playlist and the home page. Actions that
 * cannot work yet are rendered disabled with a reason rather than silently
 * doing nothing.
 */

export type TrackMenuOptions = {
  /** Queue the track belongs to, if it came from a list. */
  contextQueue?: Track[]
  /** Adds a "Remove from …" entry. */
  removeAction?: { label: string; run: () => void }
}

export function playTracks(tracks: Track[], startIndex = 0, label?: string): void {
  if (tracks.length === 0) return
  usePlayerStore.getState().playQueue(tracks, startIndex, { label })
}

export function playTrackNext(track: Track): void {
  usePlayerStore.getState().playNext(track)
  toast(`“${track.title}” will play next`)
}

export function queueTrack(track: Track): void {
  usePlayerStore.getState().enqueue(track)
  toast(`Added “${track.title}” to the queue`)
}

export function toggleLikeTrack(track: Track): void {
  const library = useLibraryStore.getState()
  const wasLiked = library.isLiked(track.id)
  library.toggleLike(track.id)
  toast(wasLiked ? `Removed “${track.title}” from Liked Songs` : `Added “${track.title}” to Liked Songs`)
}

export function isTrackLiked(trackId: string): boolean {
  return useLibraryStore.getState().likedTrackIds.includes(trackId)
}

export async function copySongInfo(track: Track): Promise<void> {
  const text = `${track.title} — ${track.artistName}\nAlbum: ${track.albumName}\nDuration: ${Math.round(
    track.durationMs / 1000,
  )}s`
  try {
    await navigator.clipboard.writeText(text)
    toast('Song information copied')
  } catch {
    toast('Could not copy song information', { tone: 'error' })
  }
}

export function trackMenuItems(track: Track, options: TrackMenuOptions = {}): MenuItem[] {
  const liked = isTrackLiked(track.id)
  const playlists = useLibraryStore.getState().playlists
  const queue = options.contextQueue ?? [track]
  const index = queue.findIndex((item) => item.id === track.id)

  const addToPlaylist: MenuItem[] = [
    ...playlists.map<MenuItem>((playlist) => ({
      kind: 'item',
      id: `add-to-${playlist.id}`,
      label: playlist.name,
      onSelect: () => {
        useLibraryStore.getState().addTracksToPlaylist(playlist.id, [track.id])
        toast(`Added to “${playlist.name}”`)
      },
    })),
    { kind: 'separator', id: 'add-to-separator' },
    {
      kind: 'item',
      id: 'add-to-new',
      label: 'New playlist…',
      icon: 'plus',
      onSelect: () => useUiStore.getState().openNewPlaylistDialog([track.id]),
    },
  ]

  const items: MenuItem[] = [
    {
      kind: 'item',
      id: 'play',
      label: 'Play',
      icon: 'play',
      shortcut: 'Enter',
      onSelect: () => playTracks(queue, index < 0 ? 0 : index, options.contextQueue ? undefined : track.albumName),
    },
    { kind: 'item', id: 'play-next', label: 'Play next', icon: 'skipForward', onSelect: () => playTrackNext(track) },
    { kind: 'item', id: 'queue', label: 'Add to queue', icon: 'queue', onSelect: () => queueTrack(track) },
    { kind: 'item', id: 'add-to-playlist', label: 'Add to playlist', icon: 'plus', submenu: addToPlaylist },
    {
      kind: 'item',
      id: 'like',
      label: liked ? 'Remove from Liked Songs' : 'Like',
      icon: liked ? 'heartFilled' : 'heart',
      onSelect: () => toggleLikeTrack(track),
    },
    {
      kind: 'item',
      id: 'download',
      label: 'Download / cache offline',
      icon: 'download',
      disabled: true,
      note: 'Offline storage arrives in Phase 9',
    },
    { kind: 'separator', id: 'sep-1' },
    {
      kind: 'item',
      id: 'go-album',
      label: 'Go to album',
      icon: 'album',
      onSelect: () => navigate({ name: 'album', id: track.albumId }),
    },
    {
      kind: 'item',
      id: 'go-artist',
      label: 'Go to artist',
      icon: 'user',
      onSelect: () => navigate({ name: 'artist', id: track.artistId }),
    },
    { kind: 'separator', id: 'sep-2' },
    {
      kind: 'item',
      id: 'copy',
      label: 'Copy song information',
      icon: 'externalLink',
      onSelect: () => void copySongInfo(track),
    },
  ]

  if (options.removeAction) {
    items.push(
      { kind: 'separator', id: 'sep-remove' },
      {
        kind: 'item',
        id: 'remove',
        label: options.removeAction.label,
        icon: 'trash',
        danger: true,
        onSelect: options.removeAction.run,
      },
    )
  }

  return items
}

export function openTrackMenuAt(point: { x: number; y: number }, track: Track, options: TrackMenuOptions = {}): void {
  openMenu({
    x: point.x,
    y: point.y,
    items: trackMenuItems(track, options),
    returnFocusTo: document.activeElement as HTMLElement | null,
  })
}

/** Opens the menu aligned under a three-dot button. */
export function openTrackMenuFromButton(button: HTMLElement, track: Track, options: TrackMenuOptions = {}): void {
  const rect = button.getBoundingClientRect()
  const menuWidth = 232
  const x = Math.min(Math.max(8, rect.right - menuWidth + 8), window.innerWidth - menuWidth - 8)
  openTrackMenuAt({ x, y: rect.bottom + 6 }, track, options)
}

export function handleTrackContextMenu(
  event: React.MouseEvent,
  track: Track,
  options: TrackMenuOptions = {},
): void {
  event.preventDefault()
  event.stopPropagation()
  openTrackMenuAt({ x: event.clientX, y: event.clientY }, track, options)
}
