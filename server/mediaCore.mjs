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
import process from 'node:process'
import { TtlCache } from './ttl.mjs'

const YT_DLP_TIMEOUT_MS = 30_000

/** In the packaged app the Rust shell points this at the bundled yt-dlp.exe. */
const YT_DLP = process.env.YTDLP_PATH || 'yt-dlp'

/** Browser-friendly native audio (m4a/AAC first, then any bestaudio). */
const FORMAT = 'bestaudio[ext=m4a]/bestaudio'

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
 * lie, because the track plays perfectly well in a browser. `web_embedded` is
 * not behind that check, so it leads; the rest are recovery for the day
 * YouTube gates a different set. Verified 5/5 tracks on a rate-limited IP.
 */
const PLAYER_CLIENTS = ['web_embedded', 'web', 'default']

/** The client that worked last, so the common path costs one child process. */
let preferredClient = PLAYER_CLIENTS[0]

/** googlevideo URLs expire ~6h but rotate sooner; keep the cache short. */
const resolutionCache = new TtlCache(9.5 * 60_000, 64)
const inflight = new Map()

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
  if (text.includes('removed') || text.includes('unavailable') || text.includes('deleted')) return 'unavailable'
  if (text.includes('timed out')) return 'timeout'
  if (code === 0) return 'no_stream'
  return 'error'
}

/** Run yt-dlp once against one player client. */
function runYtDlp(videoId, client) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '-g',
      '-f', FORMAT,
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
      const resolution = parseResolution(stdout.trim())
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
 * A track that genuinely cannot play (private, removed, geo-blocked) is not a
 * client problem, so those stop immediately rather than spawning three more
 * yt-dlp processes to reach the same verdict.
 */
async function resolveAcrossClients(videoId) {
  const order = [preferredClient, ...PLAYER_CLIENTS.filter((client) => client !== preferredClient)]
  let lastError = null
  for (const client of order) {
    try {
      const resolution = await runYtDlp(videoId, client)
      preferredClient = client
      return resolution
    } catch (error) {
      lastError = error
      if (error?.reason && error.reason !== 'rate_limited' && error.reason !== 'no_stream') throw error
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
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  let url = null
  let headers = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!url && /^https?:\/\//i.test(trimmed)) {
      url = trimmed.replace(/^["']|["']$/g, '').trim()
    } else if (Object.keys(headers).length === 0 && trimmed.startsWith('{')) {
      try { headers = JSON.parse(trimmed) } catch { /* not valid JSON, skip */ }
    }
  }

  const cleanUrl = url ? url.replace(/^["']|["']$/g, '').trim() : null

  return {
    url: cleanUrl,
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
  } else {
    const cached = resolutionCache.get(cleanVid)
    if (cached) return Promise.resolve(cached)
    const running = inflight.get(cleanVid)
    if (running) return running
  }

  const job = resolveAcrossClients(cleanVid)
    .then((resolution) => {
      resolutionCache.set(cleanVid, resolution)
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
}
