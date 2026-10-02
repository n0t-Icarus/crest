import { useState } from 'react'
import { navigate } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useLibraryStore } from '@/store/libraryStore'
import { toast, useUiStore } from '@/store/uiStore'
import styles from './CreatePlaylistDialog.module.css'

/** Create-playlist flow, shared by the sidebar "+" and the song context menu. */
export function CreatePlaylistDialog() {
  const open = useUiStore((state) => state.newPlaylistOpen)
  const stagedTrackIds = useUiStore((state) => state.newPlaylistTrackIds)
  const close = useUiStore((state) => state.closeNewPlaylistDialog)
  const [name, setName] = useState('')

  const create = () => {
    const trimmed = name.trim() || 'New playlist'
    const library = useLibraryStore.getState()
    const id = library.createPlaylist(trimmed)
    if (stagedTrackIds.length > 0) {
      library.addTracksToPlaylist(id, stagedTrackIds)
    }
    close()
    setName('')
    toast(
      stagedTrackIds.length > 0
        ? `Created “${trimmed}” with ${stagedTrackIds.length} song${stagedTrackIds.length === 1 ? '' : 's'}`
        : `Created “${trimmed}”`,
    )
    navigate({ name: 'playlist', id })
  }

  return (
    <Modal
      open={open}
      title="New playlist"
      description={
        stagedTrackIds.length > 0
          ? `${stagedTrackIds.length} song${stagedTrackIds.length === 1 ? '' : 's'} will be added.`
          : 'Give it a name — you can change it later.'
      }
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create}>
            Create playlist
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <label className={styles.label} htmlFor="crest-playlist-name">
          Playlist name
        </label>
        <input
          id="crest-playlist-name"
          data-autofocus
          className={styles.input}
          value={name}
          placeholder="My new playlist"
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
      </form>
    </Modal>
  )
}
