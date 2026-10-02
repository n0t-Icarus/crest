import type { AudioEngineEvents } from './types'

type AnyHandler = (...args: never[]) => void

/** Minimal typed emitter shared by the engine implementations. */
export class Emitter {
  private handlers = new Map<keyof AudioEngineEvents, Set<AnyHandler>>()

  on<K extends keyof AudioEngineEvents>(event: K, handler: AudioEngineEvents[K]): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as AnyHandler)
    return () => {
      set?.delete(handler as AnyHandler)
    }
  }

  emit<K extends keyof AudioEngineEvents>(event: K, ...args: Parameters<AudioEngineEvents[K]>): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) {
      ;(handler as (...a: Parameters<AudioEngineEvents[K]>) => void)(...args)
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
