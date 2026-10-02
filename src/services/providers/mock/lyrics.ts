/**
 * Placeholder lyrics for the demo library.
 *
 * The text below is original filler written for development: no licensed lyric
 * text is bundled with Crest. Two tracks carry timestamps so the synced-lyrics
 * view can be exercised end to end; the rest exercise the plain-lyrics path.
 */

import type { Lyrics } from '../types'

const synced = (trackId: string, entries: Array<[number, string]>): Lyrics => ({
  trackId,
  lines: entries.map(([startMs, text]) => ({ startMs, text })),
  synced: true,
  source: 'placeholder',
})

const plain = (trackId: string, lines: string[]): Lyrics => ({
  trackId,
  lines: lines.map((text) => ({ text })),
  synced: false,
  source: 'placeholder',
})

export const lyricsByTrack: Record<string, Lyrics> = {
  'after-dark': synced('after-dark', [
    [0, 'Another street,'],
    [4200, 'the lamps are letting go'],
    [9000, ''],
    [11000, 'I keep the window open'],
    [17000, 'so the city knows'],
    [22000, ''],
    [24000, 'And if the morning finds me'],
    [31000, 'still awake'],
    [36000, ''],
    [38000, 'Tell it I was listening'],
    [45000, 'to the dark'],
    [50000, ''],
    [52000, 'We were never lost'],
    [59000, 'we were only quiet'],
    [66000, ''],
    [68000, 'Hold the light a little longer'],
    [78000, 'let it burn'],
  ]),
  thirteen: synced('thirteen', [
    [0, 'Count the rooms I never left'],
    [6000, ''],
    [8000, 'Thirteen winters, one address'],
    [15000, ''],
    [17000, 'Nothing here is heavy'],
    [23000, 'it is only slow'],
    [29000, ''],
    [31000, 'Breathe out, let the floor hold'],
    [40000, ''],
    [42000, 'I am learning how to stay'],
    [52000, ''],
    [54000, 'Breathe out —'],
    [62000, 'let the floor hold'],
    [70000, ''],
    [72000, 'Nothing here is heavy'],
  ]),
  sparks: plain('sparks', [
    'Paper lanterns in the hall',
    'someone left the gate ajar',
    '',
    'We were small and made of glass',
    'and the night was very far',
    '',
    'All the sparks we used to keep',
    'in a drawer beside the bed',
    '',
    'Light one now and watch it fall',
    'just to prove we are still here',
  ]),
  'kick-back': plain('kick-back', [
    'Stand up, the floor is yours',
    'no one counts the seconds',
    '',
    'Every door I ever broke',
    'opened into morning',
    '',
    'Go on then — kick back',
    'I am not the one who waits',
    '',
    'Louder now, we are still young',
    'and the night is unfinished',
  ]),
  'die-for-you': plain('die-for-you', [
    'Even after all this time',
    'I still check the door',
    '',
    'You said you would be careful',
    'I said nothing at all',
    '',
    'I would take the long way home',
    'just to keep you mine',
    '',
    'Even after all this time',
    'I would do it again',
  ]),
  'sweater-weather': plain('sweater-weather', [
    'Cold hands, one coat',
    'we share the same road home',
    '',
    'Windows fogged by talking',
    'about nothing much at all',
    '',
    'Stay, the wind is honest',
    'and the summer is a rumour',
    '',
    'It is sweater weather again',
    'and you already know',
  ]),
}
