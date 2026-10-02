import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

type Side = 'top' | 'bottom' | 'left' | 'right'

type Props = {
  label: string
  side?: Side
  delayMs?: number
  /** Renders children without the wrapper when there is nothing to show. */
  disabled?: boolean
  children: ReactNode
}

const OFFSET = 10

/**
 * Tooltip.
 *
 * Every icon-only control in Crest is wrapped in one, so no control is ever
 * ambiguous. Opens on hover and on keyboard focus, closes on Escape, and is
 * wired up with role="tooltip" + aria-describedby.
 */
export function Tooltip({ label, side = 'top', delayMs = 420, disabled = false, children }: Props) {
  const id = useId()
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const [coords, setCoords] = useState<{ x: number; y: number; side: Side } | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const place = useCallback(() => {
    const element = triggerRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const resolved: Side =
      side === 'top' && rect.top < 40 ? 'bottom' : side === 'bottom' && rect.bottom > window.innerHeight - 40 ? 'top' : side

    let x = rect.left + rect.width / 2
    let y = rect.top - OFFSET
    if (resolved === 'bottom') y = rect.bottom + OFFSET
    if (resolved === 'left') {
      x = rect.left - OFFSET
      y = rect.top + rect.height / 2
    }
    if (resolved === 'right') {
      x = rect.right + OFFSET
      y = rect.top + rect.height / 2
    }
    setCoords({ x, y, side: resolved })
  }, [side])

  const open = useCallback(() => {
    if (disabled) return
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      place()
      timerRef.current = null
    }, delayMs)
  }, [clearTimer, delayMs, disabled, place])

  const close = useCallback(() => {
    clearTimer()
    setCoords(null)
  }, [clearTimer])

  useEffect(() => close, [close])

  useEffect(() => {
    if (!coords) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onScroll = () => close()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [coords, close])

  if (disabled || !label) return <>{children}</>

  const tooltip =
    coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            id={id}
            role="tooltip"
            className={styles.tooltip}
            data-side={coords.side}
            style={{ left: coords.x, top: coords.y }}
          >
            {label}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.trigger}
        onMouseEnter={open}
        onMouseLeave={close}
        onMouseDown={close}
        onFocus={open}
        onBlur={close}
        aria-describedby={coords ? id : undefined}
      >
        {children}
      </span>
      {tooltip}
    </>
  )
}
