import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/utils/cn'
import { useUiStore } from '@/store/uiStore'
import { PlayerProgress } from './PlayerProgress'
import { useCurrentTrack, usePlayerStore } from './playerStore'
import styles from './MiniPlayer.module.css'

/**
 * Compact player.
 *
 * Artwork, title, transport and a hairline progress bar — nothing else. Phase 8
 * reuses this same component inside the optional always-on-top mini window.
 */
export function MiniPlayer() {
  const track = useCurrentTrack()
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const togglePlay = usePlayerStore((state) => state.togglePlay)
  const next = usePlayerStore((state) => state.next)
  const previous = usePlayerStore((state) => state.previous)
  const setMiniPlayer = useUiStore((state) => state.setMiniPlayer)

  return (
    <footer className={cn('panel', styles.mini)} aria-label="Player (compact)">
      <Artwork
        source={track?.artwork ?? { kind: 'none' }}
        seed={track?.albumId ?? 'crest-idle'}
        alt={track ? `${track.albumName} cover` : 'No artwork'}
        size={38}
        radius="sm"
      />
      <div className={styles.meta}>
        <span className={styles.title}>{track?.title ?? 'Nothing playing'}</span>
        <span className={styles.artist}>{track?.artistName ?? '—'}</span>
      </div>
      <div className={styles.controls}>
        <IconButton icon="skipBack" label="Previous track" size="sm" variant="bare" iconSize={17} onClick={previous} />
        <button
          type="button"
          className={styles.play}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlay}
          disabled={!track}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={15} />
        </button>
        <IconButton icon="skipForward" label="Next track" size="sm" variant="bare" iconSize={17} onClick={() => next()} />
      </div>
      <PlayerProgress className={styles.progress} withTimes={false} compact />
      <IconButton
        icon="expand"
        label="Expand player"
        size="sm"
        variant="bare"
        iconSize={16}
        onClick={() => setMiniPlayer(false)}
      />
    </footer>
  )
}
