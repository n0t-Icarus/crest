/**
 * Prove the *shipped* helper bundle actually contains the pipeline fixes.
 *
 * A green `npm run helper:bundle` only proves the bundler ran. It does not
 * prove the code that ships inside the installer is the code that was tested —
 * the release helper is minified, so a fix that quietly failed to bundle would
 * look identical until a user's playback broke.
 *
 * Markers are pulled out of the server sources and searched for in the built
 * bundle, so this cannot drift from the source it is checking. Both server
 * modules are read: the extraction pipeline lives in mediaCore.mjs and the
 * paced prewarm queue lives in mediaHelper.mjs, and both end up in one bundle.
 *
 * Run: node tools/verify-shipped-helper.mjs
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SOURCES = [
  path.join(ROOT, 'server', 'mediaCore.mjs'),
  path.join(ROOT, 'server', 'mediaHelper.mjs'),
]
const BUNDLE = path.join(ROOT, 'src-tauri', 'target', 'release', 'helper', 'mediaHelper.bundle.mjs')

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

let source
let bundle
try {
  source = SOURCES.map((file) => readFileSync(file, 'utf8')).join('\n')
  bundle = readFileSync(BUNDLE, 'utf8')
} catch (error) {
  console.error(`cannot read build output: ${error.message}`)
  console.error('run `npm run helper:bundle` first.')
  process.exit(2)
}

/**
 * Each entry is [label, exact substring that must appear in both files].
 *
 * Regex literals and string *contents* survive minification, but the quote
 * style around a string does not (esbuild rewrites single quotes to double),
 * so markers deliberately exclude surrounding quotes.
 */
const MARKERS = [
  ['client ladder uses player_client', 'youtube:player_client='],
  ['escalation client list', 'ESCALATION_CLIENTS'],
  ['browser User-Agent is passed', '--user-agent'],
  ['client_needs_token classification', 'needs to be reloaded'],
  ['no_stream classification', 'requested format is not available'],
  ['quote-tolerant URL detection', String.raw`replace(/^[\s"']+/`],
  ['full URL cleanup on the resolved value', String.raw`replace(/^[\s"']+|[\s"']+$/g`],
  // Pacing gate + persistent cache: the fix for repeated rate limiting.
  ['fetchability probe (root cause fix)', 'probeUsable'],
  ['probe timeout bound', 'PROBE_TIMEOUT_MS'],
  ['extraction concurrency cap', 'MAX_CONCURRENT_EXTRACTIONS'],
  ['minimum gap between spawns', 'MIN_SPAWN_GAP_MS'],
  ['pacing gate acquire', 'acquireExtractionSlot'],
  ['persistent resolution cache path', 'CREST_RESOLUTION_CACHE'],
  ['persistent resolution cache file', 'resolutions.json'],
  ['cache is written synchronously, not on an unref timer', 'flushDiskCache'],
  // Prevents an upgrade from replaying up to 4h of never-probed, dead entries.
  ['disk cache schema version gate', 'DISK_CACHE_VERSION'],
  // Paced prewarm queue replaces the old burst prewarm.
  ['paced prewarm queue', 'PREWARM_QUEUE_MAX'],
  ['prewarm queue drain', 'drainPrewarmQueue'],
  // The 403 retry loop: this was dead code until the request stopped treating
  // its own cooldown as a reason to give up.
  ['403 retry does not self-abort', 'enteredThrottled'],
]

for (const [label, needle] of MARKERS) {
  const inSource = source.includes(needle)
  const inBundle = bundle.includes(needle)
  check(
    label,
    inSource && inBundle,
    inSource ? (inBundle ? '' : 'IN SOURCE BUT MISSING FROM BUNDLE') : 'NOT FOUND IN SOURCE EITHER',
  )
}

// The released helper is a *copy* of server-dist taken during `tauri build`, so
// comparing timestamps is meaningless: a restore, a re-run of `helper:bundle`,
// or a plain file copy all move one and not the other without changing a byte.
// Compare content instead — that is what actually decides whether the
// installer ships the code that was tested.
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16)
const builtSha = sha(readFileSync(path.join(ROOT, 'server-dist', 'mediaHelper.bundle.mjs')))
const shippedSha = sha(bundle)
check(
  'installer helper is byte-identical to the current build',
  builtSha === shippedSha,
  `build=${builtSha} shipped=${shippedSha}`,
)

console.log(failures === 0 ? '\nShipped helper contains every pipeline fix.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)