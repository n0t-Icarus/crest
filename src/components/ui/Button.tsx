import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Icon, type IconName } from './Icon'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
  pill?: boolean
  children?: ReactNode
}

/**
 * Buttons follow the reference: a solid near-white pill for the primary action
 * and a quiet translucent pill for everything secondary.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  pill = true,
  children,
  className,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={cn(styles.button, styles[variant], styles[size], pill && styles.pill, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 17 : 15} /> : null}
      {children ? <span className={styles.label}>{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={size === 'lg' ? 17 : 15} /> : null}
    </button>
  )
}
