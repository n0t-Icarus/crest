/**
 * Network utilities for the real providers.
 *
 * Two problems every catalogue API shares:
 *
 *  - Rate limits. iTunes allows ~20 calls/minute, so requests to it are
 *    serialized through a queue with a fixed minimum spacing, never parallel.
 *  - Repetition. The same lookups happen constantly (search → open album →
 *    lyrics), so every helper caches responses for a while.
 *
 * Caches are bounded: oldest entries fall out once the cap is hit so a long
 * session cannot grow memory without limit.
 */

type CacheEntry<T> = { value: T; expiresAt: number }

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 250,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    // Refresh recency so eviction hits the least-recently used entry.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}

/** Minimum spacing between requests to a throttled host, per key. */
const SPACING_MS = 3200 // ≈18.75 requests/minute, just under iTunes' ~20/min.
const queues = new Map<string, Promise<unknown>>()
let lastRunAt = new Map<string, number>()

/**
 * Runs `task` on a per-key serialized queue with fixed spacing.
 *
 * Every caller gets its own promise; tasks run strictly one at a time per key,
 * `SPACING_MS` apart, so bursts of search-as-you-type cannot trip the limit.
 */
export function throttled<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const run = async (): Promise<T> => {
    const last = lastRunAt.get(key) ?? 0
    const wait = last + SPACING_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRunAt.set(key, Date.now())
    return task()
  }
  // The queue never rejects: a failed task must not poison later callers.
  const next = previous.then(run, run)
  queues.set(
    key,
    next.catch(() => undefined),
  )
  return next
}

export type JsonOptions = { signal?: AbortSignal }

/** GET a JSON document, throwing on non-2xx so callers can fall back. */
export async function getJson<T>(url: string, options: JsonOptions = {}): Promise<T> {
  const response = await fetch(url, { signal: options.signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${new URL(url).host} responded ${response.status}`)
  return (await response.json()) as T
}

/** Resolves with the value, or `null` once the timeout elapses. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}
