import { navigate, type Route } from '@/app/router'
import styles from './music.module.css'

type Props = {
  title: string
  /** Adds the reference's "See all" affordance. */
  seeAllTo?: Route
  onSeeAll?: () => void
  seeAllLabel?: string
}

export function SectionHeader({ title, seeAllTo, onSeeAll, seeAllLabel = 'See all' }: Props) {
  return (
    <header className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {seeAllTo || onSeeAll ? (
        <button
          type="button"
          className={styles.seeAll}
          onClick={() => {
            if (onSeeAll) onSeeAll()
            else if (seeAllTo) navigate(seeAllTo)
          }}
        >
          {seeAllLabel}
        </button>
      ) : null}
    </header>
  )
}
