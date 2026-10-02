import { useTracks } from '@/library/useTracks'
import type { Mix } from '@/services/providers/types'
import { playTracks } from '@/player/songActions'
import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import styles from './music.module.css'

/**
 * Mix card.
 *
 * Artwork fills the card with the title and subtitle laid over a soft gradient —
 * exactly the treatment the reference gives the "Made for You" row. The track
 * count lives in the play button's label rather than as a third line of text, so
 * the copy stays on two lines at every card width.
 */
export function MixCard({ mix }: { mix: Mix }) {
  const tracks = useTracks(mix.trackIds)
  const count = tracks ? tracks.length : mix.trackIds.length

  const play = () => {
    if (!tracks || tracks.length === 0) return
    playTracks(tracks, 0, mix.title)
  }

  return (
    <article className={styles.mixCard}>
      <Artwork
        source={mix.artwork}
        seed={mix.id}
        alt={`${mix.title} artwork`}
        radius="md"
        tall
        className={styles.mixArt}
      />
      <div className={styles.mixScrim} aria-hidden />
      <div className={styles.mixContent}>
        <h3 className={styles.mixTitle}>{mix.title}</h3>
        <p className={styles.mixSubtitle}>{mix.subtitle}</p>
      </div>
      <button
        type="button"
        className={styles.mixPlay}
        aria-label={`Play ${mix.title} (${count} tracks)`}
        onClick={play}
      >
        <Icon name="play" size={14} />
      </button>
    </article>
  )
}
