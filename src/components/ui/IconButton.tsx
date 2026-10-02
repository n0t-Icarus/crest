import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'
import { Icon, type IconName } from './Icon'
import { Tooltip } from './Tooltip'
import styles from './IconButton.module.css'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  icon: IconName
  /** Required: also doubles as the tooltip text, so no control is unlabelled. */
  label: string
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  variant?: 'ghost' | 'subtle' | 'light' | 'bare'
  iconSize?: number
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  showTooltip?: boolean
}

export function IconButton({
  icon,
  label,
  size = 'md',
  active = false,
  variant = 'ghost',
  iconSize,
  tooltipSide = 'top',
  showTooltip = true,
  className,
  type = 'button',
  ...rest
}: Props) {
  const resolvedIconSize = iconSize ?? (size === 'sm' ? 15 : size === 'lg' ? 20 : 18)

  const button = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={rest['aria-pressed'] ?? (active ? true : undefined)}
      data-active={active || undefined}
      className={cn(styles.button, styles[size], styles[variant], className)}
      {...rest}
    >
      <Icon name={icon} size={resolvedIconSize} />
    </button>
  )

  if (!showTooltip) return button

  return (
    <Tooltip label={label} side={tooltipSide}>
      {button}
    </Tooltip>
  )
}
