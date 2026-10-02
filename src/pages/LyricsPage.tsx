import { useEffect, useRef } from 'react'
import { useRouter } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { LyricsPreview } from '@/lyrics/LyricsPreview'
import { useActiveLyricLine } from '@/lyrics/useActiveLyricLine'
import { useLyrics } from '@/lyrics/useLyrics'
import { useCurrentTrack, usePlayerStore } from '@/player/playerStore'
import { cn } from '@/utils/cn'
import styles from '@/lyrics/Lyrics.module.css'

/**
 * Lyrics view.
 *
 * Large centred typography, the active line highlighted, neighbours faded, and
 * smooth scroll that follows playback. Synced lyrics also drive the queue panel
 * preview — one implementation, two sizes.
 */
export function LyricsPage() {
  const track = useCurrentTrack()
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const { lyrics, loading, error, reload } = useLyrics(track?.id)
  const activeIndex = useActiveLyricLine(lyrics)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    const list = listRef.current
    if (!stage || !list || !lyrics?.synced) return
    const line = list.children[activeIndex] as HTMLElement | undefined
    if (!line) return
    const target = line.offsetTop - stage.clientHeight / 2 + line.clientHeight / 2
    stage.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeIndex, lyrics])

  if (!track) {
    return (
      <EmptyState
        icon="mic"
        title="Nothing playing"
        message="Start a track and its lyrics will appear here."
      />
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Artwork source={track.artwork} seed={track.albumId} alt={`${track.albumName} cover`} size={72} radius="md" priority />
        <div className={styles.headerMeta}>
          <span className={styles.eyebrow}>Lyrics</span>
          <h1 className={styles.headerTitle}>{track.title}</h1>
          <p className={styles.headerArtist}>
            {track.artistName} · {track.albumName}
          </p>
          <div className={styles.badgeRow}>
            {lyrics ? (
              <span className={cn(styles.badge, lyrics.synced && styles.badgeSynced)}>
                {lyrics.synced ? 'Synced' : 'Plain text'}
              </span>
            ) : null}
            {lyrics?.source === 'placeholder' ? <span className={styles.badge}>Demo text</span> : null}
            <span className={styles.badge}>{isPlaying ? 'Playing' : 'Paused'}</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className={styles.headerMeta}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="44%" />
          <Skeleton height={14} width="52%" />
        </div>
      ) : null}

      {error ? <ErrorState message={error} onRetry={reload} /> : null}

      {!loading && !error && !lyrics ? (
        <EmptyState
          icon="mic"
          title="No lyrics for this track"
          message="Crest shows lyrics when the provider supplies them, as plain text or timestamped."
          action={{ label: 'Go back', onClick: () => useRouter.getState().back() }}
        />
      ) : null}

      {lyrics && lyrics.synced ? (
        <div ref={stageRef} className={cn(styles.stage, 'scroll-y')}>
          <ol ref={listRef} className={styles.lines}>
            {lyrics.lines.map((line, index) => (
              <li
                key={`${index}-${line.text}`}
                className={cn(
                  styles.line,
                  line.text === '' && styles.lineEmpty,
                  Math.abs(index - activeIndex) === 1 && styles.lineNear,
                  index === activeIndex && styles.lineActive,
                )}
              >
                {line.text || '\u00a0'}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {lyrics && !lyrics.synced ? (
        <div className={styles.previewCard}>
          <LyricsPreview lyrics={lyrics} />
        </div>
      ) : null}

      {lyrics?.source === 'placeholder' ? (
        <p className={styles.eyebrow}>
          <Icon name="info" size={13} /> Demo lyrics are original placeholder text shipped with the mock catalogue — no
          licensed lyrics are bundled.
        </p>
      ) : null}

      <div>
        <Button variant="outline" icon="chevronLeft" onClick={() => useRouter.getState().back()}>
          Back
        </Button>
      </div>
    </div>
  )
}
