import { isTypingTarget, useHotkeys } from '@/hooks/useHotkeys'
import { usePlayerStore } from '@/player/playerStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'

/**
 * Global shortcuts (README → Keyboard).
 *
 * Space plays/pauses, Ctrl+←/→ skip, M mutes, ↑/↓ trim the volume, Escape
 * dismisses whatever is open. Typing fields are left alone, and so are focused
 * buttons and sliders so Space still activates them the way a desktop app should.
 */
export function useGlobalShortcuts(): void {
  useHotkeys(
    (event) => {
      const ui = useUiStore.getState()
      const settings = useSettingsStore.getState()
      const player = usePlayerStore.getState()
      const target = event.target as HTMLElement | null
      const interactive =
        target instanceof HTMLElement &&
        (target.tagName === 'BUTTON' || target.getAttribute('role') === 'slider' || target.getAttribute('role') === 'switch')
      // These listeners opt into firing inside inputs so Ctrl+arrow and M still
      // work while typing — but bare-key shortcuts must not, or Space is taken
      // as play/pause and swallowed before it ever reaches the field.
      const typing = isTypingTarget(target)

      const mod = event.ctrlKey || event.metaKey

      if (event.key === 'Escape') {
        if (ui.contextMenu) {
          ui.closeContextMenu()
          return
        }
        if (ui.searchOpen) {
          ui.closeSearch()
          return
        }
        if (ui.newPlaylistOpen) {
          ui.closeNewPlaylistDialog()
          return
        }
      }

      // Ctrl+K is owned by the search field itself.
      if (mod && event.key.toLowerCase() === 'k') return

      if (interactive) return

      if (event.code === 'Space' && !mod) {
        if (typing) return
        event.preventDefault()
        player.togglePlay()
        return
      }

      if (mod && event.key === 'ArrowRight') {
        event.preventDefault()
        player.next()
        return
      }

      if (mod && event.key === 'ArrowLeft') {
        event.preventDefault()
        player.previous()
        return
      }

      if (!mod && event.key.toLowerCase() === 'm') {
        if (typing) return
        settings.set('muted', !settings.muted)
        return
      }

      if (!mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (typing) return
        event.preventDefault()
        const delta = event.key === 'ArrowUp' ? 0.05 : -0.05
        const next = Math.max(0, Math.min(1, Number((settings.volume + delta).toFixed(2))))
        settings.set('volume', next)
        if (settings.muted && next > 0) settings.set('muted', false)
      }
    },
    { allowInInput: true },
  )
}
