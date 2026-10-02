import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUiStore, type MenuItem, type MenuItemEntry } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import { Icon } from './Icon'
import styles from './ContextMenu.module.css'

const MENU_WIDTH = 232
const EDGE = 8

/**
 * Context menu host.
 *
 * A single instance renders every menu in the app (songs, playlists, queue
 * items), which keeps behaviour — keyboard navigation, Escape, click-outside,
 * viewport clamping, focus restore — identical everywhere.
 */
export function ContextMenuHost() {
  const menu = useUiStore((state) => state.contextMenu)
  const close = useUiStore((state) => state.closeContextMenu)

  return menu ? <ContextMenu key={`${menu.x}:${menu.y}`} menu={menu} onClose={close} /> : null
}

type MenuProps = {
  menu: { x: number; y: number; items: MenuItem[]; returnFocusTo?: HTMLElement | null }
  onClose: () => void
}

function ContextMenu({ menu, onClose }: MenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null)
  const submenuRowRef = useRef<HTMLElement | null>(null)

  const selectable = menu.items.filter(isSelectable)

  useLayoutEffect(() => {
    const element = containerRef.current
    const rect = element?.getBoundingClientRect()
    const width = rect?.width ?? MENU_WIDTH
    const height = rect?.height ?? 260
    const x = Math.min(Math.max(EDGE, menu.x), window.innerWidth - width - EDGE)
    const y = Math.min(Math.max(EDGE, menu.y), Math.max(EDGE, window.innerHeight - height - EDGE))
    setPosition({ x, y })
    element?.focus()
  }, [menu.x, menu.y, menu.items])

  const close = useCallback(() => {
    const target = menu.returnFocusTo
    onClose()
    if (target && document.contains(target)) target.focus()
  }, [menu.returnFocusTo, onClose])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) return
      // Menus can be nested (submenus live inside the same portal root wrapper).
      if ((target as HTMLElement).closest?.('[data-menu-root]')) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }
    const onScroll = () => close()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onScroll)
    window.addEventListener('blur', onScroll)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('blur', onScroll)
    }
  }, [close])

  const moveActive = (delta: number) => {
    setSubmenuIndex(null)
    setActiveIndex((current) => {
      if (selectable.length === 0) return -1
      const next = current + delta
      if (next < 0) return selectable.length - 1
      if (next >= selectable.length) return 0
      return next
    })
  }

  const runItem = (item: MenuItemEntry) => {
    if (item.disabled || !item.onSelect) return
    close()
    // Let the menu unmount before the action mutates shared state.
    window.setTimeout(() => item.onSelect?.(), 0)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveActive(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveActive(-1)
        break
      case 'ArrowRight': {
        const active = selectable[activeIndex]
        if (active?.submenu?.length) {
          event.preventDefault()
          setSubmenuIndex(activeIndex)
        }
        break
      }
      case 'ArrowLeft':
        setSubmenuIndex(null)
        break
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const active = selectable[activeIndex]
        if (!active) return
        if (active.submenu?.length) setSubmenuIndex(activeIndex)
        else runItem(active)
        break
      }
      default:
        break
    }
  }

  const closeTimerRef = useRef<number | null>(null)

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => clearCloseTimer()
  }, [])

  const row = submenuRowRef.current?.getBoundingClientRect()
  const submenuAnchor = row ? { x: row.right - 2, y: row.top - 4 } : null

  return createPortal(
    <>
      <div
        ref={containerRef}
        data-menu-root
        role="menu"
        tabIndex={-1}
        aria-label="Context menu"
        className={styles.menu}
        style={{ left: position?.x ?? menu.x, top: position?.y ?? menu.y, visibility: position ? 'visible' : 'hidden' }}
        onKeyDown={handleKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        {menu.items.map((item) => {
          if (item.kind === 'separator') return <div key={item.id} className={styles.separator} role="separator" />
          const selectableIndex = selectable.indexOf(item)
          return (
            <MenuRow
              key={item.id}
              item={item}
              active={selectableIndex === activeIndex && selectableIndex >= 0}
              onHover={(element) => {
                setActiveIndex(selectableIndex)
                submenuRowRef.current = element
                clearCloseTimer()
                if (item.submenu?.length) {
                  setSubmenuIndex(selectableIndex)
                } else if (submenuIndex !== null) {
                  closeTimerRef.current = window.setTimeout(() => {
                    setSubmenuIndex(null)
                  }, 120)
                }
              }}
              onSelect={() => runItem(item)}
            />
          )
        })}
      </div>
      {submenuIndex !== null && position ? (
        <Submenu
          items={selectable[submenuIndex]?.submenu ?? []}
          anchor={submenuAnchor}
          onClose={close}
          onRun={runItem}
          onSubmenuEnter={clearCloseTimer}
          onSubmenuLeave={() => {
            clearCloseTimer()
            closeTimerRef.current = window.setTimeout(() => {
              setSubmenuIndex(null)
            }, 180)
          }}
        />
      ) : null}
    </>,
    document.body,
  )
}

function MenuRow({
  item,
  active,
  onHover,
  onSelect,
}: {
  item: MenuItemEntry
  active: boolean
  onHover: (element: HTMLElement) => void
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={item.disabled}
      className={cn(styles.item, active && styles.itemActive, item.danger && styles.itemDanger)}
      data-disabled={item.disabled || undefined}
      onMouseEnter={(event) => onHover(event.currentTarget)}
      onClick={onSelect}
      title={item.disabled ? item.note : undefined}
    >
      <span className={styles.itemIcon}>{item.icon ? <Icon name={item.icon} size={15} /> : null}</span>
      <span className={styles.itemLabel}>{item.label}</span>
      {item.disabled && item.note ? <span className={styles.itemNote}>Soon</span> : null}
      {item.submenu?.length ? <Icon name="chevronRight" size={14} className={styles.itemChevron} /> : null}
      {!item.submenu?.length && item.shortcut ? <span className={styles.itemShortcut}>{item.shortcut}</span> : null}
    </button>
  )
}

function Submenu({
  items,
  anchor,
  onRun,
  onClose: _onClose,
  onSubmenuEnter,
  onSubmenuLeave,
}: {
  items: MenuItem[]
  anchor: { x: number; y: number } | null
  onRun: (item: MenuItemEntry) => void
  onClose: () => void
  onSubmenuEnter?: () => void
  onSubmenuLeave?: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect()
    const base = anchor ?? { x: 40, y: 40 }
    const width = rect?.width ?? MENU_WIDTH
    const height = rect?.height ?? 200
    const flip = base.x + width + 12 > window.innerWidth
    setPosition({
      x: flip ? base.x - width - 6 : base.x,
      y: Math.min(Math.max(EDGE, base.y), Math.max(EDGE, window.innerHeight - height - EDGE)),
    })
  }, [anchor])

  return createPortal(
    <div
      ref={ref}
      data-menu-root
      role="menu"
      className={cn(styles.menu, styles.submenu)}
      style={{ left: position?.x ?? -9999, top: position?.y ?? -9999, visibility: position ? 'visible' : 'hidden' }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseEnter={onSubmenuEnter}
      onMouseLeave={onSubmenuLeave}
    >
      {items.map((item) =>
        item.kind === 'separator' ? (
          <div key={item.id} className={styles.separator} role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={styles.item}
            onClick={() => onRun(item)}
          >
            <span className={styles.itemIcon}>{item.icon ? <Icon name={item.icon} size={15} /> : null}</span>
            <span className={styles.itemLabel}>{item.label}</span>
            {item.note ? <span className={styles.itemNote}>{item.note}</span> : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

function isSelectable(item: MenuItem): item is MenuItemEntry {
  return item.kind === 'item'
}
