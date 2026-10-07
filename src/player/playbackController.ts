import { createEngineFor } from '@/audio/engine'
import type { AudioEngine } from '@/audio/types'
import { getProvider } from '@/services/providers'
import type { Track } from '@/services/providers/types'

/**
 * Playback controller.
 *
 * Owns the current `AudioEngine` and translates provider streams into playback.
 * It reports everything through a small sink interface, so the store stays the
 * single place that knows how playback maps onto UI state.
 */

export type PlaybackSink = {
  onPosition: (positionMs: number) => void
  onDuration: (durationMs: number) => void
  onPlaying: (playing: boolean) => void
  onBuffering: (buffering: boolean) => void
  onEnded: () => void
  onError: (message: string) => void
  /** Whether the engine about to play produces real audio or only a clock. */
  onSimulated: (simulated: boolean) => void
}

export class PlaybackController {
  private engine: AudioEngine | null = null
  private detachers: Array<() => void> = []
  /**
   * Monotonic load id. Resolving a stream can take seconds (helper health
   * check + engine metadata), and a slower load for an old track must never
   * report into a newer one — otherwise skipping quickly flashes a stale
   * error and can pause the track you just started.
   */
  private loadSeq = 0
  /**
   * Every engine this controller has ever created.
   *
   * Engines are stateful (they own a media element or an animation-frame clock),
   * so a replacement must be able to shut the previous one down even if it is no
   * longer referenced — otherwise a stranded engine keeps ticking and can drive
   * the UI. Belt and braces on top of the per-engine ownership guard below.
   */
  private readonly created = new Set<AudioEngine>()
  private volume = 1
  private muted = false
  private rate = 1

  constructor(private readonly sink: PlaybackSink) {}

  get simulated(): boolean {
    return this.engine?.simulated ?? true
  }

  get capabilities() {
    return this.engine?.capabilities
  }

  /** Load a track and optionally start playing it. */
  async load(track: Track, options: { autoplay?: boolean } = {}): Promise<void> {
    const { autoplay = true } = options
    const loadId = (this.loadSeq += 1)
    // Silence the current track *before* resolving the next one.
    //
    // Resolving a stream costs a yt-dlp round trip (1–3s). Until it lands the
    // media element still holds the previous track, so pressing play on another
    // song left the old one playing at full volume while the UI already showed
    // the new title — "I skipped but the first song is still going". Unloading
    // first is what makes a skip actually stop the music.
    this.stopCurrent()
    this.sink.onBuffering(true)

    let stream
    try {
      stream = await this.resolveStream(track)
    } catch (error) {
      if (loadId !== this.loadSeq) return
      this.sink.onBuffering(false)
      this.sink.onError(messageFor(error))
      return
    }
    // A newer load took over while we were resolving — stay silent.
    if (loadId !== this.loadSeq) return
    if (stream.kind === 'unavailable') {
      this.sink.onBuffering(false)
      this.sink.onError(stream.reason || 'This track is currently unavailable.')
      return
    }
    const url = stream.kind === 'url' ? stream.url : undefined

    // Reuse the engine when the transport kind is unchanged: creating a new
    // media element per track would defeat gapless playback later on.
    const needsHtml = Boolean(url)
    const currentIsHtml = this.engine?.kind === 'html'
    if (!this.engine || needsHtml !== currentIsHtml) {
      this.disposeEngines()
      const engine = createEngineFor({ url })
      this.engine = engine
      this.created.add(engine)
      this.attach(engine)
    }

    const engine = this.engine
    if (!engine) return
    if (loadId !== this.loadSeq) return
    this.sink.onSimulated(engine.simulated)
    engine.setVolume(this.volume)
    engine.setMuted(this.muted)
    engine.setPlaybackRate(this.rate)

    try {
      await engine.load({ url, durationHintMs: track.durationMs, playbackRate: this.rate })
      if (loadId !== this.loadSeq) return
      this.sink.onDuration(engine.getDurationMs() || track.durationMs)
      if (autoplay) await engine.play()
      if (loadId !== this.loadSeq) return
      // The engine only clears `buffering` on a `waiting`/`playing` pair, and a
      // stream that starts cleanly never fires `waiting`. Clear it here too or
      // the spinner sticks on a track that is audibly playing.
      this.sink.onBuffering(false)
    } catch (error) {
      // The abort of a superseded load lands here — a newer track owns the UI now.
      if (loadId !== this.loadSeq) return
      this.sink.onBuffering(false)
      this.sink.onError(messageFor(error))
    }
  }

  /**
   * Unload the live engine without destroying it.
   *
   * The engine is kept so the next track reuses the same media element (and its
   * volume/rate state) instead of building a new one per skip.
   */
  private stopCurrent(): void {
    this.engine?.stop()
  }

  async play(): Promise<void> {
    const engine = this.engine
    // Nothing loaded (fresh launch, restored queue, or the last load failed).
    // Report it as "no media" rather than letting `play()` reject with the
    // media element's own "no supported source was found", which read as a
    // broken track. The store falls back to loading the current track.
    if (!engine || !engine.hasSource) return
    try {
      await engine.play()
      this.sink.onBuffering(false)
    } catch (error) {
      this.sink.onError(messageFor(error))
    }
  }

  pause(): void {
    this.engine?.pause()
  }

  seek(positionMs: number): void {
    this.engine?.seek(positionMs)
    this.sink.onPosition(positionMs)
  }

  setVolume(volume: number): void {
    this.volume = volume
    this.engine?.setVolume(volume)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.engine?.setMuted(muted)
  }

  setPlaybackRate(rate: number): void {
    this.rate = rate
    this.engine?.setPlaybackRate(rate)
  }

  dispose(): void {
    this.disposeEngines()
  }

  private async resolveStream(track: Track) {
    try {
      return await getProvider().getStream(track.id)
    } catch {
      return { kind: 'unavailable' as const, reason: 'Unable to load this track.' }
    }
  }

  /**
   * Subscribes to an engine, but only forwards events while that engine is still
   * the live one. A superseded engine can therefore never move the playhead or
   * flip the transport state.
   */
  private attach(engine: AudioEngine): void {
    for (const detach of this.detachers) detach()
    const owned = <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (this.engine !== engine) return
        handler(...args)
      }
    }
    this.detachers = [
      engine.on('position', owned(this.sink.onPosition)),
      engine.on('duration', owned(this.sink.onDuration)),
      engine.on('playing', owned(this.sink.onPlaying)),
      engine.on('buffering', owned(this.sink.onBuffering)),
      engine.on('ended', owned(this.sink.onEnded)),
      engine.on('error', owned(this.sink.onError)),
    ]
  }

  private disposeEngines(): void {
    for (const detach of this.detachers) detach()
    this.detachers = []
    for (const engine of this.created) engine.dispose()
    this.created.clear()
    this.engine = null
  }
}

function messageFor(error: unknown): string {
  if (!(error instanceof Error)) return 'Unable to load this track.'
  // The media element's generic failures are the least useful thing we can show:
  // they say nothing about whether the track, the network, or the app is at
  // fault. Map them to something the listener can act on.
  const message = error.message || ''
  if (/no supported source|not supported|Empty src|Empty source/i.test(message)) {
    return 'This track could not be played here. Try Retry.'
  }
  if (/took too long/i.test(message)) {
    return 'This track took too long to load. Try Retry.'
  }
  if (/aborted/i.test(message)) return 'Playback was interrupted.'
  return message
}
