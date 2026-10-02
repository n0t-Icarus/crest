import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/player/playerStore'
import { getProvider } from '@/services/providers'
import { useSettingsStore } from '@/store/settingsStore'
import styles from './PerfOverlay.module.css'

/**
 * Performance overlay (Settings → Advanced → Debug overlay).
 *
 * Off by default and, when on, updates the DOM directly from a single rAF loop —
 * it reports real numbers (frame time, dropped frames, heap, node count) without
 * adding React work to the thing it is measuring.
 */
export function PerfOverlay() {
  const enabled = useSettingsStore((state) => state.devOverlay)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    const box = boxRef.current
    if (!box) return

    let frame = 0
    let frames = 0
    let lastSample = performance.now()
    let lastFrame = lastSample
    let worstFrame = 0
    let dropped = 0

    const tick = () => {
      const now = performance.now()
      const delta = now - lastFrame
      lastFrame = now
      frames += 1
      worstFrame = Math.max(worstFrame, delta)
      if (delta > 20) dropped += 1

      if (now - lastSample >= 500) {
        const fps = (frames * 1000) / (now - lastSample)
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        const queue = usePlayerStore.getState().queue.length
        box.textContent = [
          `fps ${fps.toFixed(0)}  worst ${worstFrame.toFixed(1)}ms  dropped ${dropped}`,
          `heap ${memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'n/a'}  nodes ${document.getElementsByTagName('*').length}`,
          `queue ${queue}  provider ${getProvider().id}`,
        ].join('\n')
        frames = 0
        worstFrame = 0
        lastSample = now
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [enabled])

  if (!enabled) return null

  return <div ref={boxRef} className={styles.overlay} data-perf-overlay aria-hidden />
}
