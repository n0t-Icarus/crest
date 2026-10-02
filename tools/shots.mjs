/**
 * Screenshot driver for the README.
 *
 * Drives a headless Edge over CDP rather than the interactive preview panel,
 * because that panel stamps a host badge over the window chrome which would
 * otherwise end up baked into every committed image.
 *
 * Not part of the app and not wired into any npm script. Run it manually:
 *   node tools/shots.mjs            # all shots
 *   node tools/shots.mjs home-noir  # a single shot
 *
 * Requires `npm run dev` to already be serving on 127.0.0.1:5273.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ORIGIN = 'http://127.0.0.1:5273'
const OUT = 'docs/screenshots'
const PROFILE = 'C:/tmp/edge-shots'
const PORT = 9333
const W = 1500
const H = 940

mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)

const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' })

const bye = () => { try { edge.kill() } catch {} }
process.on('exit', bye)
process.on('SIGINT', () => { bye(); process.exit(1) })

async function endpoint() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('Edge did not expose a debugging target')
}

const ws = new WebSocket(await endpoint())
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message))
    else resolve(msg.result)
  }
})

function cdp(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`))
    }, 60_000)
  })
}

async function evaluate(expression) {
  const res = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res?.exceptionDetails) throw new Error(res.exceptionDetails.text ?? 'evaluate failed')
  return res?.result?.value
}

/**
 * Force a genuinely fresh document.
 *
 * Navigating to the URL the page is already on is a no-op in CDP, so nothing
 * reloads and the previous shot's state survives. Bouncing through about:blank
 * guarantees a real document, which is what runs the seeding init script.
 */
async function goto(url) {
  await cdp('Page.navigate', { url: 'about:blank' })
  await sleep(300)
  await cdp('Page.navigate', { url })
  await sleep(1200)
}

/**
 * One init script, registered once, that seeds settings from `__shot`.
 *
 * Registering a script per shot does not work: the old ones are not reliably
 * removed and the stale seed wins, so every capture came out as the first
 * shot's theme. `__shot` is written by this script only — the app never
 * touches that key, so unlike `crest.settings` it is not overwritten on
 * rehydrate and it survives the reload.
 */
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    try {
      const wanted = localStorage.getItem('__shot')
      if (!wanted) return
      const patch = JSON.parse(wanted)
      const key = 'crest.settings'
      const raw = JSON.parse(localStorage.getItem(key) || '{}')
      raw.version = raw.version || 1
      raw.state = Object.assign({}, raw.state, patch)
      localStorage.setItem(key, JSON.stringify(raw))
    } catch (e) {}
  })()`,
})

async function seed(patch) {
  await evaluate(`(() => {
    localStorage.setItem('__shot', ${JSON.stringify(JSON.stringify(patch))})
    return true
  })()`)
}

/** The chip only renders outside Tauri; hide it so shots match the desktop build. */
const HIDE_CHIP = `(() => {
  const el = [...document.querySelectorAll('span,div')]
    .find(e => /Browser preview/i.test(e.textContent || '') && e.children.length === 0)
  if (el) el.remove()
  return true
})()`

/**
 * Wait for the page to actually finish painting.
 *
 * Text can be on screen while the shelves are still skeletons and the artwork
 * is still fetching — one such frame shipped as a README image. Hold until
 * every <img> has completed and then let layout settle.
 */
async function settle(extraMs = 1200) {
  await evaluate(`(() => new Promise((resolve) => {
    const imgs = [...document.images].filter(i => !i.complete)
    if (imgs.length === 0) return resolve(true)
    let left = imgs.length
    const done = () => { left -= 1; if (left <= 0) resolve(true) }
    imgs.forEach(i => { i.addEventListener('load', done, { once: true }); i.addEventListener('error', done, { once: true }) })
    setTimeout(() => resolve(true), 8000)
  }))()`)
  await sleep(extraMs)
}

/**
 * Wait for the feed to be genuinely populated.
 *
 * Waiting on the "Quick picks" heading was not enough: the skeleton state
 * renders that same label, so a shot could be taken of an empty page. Song rows
 * carry `aria-label="Play <title>"`, which only exists once real data has
 * arrived, so that is what gates the capture.
 */
async function waitForContent(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await evaluate(`(() => {
      const rows = document.querySelectorAll('button[aria-label^="Play "]').length
      const heading = document.querySelector('h1')
      const hero = heading && heading.textContent.trim().length > 2
      return rows >= 5 && !!hero
    })()`)
    if (ready) return true
    await sleep(500)
  }
  return false
}

/** Poll until the page shows `re`, so we never shoot a half-loaded frame. */
async function waitForText(re, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  const pattern = new RegExp(re.source, re.flags.replace('g', ''))
  while (Date.now() < deadline) {
    const ok = await evaluate(
      `(() => new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)}).test(document.body.innerText || ''))()`,
    )
    if (ok) return true
    await sleep(500)
  }
  return false
}

function clickText(selector, text) {
  return evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(e => (e.getAttribute('aria-label') || e.textContent || '').trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
    if (!el) return false
    el.click()
    return true
  })()`)
}

/**
 * Type with real key events.
 *
 * Assigning `input.value` and dispatching a synthetic `input` event does not
 * drive this controlled field — React's tracker sees no change — so the search
 * query never reached the store and results never rendered.
 */
async function typeText(text) {
  for (const ch of text) {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
    await sleep(40)
  }
}

async function shot(name) {
  const state = await evaluate(`(() => ({
    rows: document.querySelectorAll('button[aria-label^="Play "]').length,
    h1: (document.querySelector('h1') || {}).textContent || '',
    imgs: document.querySelectorAll('img').length,
    body: (document.body.innerText || '').slice(0, 60).replace(/\\n/g, ' '),
  }))()`)
  // Re-hide right before capture: React re-renders the chip, so removing it
  // once after load is not enough.
  await evaluate(HIDE_CHIP)
  const res = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, 'base64'))
  console.log(`  saved ${OUT}/${name}.png  [rows=${state?.rows} h1="${state?.h1}" imgs=${state?.imgs}]`)
}

/* -------------------------------------------------------------------------- */

const SHOTS = [
  {
    name: 'home-noir',
    settings: { theme: 'noir', region: '', queuePanel: false, animations: false },
    async run() { await sleep(1200) },
  },
  {
    name: 'search-noir',
    settings: { theme: 'noir', region: '', queuePanel: false },
    async run() {
      if (!(await clickText('aside nav button, nav button', 'Search'))) throw new Error('search nav item not found')
      await sleep(800)
      const focused = await evaluate(`(() => {
        const el = document.querySelector('input[placeholder*="Search"]')
        if (!el) return false
        el.focus()
        return document.activeElement === el
      })()`)
      if (!focused) throw new Error('search box not focusable')
      await typeText('daft punk')
      if (!(await waitForText(/Results for/i, 30_000))) throw new Error('results never rendered')
      await sleep(2500)
    },
  },
  {
    name: 'queue-noir',
    settings: { theme: 'noir', region: '', queuePanel: true },
    async run() {
      await clickText('button', 'Play ')
      await sleep(10_000)
    },
  },
  {
    name: 'country-korea-noir',
    settings: { theme: 'noir', region: 'KR', queuePanel: false },
    async run() { await sleep(2500) },
  },
  {
    name: 'home-glacier',
    settings: { theme: 'glacier', region: '', glow: false, queuePanel: false },
    async run() { await sleep(1200) },
  },
  {
    name: 'settings-glacier',
    settings: { theme: 'glacier', region: 'NO', queuePanel: false },
    async run() {
      if (!(await clickText('button', 'Settings'))) throw new Error('settings button not found')
      await sleep(1200)
      if (!(await clickText('nav button', 'Country'))) throw new Error('country section not found')
      await sleep(900)
    },
  },
]

await cdp('Page.enable')
await cdp('Runtime.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })

// Land on the origin once so `__shot` has a document to live in.
await goto(`${ORIGIN}/`)
await waitForContent()

for (const s of SHOTS) {
  if (only.length && !only.includes(s.name)) continue
  console.log(`- ${s.name}`)
  try {
    await seed(s.settings)
    await goto(`${ORIGIN}/`)
    if (!(await waitForContent())) throw new Error('home feed never populated')
    await evaluate(HIDE_CHIP)
    await s.run()
    await settle()
    await shot(s.name)
  } catch (error) {
    console.error(`  FAILED: ${error.message}`)
  }
}

bye()
process.exit(0)