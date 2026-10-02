/**
 * Deterministic synth renderer for the demo catalogue.
 *
 * Every demo track gets a real, playable waveform that is rendered *on this
 * machine* from the track id — no bundled audio, no network, no licensed
 * recordings. The same id always produces the same piece, so a "song" sounds
 * identical on every run while remaining unique per track.
 *
 * The recipe per track: derive a tempo, a root note, a chord progression and a
 * waveform set from the id's hash, then render pad chords, a bass line, a
 * plucked arpeggio and light drums through small wavetable oscillators into a
 * 16-bit mono WAV buffer.
 */

const SAMPLE_RATE = 22050

/* -------------------------------------------------------------------------- */
/* Wavetables                                                                 */
/* -------------------------------------------------------------------------- */

type Wavetable = Float32Array

function buildWavetable(partialWeights: readonly number[]): Wavetable {
  const size = 1024
  const table = new Float32Array(size)
  for (let i = 0; i < size; i += 1) {
    const phase = (i / size) * Math.PI * 2
    let value = 0
    for (let partial = 0; partial < partialWeights.length; partial += 1) {
      value += partialWeights[partial]! * Math.sin((partial + 1) * phase)
    }
    table[i] = value
  }
  let peak = 0
  for (let i = 0; i < size; i += 1) peak = Math.max(peak, Math.abs(table[i]!))
  if (peak > 0) for (let i = 0; i < size; i += 1) table[i] = table[i]! / peak
  return table
}

const TABLE_SINE = buildWavetable([1])
const TABLE_WARM = buildWavetable([1, 0.35, 0.12])
const TABLE_PLUCK = buildWavetable([1, 0.5, 0.28, 0.14, 0.08])
const TABLE_REED = buildWavetable([1, 0.55, 0.34, 0.2, 0.12, 0.07])

/** Linear-interpolated table lookup; `phase` must be in [0, 1). */
function tableSample(table: Wavetable, phase: number): number {
  const pos = phase * table.length
  const index = pos | 0
  const frac = pos - index
  const a = table[index % table.length]!
  const b = table[(index + 1) % table.length]!
  return a + (b - a) * frac
}

/* -------------------------------------------------------------------------- */
/* Per-track recipe                                                           */
/* -------------------------------------------------------------------------- */

/** Chords as semitone offsets from the track's root. Minor-leaning sets to fit the app's mood. */
const PROGRESSIONS: readonly number[][][] = [
  [
    [0, 3, 7],
    [8, 12, 15],
    [5, 8, 12],
    [3, 7, 10],
  ],
  [
    [0, 3, 7],
    [5, 8, 12],
    [10, 14, 17],
    [7, 10, 14],
  ],
  [
    [0, 4, 7],
    [9, 12, 16],
    [5, 9, 12],
    [7, 11, 14],
  ],
  [
    [0, 3, 7, 10],
    [8, 12, 15],
    [3, 7, 10],
    [5, 8, 12],
  ],
]

const PAD_TABLES = [TABLE_WARM, TABLE_SINE]
const ARP_TABLES = [TABLE_PLUCK, TABLE_REED, TABLE_WARM]

function hashId(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

type SynthParams = {
  beatsPerBar: number
  secondsPerBeat: number
  rootMidi: number
  chords: number[][]
  padTable: Wavetable
  arpTable: Wavetable
  arpOctave: number
  seed: number
}

function paramsFor(trackId: string): SynthParams {
  const hash = hashId(trackId)
  return {
    beatsPerBar: 4,
    secondsPerBeat: 60 / (84 + (hash % 49)),
    rootMidi: 45 + ((hash >>> 5) % 10),
    chords: PROGRESSIONS[hash % PROGRESSIONS.length]!,
    padTable: PAD_TABLES[(hash >>> 9) % PAD_TABLES.length]!,
    arpTable: ARP_TABLES[(hash >>> 12) % ARP_TABLES.length]!,
    arpOctave: 1 + ((hash >>> 15) % 2),
    seed: (hash ^ 0x9e3779b9) >>> 0,
  }
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/* -------------------------------------------------------------------------- */
/* Layers                                                                     */
/* -------------------------------------------------------------------------- */

function renderPad(out: Float32Array, p: SynthParams, bars: number, secondsPerBar: number): void {
  const segSamples = Math.round(secondsPerBar * SAMPLE_RATE)
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = p.chords[bar % p.chords.length]!
    const start = bar * segSamples
    const end = Math.min(start + segSamples, out.length)
    const length = end - start
    if (length <= 0) continue
    const attack = Math.max(1, Math.round(0.45 * SAMPLE_RATE))
    const release = Math.max(1, Math.round(0.3 * SAMPLE_RATE))
    for (const semitone of chord) {
      const baseFreq = midiToFreq(p.rootMidi + 12 + semitone)
      // Two slightly detuned oscillators per voice add gentle chorus.
      for (const detune of [1, 1.0035]) {
        const inc = (baseFreq * detune) / SAMPLE_RATE
        let phase = 0
        for (let i = start; i < end; i += 1) {
          const t = i - start
          let env = 1
          if (t < attack) env = t / attack
          else if (t > length - release) env = Math.max(0, (length - t) / release)
          out[i] += tableSample(p.padTable, phase) * env * 0.09
          phase += inc
          if (phase >= 1) phase -= 1
        }
      }
    }
  }
}

function renderBass(out: Float32Array, p: SynthParams, bars: number): void {
  const beatSamples = Math.round(p.secondsPerBeat * SAMPLE_RATE)
  const totalBeats = bars * p.beatsPerBar
  for (let beat = 4; beat < totalBeats; beat += 1) {
    // Bass enters after the first bar; one note per beat, root of the current chord.
    const start = Math.round(beat * p.secondsPerBeat * SAMPLE_RATE)
    const noteLen = Math.min(beatSamples, out.length - start)
    if (noteLen <= 0) continue
    const chord = p.chords[Math.floor(beat / p.beatsPerBar) % p.chords.length]!
    const freq = midiToFreq(p.rootMidi + chord[0]! - 12)
    const inc = freq / SAMPLE_RATE
    let phase = 0
    for (let i = 0; i < noteLen; i += 1) {
      const t = i / noteLen
      const env = Math.min(t / 0.04, 1) * (1 - 0.3 * t)
      out[start + i] += tableSample(TABLE_SINE, phase) * env * 0.3
      phase += inc
      if (phase >= 1) phase -= 1
    }
  }
}

function renderArp(out: Float32Array, p: SynthParams, bars: number): void {
  const stepSec = p.secondsPerBeat / 2
  const stepSamples = Math.round(stepSec * SAMPLE_RATE)
  const steps = bars * p.beatsPerBar * 2
  const decayMul = Math.exp(-1 / (0.2 * SAMPLE_RATE))
  let rng = p.seed
  for (let step = 8; step < steps; step += 1) {
    // Enters after the first bar; notes may ring slightly past their step.
    const start = Math.round(step * stepSec * SAMPLE_RATE)
    const noteLen = Math.min(stepSamples * 2, out.length - start)
    if (noteLen <= 0) continue
    const bar = Math.floor(step / (p.beatsPerBar * 2))
    const chord = p.chords[bar % p.chords.length]!
    rng = (Math.imul(rng, 1664525) + 1013904223) | 0
    const roll = ((rng >>> 8) % 100) / 100
    const tone = chord[(step + (roll < 0.25 ? 1 : 0)) % chord.length]!
    const octave = roll < 0.12 ? p.arpOctave + 1 : p.arpOctave
    const inc = midiToFreq(p.rootMidi + tone + 12 * octave) / SAMPLE_RATE
    let phase = 0
    let amp = roll < 0.3 ? 0.16 : 0.11
    for (let i = 0; i < noteLen; i += 1) {
      out[start + i] += tableSample(p.arpTable, phase) * amp
      phase += inc
      if (phase >= 1) phase -= 1
      amp *= decayMul
    }
  }
}

function renderKick(out: Float32Array, start: number): void {
  const length = Math.min(Math.round(0.22 * SAMPLE_RATE), out.length - start)
  const fStart = 105
  const fEnd = 44
  let phase = 0
  for (let i = 0; i < length; i += 1) {
    const t = i / length
    const freq = fEnd + (fStart - fEnd) * Math.exp(-t * 9)
    phase += freq / SAMPLE_RATE
    if (phase >= 1) phase -= 1
    out[start + i] += Math.sin(phase * Math.PI * 2) * Math.exp(-t * 5) * 0.42
  }
}

function renderHat(out: Float32Array, start: number, seed: number): void {
  const length = Math.min(Math.round(0.045 * SAMPLE_RATE), out.length - start)
  let rng = seed | 0
  let prev = 0
  for (let i = 0; i < length; i += 1) {
    rng = (Math.imul(rng, 1664525) + 1013904223) | 0
    const noise = (rng >>> 8) / 8388608 - 1
    // First-order difference ≈ crude high-pass so the tick stays ticky.
    const highPassed = noise - prev
    prev = noise
    out[start + i] += highPassed * (1 - i / length) * 0.06
  }
}

function renderDrums(out: Float32Array, p: SynthParams, bars: number): void {
  const stepSec = p.secondsPerBeat / 2
  const steps = bars * p.beatsPerBar * 2
  let rng = (p.seed ^ 0x1d3f5b7) >>> 0
  for (let step = 16; step < steps; step += 1) {
    // Enters after two bars: kick on beats 1 and 3, hats on the off-beats from bar 3.
    const start = Math.round(step * stepSec * SAMPLE_RATE)
    if (start >= out.length) break
    if (step % 4 === 0) renderKick(out, start)
    else if (step % 2 === 1 && step >= 24) {
      rng = (Math.imul(rng, 1664525) + 1013904223) | 0
      renderHat(out, start, rng)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Master bus + WAV encoding                                                  */
/* -------------------------------------------------------------------------- */

function finalize(out: Float32Array): void {
  const n = out.length
  const fadeIn = Math.min(Math.round(0.05 * SAMPLE_RATE), n)
  const fadeOut = Math.min(Math.round(1.4 * SAMPLE_RATE), n)
  for (let i = 0; i < fadeIn; i += 1) out[i] *= i / fadeIn
  for (let i = 0; i < fadeOut; i += 1) out[n - 1 - i] *= i / fadeOut

  let peak = 0
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(out[i]!))
  if (peak <= 0) return
  const gain = 0.85 / peak
  // A very quiet render gets a soft-clip lift instead of hard digital gain.
  if (gain <= 1.5) {
    for (let i = 0; i < n; i += 1) out[i] *= gain
  } else {
    for (let i = 0; i < n; i += 1) out[i] = Math.tanh(out[i]! * gain)
  }
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    offset += 2
  }
  return buffer
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Renders the full piece for a track as a WAV `ArrayBuffer`.
 *
 * Synchronous and deterministic: the same `trackId` always yields the same
 * bytes. Duration matches the catalogue metadata (clamped to a sane window) so
 * the player's durations stay consistent with every list that shows them.
 */
export function renderTrackAudio(trackId: string, durationMs: number): ArrayBuffer {
  const durationSec = Math.min(Math.max(durationMs, 15000), 420000) / 1000
  const p = paramsFor(trackId)
  const secondsPerBar = p.secondsPerBeat * p.beatsPerBar
  const bars = Math.max(2, Math.ceil(durationSec / secondsPerBar))
  const out = new Float32Array(Math.round(durationSec * SAMPLE_RATE))

  renderPad(out, p, bars, secondsPerBar)
  renderArp(out, p, bars)
  renderBass(out, p, bars)
  renderDrums(out, p, bars)
  finalize(out)

  return encodeWav(out, SAMPLE_RATE)
}
