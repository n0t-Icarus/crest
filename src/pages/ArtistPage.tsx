import { useState } from 'react'
import { getProvider } from '@/services/providers'
import { CollectionCard } from '@/components/music/CollectionCard'
import { CollectionHeader } from '@/components/music/CollectionHeader'
import { SongTable } from '@/components/music/SongTable'
import { Button } from '@/components/ui/Button'
import { SkeletonSongList } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useAsync } from '@/hooks/useAsync'
import { cacheTracks } from '@/library/useTracks'
import { playTracks } from '@/player/songActions'
import { useLibraryStore } from '@/store/libraryStore'
import { useSettingsStore } from '@/store/settingsStore'
import { formatNumber } from '@/utils/format'
import type { Album } from '@/services/providers/types'
import styles from './pages.module.css'
import headerStyles from '@/components/music/CollectionHeader.module.css'

const TOP_TRACK_COUNT = 5

/** Artist view: header, top tracks, all songs toggle, albums, follow toggle. */
export function ArtistPage({ id }: { id: string }) {
  const [showAllSongs, setShowAllSongs] = useState(false)
  const following = useLibraryStore((state) => state.followedArtistIds.includes(id))
  const toggleFollow = useLibraryStore((state) => state.toggleFollowArtist)

  const { data, loading, error, reload } = useAsync(
    async () => {
      const provider = getProvider()
      const artist = await provider.getArtist(id)
      if (!artist) return null
      const tracks = await provider.getArtistTracks(id)
      cacheTracks(tracks)
      let albums: Album[] = []
      if (provider.getArtistAlbums) {
        albums = await provider.getArtistAlbums(id)
      } else {
        const albumResults = await Promise.all(
          [...new Set(tracks.map((track) => track.albumId).filter(Boolean))].map((albumId) => provider.getAlbum(albumId)),
        )
        albums = albumResults.filter((album): album is NonNullable<typeof album> => Boolean(album))
      }
      return { artist, tracks, albums }
    },
    [id],
  )

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <SkeletonSongList rows={8} />
      </div>
    )
  }

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <EmptyState icon="user" title="Artist not found" />

  const { artist, tracks, albums } = data
  const displayedTracks = showAllSongs ? tracks : tracks.slice(0, TOP_TRACK_COUNT)

  return (
    <div className={styles.page}>
      <CollectionHeader
        eyebrow="Artist"
        title={artist.name}
        description={
          artist.monthlyListeners ? `${formatNumber(artist.monthlyListeners)} monthly listeners` : undefined
        }
        meta={`${tracks.length} songs available`}
        artwork={artist.artwork}
        seed={artist.id}
        round
        disabled={tracks.length === 0}
        onPlay={() => playTracks(tracks, 0, artist.name)}
        onShuffle={() => {
          useSettingsStore.getState().set('shuffle', true)
          playTracks(tracks, 0, artist.name)
        }}
        actions={
          <Button variant="outline" icon={following ? 'check' : 'plus'} onClick={() => toggleFollow(id)}>
            {following ? 'Following' : 'Follow'}
          </Button>
        }
      />

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{showAllSongs ? 'All Songs' : 'Popular'}</h2>
          {tracks.length > TOP_TRACK_COUNT ? (
            <button
              type="button"
              className={styles.textButton}
              onClick={() => setShowAllSongs(!showAllSongs)}
            >
              {showAllSongs ? 'Show top 5' : `See all (${tracks.length})`}
            </button>
          ) : null}
        </div>
        <SongTable tracks={displayedTracks} label={artist.name} showIndex showAlbum />
      </section>

      {albums.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Discography</h2>
          <div className={styles.grid}>
            {albums.map((album) => (
              <CollectionCard key={album.id} kind="album" album={album} />
            ))}
          </div>
        </section>
      ) : null}

      <p className={headerStyles.meta}>
        Tip: use the ··· menu on any song to jump between its album and artist.
      </p>
    </div>
  )
}
