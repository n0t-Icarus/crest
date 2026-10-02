import { readPersistedSettings, useSettingsStore, type CustomTheme, type Settings } from '@/store/settingsStore'

type AppearanceSettings = Pick<Settings, 'theme' | 'glow' | 'animations' | 'density'>

/** Every token the custom theme editor can paint. Rendered as inline vars on <html>. */
const CUSTOM_TOKEN_VARS = [
  '--canvas',
  '--panel',
  '--panel-raised',
  '--surface-1',
  '--surface-2',
  '--surface-3',
  '--control',
  '--overlay-rgb',
  '--line',
  '--line-strong',
  '--text-1',
  '--text-2',
  '--text-3',
  '--text-inverse',
  '--btn-solid',
  '--btn-ink',
  '--accent',
  '--glow-color',
] as const

export type CustomTokenId = (typeof CUSTOM_TOKEN_VARS)[number]

/** Maps a custom-theme token id to its CSS variable (currently 1:1). */
function tokenVar(token: CustomTokenId): string {
  return token
}

function applyCustomTheme(custom: CustomTheme | undefined): void {
  const root = document.documentElement
  for (const token of CUSTOM_TOKEN_VARS) {
    root.style.removeProperty(tokenVar(token))
  }
  if (!custom || !custom.enabled) return
  for (const [token, value] of Object.entries(custom.tokens)) {
    if (typeof value === 'string' && value) {
      root.style.setProperty(tokenVar(token as CustomTokenId), value)
    }
  }
}

export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.glow = settings.glow ? 'on' : 'off'
  root.dataset.animations = settings.animations ? 'on' : 'off'
  root.dataset.density = settings.density
  applyCustomTheme(useSettingsStore.getState().customTheme)
}

/**
 * Called before React mounts so the first frame already carries the user's
 * theme — no flash of default colours, no layout shift.
 */
export function bootstrapAppearance(): void {
  const persisted = readPersistedSettings()
  const root = document.documentElement
  root.dataset.theme = (persisted.theme as string) ?? 'noir'
  root.dataset.glow = persisted.glow === false ? 'off' : 'on'
  root.dataset.animations = persisted.animations === false ? 'off' : 'on'
  root.dataset.density = persisted.density ?? 'comfortable'
  applyCustomTheme(persisted.customTheme)
}

/** Keep :root attributes (and inline custom vars) in sync with the settings store. */
export function watchAppearance(): () => void {
  const initial = useSettingsStore.getState()
  applyAppearance(initial)
  return useSettingsStore.subscribe((state, previous) => {
    if (
      state.theme !== previous.theme ||
      state.glow !== previous.glow ||
      state.animations !== previous.animations ||
      state.density !== previous.density ||
      state.customTheme !== previous.customTheme
    ) {
      applyAppearance(state)
    }
  })
}
