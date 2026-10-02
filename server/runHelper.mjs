/**
 * Dev-lifecycle wrapper: spawns the media helper as a child of this process
 * so it lives and dies with the app's own lifecycle. The heartbeat watchdog
 * inside the helper covers abnormal parent exits; this wrapper additionally
 * forwards SIGINT/SIGTERM and kills the child when this process goes away.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'

const helperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mediaHelper.mjs')

const child = spawn(process.execPath, [helperPath], {
  stdio: 'inherit',
  env: { ...process.env, MEDIA_HELPER_PORT: process.env.MEDIA_HELPER_PORT ?? '5267' },
  windowsHide: true,
})

child.on('exit', (code) => {
  // Propagate the exit so `npm run media:helper` reflects the helper's state.
  process.exitCode = code ?? 0
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal)
    process.exit(0)
  })
}
