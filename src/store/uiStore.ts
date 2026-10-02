import { create } from 'zustand'
import type { IconName } from '@/components/ui/Icon'

/**
 * Ephemeral UI state (never persisted): overlays, the shared context menu and
 * toast notifications. Keeping this separate from the player and library stores
 * means opening a menu can never re-render a list of 5,000 rows.
 */

export type MenuItem =
  | {
      kind: 'item'
      id: string
      label: string
      icon?: IconName
      shortcut?: string
      disabled?: boolean
      /** Shown as a hint next to a disabled item, e.g. why it is unavailable. */
      note?: string
      danger?: boolean
      onSelect?: () => void
      submenu?: MenuItem[]
    }
  | { kind: 'separator'; id: string }

export type MenuItemEntry = Extract<MenuItem, { kind: 'item' }>

export type ToastTone = 'neutral' | 'error' | 'success'

export type Toast = {
  id: string
  message: string
  tone: ToastTone
  actionLabel?: string
  onAction?: () => void
  durationMs: number
}

export type ContextMenuState = {
  x: number
  y: number
  items: MenuItem[]
  /** Element that opened the menu, so focus can be restored on close. */
  returnFocusTo?: HTMLElement | null
}

type UiState = {
  searchOpen: boolean
  searchQuery: string
  contextMenu: ContextMenuState | null
  toasts: Toast[]
  /** Compact always-visible player instead of the full bar. */
  miniPlayer: boolean
  /** Settings section requested by a deep link. */
  settingsSection: string | null
  /** "New playlist" dialog state; tracks are staged until the dialog commits. */
  newPlaylistOpen: boolean
  newPlaylistTrackIds: string[]

  openSearch: (query?: string) => void
  closeSearch: () => void
  setSearchQuery: (query: string) => void
  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
  pushToast: (toast: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => string
  dismissToast: (id: string) => void
  setMiniPlayer: (value: boolean) => void
  toggleMiniPlayer: () => void
  openSettingsSection: (section: string) => void
  openNewPlaylistDialog: (trackIds?: string[]) => void
  closeNewPlaylistDialog: () => void
}

let toastCounter = 0

export const useUiStore = create<UiState>()((set) => ({
  searchOpen: false,
  searchQuery: '',
  contextMenu: null,
  toasts: [],
  miniPlayer: false,
  settingsSection: null,
  newPlaylistOpen: false,
  newPlaylistTrackIds: [],

  openSearch: (query) => set((state) => ({ searchOpen: true, searchQuery: query ?? state.searchQuery })),
  closeSearch: () => set({ searchOpen: false }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  openContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set({ contextMenu: null }),

  pushToast: (toast) => {
    toastCounter += 1
    const id = `toast-${toastCounter}`
    const entry: Toast = { id, durationMs: 6000, ...toast }
    set((state) => ({ toasts: [...state.toasts, entry] }))
    return id
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  setMiniPlayer: (value) => set({ miniPlayer: value }),
  toggleMiniPlayer: () => set((state) => ({ miniPlayer: !state.miniPlayer })),

  openSettingsSection: (section) => set({ settingsSection: section }),

  openNewPlaylistDialog: (trackIds = []) => set({ newPlaylistOpen: true, newPlaylistTrackIds: trackIds }),
  closeNewPlaylistDialog: () => set({ newPlaylistOpen: false, newPlaylistTrackIds: [] }),
}))

/** Convenience for non-component code. */
export function toast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}): string {
  return useUiStore.getState().pushToast({ message, tone: options.tone ?? 'neutral', ...options })
}

export function openMenu(menu: ContextMenuState): void {
  useUiStore.getState().openContextMenu(menu)
}
