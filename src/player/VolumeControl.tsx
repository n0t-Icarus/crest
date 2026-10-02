import { IconButton } from '@/components/ui/IconButton'
import { Slider } from '@/components/ui/Slider'
import { useSettingsStore } from '@/store/settingsStore'
import styles from './VolumeControl.module.css'

/**
 * Volume control.
 *
 * Volume and mute are user settings (persisted), and are pushed into the active
 * engine whenever real audio is playing. In the demo library there is no audio
 * to attenuate — the player says so instead of implying otherwise.
 */
export function VolumeControl({ compact = false }: { compact?: boolean }) {
  const volume = useSettingsStore((state) => state.volume)
  const muted = useSettingsStore((state) => state.muted)
  const setVolume = useSettingsStore((state) => state.set)

  const icon = muted || volume === 0 ? 'volumeMute' : volume < 0.45 ? 'volumeLow' : 'volumeHigh'

  return (
    <div className={styles.control} data-compact={compact || undefined}>
      <IconButton
        icon={icon}
        label={muted ? 'Unmute' : 'Mute'}
        size="sm"
        variant="bare"
        onClick={() => setVolume('muted', !muted)}
      />
      <Slider
        className={styles.slider}
        variant="volume"
        label="Volume"
        value={muted ? 0 : volume}
        valueText={`${Math.round((muted ? 0 : volume) * 100)} percent`}
        onChange={(next) => {
          setVolume('volume', next)
          if (muted && next > 0) setVolume('muted', false)
        }}
      />
    </div>
  )
}
