/**
 * The single Innertube session.
 *
 * Every youtubei.js call in the helper shares one client: creating it is the
 * expensive part (it fetches API keys and context), so a second one would just
 * slow startup down and double the request budget.
 *
 * Kept in its own module so `ytmusic.mjs` and `home.mjs` can both use it
 * without importing each other.
 *
 * Region lives here too. `gl`/`hl` are plain fields on the session context, so
 * switching country is a mutation rather than a new session — the request that
 * follows carries the new market. The defaults captured at creation are kept so
 * "Automatic" can put YouTube's own geolocation back.
 */

let innertubePromise = null
/** What YouTube picked for itself, restored when the region is set to auto. */
let baseClient = null
let region = null

function applyRegion(yt) {
  const client = yt?.session?.context?.client
  if (!client) return
  if (region) {
    client.gl = region.gl
    client.hl = region.hl
  } else if (baseClient) {
    client.gl = baseClient.gl
    client.hl = baseClient.hl
  }
}

export async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = import('youtubei.js').then((m) => m.Innertube.create()).then((yt) => {
      baseClient = { gl: yt?.session?.context?.client?.gl, hl: yt?.session?.context?.client?.hl }
      applyRegion(yt)
      return yt
    })
  }
  const yt = await innertubePromise
  applyRegion(yt)
  return yt
}

/**
 * Point subsequent calls at a market.
 *
 * @param {{ gl: string, hl: string, name?: string } | null} next `null` returns
 *   to YouTube's own geolocation.
 */
export function setRegion(next) {
  region = next && next.gl ? next : null
}

/** The market currently in force, or null when it is automatic. */
export function getRegion() {
  return region
}