// Procedural lofi background music (Web Audio). Like the art, nothing is an asset file:
// a lookahead scheduler plays an endless, slightly random loop of jazzy 7th chords,
// a soft bass line, a lazy swung boom-bap beat, sparse melody notes and vinyl crackle.
import { get, useStore } from '../state/store';
import { audio, noiseBuffer, rnd } from './sfx';

const BPM = 72;
const STEP = 60 / BPM / 4; // one 16th note, seconds
const SWING = STEP * 0.33; // delay of the off-beat 8ths
const LOOKAHEAD = 1.2; // seconds of notes scheduled ahead (survives background-tab timer throttling)
const MAX_GAIN = 0.5; // music volume 100% → this bus gain (kept below voices)

type Chord = [bass: number, voicing: number[]]; // MIDI notes
// All diatonic to C major so the pentatonic melody always fits; the key is transposed per session.
const PROGRESSIONS: Chord[][] = [
  [[41, [53, 57, 60, 64]], [40, [52, 55, 59, 62]], [38, [50, 53, 57, 60]], [36, [48, 52, 55, 59]]], // Fmaj7 Em7 Dm7 Cmaj7
  [[38, [53, 57, 60, 64]], [43, [53, 57, 59, 64]], [36, [52, 55, 59, 62]], [45, [55, 59, 60, 64]]], // Dm9 G13 Cmaj9 Am9
  [[45, [55, 59, 60, 64]], [41, [53, 57, 60, 64]], [36, [52, 55, 59, 60]], [43, [50, 55, 59, 64]]], // Am9 Fmaj7 Cmaj7 G6
];
const MELODY = [72, 74, 76, 79, 81, 84]; // C major pentatonic
const KEYS = [0, -3, 2, -5, 5];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

interface Session {
  input: AudioNode; // instruments connect here
  bus: GainNode; // per-session so a stop can fade out while a restart begins fresh
  crackle: AudioBufferSourceNode;
  next: number; // audio time of the next 16th step
  step: number; // global 16th-step counter
  prog: Chord[];
  key: number;
}

let session: Session | null = null;

function targetGain() {
  const { music, musicVolume } = get().settings;
  return music ? musicVolume * MAX_GAIN : 0;
}

function vinylBuffer(c: AudioContext) {
  const len = c.sampleRate * 3;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * 0.04; // hiss
    if (Math.random() < 0.0004) d[i] += (Math.random() < 0.5 ? -1 : 1) * rnd(0.3, 1); // pops
  }
  return buf;
}

function start(c: AudioContext) {
  // bus: everything → warm lowpass → volume → speakers
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 3200; tone.Q.value = 0.5;
  const bus = c.createGain();
  bus.gain.setValueAtTime(0.0001, c.currentTime);
  bus.gain.setTargetAtTime(targetGain(), c.currentTime, 0.8);
  tone.connect(bus).connect(c.destination);

  const crackle = c.createBufferSource();
  crackle.buffer = vinylBuffer(c);
  crackle.loop = true;
  const cf = c.createBiquadFilter();
  cf.type = 'bandpass'; cf.frequency.value = 2500; cf.Q.value = 0.4;
  const cg = c.createGain(); cg.gain.value = 0.5;
  crackle.connect(cf).connect(cg).connect(bus);
  crackle.start();

  session = { input: tone, bus, crackle, next: c.currentTime + 0.15, step: 0, prog: pick(PROGRESSIONS), key: pick(KEYS) };
}

function stop(c: AudioContext) {
  if (!session) return;
  const { bus, crackle } = session;
  session = null;
  bus.gain.cancelScheduledValues(c.currentTime);
  bus.gain.setTargetAtTime(0, c.currentTime, 0.25);
  setTimeout(() => { try { crackle.stop(); } catch { /* already stopped */ } bus.disconnect(); }, 1500);
}

// ------------------------------------------------------------------ instruments

/** Electric-piano-ish tone: sine body + detuned triangle + quickly fading "tine" overtone. */
function keys(c: AudioContext, out: AudioNode, midi: number, at: number, dur: number, vel: number) {
  const f = hz(midi);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.14 * vel, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.06 * vel, at + Math.min(dur, 1.2));
  g.gain.setTargetAtTime(0.0001, at + dur, 0.18);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1600 + vel * 600;
  lp.connect(g).connect(out);
  const wobble = Math.sin(at * 2.4) * 7; // slow tape-wobble, in cents
  const end = at + dur + 1;
  for (const [type, mult, level, detune] of [['sine', 1, 1, 0], ['triangle', 1, 0.35, 6], ['sine', 2, 0.25, -4]] as const) {
    const o = c.createOscillator();
    o.type = type; o.frequency.value = f * mult; o.detune.value = wobble + detune;
    const og = c.createGain();
    og.gain.value = level;
    if (mult === 2) { og.gain.setValueAtTime(level, at); og.gain.exponentialRampToValueAtTime(0.001, at + 0.35); }
    o.connect(og).connect(lp);
    o.start(at); o.stop(end);
  }
}

function bass(c: AudioContext, out: AudioNode, midi: number, at: number, dur: number) {
  const o = c.createOscillator();
  o.type = 'triangle'; o.frequency.value = hz(midi);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 280;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.45, at + 0.03);
  g.gain.setTargetAtTime(0.0001, at + dur, 0.08);
  o.connect(lp).connect(g).connect(out);
  o.start(at); o.stop(at + dur + 0.6);
}

function kick(c: AudioContext, out: AudioNode, at: number, vel = 1) {
  const o = c.createOscillator();
  o.frequency.setValueAtTime(115, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.7 * vel, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + 0.4);
}

function noiseHit(c: AudioContext, out: AudioNode, at: number, type: BiquadFilterType, freq: number, gain: number, decay: number) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + decay);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 0.3, decay + 0.05);
}

function snare(c: AudioContext, out: AudioNode, at: number) {
  noiseHit(c, out, at, 'bandpass', 1700, 0.22, 0.2);
  const o = c.createOscillator();
  o.type = 'triangle'; o.frequency.setValueAtTime(190, at); o.frequency.exponentialRampToValueAtTime(140, at + 0.08);
  const g = c.createGain();
  g.gain.setValueAtTime(0.12, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + 0.15);
}

// ------------------------------------------------------------------ sequencer

/** Schedule everything that happens on one 16th step. Bars are 16 steps; one chord per bar. */
function playStep(c: AudioContext, s: Session, at: number) {
  const out = s.input;
  const inBar = s.step % 16;
  const bar = Math.floor(s.step / 16);
  if (inBar === 0 && bar > 0 && bar % 8 === 0) s.prog = pick(PROGRESSIONS); // new progression every 8 bars
  const [root, voicing] = s.prog[bar % s.prog.length];
  const k = s.key;
  const drums = bar >= 2 && bar % 16 !== 15; // 2-bar keys-only intro, and a breather every 16 bars
  const swung = inBar % 4 === 2 ? at + SWING : at;

  // keys: lazily strummed chord on the downbeat, sometimes a soft re-hit on the "and" of 3
  if (inBar === 0) voicing.forEach((n, i) => keys(c, out, n + k, at + i * rnd(0.015, 0.035), STEP * 15, rnd(0.7, 0.9)));
  if (inBar === 10 && Math.random() < 0.35) voicing.slice(1).forEach((n, i) => keys(c, out, n + k, swung + i * 0.02, STEP * 5, 0.45));

  // bass
  if (inBar === 0) bass(c, out, root + k, at, STEP * 6);
  if (inBar === 10 && drums) bass(c, out, root + k + (Math.random() < 0.3 ? 7 : 0), swung, STEP * 4);

  // sparse melody, mostly on off-beats
  if (bar >= 1 && [2, 6, 7, 11, 14].includes(inBar) && Math.random() < 0.18) {
    keys(c, out, pick(MELODY) + k, swung, STEP * rnd(2, 4), 0.55);
  }

  if (!drums) return;
  if (inBar === 0 || inBar === 10 || (inBar === 7 && Math.random() < 0.3)) kick(c, out, swung, inBar === 7 ? 0.6 : 1);
  if (inBar === 4 || inBar === 12) snare(c, out, at);
  if (inBar % 2 === 0) noiseHit(c, out, swung, 'highpass', 7000, inBar % 4 === 0 ? 0.05 : 0.03, 0.045);
  else if (Math.random() < 0.1) noiseHit(c, out, at, 'highpass', 8000, 0.02, 0.03); // ghost hat
}

function tick() {
  const c = audio();
  if (!c) return;
  const want = get().settings.music && c.state === 'running';
  if (!want) { stop(c); return; }
  if (!session) start(c);
  const s = session!;
  // fell far behind (e.g. laptop asleep)? skip ahead rather than spew a burst of notes
  if (s.next < c.currentTime - 0.5) s.next = c.currentTime + 0.05;
  while (s.next < c.currentTime + LOOKAHEAD) {
    playStep(c, s, s.next);
    s.next += STEP;
    s.step++;
  }
}

/** Start the music engine (follows settings.music / musicVolume). Returns a cleanup function. */
export function initMusic() {
  const iv = window.setInterval(tick, 200);
  const unsub = useStore.subscribe((st, prev) => {
    if (st.settings.musicVolume === prev.settings.musicVolume && st.settings.music === prev.settings.music) return;
    const c = audio();
    if (c && session && st.settings.music) session.bus.gain.setTargetAtTime(targetGain(), c.currentTime, 0.15);
    tick();
  });
  return () => {
    clearInterval(iv);
    unsub();
    const c = audio();
    if (c) stop(c);
  };
}
