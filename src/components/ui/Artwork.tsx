import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useVisibility } from '@/hooks/useVisibility'
import type { ArtworkRef } from '@/services/providers/types'
import { artworkStyle } from '@/utils/artwork'
import { cn } from '@/utils/cn'
import styles from './Artwork.module.css'

type Radius = 'xs' | 'sm' | 'md' | 'lg' | 'circle'

type Props = {
  source: ArtworkRef
  /** Fallback seed when the provider has no image (normally the album id). */
  seed: string
  alt: string
  size?: number | string
  radius?: Radius
  /** Wide banner treatment for hero artwork. */
  banner?: boolean
  /** Portrait card treatment (mixes): taller silhouettes, card-scale glow. */
  tall?: boolean
  /** Skip lazy mounting (hero, now-playing). */
  priority?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/**
 * Artwork.
 *
 * Always paints a procedural gradient first, so there is never an empty box or
 * layout shift, then cross-fades a real image in over it if the provider has
 * one. Real images only mount once they scroll into view, which keeps memory
 * flat in long grids.
 */
export function Artwork({
  source,
  seed,
  alt,
  size,
  radius = 'md',
  banner = false,
  tall = false,
  priority = false,
  className,
  style,
  children,
}: Props) {
  const { ref, visible } = useVisibility<HTMLDivElement>({ rootMargin: '320px', once: true })
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  /** Bounded retries: content-node hiccups are common, permanent ones are not. */
  const [attempt, setAttempt] = useState(0)
  const url = source.kind === 'remote' ? source.url : null
  const artworkSeed = source.kind === 'generated' ? source.seed : seed
  const shouldMountImage = Boolean(url) && !failed && (priority || visible)

  // A new source resets the whole lifecycle (cache miss → new art).
  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    setAttempt(0)
  }, [url])

  return (
    <div
      ref={ref}
      className={cn(styles.art, styles[radius], banner && styles.banner, className)}
      style={{
        ...artworkStyle(artworkSeed, { banner, tall, plain: radius === 'circle' }),
        width: size,
        height: size,
        ...style,
      }}
      role="img"
      aria-label={alt}
    >
      {shouldMountImage ? (
        <img
          key={attempt}
          className={cn(styles.image, loaded && styles.imageLoaded)}
          src={url ?? ''}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            // Retry twice with a short backoff before settling on the gradient.
            if (attempt < 2) {
              window.setTimeout(() => setAttempt((value) => value + 1), 600 * (attempt + 1))
            } else {
              setFailed(true)
            }
          }}
        />
      ) : null}
      <span className={styles.grain} aria-hidden />
      {children ? <span className={styles.overlay}>{children}</span> : null}
    </div>
  )
}
