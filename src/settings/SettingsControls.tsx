import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import styles from './settings.module.css'

type SectionProps = {
  id: string
  title: string
  description?: string
  children: ReactNode
}

export function SettingsSection({ id, title, description, children }: SectionProps) {
  return (
    <section className={styles.section} id={id} aria-labelledby={`${id}-title`}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id={`${id}-title`}>
          {title}
        </h2>
        {description ? <p className={styles.sectionDescription}>{description}</p> : null}
      </header>
      <div className={styles.rows}>{children}</div>
    </section>
  )
}

type RowProps = {
  label: string
  description?: string
  /** Why a control is disabled — shown as a hint, never silently greyed out. */
  note?: string
  disabled?: boolean
  control: ReactNode
  stacked?: boolean
}

export function SettingRow({ label, description, note, disabled = false, control, stacked = false }: RowProps) {
  return (
    <div className={styles.row} data-disabled={disabled || undefined} data-stacked={stacked || undefined}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>
          {label}
          {note ? <span className={styles.soonTag}>{note}</span> : null}
        </span>
        {description ? <span className={styles.rowDescription}>{description}</span> : null}
      </div>
      <div className={styles.rowControl}>{control}</div>
    </div>
  )
}

type ToggleProps = {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}

/** Switch styled like a desktop control, not a Material one. */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn(styles.toggle, checked && styles.toggleOn)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleKnob} />
    </button>
  )
}

type SelectProps = {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  label: string
  disabled?: boolean
  width?: number
}

export function Select({ value, options, onChange, label, disabled = false, width = 168 }: SelectProps) {
  return (
    <select
      className={styles.select}
      style={{ width }}
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

type ColorSwatchProps = {
  value: string
  onChange: (value: string) => void
  label: string
}

/** Round colour picker backed by the native input[type=color]. */
export function ColorSwatch({ value, onChange, label }: ColorSwatchProps) {
  return (
    <span className={styles.colorSwatch} style={{ background: value }} title={`${label} — ${value}`}>
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={0}
      />
    </span>
  )
}

type SegmentedProps<T extends string> = {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
  disabled?: boolean
}

export function Segmented<T extends string>({ value, options, onChange, label, disabled = false }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label} data-disabled={disabled || undefined}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          className={cn(styles.segment, value === option.value && styles.segmentActive)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
