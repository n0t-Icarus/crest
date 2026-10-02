import { navigate } from '@/app/router'
import { CollectionCard } from '@/components/music/CollectionCard'
import { MediaCard } from '@/components/music/MediaCard'
import { MixCard } from '@/components/music/MixCard'
import { SectionHeader } from '@/components/music/SectionHeader'
import { SongTable } from '@/components/music/SongTable'
import { SkeletonCardRow, SkeletonMixRow } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useHomeFeed } from './useHomeFeed'
import { HeroBanner } from './HeroBanner'
import { MoodRail } from './MoodRail'
import styles from './home.module.css'

/**
 * Home.
 *
 * Mood rail first (it is the control that decides everything below it), then a
 * hero carousel built from real editorial playlists, then Quick picks, then
 * YouTube Music's own shelves.
 *
 * There is no generic "Popular on YouTube Music" row any more. It used to be a
 * global text search for "top songs this week", which is why it filled up with
 * uploads nobody asked for.
 */
export function HomePage() {
  const { feed, loading, pending, error, activeMood, selectMood, reload } = useHomeFeed()

  if (error && !feed) {
    return <ErrorState message={error} onRetry={reload} />
  }

  if (!feed) {
    return (
      <div className={styles.home}>
        <div className={styles.heroSkeleton} />
        <section className={styles.section}>
          <SectionHeader title="Quick picks" />
          <SkeletonCardRow count={6} />
        </section>
        <section className={styles.section}>
          <SectionHeader title="Featured playlists" />
          <SkeletonMixRow count={5} />
        </section>
      </div>
    )
  }

  const slides = feed.heroSlides && feed.heroSlides.length > 0 ? feed.heroSlides : [feed.hero]
  const moods = feed.moods ?? []

  return (
    <div className={styles.home}>
      {moods.length > 0 ? (
        <MoodRail moods={moods} active={activeMood} onSelect={selectMood} pending={pending} />
      ) : null}

      <HeroBanner slides={slides} />

      {feed.sections.map((section) => {
        const strapline = 'strapline' in section ? section.strapline : null

        if (section.kind === 'tracks') {
          // Quick picks reads best as a list you can hit play on; the long
          // editorial shelves read better as cards.
          if (section.id === 'quick-picks') {
            return (
              <section key={section.id} className={styles.section} aria-label={section.title}>
                <SectionHeader
                  title={section.title}
                  seeAllTo={{ name: 'search' }}
                  seeAllLabel={activeMood ? `More ${activeMood}` : 'Explore'}
                />
                <div className={styles.trackList}>
                  <SongTable tracks={section.items} label={section.title} showIndex={false} />
                </div>
              </section>
            )
          }
          return (
            <section key={section.id} className={styles.section} aria-label={section.title}>
              <SectionHeader title={section.title} />
              {strapline ? <p className={styles.strapline}>{strapline}</p> : null}
              <div className={`${styles.cardRow} scroll-x`}>
                {section.items.map((track, index) => (
                  <MediaCard
                    key={track.id}
                    track={track}
                    queue={section.items}
                    index={index}
                    queueLabel={section.title}
                  />
                ))}
              </div>
            </section>
          )
        }

        if (section.kind === 'mixes') {
          return (
            <section key={section.id} className={styles.section} aria-label={section.title}>
              <SectionHeader title={section.title} seeAllTo={{ name: 'library' }} />
              <div className={styles.mixRow}>
                {section.items.map((mix) => (
                  <MixCard key={mix.id} mix={mix} />
                ))}
              </div>
            </section>
          )
        }

        return (
          <section key={section.id} className={styles.section} aria-label={section.title}>
            <SectionHeader
              title={section.title}
              seeAllTo={
                section.kind === 'shelf' && section.items[0]
                  ? { name: 'playlist', id: section.items[0].id }
                  : { name: 'playlists' }
              }
              seeAllLabel={section.kind === 'shelf' ? 'Open' : 'See all'}
            />
            {strapline ? <p className={styles.strapline}>{strapline}</p> : null}
            <div className={`${styles.cardRow} scroll-x`}>
              {section.items.map((playlist) => (
                <CollectionCard
                  key={playlist.id}
                  kind="playlist"
                  playlist={playlist}
                  onPlay={() => navigate({ name: 'playlist', id: playlist.id })}
                />
              ))}
            </div>
          </section>
        )
      })}

      {pending || loading ? <div className={styles.loadingHint}>Loading…</div> : null}
    </div>
  )
}
