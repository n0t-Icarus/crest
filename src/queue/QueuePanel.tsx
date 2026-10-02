import { useState, type ReactNode } from 'react'
import { navigate } from '@/app/router'
import { WindowControls } from '@/components/layout/WindowControls'
import { Artwork } from '@/components/ui/Artwork'
import { EmptyState } from '@/components/ui/States'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { useLyrics } from '@/lyrics/useLyrics'
import { LyricsPreview } from '@/lyrics/LyricsPreview'
import { PlayerProgress } from '@/player/PlayerProgress'
import { openTrackMenuFromButton, toggleLikeTrack } from '@/player/songActions'
import { useCurrentTrack, usePlayerStore, useUpNext } from '@/player/playerStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useSettingsStore } from '@/store/settingsStore'
import { QueueList } from './QueueList'
import styles from './QueuePanel.module.css'

type QueueTab = 'now' | 'next'

const PREVIEW_COUNT = 6

/**
 * Queue panel.
 *
 * Matches the reference: header with the window controls, Now Playing / Up Next
 * tabs, the current track with a scrubber and transport, a lyrics preview, then
 * the upcoming tracks with a "+ N more" affordance into the full list.
 */
export function QueuePanel({ children }: { children?: ReactNode } = {}) {
  const [tab, setTab] = useState<QueueTab>('now')
  const track = useCurrentTrack()
  const upNext = useUpNext()
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const togglePlay = usePlayerStore((state) => state.togglePlay)
  const next = usePlayerStore((state) => state.next)
  const previous = usePlayerStore((state) => state.previous)
  const clearUpcoming = usePlayerStore((state) => state.clearUpcoming)
  const queueIndex = usePlayerStore((state) => state.index)
  const shuffle = useSettingsStore((state) => state.shuffle)
  const repeat = useSettingsStore((state) => state.repeat)
  const setSetting = useSettingsStore((state) => state.set)
  const liked = useLibraryStore((state) => (track ? state.likedTrackIds.includes(track.id) : false))
  const { lyrics, loading: lyricsLoading } = useLyrics(track?.id)

  const preview = upNext.slice(0, PREVIEW_COUNT)
  const hiddenCount = Math.max(0, upNext.length - preview.length)

  return (
    <aside className={`panel ${styles.queue}`} aria-label="Queue">
      <header className={styles.header} data-drag-region>
        <div className={styles.headerLeft}>
          <IconButton
            icon="close"
            label="Close queue panel"
            size="sm"
            variant="bare"
            className={styles.closeBtn}
            onClick={() => setSetting('queuePanel', false)}
          />
          <h2 className={styles.heading}>Queue</h2>
        </div>
        <WindowControls />
      </header>

      <div className={styles.tabsRow}>
        <Tabs
          label="Queue view"
          value={tab}
          onChange={(value) => setTab(value as QueueTab)}
          tabs={[
            { id: 'now', label: 'Now Playing' },
            { id: 'next', label: 'Up Next' },
          ]}
        />
      </div>

      <div className={styles.divider} />

      <div className={`${styles.body} scroll-y`}>
        {tab === 'now' ? (
          <>
            {track ? (
              <section className={styles.nowPlaying} aria-label="Now playing">
                <div className={styles.nowTop}>
                  <Artwork
                    source={track.artwork}
                    seed={track.albumId}
                    alt={`${track.albumName} cover`}
                    size={68}
                    radius="sm"
                    priority
                  />
                  <div className={styles.nowMeta}>
                    <span className={styles.nowTitle} title={track.title}>
                      {track.title}
                    </span>
                    <button
                      type="button"
                      className={styles.nowArtist}
                      onClick={() => navigate({ name: 'artist', id: track.artistId })}
                    >
                      {track.artistName}
                    </button>
                  </div>
                  <div className={styles.nowActions}>
                    <IconButton
                      icon={liked ? 'heartFilled' : 'heart'}
                      label={liked ? 'Remove from Liked Songs' : 'Like'}
                      size="sm"
                      variant="bare"
                      iconSize={17}
                      active={liked}
                      onClick={() => toggleLikeTrack(track)}
                    />
                    <IconButton
                      icon="more"
                      label="More options"
                      size="sm"
                      variant="bare"
                      iconSize={17}
                      onClick={(event) => openTrackMenuFromButton(event.currentTarget, track, { contextQueue: [track] })}
                    />
                  </div>
                </div>

                <PlayerProgress layout="stacked" thumbOnHover={false} className={styles.nowProgress} />

                <div className={styles.transport}>
                  <IconButton
                    icon="shuffle"
                    label={shuffle ? 'Shuffle on' : 'Shuffle off'}
                    size="sm"
                    variant="bare"
                    iconSize={17}
                    active={shuffle}
                    onClick={() => setSetting('shuffle', !shuffle)}
                  />
                  <IconButton icon="skipBack" label="Previous track" size="sm" variant="bare" iconSize={18} onClick={previous} />
                  <button
                    type="button"
                    className={styles.playButton}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    onClick={togglePlay}
                  >
                    <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
                  </button>
                  <IconButton icon="skipForward" label="Next track" size="sm" variant="bare" iconSize={18} onClick={() => next()} />
                  <IconButton
                    icon={repeat === 'one' ? 'repeatOne' : 'repeat'}
                    label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
                    size="sm"
                    variant="bare"
                    iconSize={17}
                    active={repeat !== 'off'}
                    onClick={() => setSetting('repeat', repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
                  />
                </div>
              </section>
            ) : (
              <EmptyState
                title="Nothing playing"
                message="Pick a track and it appears here with lyrics and progress."
              />
            )}

            <section className={styles.section} aria-label="Lyrics">
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Lyrics</h3>
                <IconButton
                  icon="expand"
                  label="Open full lyrics"
                  size="sm"
                  variant="bare"
                  iconSize={15}
                  onClick={() => navigate({ name: 'lyrics' })}
                />
              </div>
              {lyricsLoading ? (
                <div className={styles.lyricsSkeleton}>
                  <Skeleton height={11} width="72%" />
                  <Skeleton height={11} width="58%" />
                  <Skeleton height={11} width="64%" />
                </div>
              ) : (
                <LyricsPreview lyrics={lyrics} onOpen={() => navigate({ name: 'lyrics' })} />
              )}
            </section>

            <section className={styles.section} aria-label="Next up">
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Next Up</h3>
                {upNext.length > 0 ? (
                  <button type="button" className={styles.textButton} onClick={clearUpcoming}>
                    Clear
                  </button>
                ) : null}
              </div>
              {preview.length > 0 ? (
                <>
                  <QueueList tracks={preview} offset={queueIndex + 1} compact />
                  {hiddenCount > 0 ? (
                    <button type="button" className={styles.moreButton} onClick={() => setTab('next')}>
                      <Icon name="plus" size={14} />
                      {hiddenCount} more
                    </button>
                  ) : null}
                </>
              ) : (
                <p className={styles.emptyHint}>
                  {track ? 'Nothing queued — add songs from anywhere in the app.' : 'The queue is empty.'}
                </p>
              )}
            </section>
          </>
        ) : (
          <section className={styles.section} aria-label="Up next">
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Up Next</h3>
              {upNext.length > 0 ? (
                <button type="button" className={styles.textButton} onClick={clearUpcoming}>
                  Clear
                </button>
              ) : null}
            </div>
            {upNext.length > 0 ? (
              <QueueList tracks={upNext} offset={queueIndex + 1} reorderable />
            ) : (
              <EmptyState icon="queue" title="Queue is empty" message="Add songs with the ··· menu on any track." />
            )}
          </section>
        )}
      </div>
      {children}
    </aside>
  )
}
