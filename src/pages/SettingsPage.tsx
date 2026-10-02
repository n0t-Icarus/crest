import { useEffect, useState } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Slider } from '@/components/ui/Slider'
import { WEB_PIPELINE_CAPABILITIES, describeAudioFeatures } from '@/audio/audioFeatures'
import { playerController } from '@/player/playerStore'
import { useSettingsStore, type Density, type ProviderId, type RepeatMode, type ThemeId } from '@/store/settingsStore'
import { useLibraryStore } from '@/store/libraryStore'
import { usePlayerStore } from '@/player/playerStore'
import { getProvider, listProviders, setActiveProvider } from '@/services/providers'
import { clearSearchCache } from '@/search/useSearch'
import { getAppInfo, type AppInfo } from '@/windows/tauri'
import { toast, useUiStore } from '@/store/uiStore'
import { ColorSwatch, SettingRow, SettingsSection, Segmented, Select, Toggle } from '@/settings/SettingsControls'
import styles from '@/settings/settings.module.css'

type SectionId =
  | 'appearance'
  | 'playback'
  | 'audio'
  | 'region'
  | 'downloads'
  | 'library'
  | 'notifications'
  | 'keyboard'
  | 'privacy'
  | 'advanced'
  | 'about'

const SECTIONS: Array<{ id: SectionId; label: string; icon: IconName }> = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'playback', label: 'Playback', icon: 'play' },
  { id: 'audio', label: 'Audio', icon: 'equalizer' },
  { id: 'region', label: 'Country', icon: 'home' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'keyboard', label: 'Keyboard', icon: 'keyboard' },
  { id: 'privacy', label: 'Privacy', icon: 'shield' },
  { id: 'advanced', label: 'Advanced', icon: 'gear' },
  { id: 'about', label: 'About', icon: 'info' },
]

/**
 * Every market the home feed can be localized to.
 *
 * Kept in the app rather than fetched: the picker must render immediately, and
 * the country list is a product decision, not something YouTube serves.
 */
const REGION_OPTIONS = [
  ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'],
  ['NZ', 'New Zealand'], ['IE', 'Ireland'], ['IN', 'India'], ['PK', 'Pakistan'],
  ['BD', 'Bangladesh'], ['LK', 'Sri Lanka'], ['NP', 'Nepal'], ['AE', 'United Arab Emirates'],
  ['SA', 'Saudi Arabia'], ['EG', 'Egypt'], ['MA', 'Morocco'], ['DZ', 'Algeria'],
  ['NG', 'Nigeria'], ['GH', 'Ghana'], ['KE', 'Kenya'], ['ZA', 'South Africa'],
  ['DE', 'Germany'], ['AT', 'Austria'], ['CH', 'Switzerland'], ['FR', 'France'],
  ['BE', 'Belgium'], ['NL', 'Netherlands'], ['ES', 'Spain'], ['PT', 'Portugal'],
  ['BR', 'Brazil'], ['IT', 'Italy'], ['SE', 'Sweden'], ['NO', 'Norway'],
  ['DK', 'Denmark'], ['FI', 'Finland'], ['IS', 'Iceland'], ['PL', 'Poland'],
  ['CZ', 'Czechia'], ['SK', 'Slovakia'], ['HU', 'Hungary'], ['RO', 'Romania'],
  ['GR', 'Greece'], ['TR', 'Türkiye'], ['UA', 'Ukraine'], ['RU', 'Russia'],
  ['IL', 'Israel'], ['KR', 'South Korea'], ['JP', 'Japan'], ['CN', 'China'],
  ['TW', 'Taiwan'], ['HK', 'Hong Kong'], ['TH', 'Thailand'], ['VN', 'Vietnam'],
  ['ID', 'Indonesia'], ['MY', 'Malaysia'], ['SG', 'Singapore'], ['PH', 'Philippines'],
  ['MX', 'Mexico'], ['AR', 'Argentina'], ['CO', 'Colombia'], ['CL', 'Chile'],
  ['PE', 'Peru'],
] as const

const THEME_PRESETS: Array<{ id: ThemeId; label: string; description: string; preview: [string, string, string] }> = [
  { id: 'noir', label: 'Noir', description: 'Black & white with glow — the default.', preview: ['#060607', '#f4f4f5', '#0b0b0c'] },
  { id: 'midnight', label: 'Midnight', description: 'Deep blue studio with a violet accent.', preview: ['#07080c', '#7c6cf2', '#04050a'] },
  { id: 'glacier', label: 'Glacier', description: 'Daylight — white panels, dark ink.', preview: ['#f7f8fa', '#131418', '#e6e8ec'] },
]

/** One entry per paintable token in the custom theme editor. */
const CUSTOM_TOKENS: Array<{ id: string; label: string; group: string }> = [
  { id: '--canvas', label: 'Canvas (background behind panels)', group: 'Frames' },
  { id: '--panel', label: 'Panels (sidebar, content, queue)', group: 'Frames' },
  { id: '--panel-raised', label: 'Raised panel', group: 'Frames' },
  { id: '--line', label: 'Borders', group: 'Frames' },
  { id: '--line-strong', label: 'Borders (strong)', group: 'Frames' },
  { id: '--surface-1', label: 'Cards', group: 'Surfaces' },
  { id: '--surface-2', label: 'Selected / chips', group: 'Surfaces' },
  { id: '--surface-3', label: 'Inputs', group: 'Surfaces' },
  { id: '--control', label: 'Dropdowns', group: 'Surfaces' },
  { id: '--overlay-rgb', label: 'Hover tint (r, g, b)', group: 'Surfaces' },
  { id: '--text-1', label: 'Primary text', group: 'Text' },
  { id: '--text-2', label: 'Secondary text', group: 'Text' },
  { id: '--text-3', label: 'Muted text', group: 'Text' },
  { id: '--text-inverse', label: 'Inverse text', group: 'Text' },
  { id: '--btn-solid', label: 'Solid buttons (play)', group: 'Buttons & accent' },
  { id: '--btn-ink', label: 'Button icon/text', group: 'Buttons & accent' },
  { id: '--accent', label: 'Accent (highlights, toggles)', group: 'Buttons & accent' },
  { id: '--glow-color', label: 'Glow color', group: 'Buttons & accent' },
]

const DEFAULT_CUSTOM_COLORS: Record<string, string> = Object.fromEntries(
  CUSTOM_TOKENS.map((token) => [token.id, token.id === '--overlay-rgb' ? '255, 255, 255' : '#000000']),
)

function hexToRgb(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return ''
  const value = Number.parseInt(match[1], 16)
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`
}

const PLANNED = 'Planned'

/**
 * Settings.
 *
 * Every control either works today or says exactly why it does not — no switch
 * is decorative. Sections marked "Planned" are wired to the phase that adds the
 * underlying capability (see README → Roadmap).
 */
export function SettingsPage({ section }: { section?: string }) {
  const initial = SECTIONS.find((item) => item.id === section)?.id ?? 'appearance'
  const [active, setActive] = useState<SectionId>(initial)

  useEffect(() => {
    if (section && SECTIONS.some((item) => item.id === section)) setActive(section as SectionId)
  }, [section])

  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Settings sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.navItem}
            data-active={active === item.id || undefined}
            aria-current={active === item.id ? 'true' : undefined}
            onClick={() => setActive(item.id)}
          >
            <Icon name={item.icon} size={15} className={styles.navIcon} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {active === 'appearance' ? <AppearanceSection /> : null}
        {active === 'playback' ? <PlaybackSection /> : null}
        {active === 'region' ? <RegionSection /> : null}
        {active === 'audio' ? <AudioSection /> : null}
        {active === 'downloads' ? <DownloadsSection /> : null}
        {active === 'library' ? <LibrarySection /> : null}
        {active === 'notifications' ? <NotificationsSection /> : null}
        {active === 'keyboard' ? <KeyboardSection /> : null}
        {active === 'privacy' ? <PrivacySection /> : null}
        {active === 'advanced' ? <AdvancedSection /> : null}
        {active === 'about' ? <AboutSection /> : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function AppearanceSection() {
  const settings = useSettingsStore()
  const custom = settings.customTheme
  const [editorOpen, setEditorOpen] = useState(false)

  const setCustomTokens = (values: Record<string, string>) => {
    settings.set('customTheme', { ...custom, tokens: { ...custom.tokens, ...values } })
  }

  const editColor = (token: string, value: string) => {
    const next = token === '--overlay-rgb' ? value : value.toLowerCase()
    setCustomTokens({ [token]: next })
  }

  const activeCount = Object.keys(custom.tokens).length

  return (
    <SettingsSection id="appearance" title="Appearance" description="Theme, glow and your own custom colours. Changes apply immediately and persist.">
      <SettingRow
        label="Theme"
        description="Noir is the black & white look with glow on white; Glacier is the light variant."
        stacked
        control={
          <div className={styles.themeRow}>
            {THEME_PRESETS.map((preset) => {
              const active = !custom.enabled && settings.theme === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={styles.themeBtn}
                  data-active={active || undefined}
                  title={preset.description}
                  aria-pressed={active}
                  onClick={() => {
                    settings.set('theme', preset.id)
                    if (custom.enabled) settings.set('customTheme', { ...custom, enabled: false })
                  }}
                >
                  <span className={styles.themePreview} style={{ background: preset.preview[2] }}>
                    <span style={{ background: preset.preview[0] }} />
                    <span style={{ background: preset.preview[1] }} />
                  </span>
                  {preset.label}
                  {active ? <span className={styles.themeActiveTag}>Active</span> : null}
                </button>
              )
            })}
          </div>
        }
      />
      <SettingRow
        label="Glow"
        description="Soft halo around white buttons, the play button and accents. Turn off for crisp edges."
        control={<Toggle label="Glow" checked={settings.glow} onChange={(value) => settings.set('glow', value)} />}
      />
      <SettingRow
        label="Custom theme"
        description={
          custom.enabled
            ? `“${custom.name}” is active — every colour below overrides the preset.${activeCount > 0 ? ` ${activeCount} colour${activeCount === 1 ? '' : 's'} changed.` : ''}`
            : 'Paint any part of the interface yourself: panels, text, buttons, glow, accent.'
        }
        control={
          <Toggle
            label="Custom theme"
            checked={custom.enabled}
            onChange={(value) => settings.set('customTheme', { ...custom, enabled: value })}
          />
        }
      />
      {custom.enabled ? (
        <div className={styles.customThemeBlock}>
          <div className={styles.customThemeHead}>
            <input
              className={styles.customThemeName}
              value={custom.name}
              maxLength={40}
              aria-label="Theme name"
              placeholder="My theme"
              spellCheck={false}
              onChange={(event) => settings.set('customTheme', { ...custom, name: event.target.value })}
            />
            <button
              type="button"
              className={styles.textAction}
              onClick={() => setEditorOpen((open) => !open)}
            >
              {editorOpen ? 'Hide colours' : 'Edit colours'}
            </button>
            <button
              type="button"
              className={styles.textAction}
              disabled={activeCount === 0}
              onClick={() => settings.set('customTheme', { ...custom, tokens: {} })}
            >
              Reset to preset
            </button>
          </div>
          {editorOpen ? (
            <div className={styles.tokenGrid}>
              {CUSTOM_TOKENS.map((token) => {
                const isRgb = token.id === '--overlay-rgb'
                const value = custom.tokens[token.id] ?? DEFAULT_CUSTOM_COLORS[token.id]!
                return (
                  <div key={token.id} className={styles.tokenCell} title={token.group}>
                    {isRgb ? (
                      <span className={styles.rgbValue}>{value || '—'}</span>
                    ) : (
                      <ColorSwatch value={value} label={token.label} onChange={(next) => editColor(token.id, next)} />
                    )}
                    <span className={styles.tokenLabel}>{token.label}</span>
                  </div>
                )
              })}
              <p className={styles.tokenHint}>
                Tip: set “Hover tint” to match your text colour — use the picker on any colour and copy its RGB values, e.g.{' '}
                {hexToRgb(custom.tokens['--text-1'] ?? '#f5f5f6') || '245, 245, 246'} for the current primary text.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <SettingRow
        label="Animations"
        description="Fades, slides and hover elevation. Turn off for the lowest possible GPU use."
        control={<Toggle label="Animations" checked={settings.animations} onChange={(value) => settings.set('animations', value)} />}
      />
      <SettingRow
        label="Density"
        description="Compact tightens row height, player height and panel padding."
        control={
          <Segmented<Density>
            label="Density"
            value={settings.density}
            onChange={(value) => settings.set('density', value)}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        }
      />
    </SettingsSection>
  )
}

/**
 * Which country's music Home should surface.
 *
 * This shapes the editorial feed and its language — it is not a VPN. YouTube
 * still sees the real network, so chart positions can lean toward wherever the
 * machine actually is, but the shelves, headlines and mood rows are the
 * selected market's. Search stays global on purpose: any song can still be
 * found by name.
 */
function RegionSection() {
  const settings = useSettingsStore()
  const [preview, setPreview] = useState<string | null>(null)

  const options = [
    { value: '', label: 'Automatic (my location)' },
    ...REGION_OPTIONS.map(([code, name]) => ({ value: code, label: name })),
  ]
  const selected = options.find((option) => option.value === settings.region) ?? options[0]

  return (
    <SettingsSection
      id="region"
      title="Country"
      description="Shapes which music Home shows. Search always stays global, so you can still look up anything."
    >
      <SettingRow
        label="Music region"
        description="Your home feed, mood chips and shelf titles come from this market."
        control={
          <Select
            label="Music region"
            value={settings.region}
            onChange={(value) => {
              settings.set('region', value)
              setPreview(value)
            }}
            options={options}
          />
        }
      />
      <SettingRow
        label="Current market"
        description={preview ?? (settings.region ? selected.label : 'Automatic — YouTube decides from your network.')}
        control={<span className={styles.kbd}>{settings.region || 'Auto'}</span>}
      />
      <SettingRow
        label="Search"
        description="Search is never restricted by region — any song, album or artist can be looked up by name."
        control={<span className={styles.kbd}>Global</span>}
      />
    </SettingsSection>
  )
}

function PlaybackSection() {
  const settings = useSettingsStore()
  const features = describeAudioFeatures(playerController.capabilities ?? WEB_PIPELINE_CAPABILITIES)
  const featureMap = new Map(features.map((feature) => [feature.id, feature]))
  const crossfade = featureMap.get('crossfade')
  const gapless = featureMap.get('gapless')
  const skipSilence = featureMap.get('skipSilence')

  return (
    <SettingsSection id="playback" title="Playback" description="How the queue behaves, and which audio features the current engine can honour.">
      <SettingRow
        label="Autoplay"
        description="When the queue ends, keep going with tracks similar to the last one."
        control={<Toggle label="Autoplay" checked={settings.autoplay} onChange={(value) => settings.set('autoplay', value)} />}
      />
      <SettingRow
        label="Shuffle"
        description="Shuffles the current queue; turning it off restores the original order."
        control={<Toggle label="Shuffle" checked={settings.shuffle} onChange={(value) => settings.set('shuffle', value)} />}
      />
      <SettingRow
        label="Repeat"
        description="Repeat off, the whole queue, or the current track."
        control={
          <Select
            label="Repeat mode"
            value={settings.repeat}
            onChange={(value) => settings.set('repeat', value as RepeatMode)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'all', label: 'Repeat queue' },
              { value: 'one', label: 'Repeat track' },
            ]}
          />
        }
      />
      <SettingRow
        label="Playback speed"
        description="Applies to real audio as soon as a provider supplies streams."
        control={
          <div className={styles.sliderWrap}>
            <Slider
              label="Playback speed"
              value={(settings.playbackSpeed - 0.5) / 1.5}
              valueText={`${settings.playbackSpeed.toFixed(2)} times`}
              onChange={(value) => settings.set('playbackSpeed', Number((0.5 + value * 1.5).toFixed(2)))}
            />
            <span className={styles.sliderValue}>{settings.playbackSpeed.toFixed(2)}×</span>
          </div>
        }
      />
      <SettingRow
        label="Crossfade"
        description="Overlap the end of one track with the start of the next."
        note={crossfade?.status === 'available' ? undefined : PLANNED}
        disabled={crossfade?.status !== 'available'}
        control={
          <Select
            label="Crossfade duration"
            value={String(settings.crossfadeSec)}
            disabled={crossfade?.status !== 'available'}
            onChange={(value) => settings.set('crossfadeSec', Number(value))}
            options={[
              { value: '0', label: 'Off' },
              { value: '3', label: '3 seconds' },
              { value: '6', label: '6 seconds' },
              { value: '10', label: '10 seconds' },
            ]}
          />
        }
      />
      <SettingRow
        label="Gapless playback"
        description="Chain tracks that run into each other without a gap."
        note={gapless?.status === 'available' ? undefined : PLANNED}
        disabled={gapless?.status !== 'available'}
        control={<Toggle label="Gapless playback" checked={settings.gapless} disabled onChange={() => undefined} />}
      />
      <SettingRow
        label="Skip silence"
        description="Automatically jump long silent intros and outros."
        note={skipSilence?.status === 'available' ? undefined : PLANNED}
        disabled
        control={<Toggle label="Skip silence" checked={settings.skipSilence} disabled onChange={() => undefined} />}
      />
      <SettingRow
        label="Normalise volume"
        description="Replaygain-style loudness levelling between tracks."
        note={PLANNED}
        disabled
        control={<Toggle label="Normalise volume" checked={settings.normalizeVolume} disabled onChange={() => undefined} />}
      />
    </SettingsSection>
  )
}

function AudioSection() {
  const settings = useSettingsStore()
  // Live from the store: which transport is actually running right now.
  const isSimulated = usePlayerStore((state) => state.loadedOnce ? state.isSimulated : true)
  const features = describeAudioFeatures(playerController.capabilities ?? WEB_PIPELINE_CAPABILITIES)
  const equalizer = features.find((feature) => feature.id === 'equalizer')

  return (
    <SettingsSection id="audio" title="Audio" description="Output, level and processing. Crest uses the Windows default device until the native engine lands.">
      <SettingRow
        label="Output device"
        description="System default is used for now; per-device selection needs the native audio host."
        note={PLANNED}
        disabled
        control={
          <Select
            label="Output device"
            value="default"
            disabled
            onChange={() => undefined}
            options={[{ value: 'default', label: 'Windows default' }]}
          />
        }
      />
      <SettingRow
        label="Volume"
        description="Applies to real playback; it is remembered between sessions."
        control={
          <div className={styles.sliderWrap}>
            <Slider
              label="Volume"
              value={settings.muted ? 0 : settings.volume}
              valueText={`${Math.round((settings.muted ? 0 : settings.volume) * 100)} percent`}
              onChange={(value) => {
                settings.set('volume', value)
                if (settings.muted && value > 0) settings.set('muted', false)
              }}
            />
            <span className={styles.sliderValue}>{Math.round((settings.muted ? 0 : settings.volume) * 100)}%</span>
          </div>
        }
      />
      <SettingRow
        label="Equalizer"
        description="Ten-band EQ with presets, applied in the audio graph."
        note={equalizer?.status === 'available' ? undefined : PLANNED}
        disabled
        control={
          <Select
            label="Equalizer preset"
            value="flat"
            disabled
            onChange={() => undefined}
            options={[{ value: 'flat', label: 'Flat (off)' }]}
          />
        }
      />
      <SettingRow
        label="Playback pipeline"
        description={
          isSimulated
            ? 'The transport runs on a simulated clock — the active source has no audio to hand out.'
            : 'Real audio is playing through the webview media pipeline.'
        }
        control={<span className={styles.kbd}>{isSimulated ? 'Simulated' : 'Web audio'}</span>}
      />
    </SettingsSection>
  )
}

function DownloadsSection() {
  const settings = useSettingsStore()
  return (
    <SettingsSection
      id="downloads"
      title="Downloads"
      description="Crest has no cache to manage until the storage layer lands in Phase 9 — these controls are shown, disabled, and honest about it."
    >
      <SettingRow
        label="Download location"
        description="Where cached artwork and pinned downloads will live."
        control={<span className={styles.kbd}>{settings.cacheLocation}</span>}
      />
      <SettingRow
        label="Cache size limit"
        description="Crest will never grow past this; least-recently-used entries are evicted first."
        note={PLANNED}
        disabled
        control={
          <Select
            label="Cache limit"
            value={String(settings.cacheLimitMb)}
            disabled
            onChange={() => undefined}
            options={[
              { value: '512', label: '512 MB' },
              { value: '1024', label: '1 GB' },
              { value: '2048', label: '2 GB' },
              { value: '4096', label: '4 GB' },
            ]}
          />
        }
      />
      <SettingRow
        label="Current usage"
        description="Nothing cached yet."
        control={<span className={styles.kbd}>0 MB</span>}
      />
      <SettingRow
        label="Clear cache"
        description="Removes cached artwork and downloads."
        note={PLANNED}
        disabled
        control={
          <button type="button" className={styles.danger} disabled>
            Clear cache
          </button>
        }
      />
    </SettingsSection>
  )
}

function LibrarySection() {
  const likedCount = useLibraryStore((state) => state.likedTrackIds.length)
  const playlistCount = useLibraryStore((state) => state.playlists.length)
  const historyCount = useLibraryStore((state) => state.history.length)
  const resetLibrary = useLibraryStore((state) => state.resetLibrary)
  const clearHistory = useLibraryStore((state) => state.clearHistory)
  const clearUpcoming = usePlayerStore((state) => state.clearUpcoming)

  return (
    <SettingsSection id="library" title="Library" description="Your likes, playlists and history live on this machine only.">
      <SettingRow
        label="Library contents"
        description={`${likedCount} liked songs · ${playlistCount} playlists · ${historyCount} played tracks`}
        control={<span className={styles.kbd}>Local</span>}
      />
      <SettingRow
        label="Clear play history"
        description="Removes every recorded play. Likes and playlists stay."
        control={
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              clearHistory()
              toast('Play history cleared')
            }}
          >
            Clear history
          </button>
        }
      />
      <SettingRow
        label="Clear the queue"
        description="Keeps the current track and drops everything after it."
        control={
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              clearUpcoming()
              toast('Queue cleared')
            }}
          >
            Clear queue
          </button>
        }
      />
      <SettingRow
        label="Reset library to demo data"
        description="Restores the bundled demo playlists and likes. Useful while the catalogue is mock data."
        control={
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              resetLibrary()
              toast('Library reset to demo data')
            }}
          >
            Reset library
          </button>
        }
      />
    </SettingsSection>
  )
}

function NotificationsSection() {
  const settings = useSettingsStore()
  return (
    <SettingsSection id="notifications" title="Notifications" description="Windows toasts and presence. Nothing leaves your machine without asking.">
      <SettingRow
        label="Track change notifications"
        description="A Windows toast when a new track starts while Crest is in the background."
        note={PLANNED}
        disabled
        control={<Toggle label="Track change notifications" checked={settings.notifications} disabled onChange={() => undefined} />}
      />
      <SettingRow
        label="Discord Rich Presence"
        description="Shows the current track on your Discord profile. Optional and off until the integration ships."
        note={PLANNED}
        disabled
        control={<Toggle label="Discord Rich Presence" checked={settings.discordRpc} disabled onChange={() => undefined} />}
      />
      <SettingRow
        label="Start with Windows"
        description="Launches Crest minimised to the tray at sign-in."
        note={PLANNED}
        disabled
        control={<Toggle label="Start with Windows" checked={settings.startWithWindows} disabled onChange={() => undefined} />}
      />
      <SettingRow
        label="Minimise to tray"
        description="Closing the window keeps the player running in the system tray."
        note={PLANNED}
        disabled
        control={<Toggle label="Minimise to tray" checked={settings.minimizeToTray} disabled onChange={() => undefined} />}
      />
    </SettingsSection>
  )
}

function KeyboardSection() {
  const shortcuts = useSettingsStore((state) => state.shortcuts)
  return (
    <SettingsSection
      id="keyboard"
      title="Keyboard"
      description="Shortcuts work right now; rebinding and system-wide hotkeys arrive with the global-shortcut plugin in Phase 8."
    >
      {Object.entries(shortcuts).map(([key, value]) => (
        <SettingRow
          key={key}
          label={LABELS[key] ?? key}
          control={<kbd className={styles.kbd}>{value}</kbd>}
        />
      ))}
    </SettingsSection>
  )
}

const LABELS: Record<string, string> = {
  search: 'Focus search',
  playPause: 'Play / pause',
  next: 'Next track',
  previous: 'Previous track',
  mute: 'Mute',
  volumeUp: 'Volume up',
  volumeDown: 'Volume down',
  dismiss: 'Dismiss overlays',
}

function PrivacySection() {
  return (
    <SettingsSection id="privacy" title="Privacy" description="Crest is a local desktop application, designed to keep it that way.">
      <SettingRow label="Telemetry" description="None. There is no analytics SDK in this build and no crash reporting." control={<span className={styles.kbd}>Off</span>} />
      <SettingRow
        label="Account"
        description="No sign-in is required or supported; your library lives in local storage on this machine."
        control={<span className={styles.kbd}>Not required</span>}
      />
      <SettingRow
        label="Network"
        description="The demo catalogue is fully offline. When a network provider is added, only catalogue and artwork requests leave the app."
        control={<span className={styles.kbd}>Catalogue only</span>}
      />
      <SettingRow
        label="Clear search cache"
        description="Drops cached search results and resolved artwork."
        control={
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              clearSearchCache()
              toast('Search cache cleared')
            }}
          >
            Clear cache
          </button>
        }
      />
    </SettingsSection>
  )
}

function AdvancedSection() {
  const settings = useSettingsStore()
  const miniPlayer = useUiStore((state) => state.miniPlayer)
  const setMiniPlayer = useUiStore((state) => state.setMiniPlayer)
  // Bumped when the source changes: the provider registry is module state, so
  // this forces the diagnostics block below to re-read it.
  const [sourceVersion, setSourceVersion] = useState(0)
  const provider = getProvider()

  return (
    <SettingsSection
      id="advanced"
      title="Advanced"
      description="Diagnostics and the active data provider. Swapping backends never requires UI changes."
    >
      <SettingRow
        label="Music source"
        description="Which catalogue backend feeds the app. The switch applies to the next track that loads; the current queue keeps playing."
        control={
          <Select
            label="Music source"
            value={settings.providerId}
            onChange={(value) => {
              setActiveProvider(value as ProviderId)
              settings.set('providerId', value as ProviderId)
              setSourceVersion((version) => version + 1)
            }}
            options={listProviders().map((item) => ({ value: item.id, label: item.displayName }))}
          />
        }
      />
      <div className={styles.metaList}>
        <span className={styles.metaKey}>Provider id</span>
        <span>{provider.id}</span>
        <span className={styles.metaKey}>Name</span>
        <span>{provider.displayName}</span>
        <span className={styles.metaKey}>Streaming</span>
        <span key={sourceVersion}>{provider.capabilities.streaming ? 'Yes' : 'No — metadata only'}</span>
        <span className={styles.metaKey}>Lyrics</span>
        <span>{provider.capabilities.lyrics}</span>
        <span className={styles.metaKey}>Search</span>
        <span>{provider.capabilities.search ? 'Yes' : 'No'}</span>
        <span className={styles.metaKey}>Notes</span>
        <span>{provider.capabilities.notes ?? '—'}</span>
      </div>

      <SettingRow
        label="Debug overlay"
        description="Live frame time, dropped frames, heap and node count. Off by default; it costs a single animation frame loop."
        control={<Toggle label="Debug overlay" checked={settings.devOverlay} onChange={(value) => settings.set('devOverlay', value)} />}
      />
      <SettingRow
        label="Compact player"
        description="Collapse the bottom bar to the small player with artwork, title and transport."
        control={<Toggle label="Compact player" checked={miniPlayer} onChange={setMiniPlayer} />}
      />
    </SettingsSection>
  )
}

function AboutSection() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let active = true
    void getAppInfo().then((value) => {
      if (active) setInfo(value)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <SettingsSection id="about" title="About" description="Crest — a lightweight Windows desktop music client.">
      <div className={styles.metaList}>
        <span className={styles.metaKey}>Application</span>
        <span>{info?.name ?? 'Crest'}</span>
        <span className={styles.metaKey}>Codename</span>
        <span>{info?.codename ?? 'Nabito'}</span>
        <span className={styles.metaKey}>Version</span>
        <span>{info?.version ?? '0.1.0'}</span>
        <span className={styles.metaKey}>Platform</span>
        <span>{info?.platform ?? (typeof navigator !== 'undefined' ? navigator.platform : 'unknown')}</span>
        <span className={styles.metaKey}>Shell</span>
        <span>Tauri 2 · WebView2 · React 19</span>
        <span className={styles.metaKey}>Typography</span>
        <span>Inter &amp; Manrope (SIL Open Font License 1.1)</span>
      </div>
      <SettingRow
        label="Third-party assets"
        description="Font licences ship with the application in public/fonts. Artwork in this build is generated procedurally; no third-party images are bundled."
        control={<span className={styles.kbd}>OFL 1.1</span>}
      />
    </SettingsSection>
  )
}
