import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import styles from './Tabs.module.css'

export type TabItem<T extends string> = {
  id: T
  label: string
  count?: number
}

type Props<T extends string> = {
  tabs: Array<TabItem<T>>
  value: T
  onChange: (id: T) => void
  size?: 'sm' | 'md'
  className?: string
  /** Accessible name for the tab list. */
  label: string
}

/**
 * Tabs.
 *
 * The reference uses a soft dark pill for the active tab. The indicator is one
 * shared element that slides between tabs (transform only), which stays smooth
 * on integrated graphics.
 */
export function Tabs<T extends string>({ tabs, value, onChange, size = 'md', className, label }: Props<T>) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  // Depend on the tab *signature*, not the array identity: callers pass inline
  // literals, and re-measuring on every render would loop forever.
  const tabKey = tabs.map((tab) => tab.id).join('|')

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`)
    if (!active) {
      setIndicator(null)
      return
    }
    const next = { left: active.offsetLeft, width: active.offsetWidth }
    setIndicator((current) =>
      current && current.left === next.left && current.width === next.width ? current : next,
    )
  }, [value, tabKey])

  return (
    <div ref={listRef} className={cn(styles.list, styles[size], className)} role="tablist" aria-label={label}>
      {indicator ? (
        <span
          className={styles.indicator}
          style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
          aria-hidden
        />
      ) : null}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          data-tab={tab.id}
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          className={cn(styles.tab, tab.id === value && styles.active)}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
            event.preventDefault()
            const index = tabs.findIndex((item) => item.id === value)
            const delta = event.key === 'ArrowRight' ? 1 : -1
            const next = tabs[(index + delta + tabs.length) % tabs.length]
            if (next) onChange(next.id)
          }}
        >
          {tab.label}
          {tab.count !== undefined ? <span className={styles.count}>{tab.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
