import type { AudioCapabilities } from './types'

/**
 * Audio feature registry.
 *
 * Settings and the player render from this list, so a switch can never appear
 * to work when the engine cannot deliver it. Every unavailable feature states
 * why, and which phase brings it in.
 */
export type AudioFeatureId =
  | 'volume'
  | 'playbackRate'
  | 'crossfade'
  | 'gapless'
  | 'normalizeVolume'
  | 'skipSilence'
  | 'equalizer'
  | 'pitch'

export type AudioFeatureStatus = 'available' | 'planned'

export type AudioFeature = {
  id: AudioFeatureId
  label: string
  description: string
  status: AudioFeatureStatus
  /** Shown next to a disabled control so the reason is never a mystery. */
  note?: string
}

const PLANNED_NOTE = 'Needs the native audio pipeline (Phase 10).'

/**
 * Capabilities of the browser pipeline: seek, rate and volume work, but gapless
 * playback, crossfade and the equalizer require a native engine.
 */
export const WEB_PIPELINE_CAPABILITIES: AudioCapabilities = {
  seek: true,
  playbackRate: true,
  volume: true,
  gapless: false,
  crossfade: false,
  normalize: false,
  equalizer: false,
  pitch: false,
}

export function describeAudioFeatures(capabilities: AudioCapabilities): AudioFeature[] {
  const gate = (available: boolean): AudioFeatureStatus => (available ? 'available' : 'planned')

  return [
    {
      id: 'volume',
      label: 'Volume & mute',
      description: 'Output level, mute and per-track volume memory.',
      status: gate(capabilities.volume),
    },
    {
      id: 'playbackRate',
      label: 'Playback speed',
      description: '0.5× – 2× without changing the pitch of the source.',
      status: gate(capabilities.playbackRate),
    },
    {
      id: 'crossfade',
      label: 'Crossfade',
      description: 'Overlap the tail of one track with the head of the next.',
      status: gate(capabilities.crossfade),
      note: capabilities.crossfade ? undefined : PLANNED_NOTE,
    },
    {
      id: 'gapless',
      label: 'Gapless playback',
      description: 'Remove the silence between tracks that run into each other.',
      status: gate(capabilities.gapless),
      note: capabilities.gapless ? undefined : PLANNED_NOTE,
    },
    {
      id: 'normalizeVolume',
      label: 'Normalise volume',
      description: 'Even out loudness between quiet and loud masters.',
      status: gate(capabilities.normalize),
      note: capabilities.normalize ? undefined : PLANNED_NOTE,
    },
    {
      id: 'skipSilence',
      label: 'Skip silence',
      description: 'Jump over long silent intros and outros.',
      status: gate(false),
      note: PLANNED_NOTE,
    },
    {
      id: 'equalizer',
      label: 'Equalizer',
      description: '10-band EQ with presets, applied in the audio graph.',
      status: gate(capabilities.equalizer),
      note: capabilities.equalizer ? undefined : PLANNED_NOTE,
    },
    {
      id: 'pitch',
      label: 'Pitch control',
      description: 'Shift pitch independently of playback speed.',
      status: gate(capabilities.pitch),
      note: capabilities.pitch ? undefined : PLANNED_NOTE,
    },
  ]
}

export function featureById(features: AudioFeature[], id: AudioFeatureId): AudioFeature | undefined {
  return features.find((feature) => feature.id === id)
}
