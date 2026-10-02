/**
 * Vite plugin: media helper lifecycle.
 *
 * Spawns the local media helper when the dev server starts (and during
 * `tauri dev`, which runs the same Vite server) and kills it — along with any
 * yt-dlp children — when the server closes. In production the same job is done
 * by the Tauri shell (src-tauri) spawning the helper alongside the app.
 *
 * The helper also has its own heartbeat watchdog. In dev this process sends
 * keepalive heartbeats while the dev server is alive so the helper does not
 * exit while the developer is editing with no webview open; the webview sends
 * the same heartbeat at runtime, which is the only channel in production.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

const helperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'mediaHelper.mjs')
const helperPort = process.env.MEDIA_HELPER_PORT ?? '5267'

async function heartbeat(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${helperPort}/health`, { signal: AbortSignal.timeout(2000) })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Ask any leftover helper on the same port to shut down gracefully, then wait
 * up to 3 s for the port to clear. This prevents `EADDRINUSE` crashes when the
 * previous dev session didn't exit cleanly.
 */
async function evictStaleHelper(): Promise<void> {
  const alive = await heartbeat()
  if (!alive) return
  try {
    await fetch(`http://127.0.0.1:${helperPort}/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    /* already gone or unresponsive */
  }
  // Wait for the port to actually free up.
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (!(await heartbeat())) return
  }
}

/**
 * Kill any process listening on the given TCP port (Windows only).
 * Used to clear stale Vite/helper processes that didn't exit cleanly.
 */
function killPortHolder(port: number): void {
  try {
    const output = execSync(`netstat -ano | findstr "LISTENING" | findstr ":${port}"`, {
      encoding: 'utf-8',
      windowsHide: true,
    })
    const pids = new Set<number>()
    for (const line of output.split('\n')) {
      const match = line.trim().match(/\s(\d+)\s*$/)
      if (match) pids.add(Number(match[1]))
    }
    for (const pid of pids) {
      if (pid === process.pid || pid === 0) continue
      try {
        execSync(`taskkill /PID ${pid} /F`, { windowsHide: true, stdio: 'ignore' })
      } catch { /* already gone */ }
    }
    // Brief pause for the OS to release the port.
    if (pids.size > 0) execSync('timeout /T 1 /NOBREAK >nul 2>&1', { windowsHide: true, stdio: 'ignore' })
  } catch {
    /* netstat found nothing or not on Windows — fine, move on */
  }
}

export function mediaHelperPlugin(): Plugin {
  let child: ChildProcess | null = null
  let shuttingDown = false
  let keepalive: ReturnType<typeof setInterval> | null = null

  const stop = () => {
    if (keepalive) {
      clearInterval(keepalive)
      keepalive = null
    }
    if (!child || shuttingDown) return
    shuttingDown = true
    try {
      child.kill()
    } catch {
      /* already gone */
    }
    child = null
  }

  return {
    name: 'crest-media-helper',

    // `config` fires *before* the HTTP server binds its port, so this is our
    // one chance to free port 5273 (Vite, strictPort) from stale processes.
    async config(config) {
      const vitePort = config.server?.port ?? 5273
      killPortHolder(vitePort)
      // Also evict any stale media helper to free port 5267.
      await evictStaleHelper()
    },

    configureServer(server: ViteDevServer) {
      const startHelper = () => {
        if (shuttingDown) return
        try {
          child = spawn(process.execPath, [helperPath], {
            stdio: 'inherit',
            env: { ...process.env, MEDIA_HELPER_PORT: helperPort },
            windowsHide: true,
          })
          child.on('exit', (code) => {
            if (!shuttingDown) server.config.logger.info(`[media-helper] exited (${code ?? 'signal'})`)
            child = null
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          server.config.logger.warn(`[media-helper] failed to start: ${message}`)
        }
      }

      startHelper()

      // Dev keepalive: the helper stays while the dev server stays.
      void heartbeat()
      keepalive = setInterval(async () => {
        if (shuttingDown) return
        const alive = await heartbeat()
        if (!alive && !child && !shuttingDown) {
          server.config.logger.info('[media-helper] restarting media helper...')
          startHelper()
        }
      }, 5_000)

      // Clean shutdown alongside the Vite server.
      server.httpServer?.once('close', stop)
      process.once('exit', stop)
      process.once('SIGINT', () => {
        stop()
        process.exit(0)
      })
      process.once('SIGTERM', stop)
    },
  }
}
