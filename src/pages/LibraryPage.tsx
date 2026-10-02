import { useMemo, useState } from 'react'
import { navigate } from '@/app/router'
import { CollectionCard } from '@/components/music/CollectionCard'
import { SongTable } from '@/components/music/SongTable'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/States'
import { SkeletonSongList } from '@/components/ui/Skeleton'
import { useTracks } from '@/library/useTracks'
import { playTracks } from '@/player/songActions'
import { useLibraryStore } from '@/store/libraryStore'
import { getProvider } from '@/services/providers'
import type { Album, Artist } from '@/services/providers/types'
import { trackCountLabel } from '@/utils/format'
import styles from './pages.module.css'

type Tab = 'songs' | 'albums' | 'artists' | 'playlists' | 'offline' | 'recent'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'songs', label: 'Liked Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'offline', label: 'Offline' },
  { id: 'recent', label: 'Recently Played' },
]

/**
 * Library.
 *
 * Deliberately built from the same primitives as Home (cards, song table,
 * tabs) — the brief is explicit that Library must not become a different design
 * language.
 */
export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('songs')
  const likedIds = useLibraryStore((state) => state.likedTrackIds)
  const playlists = useLibraryStore((state) => state.playlists)
  const history = useLibraryStore((state) => state.history)

  const likedTracks = useTracks(likedIds)
  const recentIds = useMemo(() => history.slice(0, 60).map((entry) => entry.trackId), [history])
  const recentTracks = useTracks(recentIds)

  // Albums and artists are derived from the songs the user actually keeps.
  const { albums, artists } = useMemo(() => {
    const albumMap = new Map<string, Album>()
    const artistMap = new Map<string, Artist>()
    for (const track of likedTracks ?? []) {
      if (!albumMap.has(track.albumId)) {
        albumMap.set(track.albumId, {
          id: track.albumId,
          title: track.albumName,
          artistId: track.artistId,
          artistName: track.artistName,
          artwork: track.artwork,
          trackIds: [],
        })
      }
      if (!artistMap.has(track.artistId)) {
        artistMap.set(track.artistId, { id: track.artistId, name: track.artistName, artwork: track.artwork })
      }
    }
    return { albums: [...albumMap.values()], artists: [...artistMap.values()] }
  }, [likedTracks])

  const openAlbum = async (album: Album) => {
    navigate({ name: 'album', id: album.id })
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Your Library</h1>
          <p className={styles.pageSubtitle}>
            {trackCountLabel(likedIds.length)} liked · {playlists.length} playlist{playlists.length === 1 ? '' : 's'} ·{' '}
            {history.length} {history.length === 1 ? 'play' : 'plays'} recorded
          </p>
        </div>
      </div>

      <div className={styles.tabsRow}>
        <Tabs label="Library sections" value={tab} onChange={(value) => setTab(value as Tab)} tabs={TABS} />
      </div>

      {tab === 'songs' ? (
        likedTracks ? (
          <SongTable
            tracks={likedTracks}
            label="Liked Songs"
            showIndex
            showAlbum
            onRemove={(index) => {
              const track = likedTracks[index]
              if (track) useLibraryStore.getState().toggleLike(track.id)
            }}
            removeLabel="Remove from Liked Songs"
            emptyTitle="No liked songs yet"
            emptyMessage="Tap the heart on any track and it will show up here."
          />
        ) : (
          <SkeletonSongList rows={8} />
        )
      ) : null}

      {tab === 'albums' ? (
        albums.length > 0 ? (
          <div className={styles.grid}>
            {albums.map((album) => (
              <CollectionCard
                key={album.id}
                kind="album"
                album={album}
                onPlay={() => {
                  void getProvider()
                    .getAlbum(album.id)
                    .then(async (full) => {
                      if (!full) return openAlbum(album)
                      const tracks = await getProvider().getTracks(full.trackIds)
                      playTracks(tracks, 0, full.title)
                    })
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No albums yet" message="Albums appear here as you like songs from them." />
        )
      ) : null}

      {tab === 'artists' ? (
        artists.length > 0 ? (
          <div className={styles.grid}>
            {artists.map((artist) => (
              <CollectionCard key={artist.id} kind="artist" artist={artist} />
            ))}
          </div>
        ) : (
          <EmptyState icon="user" title="No artists yet" message="Artists you listen to will be collected here." />
        )
      ) : null}

      {tab === 'playlists' ? (
        playlists.length > 0 ? (
          <div className={styles.grid}>
            {playlists.map((playlist) => (
              <CollectionCard
                key={playlist.id}
                kind="playlist"
                playlist={playlist}
                onPlay={() => navigate({ name: 'playlist', id: playlist.id })}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No playlists yet" message="Create your first playlist from the sidebar." />
        )
      ) : null}

      {tab === 'offline' ? (
        <EmptyState
          icon="download"
          title="Offline downloads are not available yet"
          message="Crest has no cached audio to show: the demo catalogue ships metadata only. Local caching and pinned downloads arrive with the storage layer in Phase 9 — the switches in Settings are marked accordingly rather than pretending to work."
        />
      ) : null}

      {tab === 'recent' ? (
        recentTracks ? (
          <SongTable tracks={recentTracks} label="Recently Played" showAlbum emptyTitle="No plays recorded yet" />
        ) : (
          <SkeletonSongList rows={6} />
        )
      ) : null}
    </div>
  )
}
