/** Formatting helpers shared across the UI. */

const TIME_FORMATTER = new Intl.NumberFormat('en-US')

/** 247_000 -> "4:07"; hours are only shown when needed. */
export function formatTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}

/** 1420 -> "1,420" */
export function formatNumber(value: number): string {
  return TIME_FORMATTER.format(value)
}

/** Long duration label for playlist headers: "1 hr 42 min". */
export function formatDurationLong(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

export function songCountLabel(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? 'song' : 'songs'}`
}

/** Time-of-day greeting: the reference hero says "Good evening,". */
export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return 'Good night,'
  if (hour < 12) return 'Good morning,'
  if (hour < 18) return 'Good afternoon,'
  return 'Good evening,'
}

export function trackCountLabel(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? 'track' : 'tracks'}`
}
