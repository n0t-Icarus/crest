import { useEffect, useRef } from 'react'
import { navigate, useRoute } from '@/app/router'
import { useHotkeys } from '@/hooks/useHotkeys'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import { Icon } from '../ui/Icon'
import styles from './SearchField.module.css'

type Props = {
  className?: string
  /** Compact variant used by narrow layouts. */
  compact?: boolean
  placeholder?: string
}

/**
 * The reference's rounded search field. Ctrl+K focuses it from anywhere
 * (including while typing elsewhere), Escape clears or blurs, and typing routes
 * to the search view so results are always one keystroke away.
 */
export function SearchField({ className, compact = false, placeholder = 'Search songs, albums, artists, playlists…' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const query = useUiStore((state) => state.searchQuery)
  const setQuery = useUiStore((state) => state.setSearchQuery)
  const setSearchOpen = useUiStore((state) => state.openSearch)
  const closeSearch = useUiStore((state) => state.closeSearch)
  const route = useRoute()

  useHotkeys(
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
      setSearchOpen()
    },
    { allowInInput: true },
  )

  // Leaving the search view clears the query so the field never lies about
  // which results are on screen.
  useEffect(() => {
    if (route.name !== 'search') closeSearch()
  }, [route.name, closeSearch])

  const onChange = (value: string) => {
    setQuery(value)
    setSearchOpen()
    if (route.name !== 'search') navigate({ name: 'search' })
  }

  return (
    <div className={cn(styles.field, compact && styles.compact, className)} data-no-drag>
      <Icon name="search" size={16} className={styles.icon} />
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        className={styles.input}
        value={query}
        placeholder={placeholder}
        aria-label="Search songs, albums, artists and playlists"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setSearchOpen()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            if (query) setQuery('')
            else inputRef.current?.blur()
            closeSearch()
          }
        }}
      />
      {query ? (
        <button
          type="button"
          className={styles.clear}
          aria-label="Clear search"
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
        >
          <Icon name="close" size={13} />
        </button>
      ) : (
        <kbd className={styles.kbd} aria-hidden>
          Ctrl K
        </kbd>
      )}
    </div>
  )
}
