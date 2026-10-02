import { navigate } from '@/app/router'
import { CollectionCard } from '@/components/music/CollectionCard'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/States'
import { openPlaylistMenuFromButton } from '@/playlists/playlistActions'
import { useLibraryStore } from '@/store/libraryStore'
import { useUiStore } from '@/store/uiStore'
import styles from './pages.module.css'

/** Playlists overview: every playlist the user owns, plus creation. */
export function PlaylistsPage() {
  const playlists = useLibraryStore((state) => state.playlists)
  const openNewPlaylist = useUiStore((state) => state.openNewPlaylistDialog)

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Playlists</h1>
          <p className={styles.pageSubtitle}>
            {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} · rename, reorder and delete freely
          </p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => openNewPlaylist()}>
          New playlist
        </Button>
      </div>

      {playlists.length === 0 ? (
        <EmptyState
          title="No playlists yet"
          message="Playlists you create stay on this machine and are stored locally."
          action={{ label: 'Create a playlist', onClick: () => openNewPlaylist() }}
        />
      ) : (
        <div className={styles.grid}>
          {playlists.map((playlist) => (
            <div key={playlist.id} className={styles.cardWrapper}>
              <CollectionCard
                kind="playlist"
                playlist={playlist}
                onPlay={() => navigate({ name: 'playlist', id: playlist.id })}
              />
              <IconButton
                icon="more"
                label={`Options for ${playlist.name}`}
                size="sm"
                variant="subtle"
                iconSize={16}
                className={styles.cardMenu}
                onClick={(event) => openPlaylistMenuFromButton(event.currentTarget, playlist)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
