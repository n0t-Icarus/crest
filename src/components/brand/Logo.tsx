import { cn } from '@/utils/cn'
import styles from './Logo.module.css'

/**
 * Crest mark.
 *
 * A tapered "V" — two arms that thin out towards the join. Same geometry as the
 * generated application icon (scripts/make_icons.py), so the taskbar and the app
 * share one identity.
 */
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1.06 7.77 L11.44 19.57 L12.56 18.83 L5.66 4.71 Z" />
      <path d="M18.34 4.71 L11.44 18.83 L12.56 19.57 L22.94 7.77 Z" />
    </svg>
  )
}

export function Logo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn(styles.logo, collapsed && styles.collapsed, className)}>
      <LogoMark size={collapsed ? 20 : 22} className={styles.mark} />
      {collapsed ? null : <span className={styles.word}>CREST</span>}
    </div>
  )
}
