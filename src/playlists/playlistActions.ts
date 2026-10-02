import { navigate } from '@/app/router'
import { getProvider } from '@/services/providers'
import type { Playlist } from '@/services/providers/types'
import { usePlayerStore } from '@/player/playerStore'
import { playTracks } from '@/player/songActions'
import { useLibraryStore } from '@/store/libraryStore'
import { openMenu, toast, type MenuItem } from '@/store/uiStore'

/** Playlist actions shared by the sidebar, the playlist grid and detail views. */
export function createPlaylistMenu(playlist: Playlist): MenuItem[] {
  const library = useLibraryStore.getState()
  const loadTracks = () => getProvider().getTracks(playlist.trackIds)

  return [
    {
      kind: 'item',
      id: 'play',
      label: 'Play playlist',
      icon: 'play',
      disabled: playlist.trackIds.length === 0,
      onSelect: () => {
        void loadTracks().then((list) => playTracks(list, 0, playlist.name))
      },
    },
    {
      kind: 'item',
      id: 'queue',
      label: 'Add to queue',
      icon: 'queue',
      disabled: playlist.trackIds.length === 0,
      onSelect: () => {
        void loadTracks().then((list) => {
          const player = usePlayerStore.getState()
          for (const track of list) player.enqueue(track)
          toast(`Added ${list.length} songs to the queue`)
        })
      },
    },
    { kind: 'separator', id: 'sep-1' },
    {
      kind: 'item',
      id: 'open',
      label: 'Open playlist',
      icon: 'externalLink',
      onSelect: () => navigate({ name: 'playlist', id: playlist.id }),
    },
    {
      kind: 'item',
      id: 'rename',
      label: 'Rename playlist',
      icon: 'pencil',
      onSelect: () => {
        const next = window.prompt('Rename playlist', playlist.name)
        if (next && next.trim()) {
          library.renamePlaylist(playlist.id, next.trim())
          toast(`Renamed to “${next.trim()}”`)
        }
      },
    },
    {
      kind: 'item',
      id: 'delete',
      label: 'Delete playlist',
      icon: 'trash',
      danger: true,
      onSelect: () => {
        library.deletePlaylist(playlist.id)
        toast(`Deleted “${playlist.name}”`)
      },
    },
  ]
}

export function openPlaylistMenuAt(point: { x: number; y: number }, playlist: Playlist): void {
  openMenu({
    x: point.x,
    y: point.y,
    items: createPlaylistMenu(playlist),
    returnFocusTo: document.activeElement as HTMLElement | null,
  })
}

export function openPlaylistMenuFromButton(button: HTMLElement, playlist: Playlist): void {
  const rect = button.getBoundingClientRect()
  const width = 232
  openPlaylistMenuAt({ x: Math.min(Math.max(8, rect.right - width + 8), window.innerWidth - width - 8), y: rect.bottom + 6 }, playlist)
}
