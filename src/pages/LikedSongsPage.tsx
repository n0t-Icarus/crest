import { CollectionHeader } from '@/components/music/CollectionHeader'
import { SongTable } from '@/components/music/SongTable'
import { SkeletonSongList } from '@/components/ui/Skeleton'
import { useTracks } from '@/library/useTracks'
import { playTracks } from '@/player/songActions'
import { useLibraryStore } from '@/store/libraryStore'
import { useSettingsStore } from '@/store/settingsStore'
import { formatDurationLong, songCountLabel } from '@/utils/format'
import styles from './pages.module.css'

/** Liked Songs: the user's hearted tracks, with unlike-from-row. */
export function LikedSongsPage() {
  const likedIds = useLibraryStore((state) => state.likedTrackIds)
  const toggleLike = useLibraryStore((state) => state.toggleLike)
  const tracks = useTracks(likedIds)

  const totalMs = (tracks ?? []).reduce((sum, track) => sum + track.durationMs, 0)

  return (
    <div className={styles.page}>
      <CollectionHeader
        eyebrow="Collection"
        title="Liked Songs"
        description="Everything you have hearted, newest first."
        meta={`${songCountLabel(likedIds.length)} · ${formatDurationLong(totalMs)}`}
        artwork={{ kind: 'generated', seed: 'liked-songs-art' }}
        seed="liked-songs-art"
        disabled={likedIds.length === 0}
        onPlay={() => tracks && playTracks(tracks, 0, 'Liked Songs')}
        onShuffle={() => {
          useSettingsStore.getState().set('shuffle', true)
          if (tracks) playTracks(tracks, 0, 'Liked Songs')
        }}
      />

      {tracks ? (
        <SongTable
          tracks={tracks}
          label="Liked Songs"
          showIndex
          showAlbum
          onRemove={(index) => {
            const track = tracks[index]
            if (track) toggleLike(track.id)
          }}
          removeLabel="Remove from Liked Songs"
          emptyTitle="No liked songs yet"
          emptyMessage="Tap the heart on any track and it will appear here."
        />
      ) : (
        <SkeletonSongList rows={8} />
      )}
    </div>
  )
}
