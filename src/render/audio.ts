// Synthesized sound effects (no audio files). The context starts on the first user gesture.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
export let muted = false;

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.6;
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(c: AudioContext, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, delay = 0) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(c: AudioContext, freq: number, endFreq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
  const o = c.createOscillator();
  o.type = type;
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  fire() {
    const c = audio();
    if (!c) return;
    noise(c, 0.6, 'lowpass', 900, 0.7, 0.9);
    tone(c, 110, 35, 0.5, 0.8);
  },
  /** `k` scales loudness by impact energy (0..1). */
  pen(k = 1) {
    const c = audio();
    if (!c) return;
    noise(c, 0.25, 'bandpass', 2600, 2, 0.7 * k);
    tone(c, 420, 180, 0.3, 0.35 * k, 'triangle');
    noise(c, 0.5, 'lowpass', 500, 0.7, 0.5 * k);
  },
  nonpen(k = 1) {
    const c = audio();
    if (!c) return;
    tone(c, 1900, 1500, 0.7, 0.3 * k, 'sine');
    tone(c, 2870, 2500, 0.5, 0.15 * k, 'sine');
    noise(c, 0.08, 'highpass', 3000, 1, 0.4 * k);
    noise(c, 0.3, 'lowpass', 700, 0.7, 0.4 * k);
  },
  ricochet(k = 1) {
    const c = audio();
    if (!c) return;
    tone(c, 3200, 700, 0.6, 0.25 * k, 'sawtooth');
    noise(c, 0.1, 'highpass', 2500, 1, 0.4 * k);
  },
  blast() {
    const c = audio();
    if (!c) return;
    noise(c, 0.7, 'lowpass', 1400, 0.8, 0.8);
    tone(c, 90, 40, 0.4, 0.6);
  },
  detonation() {
    const c = audio();
    if (!c) return;
    noise(c, 2.5, 'lowpass', 600, 0.6, 1.2);
    noise(c, 0.4, 'bandpass', 1800, 1, 0.6);
    tone(c, 70, 25, 1.6, 1.0);
  },
  whoosh() {
    const c = audio();
    if (!c) return;
    noise(c, 2.0, 'bandpass', 700, 0.5, 0.7);
  },
  crackle() {
    const c = audio();
    if (!c) return;
    for (let i = 0; i < 6; i++) noise(c, 0.05, 'highpass', 1500 + Math.random() * 2000, 1, 0.25, Math.random() * 0.6);
  },
};
