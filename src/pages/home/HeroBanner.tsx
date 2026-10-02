import { useState } from 'react'
import { navigate } from '@/app/router'
import { Artwork } from '@/components/ui/Artwork'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useLibraryStore } from '@/store/libraryStore'
import { getProvider } from '@/services/providers'
import type { HeroContent } from '@/services/providers/types'
import { playTracks } from '@/player/songActions'
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
      <div className={styles.heroVignette} aria-hidden />

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
 * The hero backdrop.
 *
 * A playlist thumbnail is a 512px square being shown across a banner that is
 * over 1200px wide. Stretched sharp it turned into obvious blocks, and the
 * procedural skyline laid over the top made it read as broken artwork rather
 * than a photograph. So the artwork is blurred and overscaled into an even
 * colour wash instead: it keeps each slide's identity, costs nothing extra,
 * and never looks pixelated.
 */
