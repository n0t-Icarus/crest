/**
 * Live smoke test of the yt-dlp pipeline against real YouTube.
 *
 * The stub in verify-pipeline.mjs proves the ladder logic; this proves the
 * clients we chose are still accepted by YouTube today. It is intentionally
 * not a pass/fail gate — rate limits are real and a red run here is often the
 * network's fault, not the code's. It prints what happened so a human can
 * tell the two apart.
 *
 * Run: node tools/verify-real.mjs [videoId ...]
 */
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

// The vendored sidecar, so this exercises the exact binary that ships.
process.env.YTDLP_PATH = process.env.YTDLP_PATH
  || path.join(ROOT, 'src-tauri', 'binaries', 'yt-dlp-x86_64-pc-windows-msvc.exe')

const { resolveAudio } = await import('../server/mediaCore.mjs')

const DEFAULT_VIDS = ['dx4Teh-nv3A', '_pWYaGi_FiM', '4qlDWL1kMcQ']
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_VIDS

console.log(`yt-dlp: ${process.env.YTDLP_PATH}`)
console.log(`videos: ${ids.join(', ')}\n`)

let ok = 0
for (const id of ids) {
  const started = Date.now()
  try {
    const res = await resolveAudio(id, { fresh: true })
    const clean = res.url && !/[\s"']/.test(res.url) && res.url.startsWith('https://')
    if (clean) ok++
    console.log(
      `${clean ? 'OK  ' : 'DIRTY'} ${id}  ${String(Date.now() - started).padStart(6)}ms  ` +
      `dur=${res.durationSec ?? '?'}  ua=${String(res.headers['User-Agent'] ?? '').slice(0, 44)}`,
    )
  } catch (error) {
    console.log(`FAIL ${id}  ${String(Date.now() - started).padStart(6)}ms  reason=${error?.reason ?? '?'}  ${String(error?.message ?? error).slice(0, 90)}`)
  }
}

console.log(`\n${ok}/${ids.length} resolved with a fully trimmed URL.`)