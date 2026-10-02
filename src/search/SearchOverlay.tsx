import { useEffect, useMemo, useState } from 'react'
import { navigate, useRoute } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { playTracks } from '@/player/songActions'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import type { Track } from '@/services/providers/types'
import { useSearch } from './useSearch'
import styles from './search.module.css'

const MAX_TRACKS = 6

/**
 * Search overlay.
 *
 * Opens under the field while typing and answers the "instant" requirement:
 * results appear as you type, ↑/↓ moves through them, Enter plays, Escape
 * dismisses. It is a preview — the search page holds the full result set.
 */
export function SearchOverlay() {
  const route = useRoute()
  const query = useUiStore((state) => state.searchQuery)
  const open = useUiStore((state) => state.searchOpen)
  const close = useUiStore((state) => state.closeSearch)

  const shouldRender = open && route.name === 'search' && query.trim().length > 0
  const { results, loading } = useSearch(shouldRender ? query : '')
  const [activeIndex, setActiveIndex] = useState(0)

  const items = useMemo(() => {
    if (!results) return [] as Array<{ type: 'track'; track: Track } | { type: 'entity'; label: string; sub: string; to: () => void }>
    const list: Array<{ type: 'track'; track: Track } | { type: 'entity'; label: string; sub: string; to: () => void }> = []

    for (const track of results.tracks.slice(0, MAX_TRACKS)) list.push({ type: 'track', track })
    for (const artist of results.artists.slice(0, 2)) {
      list.push({
        type: 'entity',
        label: artist.name,
        sub: 'Artist',
        to: () => navigate({ name: 'artist', id: artist.id }),
      })
    }
    for (const album of results.albums.slice(0, 2)) {
      list.push({
        type: 'entity',
        label: album.title,
        sub: `Album · ${album.artistName}`,
        to: () => navigate({ name: 'album', id: album.id }),
      })
    }
    for (const playlist of results.playlists.slice(0, 2)) {
      list.push({
        type: 'entity',
        label: playlist.name,
        sub: `${playlist.trackIds.length} songs`,
        to: () => navigate({ name: 'playlist', id: playlist.id }),
      })
    }
    return list
  }, [results])

  useEffect(() => {
    setActiveIndex(0)
  }, [results?.query])

  useEffect(() => {
    if (!shouldRender) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => Math.min(current + 1, items.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => Math.max(current - 1, 0))
      } else if (event.key === 'Enter') {
        const item = items[activeIndex]
        if (!item) return
        event.preventDefault()
        if (item.type === 'track' && results) playTracks(results.tracks, activeIndex, `Search: ${results.query}`)
        else if (item.type === 'entity') item.to()
        close()
      } else if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, close, items, results, shouldRender])

  if (!shouldRender) return null

  const noResults = !loading && items.length === 0

  return (
    <div className={styles.overlay} role="listbox" aria-label="Search results">
      {loading && items.length === 0 ? (
        <div className={styles.overlayLoading}>
          <Skeleton height={12} width="38%" />
          <Skeleton height={44} radius="sm" />
          <Skeleton height={44} radius="sm" />
          <Skeleton height={44} radius="sm" />
        </div>
      ) : null}

      {noResults ? <p className={styles.overlayEmpty}>No matches for “{query.trim()}”.</p> : null}

      {items.map((item, index) => (
        <button
          key={item.type === 'track' ? item.track.id : `${item.label}-${index}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={cn(styles.overlayRow, index === activeIndex && styles.overlayRowActive)}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => {
            if (item.type === 'track' && results) playTracks(results.tracks, index, `Search: ${results.query}`)
            else if (item.type === 'entity') item.to()
            close()
          }}
        >
          {item.type === 'track' ? (
            <>
              <Artwork source={item.track.artwork} seed={item.track.albumId} alt="" size={34} radius="xs" />
              <span className={styles.overlayText}>
                <span className={styles.overlayLabel}>{item.track.title}</span>
                <span className={styles.overlaySub}>
                  {item.track.artistName} · {item.track.albumName}
                </span>
              </span>
              <Icon name="play" size={14} className={styles.overlayHint} />
            </>
          ) : (
            <>
              <span className={styles.overlayEntityIcon}>
                <Icon name="search" size={15} />
              </span>
              <span className={styles.overlayText}>
                <span className={styles.overlayLabel}>{item.label}</span>
                <span className={styles.overlaySub}>{item.sub}</span>
              </span>
              <Icon name="chevronRight" size={14} className={styles.overlayHint} />
            </>
          )}
        </button>
      ))}

      {items.length > 0 ? (
        <button
          type="button"
          className={styles.overlayAll}
          onClick={() => {
            close()
            navigate({ name: 'search' })
          }}
        >
          Show all results
        </button>
      ) : null}
    </div>
  )
}
