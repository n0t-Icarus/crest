/**
 * Prepare the sidecars the packaged app ships with.
 *
 * `src-tauri/tauri.bundle.conf.json` declares `externalBin: ["binaries/node",
 * "binaries/yt-dlp"]`. Tauri looks for each one with the Rust target triple
 * appended and strips the suffix when it installs them, so the shell ends up
 * with a plain `node.exe` and `yt-dlp.exe` next to `Crest.exe`.
 *
 * Node: copied from the interpreter running this script, so the bundled helper
 *       always runs on a Node that was actually tested against it.
 * yt-dlp: downloaded from the official releases at a pinned version, because the
 *       copy on a developer's PATH may be stale, and a shipped build should be
 *       reproducible.
 */

import { spawnSync } from 'node:child_process'
import { chmod, mkdir, copyFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const TRIPLE = 'x86_64-pc-windows-msvc'
const YTDLP_VERSION = process.env.YTDLP_VERSION ?? '2026.08.19'
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe`

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binaries = path.join(root, 'src-tauri', 'binaries')

const nodeOut = path.join(binaries, `node-${TRIPLE}.exe`)
const ytdlpOut = path.join(binaries, `yt-dlp-${TRIPLE}.exe`)

async function exists(file) {
  try {
    return (await stat(file)).size > 0
  } catch {
    return false
  }
}

async function copyNode() {
  if (await exists(nodeOut)) {
    console.log('[sidecars] node already prepared')
    return
  }
  const from = process.execPath
  if (!from.toLowerCase().endsWith('.exe')) {
    throw new Error(`expected a Windows node.exe, got: ${from}`)
  }
  await copyFile(from, nodeOut)
  console.log(`[sidecars] node      <- ${from}`)
}

async function fetchYtdlp() {
  if (await exists(ytdlpOut)) {
    console.log('[sidecars] yt-dlp already prepared')
    return
  }
  console.log(`[sidecars] yt-dlp    downloading ${YTDLP_VERSION}…`)
  const response = await fetch(YTDLP_URL, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`yt-dlp download failed: ${response.status} ${response.statusText}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  // A redirect to an HTML error page would otherwise be written out as an exe
  // that fails mysteriously at runtime.
  if (bytes.length < 1_000_000 || bytes.subarray(0, 2).toString('latin1') !== 'MZ') {
    throw new Error(`yt-dlp download looks wrong (${bytes.length} bytes, bad header)`)
  }
  await writeFile(ytdlpOut, bytes)
  await chmod(ytdlpOut, 0o755)
  console.log(`[sidecars] yt-dlp    ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
}

/**
 * Prove the vendored yt-dlp can still resolve a URL.
 *
 * YouTube breaks older yt-dlp builds regularly — an outdated one reports
 * "The page needs to be reloaded" and the packaged app simply cannot play
 * anything. Catching that here beats discovering it after a full build.
 */
async function verifyYtdlp() {
  const probe = spawnSync(ytdlpOut,
    ['--no-playlist', '--no-warnings', '-g', '-f', 'bestaudio',
     'https://music.youtube.com/watch?v=J7p4bzqLvCw'],
    { encoding: 'utf8', timeout: 120_000, windowsHide: true })

  const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`
  if (probe.status !== 0 || !output.trim().startsWith('http')) {
    const lines = `${probe.stderr ?? ''}${probe.stdout ?? ''}`.trim().split(/\r?\n/)
    const reason = lines.at(-1) || 'no output'
    throw new Error(
      `yt-dlp ${YTDLP_VERSION} cannot resolve a track (${reason}). ` +
      'YouTube has likely blocked this version — bump YTDLP_VERSION in this script.',
    )
  }
  console.log('[sidecars] yt-dlp verified')
}

await mkdir(binaries, { recursive: true })
await copyNode()
await fetchYtdlp()
await verifyYtdlp()
console.log('[sidecars] done')