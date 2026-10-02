import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '@/player/playerStore'
import { getProgress, subscribeProgress } from '@/player/progress'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/format'
import styles from './PlayerProgress.module.css'

type Props = {
  className?: string
  /** Renders the elapsed / total timestamps next to the bar. */
  withTimes?: boolean
  /** `stacked` puts the timestamps under the bar (queue panel). */
  layout?: 'inline' | 'stacked'
  /** Hide the thumb until hover/drag (wide player bar). */
  thumbOnHover?: boolean
  /** Larger hit area for the queue panel. */
  compact?: boolean
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Progress bar.
 *
 * Position is written straight to the DOM from the progress channel, so playback
 * runs smoothly at 60fps without a single React render. React only re-renders
 * when the track or its duration changes.
 */
export function PlayerProgress({ className, withTimes = true, layout = 'inline', thumbOnHover = true, compact = false }: Props) {
  const durationMs = usePlayerStore((state) => state.durationMs)
  const seek = usePlayerStore((state) => state.seek)

  const trackRef = useRef<HTMLDivElement | null>(null)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const currentRef = useRef<HTMLSpanElement | null>(null)
  const durationRef = useRef<HTMLSpanElement | null>(null)
  const dragRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    return subscribeProgress(({ positionMs, durationMs: total }) => {
      const fraction = total > 0 ? clamp01(positionMs / total) : 0
      const shown = dragRef.current ?? fraction
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${shown})`
      if (thumbRef.current) {
        thumbRef.current.style.left = `${shown * 100}%`
        thumbRef.current.style.opacity = ''
      }
      if (currentRef.current) {
        currentRef.current.textContent = formatTime(dragRef.current !== null && total > 0 ? shown * total : positionMs)
      }
      if (durationRef.current) durationRef.current.textContent = formatTime(total)
    })
  }, [])

  const fractionFromEvent = (clientX: number): number => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return clamp01((clientX - rect.left) / rect.width)
  }

  const preview = (fraction: number) => {
    dragRef.current = fraction
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${fraction})`
    if (thumbRef.current) thumbRef.current.style.left = `${fraction * 100}%`
    if (currentRef.current && durationMs > 0) currentRef.current.textContent = formatTime(fraction * durationMs)
  }

  const commit = (fraction: number) => {
    dragRef.current = null
    seek(fraction * durationMs)
  }

  const enabled = durationMs > 0
  const initial = getProgress()

  return (
    <div className={cn(styles.wrapper, layout === 'stacked' && styles.stacked, className)} data-compact={compact || undefined}>
      {withTimes && layout === 'inline' ? <span className={styles.time} ref={currentRef}>{formatTime(initial.positionMs)}</span> : null}
      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={enabled ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamp01(initial.durationMs > 0 ? initial.positionMs / initial.durationMs : 0) * 100)}
        aria-disabled={!enabled}
        data-thumb-hover={thumbOnHover || undefined}
        data-dragging={dragging || undefined}
        onPointerDown={(event) => {
          if (!enabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          preview(fractionFromEvent(event.clientX))
        }}
        onPointerMove={(event) => {
          if (!dragging) return
          preview(fractionFromEvent(event.clientX))
        }}
        onPointerUp={(event) => {
          if (!dragging) return
          setDragging(false)
          commit(fractionFromEvent(event.clientX))
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(event) => {
          if (!enabled) return
          const current = getProgress()
          const fraction = current.durationMs > 0 ? current.positionMs / current.durationMs : 0
          const step = event.shiftKey ? 0.1 : 0.02
          if (event.key === 'ArrowRight') seek(Math.min(current.durationMs, current.positionMs + step * current.durationMs))
          else if (event.key === 'ArrowLeft') seek(Math.max(0, current.positionMs - step * current.durationMs))
          else if (event.key === 'Home') seek(0)
          else if (event.key === 'End') seek(current.durationMs)
          else if (event.key === 'ArrowUp') seek(Math.min(current.durationMs, (fraction + step) * current.durationMs))
          else if (event.key === 'ArrowDown') seek(Math.max(0, (fraction - step) * current.durationMs))
          else return
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className={styles.rail}>
          <div ref={fillRef} className={styles.fill} />
        </div>
        <div ref={thumbRef} className={styles.thumb} />
      </div>
      {withTimes ? (
        layout === 'inline' ? (
          <span className={styles.time} ref={durationRef}>
            {formatTime(initial.durationMs || durationMs)}
          </span>
        ) : null
      ) : null}
      {layout === 'stacked' ? (
        <div className={styles.timesRow}>
          <span className={styles.time} ref={currentRef}>
            {formatTime(initial.positionMs)}
          </span>
          <span className={styles.time} ref={durationRef}>
            {formatTime(initial.durationMs || durationMs)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
