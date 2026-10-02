import { useEffect, useRef } from 'react'
import type { Lyrics } from '@/services/providers/types'
import { cn } from '@/utils/cn'
import { useActiveLyricLine } from './useActiveLyricLine'
import styles from './Lyrics.module.css'

type Props = {
  lyrics: Lyrics | null
  onOpen?: () => void
}

const VISIBLE_LINES = 6

/**
 * Lyrics preview for the queue panel: a bordered card with the surrounding lines
 * around the one currently playing. The list keeps itself centred without user
 * interaction, which is what makes the reference's small lyrics box feel alive.
 */
export function LyricsPreview({ lyrics, onOpen }: Props) {
  const activeIndex = useActiveLyricLine(lyrics)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    const container = scrollRef.current
    const list = listRef.current
    if (!container || !list) return
    const line = list.children[activeIndex] as HTMLElement | undefined
    if (!line) return
    // Keep the first line anchored at the top: centring it would clip the card.
    if (activeIndex === 0) {
      container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const target = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [activeIndex, lyrics])

  if (!lyrics || lyrics.lines.length === 0) {
    return <p className={styles.empty}>No lyrics available for this track.</p>
  }

  return (
    <div className={styles.previewCard}>
      <div ref={scrollRef} className={cn(styles.previewScroll, 'scroll-y')}>
        <ol ref={listRef} className={styles.previewList}>
          {lyrics.lines.slice(0, Math.max(VISIBLE_LINES, activeIndex + 4)).map((line, index) => (
            <li
              key={`${index}-${line.text}`}
              className={cn(
                styles.previewLine,
                line.text === '' && styles.previewLineEmpty,
                index === activeIndex && lyrics.synced && styles.previewLineActive,
              )}
            >
              {line.text || '\u00a0'}
            </li>
          ))}
        </ol>
      </div>
      {onOpen ? (
        <button type="button" className={styles.previewOpen} onClick={onOpen}>
          Open lyrics
        </button>
      ) : null}
    </div>
  )
}
