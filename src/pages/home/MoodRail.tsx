import type { MoodChip } from '@/services/providers/types'
import styles from './home.module.css'

type Props = {
  moods: MoodChip[]
  active?: string
  onSelect: (mood: string) => void
  pending?: boolean
}

/**
 * Mood rail.
 *
 * These are YouTube Music's own curated moods, and picking one re-filters the
 * entire feed below. It is the one control that turns Home from "whatever
 * YouTube is pushing today" into "what I actually want to hear", so it sits
 * above the hero rather than buried under it.
 */
export function MoodRail({ moods, active, onSelect, pending = false }: Props) {
  if (moods.length === 0) return null

  return (
    <div className={styles.moodRail} role="tablist" aria-label="Mood">
      <button
        type="button"
        role="tab"
        aria-selected={!active}
        className={styles.moodChip}
        data-active={!active || undefined}
        data-pending={pending && !active || undefined}
        onClick={() => onSelect('')}
      >
        For you
      </button>
      {moods.map((mood) => (
        <button
          key={mood.id}
          type="button"
          role="tab"
          aria-selected={active === mood.id}
          className={styles.moodChip}
          data-active={active === mood.id || undefined}
          onClick={() => onSelect(mood.id)}
        >
          {mood.label}
        </button>
      ))}
    </div>
  )
}
