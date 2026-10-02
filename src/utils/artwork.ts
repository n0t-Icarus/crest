/**
 * Deterministic procedural artwork.
 *
 * Phase 1 must look like the reference without bundling third-party imagery, so
 * every cover is composed from dark gradient layers derived from the item's id.
 * The output is a plain CSS background: no network requests, no image decoding,
 * no layout thrash — cheap enough to render hundreds of cards.
 *
 * Each seed picks a palette and a scene archetype (city skyline, water horizon
 * or night haze) so a grid reads like real album art rather than a row of
 * identical blurs. Layer geometry comes from the same hash, so a cover is
 * identical on every launch and never "changes" on reload.
 *
 * Phase 5 swaps this for real artwork URLs; `Artwork` already prefers a real
 * image when the provider supplies one and falls back to these layers.
 */

import type { CSSProperties } from 'react'

export type ArtworkPalette = {
  id: string
  bloom: string
  deep: string
  glow: string
  orb: boolean
}

const PALETTES: ArtworkPalette[] = [
  { id: 'crimson', bloom: '#7e1220', deep: '#37080f', glow: '#e05361', orb: true },
  { id: 'silver', bloom: '#2b2f37', deep: '#111318', glow: '#cfd5de', orb: false },
  { id: 'sepia', bloom: '#6b4526', deep: '#291a10', glow: '#eac89c', orb: true },
  { id: 'indigo', bloom: '#1c2c6d', deep: '#0c1231', glow: '#7ba3ff', orb: false },
  { id: 'teal', bloom: '#0d4a53', deep: '#05222a', glow: '#71dae2', orb: true },
  { id: 'magenta', bloom: '#5c1a52', deep: '#220c22', glow: '#e07ad3', orb: false },
  { id: 'ember', bloom: '#7c3a12', deep: '#2a1406', glow: '#ffb26b', orb: false },
  { id: 'slate', bloom: '#24313c', deep: '#0f1720', glow: '#a9c4d9', orb: true },
  { id: 'glacier', bloom: '#2d3b54', deep: '#0f1626', glow: '#dce8f7', orb: true },
  { id: 'forest', bloom: '#15371f', deep: '#07160d', glow: '#82d38f', orb: false },
]

/** FNV-1a — stable across sessions, so covers never "change" on reload. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function paletteFor(seed: string): ArtworkPalette {
  const h = hashString(seed)
  return PALETTES[h % PALETTES.length]!
}

/**
 * Headline banners are the one place where the palette is not left to chance:
 * hero art has to read as a city at night, so only the warm, saturated dusk
 * palettes are eligible.
 */
const BANNER_PALETTES = ['magenta', 'indigo', 'ember', 'crimson', 'glacier'].map(
  (id) => PALETTES.find((palette) => palette.id === id)!,
)

type LayerOptions = {
  /** Headline banner: tinted sky, wide wash and a banner-scale glow. */
  banner?: boolean
  /** Portrait card artwork (mixes): taller silhouettes, card-scale glow. */
  tall?: boolean
  /** Skip the scene bands — used inside small circular avatars. */
  plain?: boolean
}

/** One background layer plus its own box, so bands can sit at a fixed height. */
type Layer = {
  image: string
  size?: string
  position?: string
  repeat?: string
}

export type ArtworkScene = 'skyline' | 'horizon' | 'night'

export function artworkScene(seed: string): ArtworkScene {
  const h = hashString(seed)
  // Album and playlist ids are stable, so a scene stays with its item forever.
  const scenes: ArtworkScene[] = ['skyline', 'horizon', 'night']
  return scenes[(h >>> 6) % scenes.length]!
}

/** CSS `background-image` value for a seed. */
export function artworkLayers(seed: string, options: LayerOptions = {}): string {
  return buildLayers(seed, options)
    .map((layer) => layer.image)
    .join(', ')
}

export function artworkStyle(seed: string, options: LayerOptions = {}): CSSProperties {
  const layers = buildLayers(seed, options)
  return {
    backgroundImage: layers.map((layer) => layer.image).join(', '),
    backgroundSize: layers.map((layer) => layer.size ?? 'auto').join(', '),
    backgroundPosition: layers.map((layer) => layer.position ?? '0 0').join(', '),
    backgroundRepeat: layers.map((layer) => layer.repeat ?? 'no-repeat').join(', '),
    backgroundColor: '#06070c',
  }
}

/** Solid representative colour for a seed (playlist headers, now-playing tint). */
export function artworkAccent(seed: string): string {
  return paletteFor(seed).bloom
}

function buildLayers(seed: string, options: LayerOptions): Layer[] {
  const h = hashString(seed)
  const banner = Boolean(options.banner)
  const tall = banner || Boolean(options.tall)
  const palette = banner ? BANNER_PALETTES[h % BANNER_PALETTES.length]! : PALETTES[h % PALETTES.length]!
  const scene: ArtworkScene | 'plain' = options.plain ? 'plain' : banner ? 'skyline' : artworkScene(seed)

  // Glow geometry is relative to the box on cards, but absolute on a banner:
  // a percentage radius would be stretched into a smear by a wide aspect ratio.
  const x1 = 12 + (h % 46)
  const y1 = 8 + ((h >> 3) % 34)
  const x2 = 54 + ((h >> 5) % 40)
  const y2 = 22 + ((h >> 7) % 52)
  const angle = 150 + ((h >> 9) % 60)
  const orbX = banner ? 62 + ((h >> 11) % 20) : 28 + ((h >> 11) % 44)
  const orbY = banner ? 26 + ((h >> 13) % 16) : 18 + ((h >> 13) % 30)
  const orbSize = banner ? `${130 + ((h >> 15) % 90)}px` : `${16 + ((h >> 15) % 12)}%`
  const orbOpacity = palette.orb ? (banner ? 0.28 : 0.55) + ((h >> 17) % 26) / 100 : 0

  const nearHeight = banner ? 46 : tall ? 30 : 22
  const farHeight = banner ? 62 : tall ? 40 : 30

  const silhouette = hexAlpha(palette.deep, banner ? 0.99 : 0.95)
  const farSilhouette = hexAlpha(palette.deep, 0.72)
  const layers: Layer[] = []

  // Nearest silhouette band, then the taller faint one behind it.
  if (scene === 'skyline') {
    layers.push(barBand(silhouette, banner ? 10 + (h % 22) : 8 + (h % 15), 5 + ((h >> 2) % 10), nearHeight))
    layers.push(windowsBand(palette, h, banner))
    layers.push(barBand(farSilhouette, 6 + ((h >> 4) % 9), 9 + ((h >> 6) % 10), farHeight))
  }

  if (scene === 'horizon') {
    // Sun/moon sitting on the waterline, then a shimmer band below it.
    layers.push({
      image: `radial-gradient(${banner ? 58 : 30}px ${banner ? 58 : 30}px at ${orbX}% ${banner ? 54 : 56}%, ${hexAlpha(
        palette.glow,
        0.92,
      )} 0%, ${hexAlpha(palette.glow, 0.34)} 42%, transparent 68%)`,
    })
    layers.push(barBand(hexAlpha(palette.glow, 0.14), 2 + (h % 4), 3 + ((h >> 2) % 6), banner ? 24 : 34, '0 100%'))
    layers.push(
      barBand(silhouette, 2 + (h % 3), 24 + ((h >> 4) % 16), banner ? 18 : 26, `0 ${banner ? 82 : 78}%`),
    )
  }

  if (scene === 'night') {
    layers.push(
      barBand(hexAlpha(palette.glow, 0.1), 1 + (h % 2), 22 + ((h >> 2) % 30), banner ? 70 : 78, '0 0'),
    )
    layers.push(barBand(silhouette, 4 + (h % 4), 9 + ((h >> 5) % 11), tall ? 26 : 20))
  }

  if (orbOpacity > 0) {
    layers.push({
      // A wide, soft falloff keeps the glow reading as light on a scene rather
      // than as a bright blob pasted on top of one.
      image: `radial-gradient(${orbSize} ${orbSize} at ${orbX}% ${orbY}%, ${hexAlpha(
        palette.glow,
        banner ? 0.55 : 0.85,
      )} 0%, ${hexAlpha(palette.glow, banner ? 0.22 : 0.35)} ${banner ? 42 : 46}%, transparent ${banner ? 68 : 62}%)`,
    })
  }

  if (banner) {
    // Banner artwork gets a horizon glow so the silhouettes read as buildings
    // against a lit sky instead of as shapes on flat black.
    layers.push({ image: `radial-gradient(120% 62% at ${x2}% 88%, ${hexAlpha(palette.glow, 0.46)} 0%, transparent 68%)` })
  }

  layers.push(
    {
      image: `radial-gradient(${banner ? 95 : 125}% 105% at ${x1}% ${y1}%, ${hexAlpha(
        palette.bloom,
        banner ? 0.98 : tall ? 0.95 : 0.92,
      )} 0%, ${hexAlpha(palette.bloom, 0.28)} 48%, transparent 72%)`,
    },
    { image: `radial-gradient(90% 95% at ${x2}% ${y2}%, ${hexAlpha(palette.deep, 0.95)} 0%, transparent 66%)` },
    {
      image: banner
        ? // Banners carry a tinted sky so each slide reads as its own scene.
          `linear-gradient(${angle}deg, ${hexAlpha(palette.bloom, 0.62)} 0%, #0c0f1c 56%, #05060c 100%)`
        : `linear-gradient(${angle}deg, #0b0c12 0%, #06070c 58%, #030408 100%)`,
    },
    {
      image: `linear-gradient(180deg, rgba(0, 0, 0, 0) 38%, ${
        banner ? 'rgba(0,0,0,.52)' : 'rgba(0,0,0,.42)'
      } 100%)`,
    },
  )

  return layers
}

/** A row of vertical silhouettes clamped to a horizontal band. */
function barBand(color: string, width: number, gap: number, heightPercent: number, position = '0 100%'): Layer {
  return {
    image: `repeating-linear-gradient(90deg, ${color} 0 ${width}px, transparent ${width}px ${
      width + gap
    }px)`,
    size: `100% ${heightPercent}%`,
    position,
  }
}

/** Sparse lit windows inside the nearest skyline band. */
function windowsBand(palette: ArtworkPalette, h: number, banner = false): Layer {
  const step = 6 + ((h >> 9) % 5)
  return {
    image: `repeating-linear-gradient(90deg, transparent 0 ${step}px, ${hexAlpha(
      palette.glow,
      banner ? 0.5 : 0.42,
    )} ${step}px ${step + 1}px)`,
    size: `100% ${banner ? 3 + ((h >> 13) % 3) : 1 + ((h >> 13) % 2)}%`,
    position: `0 ${banner ? 78 + ((h >> 15) % 8) : 72 + ((h >> 15) % 10)}%`,
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}
