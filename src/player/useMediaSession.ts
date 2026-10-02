import { useEffect } from 'react'
import { useCurrentTrack, usePlayerStore } from './playerStore'
import { getProgress } from './progress'

/**
 * OS media integration, webview level.
 *
 * Reporting metadata through the Media Session API is what lets the Windows
 * media flyout and the keyboard's media keys control Crest today. Phase 8 adds
 * a native SMTC source in Rust for the cases WebView2 does not cover (tray
 * thumbnails, album art, precise timeline).
 */
export function useMediaSession(): void {
  const track = useCurrentTrack()
  const isPlaying = usePlayerStore((state) => state.isPlaying)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    try {
      session.metadata = track
        ? new MediaMetadata({
            title: track.title,
            artist: track.artistName,
            album: track.albumName,
          })
        : null
      session.playbackState = track ? (isPlaying ? 'playing' : 'paused') : 'none'
    } catch {
      /* Older webview: metadata is best-effort. */
    }
  }, [track, isPlaying])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    const player = () => usePlayerStore.getState()

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ['play', () => player().play()],
      ['pause', () => player().pause()],
      ['previoustrack', () => player().previous()],
      ['nexttrack', () => player().next()],
      [
        'seekbackward',
        (details) => player().seek(Math.max(0, getProgress().positionMs - (details.seekOffset ?? 10) * 1000)),
      ],
      ['seekforward', (details) => player().seek(getProgress().positionMs + (details.seekOffset ?? 10) * 1000)],
    ]

    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        /* Unsupported action on this platform. */
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null)
        } catch {
          /* ignore */
        }
      }
    }
  }, [])
}
