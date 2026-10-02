import { useState, type DragEvent } from 'react'
import { navigate } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import type { Track } from '@/services/providers/types'
import { openTrackMenuFromButton, playTracks } from '@/player/songActions'
import { usePlayerStore } from '@/player/playerStore'
import { formatTime } from '@/utils/format'
import styles from './QueueList.module.css'

type Props = {
  tracks: Track[]
  /** Absolute queue index of the first track in `tracks`. */
  offset: number
  compact?: boolean
  /** Enables drag-and-drop + keyboard reordering. */
  reorderable?: boolean
}

/**
 * Queue rows.
 *
 * Drag-and-drop reordering uses the native HTML5 drag events (no dependency),
 * and the same reorder is reachable from the keyboard with Alt + ↑/↓ so the
 * queue is usable without a mouse.
 */
export function QueueList({ tracks, offset, compact = false, reorderable = false }: Props) {
  const removeQueueItem = usePlayerStore((state) => state.removeQueueItem)
  const moveQueueItem = usePlayerStore((state) => state.moveQueueItem)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const finishDrag = () => {
    setDragIndex(null)
    setDropIndex(null)
  }

  const handleDrop = (event: DragEvent<HTMLLIElement>, position: number) => {
    event.preventDefault()
    if (dragIndex !== null && dragIndex !== position) {
      moveQueueItem(offset + dragIndex, offset + position)
    }
    finishDrag()
  }

  return (
    <ul className={styles.list} data-compact={compact || undefined}>
      {tracks.map((track, position) => (
        <li
          key={`${track.id}-${offset + position}`}
          className={styles.row}
          draggable={reorderable}
          data-dragging={dragIndex === position || undefined}
          data-drop={dropIndex === position && dragIndex !== position ? 'above' : undefined}
          onDragStart={(event) => {
            if (!reorderable) return
            setDragIndex(position)
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', track.id)
          }}
          onDragOver={(event) => {
            if (!reorderable || dragIndex === null) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropIndex(position)
          }}
          onDragLeave={() => setDropIndex((current) => (current === position ? null : current))}
          onDrop={(event) => handleDrop(event, position)}
          onDragEnd={finishDrag}
          onKeyDown={(event) => {
            if (!reorderable || !event.altKey) return
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
            event.preventDefault()
            const target = event.key === 'ArrowUp' ? position - 1 : position + 1
            if (target < 0 || target >= tracks.length) return
            moveQueueItem(offset + position, offset + target)
          }}
          tabIndex={0}
          aria-label={`${track.title} by ${track.artistName}. Alt plus arrow keys reorder.`}
        >
          <button
            type="button"
            className={styles.playArea}
            onClick={() => playTracks(tracks, position, 'Queue')}
            onDoubleClick={() => playTracks(tracks, position, 'Queue')}
          >
            <Artwork source={track.artwork} seed={track.albumId} alt={`${track.albumName} cover`} size={40} radius="sm" />
            <span className={styles.text}>
              <span className={styles.title}>{track.title}</span>
              <span
                className={styles.artist}
                onClick={(event) => {
                  event.stopPropagation()
                  navigate({ name: 'artist', id: track.artistId })
                }}
                role="link"
                tabIndex={-1}
              >
                {track.artistName}
              </span>
            </span>
          </button>

          <span className={styles.duration}>{formatTime(track.durationMs)}</span>
          <div className={styles.rowActions}>
            <IconButton
              icon="minus"
              label="Remove from queue"
              size="sm"
              variant="bare"
              iconSize={15}
              onClick={() => removeQueueItem(offset + position)}
            />
            <IconButton
              icon="more"
              label="More options"
              size="sm"
              variant="bare"
              iconSize={16}
              onClick={(event) =>
                openTrackMenuFromButton(event.currentTarget, track, {
                  contextQueue: tracks,
                  removeAction: { label: 'Remove from queue', run: () => removeQueueItem(offset + position) },
                })
              }
            />
          </div>
          {reorderable ? (
            <span className={styles.grip} aria-hidden>
              <Icon name="grip" size={14} />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
