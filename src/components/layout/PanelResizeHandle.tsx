import { useRef, useState, type PointerEvent } from 'react'
import { cn } from '@/utils/cn'
import styles from './PanelResizeHandle.module.css'

type PanelResizeHandleProps = {
  side: 'left' | 'right'
  onResizeStart?: () => void
  onResize: (deltaX: number, currentClientX: number) => void
  onResizeEnd: () => void
  onDoubleClick?: () => void
  label?: string
  className?: string
}

/**
 * Draggable splitter handle for side panels.
 *
 * Placed on the edge of a panel facing the central content area.
 * Invisible at rest, illuminates with a glowing accent indicator on hover/drag,
 * with pointer capture for butter-smooth resizing at high frame rates.
 */
export function PanelResizeHandle({
  side,
  onResizeStart,
  onResize,
  onResizeEnd,
  onDoubleClick,
  label = 'Resize panel',
  className,
}: PanelResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    startXRef.current = event.clientX
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    onResizeStart?.()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    event.preventDefault()
    const deltaX = event.clientX - startXRef.current
    onResize(deltaX, event.clientX)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setIsDragging(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* already released */
    }
    onResizeEnd()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      data-side={side}
      data-resizing={isDragging || undefined}
      data-resize-handle
      className={cn(styles.handle, styles[side], isDragging && styles.dragging, className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onDoubleClick?.()
      }}
      title="Drag to resize, double-click to reset"
    >
      <div className={styles.bar} />
    </div>
  )
}
