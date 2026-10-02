import { useEffect, useRef, useState } from 'react'

type Options = {
  /** Keep the visible state once entered (default) or track both directions. */
  once?: boolean
  rootMargin?: string
  threshold?: number
}

/**
 * Reports whether the element has entered the viewport.
 * Used to lazy-mount artwork and defer heavy rows: nothing off-screen does work.
 */
export function useVisibility<T extends HTMLElement>(options: Options = {}) {
  const { once = true, rootMargin = '240px', threshold = 0 } = options
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const margin = Number.parseFloat(rootMargin) || 0

    const inViewport = (): boolean => {
      const rect = element.getBoundingClientRect()
      return (
        rect.top < window.innerHeight + margin &&
        rect.bottom > -margin &&
        rect.left < window.innerWidth + margin &&
        rect.right > -margin
      )
    }

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    // Synchronous first check: several embedded webviews (and some WebView2
    // builds) throttle or never deliver IO callbacks for subtrees, leaving
    // in-view content stuck invisible. If the element is already on screen,
    // skip the observer entirely when tracking one-shot visibility.
    if (once && inViewport()) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setVisible(false)
          }
        }
      },
      { rootMargin, threshold },
    )
    observer.observe(element)

    // Safety net: an observer that reports nothing at all must not wedge
    // content; re-check the geometry once shortly after mount.
    const fallback = once
      ? window.setTimeout(() => {
          if (inViewport()) setVisible(true)
        }, 1200)
      : undefined

    return () => {
      observer.disconnect()
      if (fallback !== undefined) window.clearTimeout(fallback)
    }
  }, [once, rootMargin, threshold])

  return { ref, visible }
}
