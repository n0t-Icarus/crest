/**
 * Media helper service.
 *
 * A tiny local HTTP server the Crest webview talks to for the "YouTube
 * Music" source. It exists only while the app runs: the webview heartbeats
 * `/health` every few seconds, and the process exits — taking every yt-dlp
 * child with it — after HEARTBEAT_TTL_MS without a beat, on `/shutdown`, or
 * on SIGINT/SIGTERM. No disk writes anywhere.
 *
 * Endpoints (all local-only, no auth):
 *   GET  /health                 → { ok: true }          (heartbeat)
 *   POST /shutdown               → exits the process
 *   GET  /search?q=&limit=       → track results
 *   GET  /home?mood=&limit=      → moods + editorial home shelves
 *   GET  /moods                  → the mood chip rail
 *   GET  /shelves?mood=&limit=   → home shelves, optionally filtered by mood
 *   GET  /related?vid=&limit=    → per-track recommendations
 *   GET  /radio?vid=&limit=      → a radio queue seeded from a track
 *   GET  /track?vid=             → one track's details
 *   GET  /album?id=              → album metadata + full track list
 *   GET  /artist?id=             → artist metadata + top tracks
 *   GET  /playlist?id=           → playlist metadata + full track list
 *   GET  /resolve?vid=           → { url } direct googlevideo audio URL (yt-dlp child)
 *   GET  /audio?vid=             → range-proxied full-length audio stream
 *
 * `/audio` is the endpoint the player actually uses: it resolves the URL via
 * a short-lived `yt-dlp -g -f "bestaudio[ext=m4a]/bestaudio"` child process,
 * then pipes the upstream bytes straight through (Range supported) so nothing
 * is ever written to disk and seeking works.
 */

import http from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import process from 'node:process'
import { searchAll, searchMusics, searchAlbums, searchArtists, searchPlaylists, albumTracks, artistDetails, playlistTracks, trackDetails, homeFeed, moodChips, homeShelves, relatedTracks, radioTracks } from './ytmusic.mjs'
import { resolveAudio, clearCaches } from './mediaCore.mjs'
import { setRegion } from './innertube.mjs'
import { listRegions, resolveRegion } from './regions.mjs'

const PORT = Number(process.env.MEDIA_HELPER_PORT ?? 5267)
const HOST = '127.0.0.1'
// No beat for 15s → the app is gone → shut down. (Override exists for manual
// debugging; the app always runs it at the default.)
const HEARTBEAT_TTL_MS = Number(process.env.MEDIA_HELPER_TTL_MS ?? 15_000)
/** Startup window before the first heartbeat is expected. */
const FIRST_HEARTBEAT_GRACE_MS = Number(process.env.MEDIA_HELPER_GRACE_MS ?? 180_000)
const UPSTREAM_TIMEOUT_MS = 20_000
/** googlevideo rejects Range spans much over ~1 MiB (403); keep each upstream read small. */
const AUDIO_CHUNK_BYTES = 1024 * 1024
/** Fresh URL + backoff per attempt, for the short throttles googlevideo applies. */
const UPSTREAM_ATTEMPTS = 3
const UPSTREAM_BACKOFF_MS = [2000, 5000]
/**
 * Circuit breaker.
 *
 * One 403 means the network is being throttled, and every further request made
 * during that window deepens it. So after a refusal the helper stops resolving
 * entirely for a short while, which both protects the user from a queue full
 * of instant failures and lets the throttle actually decay. Without this,
 * skipping through a playlist turns one blocked track into a blocked session.
 */
const THROTTLE_COOLDOWN_MS = 30_000
let throttleUntil = 0
const DEBUG = process.env.MEDIA_HELPER_DEBUG === '1'

/**
 * Longest we will make a *client* wait inside a request because of a cooldown.
 *
 * Longer than this and we answer straight away with `rate_limited` instead.
 * The client probes with its own timeout, so sitting on a request for the full
 * cooldown just guaranteed a timeout on the player's side — reported as "lost
 * contact with the local media helper", which blamed the wrong thing entirely
 * and did it after half a minute of frozen UI.
 */
const COOLDOWN_MAX_WAIT_MS = 1_500

function cooldownRemainingMs() {
  return Math.max(0, throttleUntil - Date.now())
}

/* -------------------------------------------------------------------------- */
/* Prewarm queue                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Speculative work is what earns the block.
 *
 * Prewarming used to spawn a yt-dlp child the moment the playhead moved, two
 * tracks deep. Every skip therefore fired three extractions at once — the
 * track being played plus two speculators — and holding Next turned that into a
 * wall of simultaneous children. YouTube answers that with an IP throttle, and
 * then the tracks the listener actually wanted all fail too.
 *
 * So prewarm is a queue drained by one worker at a fixed cadence. That keeps
 * the speculative cost roughly constant no matter how fast someone skips, and
 * when the playhead outruns the queue the speculative work is simply dropped —
 * which is right, because a track two ahead of a fast-moving playhead is stale
 * before it finishes anyway.
 */
const PREWARM_QUEUE_MAX = 3
/** Gap between speculative extractions. Far below anything that looks like a bot. */
const PREWARM_GAP_MS = 1_200
const prewarmQueue = []
let prewarmDraining = false

function enqueuePrewarm(videoId) {
  if (prewarmQueue.includes(videoId)) return
  // Drop the oldest rather than growing: the newest speculative target is the
  // one closest to the playhead, so it is the one most likely to be wanted.
  if (prewarmQueue.length >= PREWARM_QUEUE_MAX) prewarmQueue.shift()
  prewarmQueue.push(videoId)
  void drainPrewarmQueue()
}

async function drainPrewarmQueue() {
  if (prewarmDraining) return
  prewarmDraining = true
  try {
    while (prewarmQueue.length > 0) {
      // A throttle makes speculative work actively harmful, so drop the lot
      // rather than queue work we know will be refused.
      if (cooldownRemainingMs() > COOLDOWN_MAX_WAIT_MS) {
        prewarmQueue.length = 0
        break
      }
      const vid = prewarmQueue.shift()
      try {
        await resolveAudio(vid)
      } catch {
        // A failed prewarm is not an error; the real load will report it.
      }
      if (prewarmQueue.length > 0) await sleep(PREWARM_GAP_MS)
    }
  } finally {
    prewarmDraining = false
  }
}

/** Abort-aware sleep, so a client hanging up does not keep us waiting. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

let lastHeartbeat = null

setInterval(() => {
  // Before the first heartbeat (app still starting) allow a generous grace;
  // afterwards, a missed window means the app is gone → shut down completely.
  const windowMs = lastHeartbeat === null ? FIRST_HEARTBEAT_GRACE_MS : HEARTBEAT_TTL_MS
  const since = lastHeartbeat === null ? process.uptime() * 1000 : Date.now() - lastHeartbeat
  if (since > windowMs) {
    console.log('[media-helper] heartbeat expired; shutting down')
    process.exit(0)
  }
}, 5_000).unref()

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

// A player aborting a stream (seek / skip / pause) can surface as a stray stream
// error. That must never take the whole helper — and with it playback — down.
process.on('uncaughtException', (error) => {
  console.error('[media-helper] uncaught:', error?.message ?? error)
})
process.on('unhandledRejection', (error) => {
  console.error('[media-helper] unhandled rejection:', error?.message ?? error)
})

function send(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...extraHeaders,
  })
  if (payload !== undefined) res.end(payload)
  else res.end()
}

/**
 * Translate the client's Range header into the one we send upstream.
 *
 * - No Range (curl, odd clients): ask for the first 1 MiB chunk and answer 200.
 * - Open-ended or huge ranges are capped to one chunk; the player simply asks
 *   for the next range when it needs it. Spans over ~1 MiB get 403 upstream.
 * - Suffix/multi ranges are passed through untouched.
 */
function upstreamRange(clientRange) {
  if (!clientRange) return `bytes=0-${AUDIO_CHUNK_BYTES - 1}`
  const match = /^bytes=(\d*)-(\d*)$/.exec(clientRange.trim())
  if (!match || match[1] === '') return clientRange
  const start = Number(match[1])
  const end = match[2] === '' ? Number.POSITIVE_INFINITY : Number(match[2])
  return `bytes=${start}-${Math.min(end, start + AUDIO_CHUNK_BYTES - 1)}`
}

/** googlevideo reports video/* for some audio itags; the media element cares. */
function audioMime(type) {
  if (!type) return 'audio/mp4'
  if (/^video\/mp4/i.test(type)) return 'audio/mp4'
  if (/^video\/webm/i.test(type)) return 'audio/webm'
  return type
}

/**
 * Fetch upstream with the headers yt-dlp used for this URL. A stale/rejected URL
 * (401/403/404/410) is re-resolved once before giving up.
 */
async function fetchUpstream(vid, range, signal) {
  let lastStatus = null
  // Was the cooldown already running when this request arrived? That decides
  // whether a 403 below means "back off and tell the caller" or "this is my own
  // refusal, resolve a fresh URL and try again". Without this split the first
  // 403 set a 30s cooldown and then immediately bailed out of its own retry
  // loop, so UPSTREAM_ATTEMPTS was never reached for the one failure that
  // matters.
  const enteredThrottled = cooldownRemainingMs() > COOLDOWN_MAX_WAIT_MS
  // 403 from googlevideo is usually a short-lived throttle, not a dead track:
  // burst a few tracks and the next request gets refused for a bit. Resolve a
  // fresh URL and back off rather than surfacing a failure the retry would fix.
  for (let attempt = 0; attempt < UPSTREAM_ATTEMPTS; attempt += 1) {
    // Respect a cooldown left behind by an earlier refusal, but only briefly —
    // see COOLDOWN_MAX_WAIT_MS.
    const cooling = cooldownRemainingMs()
    if (cooling > 0 && !signal.aborted) await sleep(Math.min(cooling, COOLDOWN_MAX_WAIT_MS), signal)
    const media = await resolveAudio(vid, { fresh: attempt > 0 })
    // One gate per attempt: the client aborting tears the upstream down (headers
    // phase *and* body), while the timeout below only guards the headers phase —
    // a timer that outlived the headers would cut long audio streams short.
    const gate = new AbortController()
    const forward = () => gate.abort()
    signal.addEventListener('abort', forward, { once: true })
    const headerTimer = setTimeout(() => gate.abort(), UPSTREAM_TIMEOUT_MS)
    let response
    try {
      response = await fetch(media.url, {
        headers: { ...media.headers, Range: range, 'Accept-Encoding': 'identity' },
        signal: gate.signal,
      })
    } catch (error) {
      signal.removeEventListener('abort', forward)
      throw error
    } finally {
      clearTimeout(headerTimer)
    }
    if (response.ok || response.status === 416) return response
    signal.removeEventListener('abort', forward)
    await response.body?.cancel().catch(() => undefined)
    console.warn(`[media-helper] /audio ${vid} upstream ${response.status} (attempt ${attempt + 1})`)
    lastStatus = response.status
    if (response.status === 403) throttleUntil = Date.now() + THROTTLE_COOLDOWN_MS
    // Only bail early when we were already throttled on arrival. A cooldown we
    // just set ourselves must not cancel our own retries: the whole point of
    // this loop is to re-resolve a fresh URL after a refusal.
    if (enteredThrottled && cooldownRemainingMs() > COOLDOWN_MAX_WAIT_MS) {
      // Nothing this request does can succeed yet. Say so now rather than after
      // a long, silent wait that the player would time out on.
      const error = new Error('upstream throttled')
      error.reason = 'rate_limited'
      throw error
    }
    // 404/410 mean the track itself is gone; retrying only wastes seconds.
    if ([404, 410].includes(response.status)) break
    if (attempt < UPSTREAM_ATTEMPTS - 1 && !signal.aborted) {
      await sleep(UPSTREAM_BACKOFF_MS[attempt] ?? 1500, signal)
    }
  }
  const error = new Error(`upstream ${lastStatus ?? 'error'}`)
  // A refused stream is the throttle case, so say so instead of "unsupported".
  error.reason = lastStatus === 403 ? 'rate_limited' : 'error'
  throw error
}

/** Pipes an upstream audio response to the client, preserving Range semantics. */
async function proxyAudio(req, res, vid) {
  const clientRange = req.headers.range
  const controller = new AbortController()
  // If the player aborts (seek/next/pause) tear down the upstream fetch too.
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })

  const response = await fetchUpstream(vid, upstreamRange(clientRange), controller.signal)
  if (DEBUG) console.log(`[media-helper] /audio ${vid} range=${clientRange ?? '-'} -> upstream ${response.status} ${response.headers.get('content-type')} ${response.headers.get('content-range') ?? response.headers.get('content-length')}`)

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
    'Content-Type': audioMime(response.headers.get('content-type')),
  }
  const contentLength = response.headers.get('content-length')
  const contentRange = response.headers.get('content-range')
  if (contentLength) headers['Content-Length'] = contentLength
  if (contentRange) headers['Content-Range'] = contentRange

  if (response.status === 416) {
    res.writeHead(416, headers)
    res.end()
    return
  }
  // Partial content only when the client actually asked for a range.
  const status = clientRange && response.status === 206 ? 206 : 200
  if (status === 200) delete headers['Content-Range']
  res.writeHead(status, headers)
  if (!response.body) {
    res.end()
    return
  }
  // Pipe the web ReadableStream straight through — zero buffering to disk.
  const body = Readable.fromWeb(response.body)
  try {
    await pipeline(body, res)
  } catch (error) {
    if (controller.signal.aborted || res.writableEnded) return
    if (!res.headersSent) throw error
    res.destroy()
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  const path = url.pathname

  if (req.method === 'OPTIONS') {
    send(res, 204, undefined, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Private-Network': 'true',
    })
    return
  }

  try {
    switch (path) {
      case '/health': {
        lastHeartbeat = Date.now()
        send(res, 200, { ok: true })
        return
      }
      case '/shutdown': {
        send(res, 200, { ok: true })
        setTimeout(() => process.exit(0), 50)
        return
      }
      case '/clear-cache': {
        lastHeartbeat = Date.now()
        clearCaches()
        send(res, 200, { ok: true })
        return
      }
      case '/search': {
        lastHeartbeat = Date.now()
        const tracks = await searchMusics(url.searchParams.get('q') ?? '', Number(url.searchParams.get('limit') ?? 20))
        send(res, 200, { tracks })
        return
      }
      case '/regions': {
        lastHeartbeat = Date.now()
        send(res, 200, { regions: listRegions() })
        return
      }
      case '/home': {
        lastHeartbeat = Date.now()
        // Set the market before the feed is built: the Innertube session reads
        // gl/hl when the request is made, so this has to happen first.
        setRegion(resolveRegion(url.searchParams.get('region') ?? ''))
        const result = await homeFeed({
          mood: url.searchParams.get('mood') ?? '',
          limit: Number(url.searchParams.get('limit') ?? 8),
        })
        send(res, 200, result)
        return
      }
      case '/moods': {
        lastHeartbeat = Date.now()
        send(res, 200, { moods: await moodChips() })
        return
      }
      case '/shelves': {
        lastHeartbeat = Date.now()
        const shelves = await homeShelves({
          mood: url.searchParams.get('mood') ?? '',
          limit: Number(url.searchParams.get('limit') ?? 8),
        })
        send(res, 200, { shelves })
        return
      }
      case '/related': {
        lastHeartbeat = Date.now()
        const tracks = await relatedTracks(url.searchParams.get('vid') ?? '', Number(url.searchParams.get('limit') ?? 12))
        send(res, 200, { tracks })
        return
      }
      case '/radio': {
        lastHeartbeat = Date.now()
        const tracks = await radioTracks(url.searchParams.get('vid') ?? '', Number(url.searchParams.get('limit') ?? 25))
        send(res, 200, { tracks })
        return
      }
      case '/track': {
        lastHeartbeat = Date.now()
        const track = await trackDetails(url.searchParams.get('vid') ?? '')
        send(res, 200, { track })
        return
      }
      case '/album': {
        lastHeartbeat = Date.now()
        send(res, 200, await albumTracks(url.searchParams.get('id') ?? ''))
        return
      }
      case '/artist': {
        lastHeartbeat = Date.now()
        send(res, 200, await artistDetails(url.searchParams.get('id') ?? ''))
        return
      }
      case '/playlist': {
        lastHeartbeat = Date.now()
        send(res, 200, await playlistTracks(url.searchParams.get('id') ?? ''))
        return
      }
      case '/search-all': {
        lastHeartbeat = Date.now()
        const q = url.searchParams.get('q') ?? ''
        send(res, 200, await searchAll(q))
        return
      }
      case '/resolve': {
        lastHeartbeat = Date.now()
        const vid = (url.searchParams.get('vid') ?? '').trim()
        const { url: streamUrl, durationSec } = await resolveAudio(vid)
        send(res, 200, { url: streamUrl ? streamUrl.trim() : null, durationSec })
        return
      }
      case '/prewarm': {
        // Fire-and-forget: resolve the next track's URL so its /audio starts
        // instantly. Queued rather than spawned — see drainPrewarmQueue.
        lastHeartbeat = Date.now()
        const vid = (url.searchParams.get('vid') ?? '').trim()
        // Nothing to gain from spawning a yt-dlp child we already know will be
        // refused — it just burns CPU while the network recovers.
        if (cooldownRemainingMs() <= COOLDOWN_MAX_WAIT_MS && /^[A-Za-z0-9_-]{6,20}$/.test(vid)) {
          enqueuePrewarm(vid)
        }
        send(res, 202, { ok: true })
        return
      }
      case '/audio': {
        lastHeartbeat = Date.now()
        const vid = (url.searchParams.get('vid') ?? '').trim()
        if (!/^[A-Za-z0-9_-]{6,20}$/.test(vid)) {
          send(res, 400, { error: 'bad vid' })
          return
        }
        // While cooling down from an upstream 403, refuse immediately with a
        // reason the player can show. Waiting it out inside the request only
        // made the player time out and report a lost helper.
        const cooling = cooldownRemainingMs()
        if (cooling > COOLDOWN_MAX_WAIT_MS) {
          send(res, 429, { error: 'rate limited', reason: 'rate_limited' }, {
            'Retry-After': String(Math.ceil(cooling / 1000)),
          })
          return
        }
        await proxyAudio(req, res, vid)
        return
      }
      default:
        send(res, 404, { error: 'not found' })
    }
  } catch (error) {
    const message = error?.message ?? String(error)
    console.error(`[media-helper] ${path} failed:`, message)
    if (message.includes('403')) {
      console.warn('[media-helper] Upstream 403 Forbidden: YouTube rejected audio stream chunks. Run "yt-dlp -U" to update yt-dlp to the latest version.')
    }
    if (!res.headersSent) {
      // `reason` is the part the UI can act on; `error` stays the raw text for
      // anyone reading the log.
      send(res, 500, { error: message.slice(0, 200), reason: error?.reason ?? 'error' })
    } else res.end()
  }
})

// Graceful port binding: if the port is still held by a dying process, retry
// a few times before giving up. This handles the TIME_WAIT → free transition.
let retries = 0
const MAX_RETRIES = 4
const RETRY_DELAY_MS = 1500

function tryListen() {
  server.listen(PORT, HOST, () => {
    console.log(`[media-helper] listening on http://${HOST}:${PORT}`)
  })
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && retries < MAX_RETRIES) {
    retries++
    console.log(`[media-helper] port ${PORT} busy, retrying in ${RETRY_DELAY_MS}ms (attempt ${retries}/${MAX_RETRIES})`)
    setTimeout(tryListen, RETRY_DELAY_MS)
  } else {
    console.error(`[media-helper] fatal: ${err.message}`)
    process.exit(1)
  }
})

tryListen()
