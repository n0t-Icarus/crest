/**
 * Media core — yt-dlp URL resolution (no disk writes).
 *
 * Audio URLs come from short-lived `yt-dlp` child processes, so nothing is
 * ever downloaded and Google's player-JS signature changes are absorbed by
 * yt-dlp's own update cadence instead of our code.
 *
 * googlevideo expects browser-like request headers; the proxy replays a fixed
 * set (User-Agent, Referer, etc.) when fetching the `-g` URL upstream.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { TtlCache } from './ttl.mjs'

const YT_DLP_TIMEOUT_MS = 30_000

/** In the packaged app the Rust shell points this at the bundled yt-dlp.exe. */
const YT_DLP = process.env.YTDLP_PATH || 'yt-dlp'

/** Browser-friendly native audio (m4a/AAC first, then any bestaudio). */
const FORMAT = 'bestaudio[ext=m4a]/bestaudio'

/**
 * Identity the request presents as.
 *
 * yt-dlp's own default UA is a distinctive non-browser string that some CDNs
 * treat as automation, so we present a current desktop Chrome instead. It is
 * applied to the extraction *and* rides along into `%(http_headers)j`, so the
 * googlevideo fetch the proxy replays carries the same identity — a mismatch
 * between the UA used to resolve and the one used to stream is itself a signal.
 *
 * Verified harmless on every client we use: web_embedded and tv_embedded both
 * still resolve with it set.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Fallback headers when `--print` doesn't return usable ones. */
const FALLBACK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.youtube.com/',
}

/** Header names worth replaying upstream (everything else is transport noise). */
const REPLAYED_HEADERS = new Set(['user-agent', 'accept', 'accept-language', 'referer', 'origin'])

/* -------------------------------------------------------------------------- */
/* yt-dlp resolution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * YouTube player clients to try, in order.
 *
 * The default web client is gated by a bot check from a lot of IPs: yt-dlp
 * comes back with "Sign in to confirm you're not a bot", the helper turns that
 * into a 500, and the media element reports it as an unsupported source — a
 * lie, because the track plays perfectly well in a browser. `tv_embedded` is
 * not behind that check, so it leads; the rest are recovery for the day
 * YouTube gates a different set.
 *
 * Every entry below was measured against this build (yt-dlp 2026.08.19) by
 * resolving a real track *and then fetching the URL it produced*, not taken
 * from documentation:
 *
 *   tv_embedded   ✓ resolves, and the URL streams (206)
 *   default       ✓ resolves, and the URL streams (206)
 *   web_embedded  ⚠ resolves — but googlevideo answers 403 on every fetch.
 *                   This is the trap. A client that only hands back refused
 *                   URLs still "works" if you stop at a successful exit code,
 *                   and because the refusal only appears later on /audio it
 *                   looks exactly like being rate-limited. It is not: the same
 *                   track downloads fine on the very next client. That is why
 *                   probeUsable() gates the ladder, and why this client is not
 *                   allowed to lead.
 *   web           ✗ "Requested format is not available."
 *   tv            ✗ "The page needs to be reloaded." — YouTube now requires a
 *                   proof-of-origin (PO) token for this client. Without a token
 *                   provider it is simply broken, so it is NOT in the ladder.
 *   mweb          ✗ exposes only storyboards and a 360p *muxed* mp4 (itag 18).
 *                   That carries video, so it matches neither `bestaudio` nor
 *                   `bestaudio[ext=m4a]`, and it is far too low quality to be
 *                   worth a fallback slot in a music client.
 *   ios / android / web_safari / android_vr / tv_simply
 *                 ✗ no audio-only formats either.
 *
 * Note on syntax: the extractor-arg key is `player_client`, *not* `client`.
 * `youtube:client=…` is not a recognised key — yt-dlp ignores it silently and
 * falls back to the default client, so a ladder built on it looks like it works
 * while actually testing nothing.
 */
const PLAYER_CLIENTS = ['tv_embedded', 'default', 'web_embedded', 'web']

/**
 * How long a fetchability probe waits before we stop caring.
 *
 * This runs on the critical path of every uncached track, so it has to be short
 * enough to stay invisible and long enough to survive a slow connect.
 */
const PROBE_TIMEOUT_MS = 8_000

/**
 * Where to go after an upstream refusal (403 / bot check).
 *
 * Escalation point: the TV-family clients see materially different rate-limit
 * thresholds than the web ones, so a refused web extraction retries against a
 * TV client before we surface anything to the listener.
 */
const ESCALATION_CLIENTS = ['tv_embedded', 'web_embedded']

/** The client that worked last, so the common path costs one child process. */
let preferredClient = PLAYER_CLIENTS[0]

/** googlevideo URLs expire ~6h but rotate sooner; keep the cache short. */
const resolutionCache = new TtlCache(9.5 * 60_000, 64)
const inflight = new Map()

/* -------------------------------------------------------------------------- */
/* Pacing — the thing that actually keeps us off YouTube's throttle            */
/* -------------------------------------------------------------------------- */

/**
 * Why pacing exists, in one paragraph.
 *
 * YouTube throttles by how *fast* a client asks, not by how many times over a
 * session. The player used to fan out one yt-dlp child per queued track the
 * instant the playhead moved, so skipping through a playlist fired a dozen
 * extractions inside a few seconds. Nothing about the client identity helps
 * with that — swapping users does not slow the burst down. It just earns the
 * IP a block, and then every track fails until the block decays.
 *
 * So extractions are metered here instead. Everything that spawns yt-dlp goes
 * through the gate below: a hard cap on concurrent children, and a minimum
 * gap between spawns with jitter so a queue drains as a paced trickle rather
 * than a wall.
 */
const MAX_CONCURRENT_EXTRACTIONS = 2
const MIN_SPAWN_GAP_MS = 400
const SPAWN_JITTER_MS = 250

let activeExtractions = 0
let lastSpawnAt = 0
let spawnChain = Promise.resolve()

const waitMs = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * Wait for permission to spawn one yt-dlp child.
 *
 * Serialised through `spawnChain` so the gap is measured against the *previous
 * spawn*, not against whoever happened to ask first. Without that, N concurrent
 * callers would all compute the same remaining gap and all fire together.
 */
function acquireExtractionSlot() {
  const granted = spawnChain.then(async () => {
    const elapsed = Date.now() - lastSpawnAt
    const owed = MIN_SPAWN_GAP_MS - elapsed
    if (owed > 0) await waitMs(owed + Math.random() * SPAWN_JITTER_MS)
    while (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) await waitMs(50)
    lastSpawnAt = Date.now()
    activeExtractions += 1
  })
  // Keep the chain alive even if a caller's own work later fails.
  spawnChain = granted.then(() => undefined, () => undefined)
  return granted
}

function releaseExtractionSlot() {
  activeExtractions = Math.max(0, activeExtractions - 1)
}

/* -------------------------------------------------------------------------- */
/* Persistent resolution cache                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolutions survive a restart.
 *
 * Without this, relaunching the app — or coming back to a track an hour later
 * — re-extracts from YouTube, and every restart is one more block earned. A
 * googlevideo URL lives about six hours, so four is a safe floor under that.
 */
const DISK_TTL_MS = 4 * 60 * 60_000
const DISK_MAX_ENTRIES = 200
const DISK_CACHE_PATH = process.env.CREST_RESOLUTION_CACHE
  ?? path.join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'crest', 'resolutions.json')

/**
 * Bump when what counts as a valid stored entry changes.
 *
 * Version 2 exists because entries are only trustworthy once they have passed
 * probeUsable(). A cache written by an older build may hold `web_embedded` URLs
 * that googlevideo refuses on every fetch, and those replay from disk without a
 * probe — so an upgraded app would inherit up to four hours of dead entries.
 * Refusing to load an older shape is cheaper and far less confusing than
 * replaying URLs that cannot stream.
 */
const DISK_CACHE_VERSION = 2

let diskCacheLoaded = false
const diskCache = new Map()

function loadDiskCache() {
  if (diskCacheLoaded) return
  diskCacheLoaded = true
  try {
    const parsed = JSON.parse(readFileSync(DISK_CACHE_PATH, 'utf8'))
    // A file written before probeUsable() existed can only contain entries that
    // were never checked for fetchability. Start clean instead of replaying
    // URLs that are known to be refused.
    if ((parsed?.version ?? 1) < DISK_CACHE_VERSION) return
    const cutoff = Date.now() - DISK_TTL_MS
    for (const [vid, entry] of Object.entries(parsed?.entries ?? {})) {
      if (entry?.url && Number(entry.at) > cutoff) diskCache.set(vid, entry)
    }
  } catch {
    // A missing or corrupt cache is not an error; it just starts empty.
  }
}

function flushDiskCache() {
  try {
    const cutoff = Date.now() - DISK_TTL_MS
    const out = {}
    // Drop expired entries on write so the file cannot grow without bound.
    for (const [vid, entry] of diskCache) {
      if (entry.at > cutoff) out[vid] = entry
    }
    mkdirSync(path.dirname(DISK_CACHE_PATH), { recursive: true })
    writeFileSync(DISK_CACHE_PATH, JSON.stringify({ version: DISK_CACHE_VERSION, entries: out }))
  } catch {
    // A cache we cannot persist is a performance loss, never a failure.
  }
}

function rememberOnDisk(videoId, resolution) {
  diskCache.set(videoId, { url: resolution.url, headers: resolution.headers, at: Date.now() })
  // Evict the oldest so a long session cannot grow the map without bound.
  while (diskCache.size > DISK_MAX_ENTRIES) {
    const oldest = diskCache.keys().next().value
    diskCache.delete(oldest)
  }
  // Persist synchronously. This used to be a debounced timer, but an unref'd
  // timer cannot keep the process alive, so a short-lived process exited before
  // it ever fired and the cache silently never reached disk. The file is a few
  // KB and writes are rare (one per real extraction), so the debounce bought
  // nothing and cost the entire feature.
  flushDiskCache()
}

function recallFromDisk(videoId) {
  loadDiskCache()
  const entry = diskCache.get(videoId)
  if (!entry) return null
  if (Date.now() - entry.at > DISK_TTL_MS) {
    diskCache.delete(videoId)
    return null
  }
  return {
    url: entry.url,
    headers: entry.headers ?? FALLBACK_HEADERS,
    durationSec: durationFromUrl(entry.url),
  }
}

/**
 * Turn a yt-dlp failure into something the UI can say something true about.
 *
 * Without this the only thing that reaches the player is a wall of yt-dlp
 * text, and the app has to guess: it used to guess "unsupported source", which
 * sent users looking for a broken track that was actually blocked upstream.
 */
function classifyFailure(stderr, code) {
  const text = String(stderr ?? '').toLowerCase()
  if (text.includes('not a bot') || text.includes('sign in to confirm')) return 'rate_limited'
  if (text.includes('private video')) return 'private'
  if (text.includes('age') && text.includes('restricted')) return 'age_restricted'
  if (text.includes('not available in your country') || text.includes('geo')) return 'geo_blocked'
  if (text.includes('removed') || text.includes('deleted')) return 'unavailable'
  // "The page needs to be reloaded." is YouTube refusing because the client has
  // no proof-of-origin token. It is a property of the *client*, never of the
  // track, so it must not be reported as an unplayable song.
  if (text.includes('needs to be reloaded')) return 'client_needs_token'
  // The client authenticated but exposed no audio-only format for this track.
  if (text.includes('requested format is not available')) return 'no_stream'
  if (text.includes('timed out')) return 'timeout'
  if (code === 0) return 'no_stream'
  return 'error'
}

/** Run yt-dlp once against one player client, once the pacing gate allows it. */
async function runYtDlp(videoId, client) {
  await acquireExtractionSlot()
  try {
    return await spawnYtDlp(videoId, client)
  } finally {
    releaseExtractionSlot()
  }
}

function spawnYtDlp(videoId, client) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '-g',
      '-f', FORMAT,
      '--user-agent', BROWSER_UA,
      '--print', '%(http_headers)j',
    ]
    // 'default' means "let yt-dlp choose", which is expressed by not passing it.
    if (client !== 'default') args.push('--extractor-args', `youtube:player_client=${client}`)
    args.push(`https://music.youtube.com/watch?v=${videoId}`)

    const child = spawn(YT_DLP, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      const error = new Error('yt-dlp timed out')
      error.reason = 'timeout'
      reject(error)
    }, YT_DLP_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const resolution = parseResolution(stdout)
      if (code === 0 && resolution.url) {
        resolve(resolution)
        return
      }
      const errorLine = stderr.split('\n').map((line) => line.trim()).filter(Boolean).pop()
      const error = new Error(errorLine ?? `yt-dlp exited ${code}`)
      error.reason = classifyFailure(stderr, code)
      reject(error)
    })
  })
}

/**
 * Try each player client until one resolves.
 *
 * Two things shape this:
 *
 *  1. A track that genuinely cannot play (private, removed, geo-blocked) is not
 *     a client problem, so those stop immediately rather than spawning three
 *     more yt-dlp processes to reach the same verdict.
 *  2. A refusal (bot check / rate limit) *is* a client problem, so we retry —
 *     but we retry in an order that moves us onto the TV-family clients, which
 *     are not behind the same bot check. The first client that works is
 *     remembered, so the common case still costs exactly one child process.
 */
/**
 * Ask googlevideo whether it will actually serve this URL.
 *
 * This is the whole point of the client ladder, and getting it wrong is what
 * made playback look like rate limiting. A client can hand back a perfectly
 * well-formed URL that googlevideo then refuses with 403 on every fetch — and
 * because the refusal only shows up later, on /audio, it is indistinguishable
 * from being throttled. `web_embedded` reliably does exactly this.
 *
 * So a successful extraction is not evidence of a usable stream. This sends a
 * one-byte range request and treats a 403 as a client failure, which makes the
 * ladder climb to a client whose URL really is fetchable.
 */
async function probeUsable(url, headers, signal) {
  try {
    const response = await fetch(url, {
      headers: { ...headers, 'Accept-Encoding': 'identity', Range: 'bytes=0-0' },
      signal: signal ?? AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    await response.body?.cancel().catch(() => undefined)
    return response.status !== 403
  } catch {
    // A probe that cannot even be sent tells us nothing about the URL; do not
    // discard a resolution on the strength of a network hiccup.
    return true
  }
}

async function resolveAcrossClients(videoId) {
  const normal = [preferredClient, ...PLAYER_CLIENTS.filter((client) => client !== preferredClient)]
  let lastError = null

  for (const client of normal) {
    try {
      const resolution = await runYtDlp(videoId, client)
      // Resolving is not the same as being able to play. Verify before
      // accepting, so a client that only ever hands back refused URLs is
      // skipped here instead of failing later on /audio.
      if (!(await probeUsable(resolution.url, resolution.headers))) {
        lastError = Object.assign(new Error('googlevideo refused this URL'), { reason: 'unplayable_url' })
        continue
      }
      preferredClient = client
      return resolution
    } catch (error) {
      lastError = error
      const reason = error?.reason
      // A refusal is a property of the client, not the track, so keep climbing
      // the ladder instead of surfacing it. `tv_embedded` sits at position 2,
      // which is what makes this an escalation to a TV interface in practice.
      if (reason === 'rate_limited' || reason === 'client_needs_token') continue
      // The track itself is unplayable: stop rather than spawn three more
      // yt-dlp processes to reach the same verdict.
      if (reason && reason !== 'no_stream') throw error
    }
  }

  // Every client in the ladder was refused or empty. Make one last attempt that
  // leads with the TV-family clients: they are the ones that clear the bot check
  // most often, and by this point we have nothing left to lose but one more
  // short-lived child process.
  if (lastError?.reason === 'rate_limited' || lastError?.reason === 'client_needs_token' || lastError?.reason === 'unplayable_url') {
    for (const client of ESCALATION_CLIENTS) {
      try {
        const resolution = await runYtDlp(videoId, client)
        if (!(await probeUsable(resolution.url, resolution.headers))) {
          lastError = Object.assign(new Error('googlevideo refused this URL'), { reason: 'unplayable_url' })
          continue
        }
        preferredClient = client
        return resolution
      } catch (error) {
        lastError = error
      }
    }
  }

  throw lastError ?? Object.assign(new Error('yt-dlp produced no stream'), { reason: 'no_stream' })
}

function pickHeaders(raw) {
  const picked = {}
  for (const [name, value] of Object.entries(raw ?? {})) {
    if (typeof value === 'string' && REPLAYED_HEADERS.has(name.toLowerCase())) picked[name] = value
  }
  return Object.keys(picked).length > 0 ? picked : { ...FALLBACK_HEADERS }
}

/**
 * Extract duration (in seconds) from a googlevideo URL's `dur=` parameter.
 * Returns null when the parameter isn't present.
 */
function durationFromUrl(url) {
  try {
    const match = url.match(/[?&]dur=([\d.]+)/)
    if (match) return parseFloat(match[1])
  } catch { /* ignore */ }
  return null
}

/**
 * Parse the combined stdout of `yt-dlp -g --print %(http_headers)j`.
 *
 * Output order varies by yt-dlp version — the headers JSON may appear before
 * or after the URL. We search all non-empty lines for both.
 */
function parseResolution(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  let url = null
  let headers = {}

  for (const line of lines) {
    // Quote-tolerant detection. Some yt-dlp builds and print styles wrap the
    // URL in quotes; testing the raw line here would miss it entirely and
    // report "no stream" for a track that resolved perfectly well.
    const bare = line.replace(/^[\s"']+/, '')
    if (!url && /^https?:\/\//i.test(bare)) {
      url = bare
    } else if (Object.keys(headers).length === 0 && line.startsWith('{')) {
      try { headers = JSON.parse(line) } catch { /* not valid JSON, skip */ }
    }
  }

  // The stream string is handed straight to an HTTP request and replayed in a
  // `Range` header, so any stray quote, carriage return or trailing space
  // becomes a malformed URL that fails at the byte level rather than here.
  // Strip once, defensively, at the single point the value is final.
  const cleanUrl = url ? url.replace(/^[\s"']+|[\s"']+$/g, '') : null

  return {
    url: cleanUrl || null,
    headers: pickHeaders(headers),
    durationSec: cleanUrl ? durationFromUrl(cleanUrl) : null,
  }
}

/**
 * Resolve a video to `{ url, headers, durationSec }`.
 *
 * Short-lived child process; on success we read stdout and let the process
 * exit on its own. `-g` is simulate-only, so nothing is downloaded or written
 * to disk. Rejections carry a `reason` code the UI turns into a real message.
 *
 * @param {string} videoId
 * @param {{ fresh?: boolean }} [options] `fresh` skips (and replaces) the cached entry.
 */
export function resolveAudio(videoId, options = {}) {
  const cleanVid = String(videoId || '').trim()
  if (options.fresh) {
    resolutionCache.delete(cleanVid)
    diskCache.delete(cleanVid)
  } else {
    const cached = resolutionCache.get(cleanVid)
    if (cached) return Promise.resolve(cached)
    const running = inflight.get(cleanVid)
    if (running) return running
    // Nothing in memory, but a previous session may have resolved it. Replaying
    // a stored URL costs zero upstream requests, which is the whole point.
    const persisted = recallFromDisk(cleanVid)
    if (persisted) {
      resolutionCache.set(cleanVid, persisted)
      return Promise.resolve(persisted)
    }
  }

  const job = resolveAcrossClients(cleanVid)
    .then((resolution) => {
      resolutionCache.set(cleanVid, resolution)
      rememberOnDisk(cleanVid, resolution)
      return resolution
    })
    .finally(() => {
      if (inflight.get(cleanVid) === job) inflight.delete(cleanVid)
    })

  inflight.set(cleanVid, job)
  return job
}

/** Back-compat for `/resolve`: just the URL. */
export async function resolveAudioUrl(videoId) {
  return (await resolveAudio(videoId)).url
}

export function clearCaches() {
  resolutionCache.clear()
  diskCache.clear()
}
