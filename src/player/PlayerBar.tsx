import { navigate } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/utils/cn'
import { useLibraryStore } from '@/store/libraryStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { openTrackMenuFromButton, playTracks, toggleLikeTrack } from './songActions'
import { PlayerProgress } from './PlayerProgress'
import { useCurrentTrack, usePlayerStore } from './playerStore'
import { VolumeControl } from './VolumeControl'
import styles from './PlayerBar.module.css'

/**
 * Bottom player.
 *
 * Always visible while something is queued, and identical in structure to the
 * reference: track on the left, transport + progress in the centre, queue,
 * volume and audio settings on the right.
 */
export function PlayerBar() {
  const track = useCurrentTrack()
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const isBuffering = usePlayerStore((state) => state.isBuffering)
  const isSimulated = usePlayerStore((state) => state.isSimulated)
  const loadedOnce = usePlayerStore((state) => state.loadedOnce)
  const error = usePlayerStore((state) => state.error)
  const togglePlay = usePlayerStore((state) => state.togglePlay)
  const next = usePlayerStore((state) => state.next)
  const previous = usePlayerStore((state) => state.previous)
  const retry = usePlayerStore((state) => state.retry)

  const shuffle = useSettingsStore((state) => state.shuffle)
  const repeat = useSettingsStore((state) => state.repeat)
  const queueOpen = useSettingsStore((state) => state.queuePanel)
  const setSetting = useSettingsStore((state) => state.set)

  const liked = useLibraryStore((state) => (track ? state.likedTrackIds.includes(track.id) : false))
  const setMiniPlayer = useUiStore((state) => state.setMiniPlayer)

  const repeatIcon = repeat === 'one' ? 'repeatOne' : 'repeat'
  const repeatLabel = repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'

  return (
    <footer className={cn('panel', styles.player)} aria-label="Player">
      <div className={styles.left}>
        <button
          type="button"
          className={styles.trackButton}
          onClick={() => track && playTracks([track], 0, track.albumName)}
          disabled={!track}
          aria-label={track ? `Now playing ${track.title} by ${track.artistName}` : 'Nothing playing'}
        >
          <Artwork
            source={track?.artwork ?? { kind: 'none' }}
            seed={track?.albumId ?? 'crest-idle'}
            alt={track ? `${track.albumName} cover` : 'No artwork'}
            size={48}
            radius="sm"
          />
        </button>

        <div className={styles.meta}>
          {error ? (
            <span className={styles.error}>
              {error}
              <button type="button" className={styles.retry} onClick={retry}>
                Retry
              </button>
            </span>
          ) : (
            <>
              <span className={styles.title} title={track?.title ?? undefined}>
                {track?.title ?? 'Nothing playing'}
                {isBuffering ? <span className={styles.bufferDot} aria-label="Buffering" /> : null}
              </span>
              {track ? (
                <button
                  type="button"
                  className={styles.artistButton}
                  title={`Go to ${track.artistName}`}
                  onClick={() => navigate({ name: 'artist', id: track.artistId })}
                >
                  {track.artistName}
                </button>
              ) : (
                <span className={styles.artist}>Choose a song to begin</span>
              )}
            </>
          )}
        </div>

        {track ? (
          <div className={styles.trackActions}>
            <IconButton
              icon={liked ? 'heartFilled' : 'heart'}
              label={liked ? 'Remove from Liked Songs' : 'Like'}
              size="sm"
              variant="bare"
              active={liked}
              onClick={() => toggleLikeTrack(track)}
            />
            <IconButton
              icon="more"
              label="More options"
              size="sm"
              variant="bare"
              onClick={(event) => openTrackMenuFromButton(event.currentTarget, track)}
            />
          </div>
        ) : null}
      </div>

      <div className={styles.center}>
        <div className={styles.controls}>
          <IconButton
            icon="shuffle"
            label={shuffle ? 'Shuffle on' : 'Shuffle off'}
            size="sm"
            variant="bare"
            active={shuffle}
            aria-pressed={shuffle}
            onClick={() => setSetting('shuffle', !shuffle)}
          />
          <IconButton icon="skipBack" label="Previous track" size="md" variant="bare" iconSize={19} onClick={previous} />
          <button
            type="button"
            className={styles.playButton}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={togglePlay}
            disabled={!track}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
          </button>
          <IconButton icon="skipForward" label="Next track" size="md" variant="bare" iconSize={19} onClick={() => next()} />
          <IconButton
            icon={repeatIcon}
            label={repeatLabel}
            size="sm"
            variant="bare"
            active={repeat !== 'off'}
            onClick={() => setSetting('repeat', repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
          />
        </div>
        <PlayerProgress className={styles.progress} />
      </div>

      <div className={styles.right}>
        {isSimulated && loadedOnce && track ? (
          <span
            className={styles.demoChip}
            title="The demo library ships without audio files, so playback is simulated. Volume and transport controls still persist and will drive real audio once a provider supplies streams."
          >
            Demo audio
          </span>
        ) : null}
        {track?.preview ? (
          <span
            className={styles.demoChip}
            title="Apple hosts 30-second previews of store recordings for promotional purposes; full-length playback is not licensed to third-party players."
          >
            Preview
          </span>
        ) : null}
        <IconButton
          icon="queue"
          label={queueOpen ? 'Hide queue' : 'Show queue'}
          size="sm"
          variant="bare"
          active={queueOpen}
          iconSize={19}
          onClick={() => setSetting('queuePanel', !queueOpen)}
        />
        <VolumeControl />
        <IconButton
          icon="music"
          label="Now playing"
          size="sm"
          variant="bare"
          iconSize={18}
          onClick={() => navigate({ name: 'lyrics' })}
        />
        <IconButton
          icon="sliders"
          label="Audio settings"
          size="sm"
          variant="bare"
          iconSize={18}
          onClick={() => navigate({ name: 'settings', section: 'audio' })}
        />
        <IconButton
          icon="collapse"
          label="Compact player"
          size="sm"
          variant="bare"
          iconSize={17}
          onClick={() => setMiniPlayer(true)}
        />
      </div>
    </footer>
  )
}
