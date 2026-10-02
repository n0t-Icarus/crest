import { useEffect, useState } from 'react'
import { subscribeProgress } from '@/player/progress'
import type { Lyrics } from '@/services/providers/types'

/**
 * Active lyric line.
 *
 * Reads playback position from the progress channel and only calls setState when
 * the line actually changes, so a synced lyrics view costs a handful of renders
 * per song instead of thousands.
 */
export function useActiveLyricLine(lyrics: Lyrics | null, offsetMs = 0): number {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!lyrics || !lyrics.synced) {
      setIndex(0)
      return
    }
    const timed = lyrics.lines.filter((line) => line.startMs !== undefined)
    if (timed.length === 0) return

    return subscribeProgress(({ positionMs }) => {
      const at = positionMs + offsetMs
      let next = 0
      for (let i = 0; i < lyrics.lines.length; i += 1) {
        const start = lyrics.lines[i]?.startMs
        if (start !== undefined && start <= at) next = i
      }
      setIndex((current) => (current === next ? current : next))
    })
  }, [lyrics, offsetMs])

  return index
}
