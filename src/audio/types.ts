/**
 * Audio engine contract.
 *
 * The player never touches `<audio>` directly. It drives an `AudioEngine`, which
 * today has two implementations:
 *
 *  - HtmlAudioEngine — real playback through the webview media pipeline.
 *  - SimulatedEngine — an honest clock-only transport used when the active
 *                      provider has no audio to hand out (the Phase 1 demo
 *                      catalogue). It reports `simulated: true` so the UI can
 *                      say so out loud instead of faking a working player.
 *
 * Phase 10 adds a native (Rust/symphonia) engine behind this same interface for
 * gapless playback, crossfade and the equalizer — no UI changes required.
 */

export type AudioEngineKind = 'html' | 'simulated'

export type AudioCapabilities = {
  seek: boolean
  playbackRate: boolean
  volume: boolean
  /** Gapless: the next stream is pre-buffered and chained without a gap. */
  gapless: boolean
  /** Crossfade: overlapping fade between consecutive tracks. */
  crossfade: boolean
  /** Replaygain-style loudness normalisation. */
  normalize: boolean
  /** Biquad EQ chain. */
  equalizer: boolean
  /** Variable pitch independent of tempo. */
  pitch: boolean
}

export type AudioEngineEvents = {
  /** Playback position advanced (ms). */
  position: (positionMs: number) => void
  /** Track duration became known (ms). */
  duration: (durationMs: number) => void
  playing: (playing: boolean) => void
  /** Track reached its end naturally. */
  ended: () => void
  /** Buffering started / stopped. */
  buffering: (buffering: boolean) => void
  error: (message: string) => void
}

export type AudioLoadInput = {
  /** Remote or asset URL to play. */
  url?: string
  /** Known/expected duration, used by the simulated transport. */
  durationHintMs?: number
  /** Playback rate to apply on load. */
  playbackRate?: number
}

export interface AudioEngine {
  readonly kind: AudioEngineKind
  /** True when no real audio is being produced. Surfaced in the UI. */
  readonly simulated: boolean
  readonly capabilities: AudioCapabilities

  load(input: AudioLoadInput): Promise<void>
  play(): Promise<void>
  pause(): void
  seek(positionMs: number): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  setPlaybackRate(rate: number): void
  getPositionMs(): number
  getDurationMs(): number
  on<K extends keyof AudioEngineEvents>(event: K, handler: AudioEngineEvents[K]): () => void
  dispose(): void
}
