/**
 * Thin bridge to the Tauri shell.
 *
 * The UI never talks to Tauri directly: everything funnelled through here, and
 * every call degrades to a no-op in a plain browser so `npm run dev` can be used
 * for fast visual iteration without the Rust host running.
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

type TauriWindow = {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
  show: () => Promise<void>
  hide: () => Promise<void>
  setFullscreen: (value: boolean) => Promise<void>
  onResized: (cb: () => void) => Promise<() => void>
}

let cachedWindow: TauriWindow | null = null

async function currentWindow(): Promise<TauriWindow | null> {
  if (!isTauri()) return null
  if (cachedWindow) return cachedWindow
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  cachedWindow = getCurrentWindow() as unknown as TauriWindow
  return cachedWindow
}

/** Reveal the main window once the first frame has painted. */
export async function revealWindow(): Promise<void> {
  const win = await currentWindow()
  if (!win) return
  try {
    await win.show()
  } catch {
    /* window already visible */
  }
}

export async function minimizeWindow(): Promise<void> {
  ;(await currentWindow())?.minimize()
}

export async function toggleMaximizeWindow(): Promise<void> {
  ;(await currentWindow())?.toggleMaximize()
}

export async function closeWindow(): Promise<void> {
  ;(await currentWindow())?.close()
}

export async function isWindowMaximized(): Promise<boolean> {
  const win = await currentWindow()
  return win ? win.isMaximized() : false
}

export async function toggleFullscreen(): Promise<void> {
  const win = await currentWindow()
  if (!win) return
  const maximized = await win.isMaximized()
  win.setFullscreen(!maximized)
}

/** Subscribe to window resize events. Returns an unsubscribe function. */
export function onWindowResized(cb: () => void): () => void {
  if (!isTauri()) return () => {}
  let dispose: (() => void) | null = null
  let cancelled = false
  void (async () => {
    const win = await currentWindow()
    if (!win) return
    const unlisten = await win.onResized(cb)
    if (cancelled) unlisten()
    else dispose = unlisten
  })()
  return () => {
    cancelled = true
    dispose?.()
  }
}

export type AppInfo = {
  name: string
  codename: string
  version: string
  platform: string
}

/** Static build metadata reported by the Rust side. */
export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<AppInfo>('app_info')
  } catch {
    return null
  }
}
