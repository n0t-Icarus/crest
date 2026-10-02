import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Application settings.
 *
 * Persisted today through the webview's localStorage adapter; Phase 9 swaps the
 * storage layer for the SQLite-backed settings table without touching call
 * sites, because everything goes through `useSettingsStore`.
 */

/** Legacy accent picker (kept so old persisted settings migrate cleanly). */
export type AccentId = 'violet' | 'azure' | 'teal' | 'amber' | 'rose' | 'mono'
/** Theme presets (Settings → Appearance). */
export type ThemeId = 'noir' | 'midnight' | 'glacier'
/** Registered MusicProvider ids (`services/providers`). */
export type ProviderId = 'mock' | 'synth' | 'yt'
export type Density = 'comfortable' | 'compact'
export type RepeatMode = 'off' | 'all' | 'one'

/**
 * Custom theme — the user's own colours, painted as CSS variables on <html>
 * (see app/appearance.ts). `tokens` values are any valid CSS colour; when
 * `enabled` is false the selected preset shows instead.
 */
export type CustomTheme = {
  enabled: boolean
  name: string
  /** Token id → CSS colour, e.g. `{ '--panel': '#0b0b0c' }`. */
  tokens: Record<string, string>
}

export type ShortcutMap = Record<string, string>

export type Settings = {
  /* Catalogue */
  providerId: ProviderId

  /* Appearance */
  accent: AccentId
  theme: ThemeId
  glow: boolean
  customTheme: CustomTheme
  animations: boolean
  density: Density

  /* Layout (user intent; narrow windows still auto-collapse) */
  queuePanel: boolean
  sidebarCollapsed: boolean
  sidebarWidth: number
  queueWidth: number

  /* Playback */
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  playbackSpeed: number
  autoplay: boolean
  crossfadeSec: number
  gapless: boolean
  normalizeVolume: boolean
  skipSilence: boolean

  /* Windows integration */
  minimizeToTray: boolean
  closeToTray: boolean
  startWithWindows: boolean
  notifications: boolean
  discordRpc: boolean

  /* Storage */
  cacheLocation: string
  cacheLimitMb: number

  /* Keyboard */
  shortcuts: ShortcutMap

  /* Developer */
  devOverlay: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  providerId: 'yt',
  accent: 'violet',
  theme: 'noir',
  glow: true,
  customTheme: { enabled: false, name: 'My theme', tokens: {} },
  animations: true,
  density: 'comfortable',

  queuePanel: true,
  sidebarCollapsed: false,
  sidebarWidth: 232,
  queueWidth: 292,

  volume: 0.72,
  muted: false,
  shuffle: false,
  repeat: 'off',
  playbackSpeed: 1,
  autoplay: true,
  crossfadeSec: 0,
  gapless: false,
  normalizeVolume: false,
  skipSilence: false,

  minimizeToTray: true,
  closeToTray: false,
  startWithWindows: false,
  notifications: true,
  discordRpc: false,

  cacheLocation: '%APPDATA%\\Crest\\cache',
  cacheLimitMb: 2048,

  shortcuts: {
    search: 'Ctrl K',
    playPause: 'Space',
    next: 'Ctrl →',
    previous: 'Ctrl ←',
    mute: 'M',
    volumeUp: '↑',
    volumeDown: '↓',
    dismiss: 'Esc',
  },

  devOverlay: false,
}

type SettingsActions = {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  patch: (values: Partial<Settings>) => void
  reset: () => void
}

export type SettingsStore = Settings & SettingsActions

export const SETTINGS_STORAGE_KEY = 'crest.settings'
const LEGACY_SETTINGS_STORAGE_KEY = 'velune.settings'

// Migrate from legacy storage key if needed
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(SETTINGS_STORAGE_KEY)) {
    const legacy = localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY)
    if (legacy) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, legacy)
    }
  }
} catch {
  /* storage access failed */
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      patch: (values) => set(values),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        const state = { ...(persistedState || {}) } as Partial<Settings>
        if (!state.providerId || state.providerId === 'synth' || state.providerId === 'mock') {
          state.providerId = 'yt'
        }
        // v2 → v3: the accent picker became theme presets. The monochrome
        // accent maps to the new default (noir); everything else keeps its
        // look via the midnight preset.
        if (version < 3 && !state.theme) {
          state.theme = state.accent === 'mono' ? 'noir' : 'midnight'
        }
        if (typeof state.glow !== 'boolean') state.glow = true
        if (!state.customTheme || typeof state.customTheme !== 'object') {
          state.customTheme = { enabled: false, name: 'My theme', tokens: {} }
        }
        return state
      },
      storage: createJSONStorage(() => localStorage),
      // Actions are not state; only persist data.
      partialize: (state) => {
        const { set: _set, patch: _patch, reset: _reset, ...data } = state
        return data
      },
    },
  ),
)

/** Read persisted settings without subscribing (used before React mounts). */
export function readPersistedSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { providerId: 'yt' }
    const parsed = JSON.parse(raw) as { version?: number; state?: Partial<Settings> }
    const state = parsed.state ?? {}
    if (!state.providerId || state.providerId === 'synth' || state.providerId === 'mock') {
      state.providerId = 'yt'
    }
    // Mirror the store's v2 → v3 migration so the pre-React bootstrap paints
    // the right theme even before zustand hydrates.
    if (!state.theme) {
      state.theme = parsed.version !== undefined && parsed.version < 3 && state.accent === 'mono' ? 'noir' : 'midnight'
    }
    if (typeof state.glow !== 'boolean') state.glow = true
    if (!state.customTheme || typeof state.customTheme !== 'object') {
      state.customTheme = { enabled: false, name: 'My theme', tokens: {} }
    }
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...parsed, version: 3, state }))
    } catch {
      /* storage write failure ignored */
    }
    return state
  } catch {
    return { providerId: 'yt' }
  }
}
