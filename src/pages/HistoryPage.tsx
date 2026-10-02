import { useMemo } from 'react'
import { navigate } from '@/app/router'
import { SectionHeader } from '@/components/music/SectionHeader'
import { SongTable } from '@/components/music/SongTable'
import { Button } from '@/components/ui/Button'
import { SkeletonSongList } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { useTracks } from '@/library/useTracks'
import { playTracks } from '@/player/songActions'
import { useLibraryStore } from '@/store/libraryStore'
import styles from './pages.module.css'

/**
 * History.
 *
 * Grouped by day so long histories stay scannable, and each group is playable on
 * its own — "what did I listen to yesterday" is a normal thing to want.
 */
export function HistoryPage() {
  const history = useLibraryStore((state) => state.history)
  const clearHistory = useLibraryStore((state) => state.clearHistory)

  const groups = useMemo(() => {
    const buckets = new Map<string, { label: string; trackIds: string[] }>()
    for (const entry of history) {
      const date = new Date(entry.playedAt)
      const key = date.toDateString()
      const label = dayLabel(date)
      const bucket = buckets.get(key) ?? { label, trackIds: [] }
      if (!bucket.trackIds.includes(entry.trackId)) bucket.trackIds.push(entry.trackId)
      buckets.set(key, bucket)
    }
    return [...buckets.entries()].map(([key, value]) => ({ key, ...value })).slice(0, 6)
  }, [history])

  const allIds = useMemo(() => groups.flatMap((group) => group.trackIds), [groups])
  const allTracks = useTracks(allIds)

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>History</h1>
          <p className={styles.pageSubtitle}>{history.length} plays recorded on this machine</p>
        </div>
        {history.length > 0 ? (
          <Button variant="outline" icon="trash" onClick={clearHistory}>
            Clear history
          </Button>
        ) : null}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Nothing played yet"
          message="Tracks you play show up here. History stays local — it is never uploaded."
          action={{ label: 'Play something', onClick: () => navigate({ name: 'home' }) }}
        />
      ) : !allTracks ? (
        <SkeletonSongList rows={8} />
      ) : (
        groups.map((group) => {
          const tracks = group.trackIds
            .map((id) => allTracks.find((track) => track.id === id))
            .filter((track): track is NonNullable<typeof track> => Boolean(track))
          if (tracks.length === 0) return null
          return (
            <section key={group.key} className={styles.section}>
              <SectionHeader title={group.label} onSeeAll={() => playTracks(tracks, 0, group.label)} seeAllLabel="Play all" />
              <SongTable tracks={tracks} label={group.label} showAlbum />
            </section>
          )
        })
      )}
    </div>
  )
}

function dayLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
