import { useMemo, useState } from 'react'
import { navigate } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useLibraryStore } from '@/store/libraryStore'
import { getProvider } from '@/services/providers'
import type { HeroContent } from '@/services/providers/types'
import { playTracks } from '@/player/songActions'
import { hashString } from '@/utils/artwork'
import styles from './home.module.css'

type Props = {
  slides: HeroContent[]
}

/**
 * Hero banner.
 *
 * Dark cinematic artwork, a short greeting, one large statement and two actions
 * — the reference's hierarchy exactly. Slides cross-fade and never auto-advance,
 * so an idle window costs nothing.
 */
export function HeroBanner({ slides }: Props) {
  const [index, setIndex] = useState(0)
  const slide = slides[index] ?? slides[0]!

  const playlist = useLibraryStore((state) => state.playlists.find((item) => item.id === slide?.contextId))

  const go = (delta: number) => {
    setIndex((current) => {
      const next = current + delta
      if (next < 0) return slides.length - 1
      if (next >= slides.length) return 0
      return next
    })
  }

  if (!slide) return null

  const playHero = async () => {
    // Resolve what the slide points at and start it.
    if (slide.contextKind === 'playlist') {
      const provider = getProvider()
      const target = playlist ?? (await provider.getPlaylist(slide.contextId))
      if (!target) return
      const tracks = await provider.getTracks(target.trackIds)
      playTracks(tracks, 0, target.name)
      return
    }
    if (slide.contextKind === 'mix') {
      const mix = await getProvider().getMix(slide.contextId)
      if (!mix) return
      const tracks = await getProvider().getTracks(mix.trackIds)
      playTracks(tracks, 0, mix.title)
    }
  }

  return (
    <article className={styles.hero} aria-label="Featured">
      {slides.map((item, position) => (
        <Artwork
          key={item.artwork.kind === 'generated' ? item.artwork.seed : `${item.title}-${position}`}
          source={item.artwork}
          seed={`hero-${position}`}
          alt=""
          banner
          priority={position === 0}
          radius="lg"
          className={styles.heroArt}
          style={{
            opacity: position === index ? 1 : 0,
            transition: 'opacity var(--dur-3) var(--ease)',
          }}
        />
      ))}
      <div className={styles.heroScrim} aria-hidden />
      <Skyline seed={`skyline-${index}`} />

      <div className={styles.heroContent}>
        {slide.eyebrow ? <p className={styles.heroEyebrow}>{slide.eyebrow}</p> : null}
        <h1 className={styles.heroTitle}>{slide.title}</h1>
        <p className={styles.heroSubtitle}>{slide.subtitle}</p>
        <div className={styles.heroActions}>
          <Button variant="primary" size="lg" icon="play" onClick={() => void playHero()}>
            Play
          </Button>
          <Button variant="secondary" size="lg" icon="sliders" onClick={() => navigate({ name: 'library' })}>
            Explore
          </Button>
        </div>
      </div>

      <div className={styles.heroNav}>
        <span className={styles.heroDots} aria-hidden>
          {slides.map((item, position) => (
            <i key={item.title + position} data-active={position === index || undefined} />
          ))}
        </span>
        <IconButton
          icon="chevronLeft"
          label="Previous highlight"
          size="sm"
          variant="subtle"
          iconSize={15}
          onClick={() => go(-1)}
        />
        <IconButton
          icon="chevronRight"
          label="Next highlight"
          size="sm"
          variant="subtle"
          iconSize={15}
          onClick={() => go(1)}
        />
      </div>
    </article>
  )
}

/**
 * Procedural city silhouette.
 *
 * The reference hero is a dark cinematic cityscape. Rather than bundling a
 * stock photograph, the skyline is derived from the slide's seed: deterministic,
 * a few hundred bytes of SVG, and no image request at all.
 */
function Skyline({ seed }: { seed: string }) {
  const path = useMemo(() => {
    let h = hashString(seed) || 1
    const parts: string[] = ['M0,150']
    let x = 0
    for (let i = 0; i < 48 && x < 1200; i += 1) {
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0 || 1
      const width = 12 + (h % 30)
      h = Math.imul(h ^ (h >>> 11), 2246822507) >>> 0 || 1
      const top = 52 + (h % 84)
      parts.push(`L${x},${top}`, `L${x + width},${top}`)
      x += width
    }
    parts.push('L1200,150', 'Z')
    return parts.join(' ')
  }, [seed])

  const gradientId = `skyline-${seed.replace(/[^a-z0-9-]/gi, '')}`

  return (
    <svg className={styles.heroSkyline} viewBox="0 0 1200 150" preserveAspectRatio="none" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(5, 6, 10, 0.42)" />
          <stop offset="100%" stopColor="rgba(3, 4, 7, 0.96)" />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${gradientId})`} />
    </svg>
  )
}
