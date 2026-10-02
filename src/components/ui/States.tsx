import { Icon, type IconName } from './Icon'
import styles from './States.module.css'

type EmptyProps = {
  icon?: IconName
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
  compact?: boolean
}

export function EmptyState({ icon = 'music', title, message, action, compact = false }: EmptyProps) {
  return (
    <div className={styles.state} data-compact={compact || undefined}>
      <span className={styles.icon}>
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <h3 className={styles.title}>{title}</h3>
      {message ? <p className={styles.message}>{message}</p> : null}
      {action ? (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}

type ErrorProps = {
  /** User-facing sentence — never a stack trace. */
  message?: string
  onRetry?: () => void
  compact?: boolean
}

export function ErrorState({ message = 'Something went wrong while loading this content.', onRetry, compact }: ErrorProps) {
  return (
    <div className={styles.state} data-tone="error" data-compact={compact || undefined}>
      <span className={styles.icon}>
        <Icon name="info" size={compact ? 18 : 22} />
      </span>
      <h3 className={styles.title}>Unable to load this content</h3>
      <p className={styles.message}>{message}</p>
      {onRetry ? (
        <button type="button" className={styles.action} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
