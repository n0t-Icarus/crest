/**
 * Measure the extraction pacing gate, without touching YouTube.
 *
 * The bug this fix addresses is not "a client was refused" — it is that a burst
 * of extractions is what earns the IP a block in the first place. So the
 * property worth proving is the one the fix actually changes: **extractions are
 * spaced in time, not fired together.**
 *
 * The stub binary is not used here on purpose. Pointing YTDLP_PATH at a path
 * that does not exist still drives every code path through the gate — each
 * attempt just fails instantly instead of doing network work. Wall clock then
 * measures the gate alone, with no upstream traffic and no dependence on
 * whether a locally linked binary is allowed to execute on this machine.
 *
 * Run: node tools/measure-pacing.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const MISSING = path.join(ROOT, 'tools', 'definitely-not-yt-dlp.exe')
const CACHE = path.join(ROOT, 'tools', '.pacing-cache.json')

// On Windows a bare "D:/..." absolute path is not a valid ESM specifier, so the
// child processes have to import via a file:// URL. Without this the child dies
// with ERR_UNSUPPORTED_ESM_URL_SCHEME and the real cause is invisible.
const CORE_URL = pathToFileURL(path.join(ROOT, 'server', 'mediaCore.mjs')).href

// Node crash reports end with a bare "Node.js v24.x" line that says nothing.
// Keep the informative part of a child's stderr instead.
const tail = (text) => (text || '')
  .split(/\r?\n/)
  .filter((line) => line.trim() && !/^Node\.js v/.test(line.trim()))
  .slice(-3)
  .join(' | ')

// Matches MIN_SPAWN_GAP_MS in server/mediaCore.mjs. Duplicated deliberately:
// this is a measurement, and importing the constant would let a change to the
// gate silently redefine what "correct" means.
const MIN_SPAWN_GAP_MS = 400
const CONCURRENT_CALLS = 3
/** Every call climbs the whole ladder when the binary is missing. */
const ATTEMPTS_PER_CALL = 4
const TOTAL_SLOTS = CONCURRENT_CALLS * ATTEMPTS_PER_CALL

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/* ---------------------------------------------------------------------- */
/* 1. A burst is serialised by the gate, not fired together                 */
/* ---------------------------------------------------------------------- */
rmSync(CACHE, { force: true })
process.env.CREST_RESOLUTION_CACHE = CACHE
process.env.YTDLP_PATH = MISSING

const { resolveAudio } = await import('../server/mediaCore.mjs')

const started = Date.now()
const settled = await Promise.allSettled(
  Array.from({ length: CONCURRENT_CALLS }, (_, i) => resolveAudio(`PACING${i}`, { fresh: true })),
)
const wall = Date.now() - started

// With no gate, every attempt fails instantly and the whole burst finishes in
// well under a second. With the gate it cannot be faster than (slots - 1) gaps.
const unpacedBound = TOTAL_SLOTS * 40
const pacedFloor = (TOTAL_SLOTS - 1) * MIN_SPAWN_GAP_MS * 0.8

console.log(`${CONCURRENT_CALLS} concurrent resolutions, ${TOTAL_SLOTS} gate slots total`)
console.log(`wall clock: ${wall}ms  (unpaced would be <~${unpacedBound}ms, gate floor ~${Math.round(pacedFloor)}ms)\n`)

check(
  'the burst was serialised by the pacing gate',
  wall >= pacedFloor,
  `${wall}ms >= ${Math.round(pacedFloor)}ms`,
)
check(
  'a burst is far slower than an unpaced one',
  wall > unpacedBound,
  `${wall}ms vs <~${unpacedBound}ms unpaced`,
)
check(
  'every call still resolved to a definite failure',
  settled.every((r) => r.status === 'rejected'),
  `${settled.filter((r) => r.status === 'fulfilled').length} unexpectedly succeeded`,
)

/* ---------------------------------------------------------------------- */
/* 2. The persistent cache answers a replay with zero extractions           */
/* ---------------------------------------------------------------------- */
/**
 * Proved across a process boundary on purpose.
 *
 * The in-memory cache would make this pass trivially and prove nothing. A fresh
 * process sharing only the cache file is the real test: if the disk cache were
 * broken, this second resolve would try to spawn and would fail, because the
 * yt-dlp path in this process does not exist.
 */
const realYtdlp = path.join(ROOT, 'src-tauri', 'binaries', 'yt-dlp-x86_64-pc-windows-msvc.exe')
if (!existsSync(realYtdlp)) {
  console.log('\nSKIP  persistent cache replay (vendored yt-dlp not present)')
} else {
  const CACHE_SEED = process.argv[2] ?? 'dQw4w9WgXcQ'
  const seedScript = `
    const { resolveAudio } = await import(${JSON.stringify(CORE_URL)});
    const r = await resolveAudio(${JSON.stringify(CACHE_SEED)}, { fresh: true });
    console.log(JSON.stringify({ url: r.url, dur: r.durationSec }));
  `
  const seeded = spawnSync(process.execPath, ['--input-type=module', '-e', seedScript], {
    env: {
      ...process.env,
      YTDLP_PATH: realYtdlp,
      CREST_RESOLUTION_CACHE: CACHE,
    },
    encoding: 'utf8',
    timeout: 120_000,
  })

  if (seeded.status !== 0 || !seeded.stdout.trim()) {
    check('seeded the persistent cache from a real extraction', false,
      tail(seeded.stderr) || `exit ${seeded.status}`)
  } else {
    const first = JSON.parse(seeded.stdout.trim().split(/\r?\n/).pop())
    check('seeded the persistent cache from a real extraction', Boolean(first.url), `dur=${first.dur}`)

    const replayScript = `
      const { resolveAudio } = await import(${JSON.stringify(CORE_URL)});
      const r = await resolveAudio(${JSON.stringify(CACHE_SEED)});
      console.log(JSON.stringify({ url: r.url, dur: r.durationSec }));
    `
    const replayStart = Date.now()
    const replayed = spawnSync(process.execPath, ['--input-type=module', '-e', replayScript], {
      // yt-dlp deliberately points nowhere: a cache miss would fail here, which
      // is exactly the signal we want.
      env: { ...process.env, YTDLP_PATH: MISSING, CREST_RESOLUTION_CACHE: CACHE },
      encoding: 'utf8',
      timeout: 30_000,
    })
    const replayWall = Date.now() - replayStart

    if (replayed.status !== 0 || !replayed.stdout.trim()) {
      check('a fresh process replays it with zero extractions', false,
        tail(replayed.stderr) || `exit ${replayed.status}`)
    } else {
      const second = JSON.parse(replayed.stdout.trim().split(/\r?\n/).pop())
      check('a fresh process replays it with zero extractions', Boolean(second.url))
      check('the replayed URL is identical', second.url === first.url)
      check('the replay did not touch the network', replayWall < 5_000, `${replayWall}ms`)
    }
  }
}

rmSync(CACHE, { force: true })
console.log(failures === 0 ? '\nPacing holds and the cache replays.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)