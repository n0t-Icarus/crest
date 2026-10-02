import { useEffect, useState } from 'react'
import { navigate } from '@/app/router'
import { CollectionHeader } from '@/components/music/CollectionHeader'
import { SongTable } from '@/components/music/SongTable'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SkeletonSongList } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { useTracks } from '@/library/useTracks'
import { openPlaylistMenuFromButton } from '@/playlists/playlistActions'
import { playTracks } from '@/player/songActions'
import { useLibraryStore } from '@/store/libraryStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { getProvider } from '@/services/providers'
import type { Playlist } from '@/services/providers/types'
import { formatDurationLong, songCountLabel } from '@/utils/format'
import styles from './pages.module.css'

/**
 * Playlist detail: header, transport, reorderable song list, playlist actions.
 *
 * Two kinds of playlist render here:
 *  - User playlists (`libraryStore`, `editable: true`) — fully editable.
 *  - Catalogue playlists from the active provider (e.g. Audius communities) —
 *    read-only: no reorder/remove affordances and no library-store lookup.
 */
export function PlaylistPage({ id }: { id: string }) {
  const localPlaylist = useLibraryStore((state) => state.playlists.find((item) => item.id === id))
  const removeTrack = useLibraryStore((state) => state.removeTrackFromPlaylist)
  const reorder = useLibraryStore((state) => state.reorderPlaylist)
  const openNewPlaylist = useUiStore((state) => state.openNewPlaylistDialog)
  const [cataloguePlaylist, setCataloguePlaylist] = useState<Playlist | null>(null)
  const [catalogueError, setCatalogueError] = useState(false)

  useEffect(() => {
    if (localPlaylist) return
    let active = true
    setCataloguePlaylist(null)
    setCatalogueError(false)
    void getProvider()
      .getPlaylist(id)
      .then((result) => {
        if (active) setCataloguePlaylist(result)
      })
      .catch(() => {
        if (active) setCatalogueError(true)
      })
    return () => {
      active = false
    }
  }, [id, localPlaylist])

  const playlist = localPlaylist ?? cataloguePlaylist
  const isCatalogue = !localPlaylist && Boolean(cataloguePlaylist)
  const tracks = useTracks(playlist?.trackIds ?? [])

  if (!playlist) {
    if (!localPlaylist && !catalogueError) return null // still resolving the catalogue
    return (
      <div className={styles.page}>
        <EmptyState
          title="Playlist not found"
          message="It may have been deleted. Your other playlists are untouched."
          action={{ label: 'Back to playlists', onClick: () => navigate({ name: 'playlists' }) }}
        />
      </div>
    )
  }

  const totalMs = (tracks ?? []).reduce((sum, track) => sum + track.durationMs, 0)
  const meta = `${songCountLabel(playlist.trackIds.length)} · ${formatDurationLong(totalMs)}`

  return (
    <div className={styles.page}>
      <CollectionHeader
        eyebrow={isCatalogue ? 'Playlist · Audius' : 'Playlist'}
        title={playlist.name}
        description={playlist.description}
        meta={meta}
        artwork={playlist.artwork}
        seed={playlist.id}
        disabled={playlist.trackIds.length === 0}
        onPlay={() => tracks && playTracks(tracks, 0, playlist.name)}
        onShuffle={() => {
          useSettingsStore.getState().set('shuffle', true)
          if (tracks) playTracks(tracks, 0, playlist.name)
        }}
        actions={
          isCatalogue ? null : (
            <>
              <Button variant="outline" icon="plus" onClick={() => openNewPlaylist()}>
                New playlist
              </Button>
              <IconButton
                icon="more"
                label="Playlist options"
                variant="subtle"
                onClick={(event) => openPlaylistMenuFromButton(event.currentTarget, playlist)}
              />
            </>
          )
        }
      />

      {tracks ? (
        <SongTable
          tracks={tracks}
          label={playlist.name}
          showIndex
          showAlbum
          reorderable={!isCatalogue}
          onReorder={isCatalogue ? undefined : (from, to) => reorder(playlist.id, from, to)}
          onRemove={isCatalogue ? undefined : (index) => {
            const track = tracks[index]
            if (track) removeTrack(playlist.id, track.id)
          }}
          removeLabel={isCatalogue ? undefined : 'Remove from this playlist'}
          emptyTitle="This playlist is empty"
          emptyMessage="Use the ··· menu on any song to add it here."
        />
      ) : (
        <SkeletonSongList rows={6} />
      )}

      {!isCatalogue && playlist.trackIds.length > 0 ? (
        <p className={styles.note}>
          Drag rows — or focus one and hold Alt with ↑/↓ — to reorder. Changes save immediately; Crest keeps your
          playlists on this machine.
        </p>
      ) : null}
    </div>
  )
}
