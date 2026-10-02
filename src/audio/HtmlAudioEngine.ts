import { Emitter } from './emitter'
import type { AudioCapabilities, AudioEngine, AudioEngineEvents, AudioLoadInput } from './types'

const POSITION_EPSILON_MS = 40
/** Metadata must arrive within this window or the load is declared failed. */
const LOAD_TIMEOUT_MS = 15_000

/**
 * Real playback through the webview's media element.
 *
 * Position is reported from a requestAnimationFrame loop that runs only while
 * audio is actually playing — no permanent polling, and the loop stops the
 * moment playback pauses or the engine is disposed.
 */
export class HtmlAudioEngine implements AudioEngine {
  readonly kind = 'html' as const
  readonly simulated = false

  readonly capabilities: AudioCapabilities = {
    seek: true,
    playbackRate: true,
    volume: true,
    gapless: false,
    crossfade: false,
    normalize: false,
    equalizer: false,
    pitch: false,
  }

  private readonly emitter = new Emitter()
  private readonly element: HTMLAudioElement
  private frame: number | null = null
  /** Guards against stale frame loops re-arming after a stop (see SimulatedEngine). */
  private generation = 0
  private disposed = false
  private volume = 1
  private muted = false
  private lastPosition = 0

  constructor() {
    this.element = new Audio()
    this.element.preload = 'auto'
    this.element.crossOrigin = 'anonymous'
    this.element.addEventListener('ended', this.handleEnded)
    this.element.addEventListener('durationchange', this.handleDurationChange)
    this.element.addEventListener('play', this.handlePlay)
    this.element.addEventListener('pause', this.handlePause)
    this.element.addEventListener('waiting', this.handleWaiting)
    this.element.addEventListener('playing', this.handlePlaying)
    this.element.addEventListener('error', this.handleError)
  }

  async load(input: AudioLoadInput): Promise<void> {
    if (!input.url) throw new Error('HtmlAudioEngine requires a url')
    const cleanUrl = input.url.trim().replace(/^["']|["']$/g, '')
    this.element.src = cleanUrl
    this.element.playbackRate = clampRate(input.playbackRate ?? 1)
    this.emitter.emit('position', 0)
    this.lastPosition = 0
    await new Promise<void>((resolve, reject) => {
      // A stream that never delivers metadata must not wedge the player: the
      // rejection surfaces in the UI, where retry/skip remain available.
      const timeout = window.setTimeout(() => {
        cleanup()
        reject(new Error('This track took too long to load.'))
      }, LOAD_TIMEOUT_MS)
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Unable to load this track.'))
      }
      const cleanup = () => {
        window.clearTimeout(timeout)
        this.element.removeEventListener('loadedmetadata', onReady)
        this.element.removeEventListener('error', onError)
      }
      this.element.addEventListener('loadedmetadata', onReady)
      this.element.addEventListener('error', onError)
    })
  }

  async play(): Promise<void> {
    if (this.muted) this.element.muted = true
    this.element.volume = this.volume
    await this.element.play()
  }

  pause(): void {
    this.element.pause()
  }

  seek(positionMs: number): void {
    const duration = this.getDurationMs()
    const target = Math.max(0, duration > 0 ? Math.min(positionMs, duration) : positionMs)
    this.element.currentTime = target / 1000
    this.lastPosition = target
    this.emitter.emit('position', target)
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
    this.element.volume = this.volume
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.element.muted = muted
  }

  setPlaybackRate(rate: number): void {
    this.element.playbackRate = clampRate(rate)
  }

  getPositionMs(): number {
    return Math.round(this.element.currentTime * 1000)
  }

  getDurationMs(): number {
    const duration = this.element.duration
    return Number.isFinite(duration) ? Math.round(duration * 1000) : 0
  }

  on<K extends keyof AudioEngineEvents>(event: K, handler: AudioEngineEvents[K]): () => void {
    return this.emitter.on(event, handler)
  }

  dispose(): void {
    this.disposed = true
    this.stopFrameLoop()
    this.element.removeEventListener('ended', this.handleEnded)
    this.element.removeEventListener('durationchange', this.handleDurationChange)
    this.element.removeEventListener('play', this.handlePlay)
    this.element.removeEventListener('pause', this.handlePause)
    this.element.removeEventListener('waiting', this.handleWaiting)
    this.element.removeEventListener('playing', this.handlePlaying)
    this.element.removeEventListener('error', this.handleError)
    this.element.pause()
    this.element.removeAttribute('src')
    this.element.load()
    this.emitter.clear()
  }

  private handleEnded = () => {
    this.stopFrameLoop()
    this.emitter.emit('ended')
  }

  private handleDurationChange = () => {
    this.emitter.emit('duration', this.getDurationMs())
  }

  private handlePlay = () => {
    this.emitter.emit('playing', true)
    this.startFrameLoop()
  }

  private handlePause = () => {
    this.emitter.emit('playing', false)
    this.stopFrameLoop()
  }

  private handleWaiting = () => this.emitter.emit('buffering', true)

  private handlePlaying = () => this.emitter.emit('buffering', false)

  private handleError = () => {
    this.stopFrameLoop()
    const err = this.element.error
    console.error('[HtmlAudioEngine] Audio playback error:', err ? `code ${err.code}: ${err.message}` : 'unknown')
    this.emitter.emit('error', 'Unable to load this track.')
  }

  private startFrameLoop(): void {
    if (this.frame !== null || this.disposed) return
    const generation = (this.generation += 1)
    const tick = () => {
      if (this.disposed || generation !== this.generation) return
      const position = this.getPositionMs()
      if (Math.abs(position - this.lastPosition) >= POSITION_EPSILON_MS) {
        this.lastPosition = position
        this.emitter.emit('position', position)
      }
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

function clampRate(rate: number): number {
  return Math.max(0.5, Math.min(2, rate))
}
