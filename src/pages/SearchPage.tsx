import { useEffect, useState } from 'react'
import { navigate } from '@/app/router'
import { CollectionCard } from '@/components/music/CollectionCard'
import { SongTable } from '@/components/music/SongTable'
import { Skeleton, SkeletonSongList } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { useLibraryStore } from '@/store/libraryStore'
import { useUiStore } from '@/store/uiStore'
import { useSearch } from '@/search/useSearch'
import styles from './pages.module.css'

type Tab = 'tracks' | 'albums' | 'artists' | 'playlists'

/** Search results. The field lives in the top bar; this is the full result set. */
export function SearchPage() {
  const query = useUiStore((state) => state.searchQuery)
  const setQuery = useUiStore((state) => state.setSearchQuery)
  const { results, loading, error, retry } = useSearch(query)
  const [tab, setTab] = useState<Tab>('tracks')

  useEffect(() => {
    if (!results) return
    if (results.tracks.length === 0) {
      if (results.albums.length > 0) setTab('albums')
      else if (results.artists.length > 0) setTab('artists')
      else if (results.playlists.length > 0) setTab('playlists')
    }
  }, [results])

  if (!query.trim()) {
    return <SearchSuggestions onPick={setQuery} />
  }

  if (error) {
    return <ErrorState message={error} onRetry={retry} />
  }

  if (!results) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <Skeleton height={26} width={220} radius="md" />
        </div>
        <SkeletonSongList rows={8} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Results for “{results.query}”</h1>
          <p className={styles.pageSubtitle}>
            {results.tracks.length} songs · {results.albums.length} albums · {results.artists.length} artists ·{' '}
            {results.playlists.length} playlists
          </p>
        </div>
        {loading ? <span className={styles.note}>Searching…</span> : null}
      </div>

      <div className={styles.tabsRow}>
        <Tabs
          label="Result types"
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          tabs={[
            { id: 'tracks', label: 'Songs', count: results.tracks.length || undefined },
            { id: 'albums', label: 'Albums', count: results.albums.length || undefined },
            { id: 'artists', label: 'Artists', count: results.artists.length || undefined },
            { id: 'playlists', label: 'Playlists', count: results.playlists.length || undefined },
          ]}
        />
      </div>

      {tab === 'tracks' ? (
        <SongTable
          tracks={results.tracks}
          label={`Search: ${results.query}`}
          showAlbum
          emptyTitle="No songs matched"
          emptyMessage="Try a different spelling or a shorter word."
        />
      ) : null}

      {tab === 'albums' ? (
        results.albums.length > 0 ? (
          <div className={styles.grid}>
            {results.albums.map((album) => (
              <CollectionCard key={album.id} kind="album" album={album} onPlay={() => navigate({ name: 'album', id: album.id })} />
            ))}
          </div>
        ) : (
          <EmptyState icon="album" title="No albums matched" />
        )
      ) : null}

      {tab === 'artists' ? (
        results.artists.length > 0 ? (
          <div className={styles.grid}>
            {results.artists.map((artist) => (
              <CollectionCard key={artist.id} kind="artist" artist={artist} />
            ))}
          </div>
        ) : (
          <EmptyState icon="user" title="No artists matched" />
        )
      ) : null}

      {tab === 'playlists' ? (
        results.playlists.length > 0 ? (
          <div className={styles.grid}>
            {results.playlists.map((playlist) => (
              <CollectionCard
                key={playlist.id}
                kind="playlist"
                playlist={playlist}
                onPlay={() => navigate({ name: 'playlist', id: playlist.id })}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon="playlist" title="No playlists matched" />
        )
      ) : null}
    </div>
  )
}

/** Suggestions shown before anything is typed — never a blank screen. */
function SearchSuggestions({ onPick }: { onPick: (value: string) => void }) {
  const playlists = useLibraryStore((state) => state.playlists)
  const likedIds = useLibraryStore((state) => state.likedTrackIds)

  const chips = [
    ...playlists.slice(0, 4).map((playlist) => playlist.name),
    'After Dark',
    'Lo-Fi',
    'Chill',
  ]

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Search</h1>
          <p className={styles.pageSubtitle}>
            {likedIds.length} liked songs · press Ctrl K from anywhere to jump back here
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Try one of these</h2>
        <div className={styles.chipRow}>
          {chips.map((chip) => (
            <button key={chip} type="button" className={styles.chip} onClick={() => onPick(chip)}>
              {chip}
            </button>
          ))}
        </div>
      </div>

      <EmptyState
        icon="search"
        title="Search your library and the catalogue"
        message="Songs, albums, artists and playlists — results narrow as you type."
      />
    </div>
  )
}
