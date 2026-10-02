import type { ReactNode } from 'react'
import { Artwork } from '@/components/ui/Artwork'
import { Button } from '@/components/ui/Button'
import type { ArtworkRef } from '@/services/providers/types'
import styles from './CollectionHeader.module.css'

type Props = {
  eyebrow: string
  title: string
  description?: string
  meta?: string
  artwork: ArtworkRef
  seed: string
  round?: boolean
  onPlay: () => void
  onShuffle?: () => void
  actions?: ReactNode
  /** Shuffle is hidden when there is nothing to shuffle. */
  disabled?: boolean
}

/** The big header that opens every collection view (playlist, album, artist). */
export function CollectionHeader({
  eyebrow,
  title,
  description,
  meta,
  artwork,
  seed,
  round = false,
  onPlay,
  onShuffle,
  actions,
  disabled = false,
}: Props) {
  return (
    <header className={styles.header}>
      <Artwork
        source={artwork}
        seed={seed}
        alt={`${title} artwork`}
        radius={round ? 'circle' : 'lg'}
        className={styles.art}
        priority
      />
      <div className={styles.info}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {meta ? <p className={styles.meta}>{meta}</p> : null}
        <div className={styles.actions}>
          <Button variant="primary" icon="play" onClick={onPlay} disabled={disabled}>
            Play
          </Button>
          {onShuffle ? (
            <Button variant="secondary" icon="shuffle" onClick={onShuffle} disabled={disabled}>
              Shuffle
            </Button>
          ) : null}
          {actions}
        </div>
      </div>
    </header>
  )
}
