import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUiStore, type Toast } from '@/store/uiStore'
import { Icon, type IconName } from './Icon'
import styles from './Toasts.module.css'

const TONE_ICON: Record<Toast['tone'], IconName> = {
  neutral: 'info',
  error: 'info',
  success: 'check',
}

/**
 * Toasts.
 *
 * Used for user-facing failures ("Unable to load this track." + Retry) and for
 * confirmations. Never for stack traces — those stay in the dev console.
 */
export function ToastHost() {
  const toasts = useUiStore((state) => state.toasts)

  return createPortal(
    <div className={styles.host} role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((state) => state.dismissToast)

  useEffect(() => {
    if (toast.durationMs <= 0) return
    const timer = window.setTimeout(() => dismiss(toast.id), toast.durationMs)
    return () => window.clearTimeout(timer)
  }, [dismiss, toast.durationMs, toast.id])

  return (
    <div className={styles.toast} data-tone={toast.tone} role="status">
      <span className={styles.icon}>
        <Icon name={TONE_ICON[toast.tone]} size={15} />
      </span>
      <span className={styles.message}>{toast.message}</span>
      {toast.actionLabel ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.onAction?.()
            dismiss(toast.id)
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button type="button" className={styles.close} aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}
