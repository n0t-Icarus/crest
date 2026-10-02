import { useEffect } from 'react'
import { ContextMenuHost } from '@/components/ui/ContextMenu'
import { ToastHost } from '@/components/ui/Toasts'
import { PerfOverlay } from '@/components/dev/PerfOverlay'
import { CreatePlaylistDialog } from '@/playlists/CreatePlaylistDialog'
import { seedInitialQueue } from '@/player/playerStore'
import { useMediaSession } from '@/player/useMediaSession'
import { setActiveProvider } from '@/services/providers'
import { startHelperHeartbeat } from '@/services/providers/yt/ytProvider'
import { useSettingsStore } from '@/store/settingsStore'
import { ErrorBoundary } from './ErrorBoundary'
import { AppShell } from './AppShell'
import { useRoute, type Route } from './router'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { watchAppearance } from './appearance'
import { AlbumPage } from '@/pages/AlbumPage'
import { ArtistPage } from '@/pages/ArtistPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { HomePage } from '@/pages/home/HomePage'
import { LibraryPage } from '@/pages/LibraryPage'
import { LikedSongsPage } from '@/pages/LikedSongsPage'
import { LyricsPage } from '@/pages/LyricsPage'
import { MixPage } from '@/pages/MixPage'
import { PlaylistPage } from '@/pages/PlaylistPage'
import { PlaylistsPage } from '@/pages/PlaylistsPage'
import { SearchPage } from '@/pages/SearchPage'
import { SettingsPage } from '@/pages/SettingsPage'

/**
 * Application root.
 *
 * Composition only: shell, route switch and the three global hosts (context
 * menu, toasts, dialogs). Every provider is registered once here so swapping the
 * catalogue backend later is a one-line change in this file.
 */
export function App() {
  const route = useRoute()

  useEffect(() => watchAppearance(), [])
  useEffect(() => {
    const settings = useSettingsStore.getState()
    if (settings.providerId !== 'yt') {
      settings.set('providerId', 'yt')
      setActiveProvider('yt')
    }
    startHelperHeartbeat()
    void seedInitialQueue()
  }, [])

  useGlobalShortcuts()
  useMediaSession()

  return (
    <ErrorBoundary>
      <AppShell route={route}>
        <RouteView route={route} />
      </AppShell>
      <ContextMenuHost />
      <ToastHost />
      <CreatePlaylistDialog />
      <PerfOverlay />
    </ErrorBoundary>
  )
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />
    case 'search':
      return <SearchPage />
    case 'library':
      return <LibraryPage />
    case 'playlists':
      return <PlaylistsPage />
    case 'liked':
      return <LikedSongsPage />
    case 'history':
      return <HistoryPage />
    case 'lyrics':
      return <LyricsPage />
    case 'settings':
      return <SettingsPage section={route.section} />
    case 'playlist':
      return <PlaylistPage id={route.id} />
    case 'album':
      return <AlbumPage id={route.id} />
    case 'artist':
      return <ArtistPage id={route.id} />
    case 'mix':
      return <MixPage id={route.id} />
    default:
      return <HomePage />
  }
}
