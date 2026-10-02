import { navigate } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Icon } from '@/components/ui/Icon'
import type { Album, Artist, Playlist } from '@/services/providers/types'
import { cn } from '@/utils/cn'
import styles from './music.module.css'

type Props =
  | { kind: 'playlist'; playlist: Playlist; onPlay?: () => void; className?: string }
  | { kind: 'album'; album: Album; onPlay?: () => void; className?: string }
  | { kind: 'artist'; artist: Artist; onPlay?: () => void; className?: string }

/**
 * Square collection card — same silhouette as track cards, one line of meta.
 *
 * The artwork and the title both open the collection (that is what a click on a
 * card means everywhere else in the reference), while the subtitle stays the
 * artist link and the hover play button starts playback.
 */
function describePlaylist(playlist: Playlist): string {
  if (playlist.trackIds.length > 0) {
    return `${playlist.trackIds.length} song${playlist.trackIds.length === 1 ? '' : 's'}`
  }
  if (playlist.trackCount && playlist.trackCount > 0) {
    return `${playlist.trackCount} song${playlist.trackCount === 1 ? '' : 's'}`
  }
  const description = playlist.description?.trim()
  if (description) return description
  return playlist.owner || 'Playlist'
}

export function CollectionCard(props: Props) {
  const { kind, onPlay, className } = props
  const title = kind === 'playlist' ? props.playlist.name : kind === 'album' ? props.album.title : props.artist.name
  // Shelf playlists arrive without a track list, so `trackIds.length` would
  // read "0 songs". Prefer a real count, then the description YouTube supplies
  // (usually the artist names), and only fall back to a count we actually have.
  const subtitle =
    kind === 'playlist'
      ? describePlaylist(props.playlist)
      : kind === 'album'
        ? props.album.artistName
        : 'Artist'
  const source = kind === 'playlist' ? props.playlist.artwork : kind === 'album' ? props.album.artwork : props.artist.artwork
  const seed = kind === 'playlist' ? props.playlist.id : kind === 'album' ? props.album.id : props.artist.id

  const open = () => {
    if (kind === 'playlist') navigate({ name: 'playlist', id: props.playlist.id })
    else if (kind === 'album') navigate({ name: 'album', id: props.album.id })
    else navigate({ name: 'artist', id: props.artist.id })
  }

  return (
    <article className={cn(styles.mediaCard, styles.collectionCard, className)}>
      <div className={styles.mediaArtWrap}>
        <button type="button" className={styles.mediaOpen} aria-label={`Open ${title}`} onClick={open}>
          <Artwork
            source={source}
            seed={seed}
            alt={`${title} artwork`}
            radius={kind === 'artist' ? 'circle' : 'md'}
            className={styles.mediaArt}
          />
        </button>
        {onPlay ? (
          <button type="button" className={styles.mediaPlay} aria-label={`Play ${title}`} onClick={onPlay}>
            <Icon name="play" size={16} />
          </button>
        ) : null}
      </div>
      <div className={styles.mediaMeta}>
        <button type="button" className={styles.mediaTitle} title={title} onClick={open}>
          {title}
        </button>
      </div>
      <button
        type="button"
        className={styles.mediaArtist}
        onClick={() => {
          if (kind === 'album') navigate({ name: 'artist', id: props.album.artistId })
          else open()
        }}
      >
        {subtitle}
      </button>
    </article>
  )
}
