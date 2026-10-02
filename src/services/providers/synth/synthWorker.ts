/**
 * Worker entry for the synth renderer.
 *
 * Rendering a full track is hundreds of millions of simple float ops, so it
 * must never run on the main thread — a click on Play would visibly freeze the
 * UI. The worker renders off-thread and transfers the finished buffer back.
 */

import { renderTrackAudio } from './synthEngine'

type RenderRequest = { id: number; trackId: string; durationMs: number }
type RenderResponse = { id: number; buffer?: ArrayBuffer; error?: string }

self.addEventListener('message', (event: MessageEvent<RenderRequest>) => {
  const { id, trackId, durationMs } = event.data
  try {
    const buffer = renderTrackAudio(trackId, durationMs)
    const response: RenderResponse = { id, buffer }
    // Transfer ownership to avoid copying several MB across the boundary.
    ;(self as unknown as Worker).postMessage(response, [buffer])
  } catch (error) {
    const response: RenderResponse = { id, error: error instanceof Error ? error.message : 'Render failed.' }
    ;(self as unknown as Worker).postMessage(response)
  }
})
