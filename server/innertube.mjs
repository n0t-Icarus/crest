/**
 * The single Innertube session.
 *
 * Every youtubei.js call in the helper shares one client: creating it is the
 * expensive part (it fetches API keys and context), so a second one would just
 * slow startup down and double the request budget.
 *
 * Kept in its own module so `ytmusic.mjs` and `home.mjs` can both use it
 * without importing each other.
 */

let innertubePromise = null

export async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = import('youtubei.js').then((m) => m.Innertube.create())
  }
  return innertubePromise
}
