// Procedural sound effects (Web Audio) — like the art, nothing here is an asset file.
// Footsteps are short filtered-noise bursts shaped per floor surface, Stardew-style.

export type Surface = 'wood' | 'hard' | 'soft' | 'grass' | 'gravel';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio() {
  if (ctx) return ctx;
  try { ctx = new AudioContext(); } catch { return null; }
  master = ctx.createGain();
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Browsers keep audio suspended until a user gesture; call from input handlers. */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** One noise burst through a filter with a fast attack and exponential decay. */
function burst(c: AudioContext, out: AudioNode, at: number, o: {
  type: BiquadFilterType; freq: number; q: number; gain: number; decay: number;
}) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rnd(0.9, 1.1);
  const f = c.createBiquadFilter();
  f.type = o.type; f.frequency.value = o.freq; f.Q.value = o.q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.decay);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 0.4, o.decay + 0.02);
}

/** A short pitched thump (the "body" of a step on a wooden floor). */
function thump(c: AudioContext, out: AudioNode, at: number, freq: number, gain: number, decay: number) {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, at + decay);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.02);
}

/**
 * Play one footstep. `volume` is 0..1 (already including distance falloff),
 * `pan` is -1..1 for remote players to the left/right of us.
 */
export function footstep(surface: Surface, volume: number, pan = 0) {
  if (volume <= 0.001) return;
  const c = audio();
  if (!c || c.state !== 'running' || !master) return;
  const at = c.currentTime + 0.005;
  const out = c.createGain();
  out.gain.value = volume * rnd(0.8, 1);
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  out.connect(p).connect(master);
  const pitch = rnd(0.9, 1.12);

  switch (surface) {
    case 'wood': // hollow knock
      thump(c, out, at, 150 * pitch, 0.55, 0.07);
      burst(c, out, at, { type: 'bandpass', freq: 900 * pitch, q: 2.5, gain: 0.5, decay: 0.05 });
      break;
    case 'hard': // tile / stone: crisp click
      burst(c, out, at, { type: 'bandpass', freq: 2600 * pitch, q: 3, gain: 0.6, decay: 0.035 });
      thump(c, out, at, 220 * pitch, 0.2, 0.03);
      break;
    case 'soft': // carpet / rug: muffled pad
      burst(c, out, at, { type: 'lowpass', freq: 420 * pitch, q: 0.7, gain: 0.9, decay: 0.09 });
      break;
    case 'grass': // rustle: a couple of airy bursts
      burst(c, out, at, { type: 'bandpass', freq: 3800 * pitch, q: 0.8, gain: 0.35, decay: 0.08 });
      burst(c, out, at + 0.025, { type: 'bandpass', freq: 2600 * pitch, q: 0.8, gain: 0.25, decay: 0.07 });
      break;
    case 'gravel': // crunch: several tiny grains
      for (let i = 0; i < 4; i++) {
        burst(c, out, at + i * rnd(0.008, 0.016), { type: 'bandpass', freq: rnd(1400, 2400) * pitch, q: 2, gain: rnd(0.25, 0.45), decay: 0.03 });
      }
      break;
  }
}
