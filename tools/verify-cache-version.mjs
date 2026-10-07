/**
 * Verify the versioned disk cache: it must write the new shape, replay it, and
 * REFUSE to load a pre-fix file (which can only contain unprobed URLs).
 *
 * Deterministic: the stale file is seeded by hand, and the replay child points
 * YTDLP_PATH nowhere, so a cache miss fails loudly instead of quietly working.
 *
 * Run: node tools/verify-cache-version.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CACHE = path.join(ROOT, 'tools', '.cache-version.json')
const MISSING = path.join(ROOT, 'tools', 'definitely-not-yt-dlp.exe')
const CORE_URL = pathToFileURL(path.join(ROOT, 'server', 'mediaCore.mjs')).href

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const child = (body, extraEnv = {}) => spawnSync(
  process.execPath,
  ['--input-type=module', '-e', `
    const { resolveAudio } = await import(${JSON.stringify(CORE_URL)});
    ${body}
  `],
  {
    env: { ...process.env, YTDLP_PATH: MISSING, CREST_RESOLUTION_CACHE: CACHE, ...extraEnv },
    encoding: 'utf8',
    timeout: 60_000,
  },
)

rmSync(CACHE, { force: true })

// 1. A stale (pre-fix) cache must NOT be replayed: yt-dlp points nowhere, so a
//    successful resolve proves the entry was ignored and re-resolved.
mkdirSync(path.dirname(CACHE), { recursive: true })
writeFileSync(CACHE, JSON.stringify({
  DEADBEEF: { url: 'https://example.invalid/stale.m4a', at: Date.now() },
}))

const stale = child(`
  try {
    const r = await resolveAudio('DEADBEEF');
    console.log('REPLAYED:' + r.url);
  } catch (e) {
    console.log('IGNORED_AS_EXPECTED');
  }
`)
const staleOut = (stale.stdout || '').trim()
check(
  'a pre-fix cache file is rejected, not replayed',
  staleOut.includes('IGNORED_AS_EXPECTED'),
  staleOut.slice(0, 70) || `exit ${stale.status}`,
)

// 2. A fresh write must use the versioned shape.
mkdirSync(path.dirname(CACHE), { recursive: true })
writeFileSync(CACHE, JSON.stringify({
  version: 2,
  entries: { KEEPME: { url: 'https://example.invalid/keep.m4a', at: Date.now(), headers: {} } },
}))
const kept = child(`
  try {
    const r = await resolveAudio('KEEPME');
    console.log('REPLAYED:' + r.url);
  } catch (e) {
    console.log('MISSED:' + String(e && e.message).slice(0, 60));
  }
`)
const keptOut = (kept.stdout || '').trim()
check('a current-shape cache still replays', keptOut.includes('https://example.invalid/keep.m4a'), keptOut.slice(0, 70))

// 3. After a real write, the file on disk must carry the version field.
const real = spawnSync(process.execPath, ['--input-type=module', '-e', `
  const { resolveAudio } = await import(${JSON.stringify(CORE_URL)});
  try { const r = await resolveAudio('dQw4w9WgXcQ', { fresh: true }); console.log('ok:' + Boolean(r.url)); }
  catch (e) { console.log('err:' + String(e && e.message).slice(0, 80)); }
`], {
  env: {
    ...process.env,
    YTDLP_PATH: path.join(ROOT, 'src-tauri', 'binaries', 'yt-dlp-x86_64-pc-windows-msvc.exe'),
    CREST_RESOLUTION_CACHE: CACHE,
  },
  encoding: 'utf8',
  timeout: 180_000,
})
const wrote = (real.stdout || '').trim()
let shape = null
if (existsSync(CACHE)) {
  try {
    const parsed = JSON.parse(readFileSync(CACHE, 'utf8'))
    shape = { version: parsed.version, entries: Object.keys(parsed.entries ?? {}).length }
  } catch { shape = 'unparseable' }
}
check('a fresh write stamps the version', wrote.startsWith('ok:') && shape?.version === 2, `result=${wrote.slice(0, 40)} file=${JSON.stringify(shape)}`)

// 4. That stamped file must be readable by a brand-new process.
const replay = child(`
  try { const r = await resolveAudio('dQw4w9WgXcQ'); console.log('REPLAYED:' + Boolean(r.url)); }
  catch (e) { console.log('MISSED:' + String(e && e.message).slice(0, 60)); }
`)
check(
  'the stamped file replays across a process boundary',
  (replay.stdout || '').includes('REPLAYED:true'),
  (replay.stdout || '').trim().slice(0, 70),
)

rmSync(CACHE, { force: true })
console.log(failures === 0 ? '\nCache versioning verified.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)