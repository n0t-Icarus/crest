import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PanelResizeHandle } from '@/components/layout/PanelResizeHandle'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { BREAKPOINTS, useMediaQuery } from '@/hooks/useMediaQuery'
import { MiniPlayer } from '@/player/MiniPlayer'
import { PlayerBar } from '@/player/PlayerBar'
import { QueuePanel } from '@/queue/QueuePanel'
import { SearchOverlay } from '@/search/SearchOverlay'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { routeKey } from './router'
import type { Route } from './router'
import { ScrollElementContext } from './ScrollContext'
import styles from './AppShell.module.css'

type Props = {
  route: Route
  children: ReactNode
}

/**
 * Layout shell.
 *
 * Mirrors Spotify-like desktop architecture: expandable and resizable side panels
 * (sidebar · content · queue) with smooth draggable handles and persistent widths.
 * The queue auto-collapses below 1240px and the sidebar becomes a 74px icon rail
 * below 1000px, while remaining user-customizable.
 */
export function AppShell({ route, children }: Props) {
  const queuePreference = useSettingsStore((state) => state.queuePanel)
  const sidebarPreference = useSettingsStore((state) => state.sidebarCollapsed)
  const sidebarWidthSetting = useSettingsStore((state) => state.sidebarWidth ?? 232)
  const queueWidthSetting = useSettingsStore((state) => state.queueWidth ?? 292)
  const setSetting = useSettingsStore((state) => state.set)
  const miniPlayer = useUiStore((state) => state.miniPlayer)

  const narrow = useMediaQuery(BREAKPOINTS.queue)
  const veryNarrow = useMediaQuery(BREAKPOINTS.sidebarRail)

  const queueOpen = queuePreference && !narrow
  const sidebarCollapsed = sidebarPreference || veryNarrow

  const [sidebarWidth, setSidebarWidth] = useState(sidebarWidthSetting)
  const [queueWidth, setQueueWidth] = useState(queueWidthSetting)
  const [isResizing, setIsResizing] = useState(false)

  const startSidebarWidthRef = useRef(sidebarWidth)
  const startQueueWidthRef = useRef(queueWidth)

  useEffect(() => {
    setSidebarWidth(sidebarWidthSetting)
  }, [sidebarWidthSetting])

  useEffect(() => {
    setQueueWidth(queueWidthSetting)
  }, [queueWidthSetting])

  const handleSidebarResizeStart = () => {
    setIsResizing(true)
    startSidebarWidthRef.current = sidebarCollapsed ? 74 : sidebarWidth
  }

  const handleSidebarResize = (deltaX: number) => {
    const raw = startSidebarWidthRef.current + deltaX
    const maxSidebarWidth = Math.min(480, Math.floor(window.innerWidth * 0.45))
    if (raw < 130) {
      if (!sidebarPreference) {
        setSetting('sidebarCollapsed', true)
      }
    } else {
      if (sidebarPreference) {
        setSetting('sidebarCollapsed', false)
      }
      const clamped = Math.max(180, Math.min(raw, maxSidebarWidth))
      setSidebarWidth(clamped)
    }
  }

  const handleSidebarResizeEnd = () => {
    setIsResizing(false)
    if (!sidebarPreference) {
      setSetting('sidebarWidth', sidebarWidth)
    }
  }

  const handleSidebarDoubleClick = () => {
    if (sidebarCollapsed) {
      setSetting('sidebarCollapsed', false)
      setSidebarWidth(232)
      setSetting('sidebarWidth', 232)
    } else if (Math.abs(sidebarWidth - 232) > 10) {
      setSidebarWidth(232)
      setSetting('sidebarWidth', 232)
    } else {
      setSetting('sidebarCollapsed', true)
    }
  }

  const handleQueueResizeStart = () => {
    setIsResizing(true)
    startQueueWidthRef.current = queueWidth
  }

  const handleQueueResize = (deltaX: number) => {
    const raw = startQueueWidthRef.current - deltaX
    const maxQueueWidth = Math.min(560, Math.floor(window.innerWidth * 0.45))
    const clamped = Math.max(240, Math.min(raw, maxQueueWidth))
    setQueueWidth(clamped)
  }

  const handleQueueResizeEnd = () => {
    setIsResizing(false)
    setSetting('queueWidth', queueWidth)
  }

  const handleQueueDoubleClick = () => {
    setQueueWidth(292)
    setSetting('queueWidth', 292)
  }

  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Mirror the scroller into state once, so long lists can window against it.
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const key = routeKey(route)

  // Reset scroll when moving between views, but never when the content of the
  // current view merely updates (playback must not jump a page).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [key])

  return (
    <div
      className={styles.shell}
      data-queue={queueOpen ? 'open' : 'closed'}
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
      data-mini={miniPlayer || undefined}
      data-resizing={isResizing || undefined}
      style={
        {
          '--sidebar-w': sidebarCollapsed ? 'var(--sidebar-w-collapsed)' : `${sidebarWidth}px`,
          '--queue-w': `${queueWidth}px`,
        } as React.CSSProperties
      }
    >
      <Sidebar collapsed={sidebarCollapsed}>
        <PanelResizeHandle
          side="left"
          onResizeStart={handleSidebarResizeStart}
          onResize={handleSidebarResize}
          onResizeEnd={handleSidebarResizeEnd}
          onDoubleClick={handleSidebarDoubleClick}
          label="Resize sidebar (double-click to reset)"
        />
      </Sidebar>

      <main className={`panel ${styles.content}`} aria-label="Main content">
        <TopBar showWindowControls={!queueOpen} compactSearch={queueOpen} />
        <ScrollElementContext.Provider value={scrollElement}>
          <div
            ref={(element) => {
              scrollRef.current = element
              setScrollElement(element)
            }}
            className={`${styles.scroll} scroll-y`}
          >
            <div key={key} className={styles.page}>
              {children}
            </div>
          </div>
        </ScrollElementContext.Provider>
        <SearchOverlay />
      </main>

      {queueOpen ? (
        <QueuePanel>
          <PanelResizeHandle
            side="right"
            onResizeStart={handleQueueResizeStart}
            onResize={handleQueueResize}
            onResizeEnd={handleQueueResizeEnd}
            onDoubleClick={handleQueueDoubleClick}
            label="Resize queue panel (double-click to reset)"
          />
        </QueuePanel>
      ) : null}

      {miniPlayer ? <MiniPlayer /> : <PlayerBar />}
    </div>
  )
}
