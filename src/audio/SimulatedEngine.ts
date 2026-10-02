import { Emitter } from './emitter'
import type { AudioCapabilities, AudioEngine, AudioEngineEvents, AudioLoadInput } from './types'

/**
 * Clock-only transport.
 *
 * Used only when the active provider cannot supply audio (the bundled demo
 * catalogue). It emits exactly the same events as the real engine so every
 * player affordance — progress, seek, next, previous — exercises the real code
 * path, while `simulated: true` lets the UI state plainly that no sound is being
 * produced instead of pretending otherwise.
 */
export class SimulatedEngine implements AudioEngine {
  readonly kind = 'simulated' as const
  readonly simulated = true

  readonly capabilities: AudioCapabilities = {
    seek: true,
    playbackRate: true,
    volume: false,
    gapless: false,
    crossfade: false,
    normalize: false,
    equalizer: false,
    pitch: false,
  }

  private readonly emitter = new Emitter()
  private frame: number | null = null
  /**
   * Frame-loop generation. A cancelled-but-already-fired callback re-arms
   * itself, so a plain "is a frame pending?" flag can leak extra loops (which
   * makes the clock race). Every start/stop bumps the generation and any tick
   * from an older generation exits immediately.
   */
  private generation = 0
  private durationMs = 0
  private positionMs = 0
  private rate = 1
  private lastTick = 0
  private disposed = false

  async load(input: AudioLoadInput): Promise<void> {
    this.stopFrameLoop()
    this.durationMs = input.durationHintMs ?? 0
    this.positionMs = 0
    this.rate = input.playbackRate ?? 1
    this.emitter.emit('playing', false)
    this.emitter.emit('duration', this.durationMs)
    this.emitter.emit('position', 0)
  }

  async play(): Promise<void> {
    if (this.disposed) return
    // Idempotent: always (re)assert the playing state so the store can never
    // disagree with the engine about whether audio is running.
    this.emitter.emit('playing', true)
    this.lastTick = performance.now()
    this.startFrameLoop()
  }

  pause(): void {
    if (this.disposed) return
    this.stopFrameLoop()
    this.emitter.emit('playing', false)
  }

  seek(positionMs: number): void {
    const target = Math.max(0, this.durationMs > 0 ? Math.min(positionMs, this.durationMs) : positionMs)
    this.positionMs = target
    this.emitter.emit('position', target)
  }

  setVolume(): void {
    // Nothing to apply — capabilities.volume is false.
  }

  setMuted(): void {
    // Nothing to apply — capabilities.volume is false.
  }

  setPlaybackRate(rate: number): void {
    this.rate = Math.max(0.5, Math.min(2, rate))
  }

  getPositionMs(): number {
    return this.positionMs
  }

  getDurationMs(): number {
    return this.durationMs
  }

  on<K extends keyof AudioEngineEvents>(event: K, handler: AudioEngineEvents[K]): () => void {
    return this.emitter.on(event, handler)
  }

  dispose(): void {
    this.disposed = true
    this.stopFrameLoop()
    this.emitter.clear()
  }

  private startFrameLoop(): void {
    if (this.frame !== null || this.disposed) return
    const generation = (this.generation += 1)
    const tick = (now: number) => {
      if (this.disposed || generation !== this.generation) return
      // Clamp the step so a backgrounded/throttled frame cannot teleport the
      // playhead (which would fire an immediate "ended").
      const delta = Math.min(Math.max(now - this.lastTick, 0), 100)
      this.lastTick = now
      this.positionMs += delta * this.rate
      if (this.durationMs > 0 && this.positionMs >= this.durationMs) {
        this.positionMs = this.durationMs
        this.emitter.emit('position', this.positionMs)
        this.stopFrameLoop()
        this.emitter.emit('playing', false)
        this.emitter.emit('ended')
        return
      }
      this.emitter.emit('position', this.positionMs)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private stopFrameLoop(): void {
    this.generation += 1
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame)
      this.frame = null
    }
  }
}
