import { getProvider } from '@/services/providers'
import { CollectionHeader } from '@/components/music/CollectionHeader'
import { SongTable } from '@/components/music/SongTable'
import { SkeletonSongList } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useAsync } from '@/hooks/useAsync'
import { cacheTracks } from '@/library/useTracks'
import { playTracks } from '@/player/songActions'
import { useSettingsStore } from '@/store/settingsStore'
import { formatDurationLong, songCountLabel } from '@/utils/format'
import styles from './pages.module.css'

/** Album view: header, track list, artist link. */
export function AlbumPage({ id }: { id: string }) {
  const { data, loading, error, reload } = useAsync(
    async () => {
      const album = await getProvider().getAlbum(id)
      if (!album) return null
      const tracks = await getProvider().getTracks(album.trackIds)
      cacheTracks(tracks)
      const artist = await getProvider().getArtist(album.artistId)
      return { album, tracks, artist }
    },
    [id],
  )

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <SkeletonSongList rows={6} />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />
  }

  if (!data) {
    return <EmptyState icon="album" title="Album not found" message="It may not exist in this provider." />
  }

  const { album, tracks, artist } = data
  const totalMs = tracks.reduce((sum, track) => sum + track.durationMs, 0)

  return (
    <div className={styles.page}>
      <CollectionHeader
        eyebrow={album.kind === 'single' ? 'Single' : album.year ? `Album · ${album.year}` : 'Album'}
        title={album.title}
        description={artist ? artist.name : album.artistName}
        meta={`${songCountLabel(tracks.length)} · ${formatDurationLong(totalMs)}`}
        artwork={album.artwork}
        seed={album.id}
        disabled={tracks.length === 0}
        onPlay={() => playTracks(tracks, 0, album.title)}
        onShuffle={() => {
          useSettingsStore.getState().set('shuffle', true)
          playTracks(tracks, 0, album.title)
        }}
      />
      <SongTable tracks={tracks} label={album.title} showIndex emptyTitle="This album has no tracks" />
    </div>
  )
}
