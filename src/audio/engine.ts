import { HtmlAudioEngine } from './HtmlAudioEngine'
import { SimulatedEngine } from './SimulatedEngine'
import type { AudioEngine, AudioLoadInput } from './types'

/**
 * Chooses the transport for what the provider actually handed us: a real media
 * URL gets the HTML engine, anything else falls back to the simulated clock so
 * the rest of the player stays fully exercisable.
 */
export function createEngineFor(input: AudioLoadInput): AudioEngine {
  return input.url ? new HtmlAudioEngine() : new SimulatedEngine()
}
