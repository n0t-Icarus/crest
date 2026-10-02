import { cn } from '@/utils/cn'
import styles from './Skeleton.module.css'

type Props = {
  width?: number | string
  height?: number | string
  radius?: 'xs' | 'sm' | 'md' | 'lg' | 'pill' | 'circle'
  className?: string
}

/**
 * Loading placeholders.
 *
 * Loaders mirror the final layout — same card size, same row height — so content
 * does not jump when it arrives. No spinners, no full-page flashes.
 */
export function Skeleton({ width = '100%', height = 12, radius = 'sm', className }: Props) {
  return (
    <div
      className={cn(styles.skeleton, styles[radius], className)}
      style={{ width, height }}
      aria-hidden
      data-skeleton
    />
  )
}

export function SkeletonCardRow({ count = 6, cardSize = 140 }: { count?: number; cardSize?: number }) {
  return (
    <div className={styles.cardRow} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.card} style={{ width: cardSize }}>
          <Skeleton height={cardSize} radius="md" />
          <Skeleton width="72%" height={11} className={styles.cardLine} />
          <Skeleton width="46%" height={10} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonMixRow({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.mixRow} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={178} radius="md" className={styles.mix} />
      ))}
    </div>
  )
}

export function SkeletonSongList({ rows = 8 }: { rows?: number }) {
  return (
    <div className={styles.songList} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.songRow}>
          <Skeleton width={36} height={36} radius="sm" />
          <div className={styles.songText}>
            <Skeleton width={`${30 + ((index * 13) % 40)}%`} height={11} />
            <Skeleton width={`${18 + ((index * 7) % 26)}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}
