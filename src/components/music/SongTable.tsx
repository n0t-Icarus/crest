import { useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useScrollElement } from '@/app/ScrollContext'
import { navigate } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/States'
import { handleTrackContextMenu, openTrackMenuFromButton, playTracks } from '@/player/songActions'
import { useCurrentTrack } from '@/player/playerStore'
import type { Track } from '@/services/providers/types'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/format'
import styles from './music.module.css'

type Props = {
  tracks: Track[]
  /** Queue label shown in the player when playback starts from this list. */
  label?: string
  showIndex?: boolean
  showAlbum?: boolean
  startIndex?: number
  reorderable?: boolean
  onReorder?: (from: number, to: number) => void
  onRemove?: (index: number) => void
  removeLabel?: string
  emptyTitle?: string
  emptyMessage?: string
  /** Row height override; must match the CSS when windowing is active. */
  rowHeight?: number
}

const VIRTUAL_THRESHOLD = 30

/**
 * Song list.
 *
 * One component renders every track list in the app (search results, playlists,
 * albums, liked songs, history). Lists longer than 30 rows are windowed against
 * the page scroller, so a 5,000-track playlist mounts the same ~20 rows a short
 * one does.
 */
export function SongTable({
  tracks,
  label,
  showIndex = false,
  showAlbum = false,
  startIndex = 0,
  reorderable = false,
  onReorder,
  onRemove,
  removeLabel = 'Remove',
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  rowHeight = 52,
}: Props) {
  const scrollElement = useScrollElement()
  const currentTrack = useCurrentTrack()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const virtualize = tracks.length > VIRTUAL_THRESHOLD && Boolean(scrollElement)

  // Offset of the list inside the scroller, required for correct positioning.
  useLayoutEffect(() => {
    if (!virtualize || !scrollElement || !wrapRef.current) return
    const wrapper = wrapRef.current.getBoundingClientRect()
    const scroller = scrollElement.getBoundingClientRect()
    setScrollMargin(wrapper.top - scroller.top + scrollElement.scrollTop)
  }, [virtualize, scrollElement, tracks.length])

  const virtualizer = useVirtualizer({
    count: virtualize ? tracks.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: 10,
    scrollMargin: scrollMargin ?? 0,
  })

  const playFrom = (index: number) => {
    playTracks(tracks, index, label)
  }

  const rows = useMemo(() => {
    if (!virtualize) return null
    return virtualizer.getVirtualItems()
  }, [virtualize, virtualizer])

  const handleDrop = (event: DragEvent<HTMLLIElement>, index: number) => {
    event.preventDefault()
    if (dragIndex !== null && dragIndex !== index) onReorder?.(dragIndex, index)
    setDragIndex(null)
    setDropIndex(null)
  }

  if (tracks.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  const renderRow = (track: Track, index: number, style?: React.CSSProperties) => {
    const isCurrent = currentTrack?.id === track.id
    return (
      <li
        key={track.id}
        style={style}
        className={cn(styles.songRow, isCurrent && styles.songRowActive)}
        data-dragging={dragIndex === index || undefined}
        data-drop={dropIndex === index && dragIndex !== index ? 'above' : undefined}
        draggable={reorderable}
        onDragStart={(event) => {
          if (!reorderable) return
          setDragIndex(index)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', track.id)
        }}
        onDragOver={(event) => {
          if (!reorderable || dragIndex === null) return
          event.preventDefault()
          setDropIndex(index)
        }}
        onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
        onDrop={(event) => handleDrop(event, index)}
        onDragEnd={() => {
          setDragIndex(null)
          setDropIndex(null)
        }}
        onDoubleClick={() => playFrom(index)}
        onContextMenu={(event) =>
          handleTrackContextMenu(event, track, {
            contextQueue: tracks,
            removeAction: onRemove ? { label: removeLabel, run: () => onRemove(index) } : undefined,
          })
        }
      >
        {showIndex ? (
          <span className={styles.songIndex}>
            {isCurrent ? (
              <span className={styles.nowBars} aria-label="Now playing">
                <i />
                <i />
                <i />
              </span>
            ) : (
              index + 1 + startIndex
            )}
          </span>
        ) : null}

        {reorderable ? (
          <span className={styles.songGrip} aria-hidden>
            <Icon name="grip" size={14} />
          </span>
        ) : null}

        <div className={styles.songPlayArea}>
          <button
            type="button"
            className={styles.songArtBtn}
            onClick={() => playFrom(index)}
            aria-label={`Play ${track.title}`}
          >
            <Artwork source={track.artwork} seed={track.albumId} alt={`${track.albumName} cover`} size={38} radius="sm" />
          </button>
          <span className={styles.songText}>
            <button
              type="button"
              className={styles.songTitleBtn}
              onClick={() => playFrom(index)}
              title={track.title}
            >
              {track.title}
            </button>
            <button
              type="button"
              className={styles.songArtistBtn}
              onClick={(e) => {
                e.stopPropagation()
                navigate({ name: 'artist', id: track.artistId })
              }}
              title={`Go to ${track.artistName}`}
            >
              {track.artistName}
            </button>
          </span>
        </div>

        {showAlbum ? (
          <button
            type="button"
            className={styles.songAlbumBtn}
            onClick={(e) => {
              e.stopPropagation()
              if (track.albumId) navigate({ name: 'album', id: track.albumId })
            }}
            title={track.albumName ? `Go to ${track.albumName}` : undefined}
          >
            {track.albumName}
          </button>
        ) : null}
        <span className={styles.songDuration}>{formatTime(track.durationMs)}</span>

        <div className={cn(styles.songActions, styles.hoverReveal)}>
          {onRemove ? (
            <IconButton
              icon="minus"
              label={removeLabel}
              size="sm"
              variant="bare"
              iconSize={15}
              onClick={() => onRemove(index)}
            />
          ) : null}
          <IconButton
            icon="more"
            label={`More options for ${track.title}`}
            size="sm"
            variant="bare"
            iconSize={16}
            onClick={(event) =>
              openTrackMenuFromButton(event.currentTarget, track, {
                contextQueue: tracks,
                removeAction: onRemove ? { label: removeLabel, run: () => onRemove(index) } : undefined,
              })
            }
          />
        </div>
      </li>
    )
  }

  if (virtualize && rows) {
    return (
      <div ref={wrapRef} className={styles.virtualWrap} style={{ height: virtualizer.getTotalSize() }}>
        <ul className={styles.songList}>
          {rows.map((row) => {
            const track = tracks[row.index]
            if (!track) return null
            return renderRow(track, row.index, {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: row.size,
              transform: `translateY(${row.start - (scrollMargin ?? 0)}px)`,
            })
          })}
        </ul>
      </div>
    )
  }

  return (
    <div ref={wrapRef}>
      <ul className={styles.songList}>{tracks.map((track, index) => renderRow(track, index))}</ul>
    </div>
  )
}
