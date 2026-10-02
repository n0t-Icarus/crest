import { useState, type ReactNode } from 'react'
import { navigate, useRoute, type Route } from '@/app/router'
import { Logo, LogoMark } from '@/components/brand/Logo'
import { Artwork } from '@/components/ui/Artwork'
import { Icon, type IconName } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useLibraryStore } from '@/store/libraryStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { songCountLabel } from '@/utils/format'
import styles from './Sidebar.module.css'

type NavItem = {
  id: string
  label: string
  icon: IconName
  route: Route
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home', route: { name: 'home' } },
  { id: 'search', label: 'Search', icon: 'search', route: { name: 'search' } },
  { id: 'library', label: 'Library', icon: 'library', route: { name: 'library' } },
  { id: 'playlists', label: 'Playlists', icon: 'playlist', route: { name: 'playlists' } },
  { id: 'liked', label: 'Liked Songs', icon: 'heart', route: { name: 'liked' } },
  { id: 'history', label: 'History', icon: 'clock', route: { name: 'history' } },
]

/** Which nav entry stays highlighted for the current route. */
const ROUTE_PARENT: Record<string, string> = {
  playlist: 'playlists',
  mix: 'home',
  album: 'library',
  artist: 'library',
  lyrics: 'home',
  settings: 'home',
}

export function Sidebar({ collapsed, children }: { collapsed: boolean; children?: ReactNode }) {
  const route = useRoute()
  const playlists = useLibraryStore((state) => state.playlists)
  const openNewPlaylist = useUiStore((state) => state.openNewPlaylistDialog)
  const setSetting = useSettingsStore((state) => state.set)
  const [hoveredPlaylist, setHoveredPlaylist] = useState<string | null>(null)

  const activeId = route.name in ROUTE_PARENT ? ROUTE_PARENT[route.name] : route.name

  return (
    <aside className={`panel ${styles.sidebar}`} data-collapsed={collapsed || undefined} aria-label="Primary navigation">
      <div className={styles.brand} data-drag-region>
        {collapsed ? (
          <button
            type="button"
            className={styles.brandCollapsedBtn}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            onClick={() => setSetting('sidebarCollapsed', false)}
          >
            <Logo collapsed={collapsed} />
          </button>
        ) : (
          <>
            <Logo collapsed={collapsed} />
            <IconButton
              icon="collapse"
              label="Collapse sidebar"
              size="sm"
              variant="bare"
              className={styles.sidebarToggle}
              onClick={() => setSetting('sidebarCollapsed', true)}
            />
          </>
        )}
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = activeId === item.id
          const button = (
            <button
              type="button"
              key={item.id}
              className={styles.navItem}
              data-active={active || undefined}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.route)}
            >
              <Icon name={item.icon} size={17} className={styles.navIcon} />
              {collapsed ? null : <span className={styles.navLabel}>{item.label}</span>}
            </button>
          )
          return collapsed ? (
            <Tooltip key={item.id} label={item.label} side="right">
              {button}
            </Tooltip>
          ) : (
            button
          )
        })}
      </nav>

      <div className={styles.playlistsHeader}>
        {collapsed ? null : <h2 className={styles.playlistsTitle}>Your Playlists</h2>}
        <IconButton
          icon="plus"
          label="Create playlist"
          size={collapsed ? 'sm' : 'md'}
          variant="bare"
          tooltipSide={collapsed ? 'right' : 'top'}
          onClick={() => openNewPlaylist()}
        />
      </div>

      <div className={`${styles.playlists} scroll-y`}>
        {playlists.map((playlist) => {
          const active = route.name === 'playlist' && route.id === playlist.id
          const row = (
            <button
              type="button"
              className={styles.playlistRow}
              data-active={active || undefined}
              onClick={() => navigate({ name: 'playlist', id: playlist.id })}
              onMouseEnter={() => setHoveredPlaylist(playlist.id)}
              onMouseLeave={() => setHoveredPlaylist(null)}
            >
              <Artwork
                source={playlist.artwork}
                seed={playlist.id}
                alt={`${playlist.name} cover`}
                size={collapsed ? 34 : 30}
                radius="xs"
                className={styles.playlistArt}
              />
              {collapsed ? null : (
                <span className={styles.playlistText}>
                  <span className={styles.playlistName}>{playlist.name}</span>
                  <span className={styles.playlistCount}>{songCountLabel(playlist.trackIds.length)}</span>
                </span>
              )}
            </button>
          )
          return collapsed ? (
            <Tooltip key={playlist.id} label={playlist.name} side="right">
              {row}
            </Tooltip>
          ) : (
            <div key={playlist.id} data-hovered={hoveredPlaylist === playlist.id || undefined}>
              {row}
            </div>
          )
        })}
        {playlists.length === 0 && !collapsed ? (
          <p className={styles.emptyPlaylists}>No playlists yet — create one with the + button.</p>
        ) : null}
      </div>

      <div className={styles.account}>
        <div className={styles.accountTile}>
          <LogoMark size={18} />
        </div>
        {collapsed ? null : (
          <span className={styles.accountText}>
            <span className={styles.accountName}>Crest</span>
            <span className={styles.accountSub}>Music for your soul</span>
          </span>
        )}
        {collapsed ? null : (
          <IconButton
            icon="gear"
            label="Settings"
            size="sm"
            variant="bare"
            iconSize={15}
            onClick={() => navigate({ name: 'settings' })}
          />
        )}
      </div>
      {children}
    </aside>
  )
}
