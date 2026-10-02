/**
 * Country list for the regional home feed.
 *
 * YouTube Music personalises its home feed from two fields on the Innertube
 * client: `gl` (which market the request claims to come from) and `hl` (the
 * interface language). Setting both is what turns the shelves local — Norway
 * gets "Aktuelt-spillelister for deg", Brazil gets "Playlists em destaque
 * para você".
 *
 * `gl` alone is not enough: with only `gl` the shelf headings stayed English.
 * Both are therefore listed here, and the client only ever sends the ISO code.
 *
 * This is NOT a VPN and does not relocate the app. YouTube still sees the real
 * IP, so charts can skew toward wherever the machine actually is; what changes
 * is the editorial feed, its language, and which music is surfaced. Search is
 * deliberately unaffected — it stays global, so anyone can still look up any
 * song they like.
 */

/** @type {ReadonlyArray<{ code: string; name: string; hl: string }>} */
export const REGIONS = Object.freeze([
  { code: '', name: 'Automatic (my location)', hl: '' },
  { code: 'US', name: 'United States', hl: 'en' },
  { code: 'GB', name: 'United Kingdom', hl: 'en' },
  { code: 'CA', name: 'Canada', hl: 'en' },
  { code: 'AU', name: 'Australia', hl: 'en' },
  { code: 'NZ', name: 'New Zealand', hl: 'en' },
  { code: 'IE', name: 'Ireland', hl: 'en' },
  { code: 'IN', name: 'India', hl: 'en' },
  { code: 'PK', name: 'Pakistan', hl: 'en' },
  { code: 'BD', name: 'Bangladesh', hl: 'en' },
  { code: 'LK', name: 'Sri Lanka', hl: 'si' },
  { code: 'NP', name: 'Nepal', hl: 'ne' },
  { code: 'AE', name: 'United Arab Emirates', hl: 'ar' },
  { code: 'SA', name: 'Saudi Arabia', hl: 'ar' },
  { code: 'EG', name: 'Egypt', hl: 'ar' },
  { code: 'MA', name: 'Morocco', hl: 'ar' },
  { code: 'DZ', name: 'Algeria', hl: 'ar' },
  { code: 'NG', name: 'Nigeria', hl: 'en' },
  { code: 'GH', name: 'Ghana', hl: 'en' },
  { code: 'KE', name: 'Kenya', hl: 'en' },
  { code: 'ZA', name: 'South Africa', hl: 'en' },
  { code: 'DE', name: 'Germany', hl: 'de' },
  { code: 'AT', name: 'Austria', hl: 'de' },
  { code: 'CH', name: 'Switzerland', hl: 'de' },
  { code: 'FR', name: 'France', hl: 'fr' },
  { code: 'BE', name: 'Belgium', hl: 'fr' },
  { code: 'NL', name: 'Netherlands', hl: 'nl' },
  { code: 'ES', name: 'Spain', hl: 'es' },
  { code: 'PT', name: 'Portugal', hl: 'pt' },
  { code: 'BR', name: 'Brazil', hl: 'pt' },
  { code: 'IT', name: 'Italy', hl: 'it' },
  { code: 'SE', name: 'Sweden', hl: 'sv' },
  { code: 'NO', name: 'Norway', hl: 'nb' },
  { code: 'DK', name: 'Denmark', hl: 'da' },
  { code: 'FI', name: 'Finland', hl: 'fi' },
  { code: 'IS', name: 'Iceland', hl: 'is' },
  { code: 'PL', name: 'Poland', hl: 'pl' },
  { code: 'CZ', name: 'Czechia', hl: 'cs' },
  { code: 'SK', name: 'Slovakia', hl: 'sk' },
  { code: 'HU', name: 'Hungary', hl: 'hu' },
  { code: 'RO', name: 'Romania', hl: 'ro' },
  { code: 'GR', name: 'Greece', hl: 'el' },
  { code: 'TR', name: 'Türkiye', hl: 'tr' },
  { code: 'UA', name: 'Ukraine', hl: 'uk' },
  { code: 'RU', name: 'Russia', hl: 'ru' },
  { code: 'IL', name: 'Israel', hl: 'he' },
  { code: 'KR', name: 'South Korea', hl: 'ko' },
  { code: 'JP', name: 'Japan', hl: 'ja' },
  { code: 'CN', name: 'China', hl: 'zh-Hans' },
  { code: 'TW', name: 'Taiwan', hl: 'zh-Hant' },
  { code: 'HK', name: 'Hong Kong', hl: 'zh-Hant' },
  { code: 'TH', name: 'Thailand', hl: 'th' },
  { code: 'VN', name: 'Vietnam', hl: 'vi' },
  { code: 'ID', name: 'Indonesia', hl: 'id' },
  { code: 'MY', name: 'Malaysia', hl: 'ms' },
  { code: 'SG', name: 'Singapore', hl: 'en' },
  { code: 'PH', name: 'Philippines', hl: 'en' },
  { code: 'MX', name: 'Mexico', hl: 'es' },
  { code: 'AR', name: 'Argentina', hl: 'es' },
  { code: 'CO', name: 'Colombia', hl: 'es' },
  { code: 'CL', name: 'Chile', hl: 'es' },
  { code: 'PE', name: 'Peru', hl: 'es' },
])

const BY_CODE = new Map(REGIONS.map((region) => [region.code, region]))

/**
 * Normalise whatever the client sent into `{ gl, hl, name }`, or null for auto.
 *
 * `hl` is deliberately pinned to English for every market. The country still
 * decides which music and which charts come back, but Crest's own headings —
 * mood chips, shelf titles, settings — stay in one language. Letting `hl`
 * follow the country produced a Korean interface for a Korean feed, which
 * nobody asked for and which reads as a bug rather than a feature.
 */
export function resolveRegion(code) {
  const clean = String(code ?? '').trim().toUpperCase()
  if (!clean) return null
  const found = BY_CODE.get(clean)
  if (!found) return null
  return { gl: found.code, hl: 'en', name: found.name }
}

/** The list for the Settings picker. */
export function listRegions() {
  return REGIONS.map(({ code, name }) => ({ code, name }))
}