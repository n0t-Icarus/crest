import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/utils/cn'
import styles from './Slider.module.css'

type Props = {
  /** Current value, 0–1. */
  value: number
  /**
   * `drag` fires continuously while the pointer is down (use it to update a
   * preview), `commit` fires on release / keyboard change (use it to seek).
   */
  onChange: (value: number, phase: 'drag' | 'commit') => void
  label: string
  /** Spoken value, e.g. "1:42 of 4:07". */
  valueText?: string
  variant?: 'progress' | 'volume'
  disabled?: boolean
  /** Hides the thumb until hover/drag — used by the wide progress bar. */
  thumbOnHover?: boolean
  className?: string
  step?: number
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Pointer + keyboard slider.
 *
 * Written by hand rather than using `<input type="range">`: the reference's
 * progress bar and volume slider are fully custom (thin track, hairline fill,
 * tiny white thumb) and the native control cannot be styled to match.
 */
export function Slider({
  value,
  onChange,
  label,
  valueText,
  variant = 'volume',
  disabled = false,
  thumbOnHover = false,
  className,
  step = 0.01,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)

  const shown = clamp01(preview ?? value)

  const valueFromEvent = useCallback((clientX: number): number => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return clamp01((clientX - rect.left) / rect.width)
  }, [])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return
      const next = valueFromEvent(event.clientX)
      setDragging(true)
      setPreview(next)
      event.currentTarget.setPointerCapture(event.pointerId)
      onChange(next, 'drag')
    },
    [disabled, onChange, valueFromEvent],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging || disabled) return
      const next = valueFromEvent(event.clientX)
      setPreview(next)
      onChange(next, 'drag')
    },
    [disabled, dragging, onChange, valueFromEvent],
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      const next = valueFromEvent(event.clientX)
      setDragging(false)
      setPreview(null)
      onChange(next, 'commit')
    },
    [dragging, onChange, valueFromEvent],
  )

  // Keyboard support keeps the control reachable without a pointer.
  useEffect(() => {
    const track = trackRef.current
    if (!track || disabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const current = clamp01(preview ?? value)
      const delta = event.shiftKey ? step * 10 : step
      let next: number | null = null
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = clamp01(current + delta)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = clamp01(current - delta)
      if (event.key === 'Home') next = 0
      if (event.key === 'End') next = 1
      if (next === null) return
      event.preventDefault()
      event.stopPropagation()
      setPreview(next)
      onChange(next, 'commit')
      window.setTimeout(() => setPreview(null), 0)
    }
    track.addEventListener('keydown', onKeyDown)
    return () => track.removeEventListener('keydown', onKeyDown)
  }, [disabled, onChange, preview, step, value])

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      data-variant={variant}
      data-dragging={dragging || undefined}
      data-thumb-hover={thumbOnHover || undefined}
      data-disabled={disabled || undefined}
      className={cn(styles.slider, className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${shown * 100}%` }} />
      </div>
      <div className={styles.thumb} style={{ left: `${shown * 100}%` }} />
    </div>
  )
}
