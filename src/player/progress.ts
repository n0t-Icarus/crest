/**
 * Progress channel.
 *
 * Playback position changes ~60×/second. Putting it in the React store would
 * re-render every subscribed component on every animation frame, so position
 * lives here instead: components subscribe imperatively and write directly to
 * the DOM (a width, a transform, a label). React re-renders only when the track,
 * duration or playing state actually changes.
 */

export type ProgressSnapshot = {
  positionMs: number
  durationMs: number
}

let snapshot: ProgressSnapshot = { positionMs: 0, durationMs: 0 }
const listeners = new Set<(value: ProgressSnapshot) => void>()

export function getProgress(): ProgressSnapshot {
  return snapshot
}

export function setProgress(positionMs: number, durationMs?: number): void {
  const nextDuration = durationMs ?? snapshot.durationMs
  if (nextDuration === snapshot.durationMs && Math.abs(positionMs - snapshot.positionMs) < 1) return
  snapshot = { positionMs, durationMs: nextDuration }
  for (const listener of listeners) listener(snapshot)
}

export function resetProgress(durationMs = 0): void {
  snapshot = { positionMs: 0, durationMs }
  for (const listener of listeners) listener(snapshot)
}

export function subscribeProgress(listener: (value: ProgressSnapshot) => void): () => void {
  listeners.add(listener)
  listener(snapshot)
  return () => {
    listeners.delete(listener)
  }
}

/** Fraction 0–1, guarded against unknown durations. */
export function progressFraction(value: ProgressSnapshot): number {
  if (value.durationMs <= 0) return 0
  return Math.max(0, Math.min(1, value.positionMs / value.durationMs))
}
