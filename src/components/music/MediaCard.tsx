import { navigate } from '@/app/router'
import type { Track } from '@/services/providers/types'
import { handleTrackContextMenu, openTrackMenuFromButton, playTracks } from '@/player/songActions'
import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/utils/cn'
import styles from './music.module.css'

type Props = {
  track: Track
  queue: Track[]
  index: number
  /** Optional contextual label, e.g. the playlist the queue came from. */
  queueLabel?: string
  /** Cards are keyboard-navigable and have a context menu. */
  showMenu?: boolean
}

/**
 * Track card.
 *
 * The reference reveals a play button on hover and keeps a three-dot menu in the
 * title row. The menu is always rendered for keyboard users and only revealed
 * visually on hover, so nothing is mouse-only.
 */
export function MediaCard({ track, queue, index, queueLabel, showMenu = true }: Props) {
  return (
    <article
      className={styles.mediaCard}
      onContextMenu={(event) => handleTrackContextMenu(event, track, { contextQueue: queue })}
    >
      <div className={styles.mediaArtWrap}>
        <Artwork
          source={track.artwork}
          seed={track.albumId || track.id}
          alt={`${track.albumName} cover`}
          radius="md"
          className={styles.mediaArt}
        />
        <button
          type="button"
          className={styles.mediaPlay}
          aria-label={`Play ${track.title}`}
          onClick={() => playTracks(queue, index, queueLabel)}
        >
          <Icon name="play" size={16} />
        </button>
      </div>

      <div className={styles.mediaMeta}>
        <button
          type="button"
          className={styles.mediaTitle}
          title={track.title}
          onClick={() => playTracks(queue, index, queueLabel)}
        >
          {track.title}
        </button>
        {showMenu ? (
          <IconButton
            icon="more"
            label={`More options for ${track.title}`}
            size="sm"
            variant="bare"
            iconSize={16}
            className={cn(styles.mediaMenu, styles.hoverReveal)}
            onClick={(event) => openTrackMenuFromButton(event.currentTarget, track, { contextQueue: queue })}
          />
        ) : null}
      </div>
      <button
        type="button"
        className={styles.mediaArtist}
        title={`Go to ${track.artistName}`}
        onClick={() => navigate({ name: 'artist', id: track.artistId })}
      >
        {track.artistName}
      </button>
    </article>
  )
}
