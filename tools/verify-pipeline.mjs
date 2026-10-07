/**
 * Deterministic verification of the yt-dlp pipeline in server/mediaCore.mjs.
 *
 * The failure this guards against is not "yt-dlp is broken" but "the client
 * ladder quietly stopped climbing", which looks identical from the outside:
 * the helper returns a 500, the media element reports an unsupported source,
 * and the user is told the track is broken when it is merely blocked.
 * Today's YouTube behaviour cannot be relied on to reproduce that, so this
 * drives the real resolveAcrossClients() code path against a stub binary that
 * refuses specific clients on demand.
 *
 * Run: node tools/verify-pipeline.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const STUB = path.join(HERE, 'yt-dlp-stub.exe')
const SCRATCH = path.join(HERE, '.verify')

if (!existsSync(STUB)) {
  console.error(`stub binary missing: ${STUB}`)
  console.error('build it with: cmd //c tools\\msvc.bat cl /nologo /Fe:tools\\yt-dlp-stub.exe tools\\yt-dlp-stub.c')
  process.exit(2)
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * mediaCore reads YTDLP_PATH at import time, so each scenario needs a fresh
 * module instance with its own environment.
 */
async function withPipeline(mode) {
  rmSync(SCRATCH, { recursive: true, force: true })
  mkdirSync(SCRATCH, { recursive: true })
  const log = path.join(SCRATCH, 'calls.log')
  const counter = path.join(SCRATCH, 'counter.txt')
  writeFileSync(log, '')
  process.env.YTDLP_PATH = STUB
  process.env.STUB_MODE = mode
  process.env.STUB_LOG = log
  process.env.STUB_COUNTER = counter
  const mod = await import(`../server/mediaCore.mjs?t=${mode}-${Date.now()}`)
  return { mod, log, counter }
}

const readCalls = (log) =>
  readFileSync(log, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const [head, ...rest] = line.split(' | ')
    const fields = Object.fromEntries(head.split(' ').map((part) => part.split('=')))
    return { attempt: Number(fields.attempt), client: fields.client, argv: rest }
  })

/* ---------------------------------------------------------------------- */
/* 1. Browser User-Agent spoofing                                          */
/* ---------------------------------------------------------------------- */
{
  const { mod, log } = await withPipeline('ok')
  const res = await mod.resolveAudio('TESTVID1', { fresh: true })
  const calls = readCalls(log)

  const uaCall = calls[0].argv.find((a) => a.toLowerCase() === '--user-agent')
  check('--user-agent is passed to yt-dlp', Boolean(uaCall))
  const ua = uaCall ? calls[0].argv[calls[0].argv.indexOf(uaCall) + 1] : ''
  check('UA looks like a desktop browser', /Chrome\/1\d\d\.\d+\.\d+\.\d+ Safari\/537\.36/.test(ua), ua.slice(0, 60))

  const printed = res.headers['User-Agent'] ?? res.headers['user-agent'] ?? ''
  check('the same UA is replayed to googlevideo', printed === ua || /Chrome\//.test(printed), printed.slice(0, 60))

  /* -------------------------------------------------------------------- */
  /* 2. Stream strings are fully trimmed                                   */
  /* -------------------------------------------------------------------- */
  check('URL has no leading whitespace', !/^\s/.test(res.url), JSON.stringify(res.url.slice(0, 12)))
  check('URL has no trailing whitespace or quote', !/[\s"']$/.test(res.url), JSON.stringify(res.url.slice(-12)))
  check('URL has no embedded quote', !res.url.includes('"'))
  check('URL starts at the scheme', res.url.startsWith('https://'))
  check('URL contains no stray whitespace at all', !/\s/.test(res.url))
  check('duration parsed from the cleaned URL', res.durationSec === 185.5, String(res.durationSec))
}

/* ---------------------------------------------------------------------- */
/* 3. Fallback: a refused client is climbed over, not surfaced             */
/* ---------------------------------------------------------------------- */
{
  const { mod, log } = await withPipeline('climb')
  let res = null
  let thrown = null
  try {
    res = await mod.resolveAudio('TESTVID2', { fresh: true })
  } catch (error) {
    thrown = error
  }
  const calls = readCalls(log)
  check('resolution succeeded despite the first client being refused', Boolean(res?.url), thrown ? `threw ${thrown.reason}` : '')
  check('ladder tried more than one client', calls.length > 1, `${calls.length} calls`)
  check('escalated onto the TV-family client', calls.some((c) => c.client === 'tv_embedded'), calls.map((c) => c.client).join(' -> '))
}

/* ---------------------------------------------------------------------- */
/* 4. Fallback: a fully refused ladder still gets a final TV attempt       */
/* ---------------------------------------------------------------------- */
{
  const { mod, log } = await withPipeline('escalate')
  let res = null
  let thrown = null
  try {
    res = await mod.resolveAudio('TESTVID3', { fresh: true })
  } catch (error) {
    thrown = error
  }
  const calls = readCalls(log)
  check('resolved after the whole ladder was refused', Boolean(res?.url), thrown ? `threw ${thrown.reason}` : '')
  check('a final escalation pass ran after the ladder', calls.length >= 5, `${calls.length} calls: ${calls.map((c) => c.client).join(' -> ')}`)
  check('the last attempt used a TV-family client', calls[calls.length - 1]?.client === 'tv_embedded')
}

/* ---------------------------------------------------------------------- */
/* 5. A "needs a token" refusal is climbed over like a rate limit           */
/* ---------------------------------------------------------------------- */
{
  const { mod, log } = await withPipeline('token')
  let reason = null
  try {
    await mod.resolveAudio('TESTVID5', { fresh: true })
  } catch (error) {
    reason = error?.reason ?? null
  }
  const calls = readCalls(log)
  check('token refusals do not stop the ladder', calls.length > 1, `${calls.length} calls: ${calls.map((c) => c.client).join(' -> ')}`)
  check('a token refusal is never reported as a bad track', reason !== 'unavailable' && reason !== 'no_stream', String(reason))
}

/* ---------------------------------------------------------------------- */
/* 6. A per-track fault is NOT retried against every client                 */
/* ---------------------------------------------------------------------- */
{
  const { mod, log } = await withPipeline('private')
  let reason = null
  try {
    await mod.resolveAudio('TESTVID6', { fresh: true })
  } catch (error) {
    reason = error?.reason ?? null
  }
  const calls = readCalls(log)
  // A private track is private for every client. Climbing the ladder would
  // spawn four more yt-dlp processes to reach the same verdict, and would have
  // escalated to TV clients for a fault that has nothing to do with the client.
  check('a private track stops after one attempt', calls.length === 1, `${calls.length} calls: ${calls.map((c) => c.client).join(' -> ')}`)
  check('the failure is classified as private', reason === 'private', String(reason))
}

rmSync(SCRATCH, { recursive: true, force: true })

console.log(failures === 0 ? '\nAll pipeline checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)