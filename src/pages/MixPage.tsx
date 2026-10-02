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

/** Detail view for a generated mix from "Made for You". */
export function MixPage({ id }: { id: string }) {
  const { data, loading, error, reload } = useAsync(
    async () => {
      const mix = await getProvider().getMix(id)
      if (!mix) return null
      const tracks = await getProvider().getTracks(mix.trackIds)
      cacheTracks(tracks)
      return { mix, tracks }
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
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <EmptyState icon="sparkle" title="Mix not found" />

  const { mix, tracks } = data
  const totalMs = tracks.reduce((sum, track) => sum + track.durationMs, 0)

  return (
    <div className={styles.page}>
      <CollectionHeader
        eyebrow="Made for you"
        title={mix.title}
        description={mix.subtitle}
        meta={`${songCountLabel(tracks.length)} · ${formatDurationLong(totalMs)}`}
        artwork={mix.artwork}
        seed={mix.id}
        disabled={tracks.length === 0}
        onPlay={() => playTracks(tracks, 0, mix.title)}
        onShuffle={() => {
          useSettingsStore.getState().set('shuffle', true)
          playTracks(tracks, 0, mix.title)
        }}
      />
      <SongTable tracks={tracks} label={mix.title} showIndex emptyTitle="This mix is empty" />
    </div>
  )
}
