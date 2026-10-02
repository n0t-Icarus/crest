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

/** googlevideo URLs expire ~6h but rotate sooner; keep the cache short. */
const resolutionCache = new TtlCache(9.5 * 60_000, 64)
const inflight = new Map()

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
 * to disk.
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

  const job = new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '-g',
      '-f', FORMAT,
      '--print', '%(http_headers)j',
      `https://music.youtube.com/watch?v=${cleanVid}`,
    ]

    const child = spawn(YT_DLP, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('yt-dlp timed out'))
    }, YT_DLP_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const resolution = parseResolution(stdout.trim())
      if (code === 0 && resolution.url) {
        resolutionCache.set(videoId, resolution)
        resolve(resolution)
      } else {
        const errorLine = stderr.split('\n').map((line) => line.trim()).filter(Boolean).pop()
        reject(new Error(errorLine ?? `yt-dlp exited ${code}`))
      }
    })
  }).finally(() => {
    if (inflight.get(videoId) === job) inflight.delete(videoId)
  })

  inflight.set(videoId, job)
  return job
}

/** Back-compat for `/resolve`: just the URL. */
export async function resolveAudioUrl(videoId) {
  return (await resolveAudio(videoId)).url
}

export function clearCaches() {
  resolutionCache.clear()
}
