// Sound design, synthesised from impulse-like shapes so the build stays asset-free. Every cue scales with the
// calibre of the round (`cal`, mm) and, for impacts, with the energy of the hit (`k`, 0..1).

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

/** Filtered noise burst with an exponential tail. */
function noise(c: AudioContext, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, delay = 0, attack = 0.002) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

/** Pitched tone with an exponential glide and decay. */
function tone(c: AudioContext, freq: number, endFreq: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0, vibrato = 0) {
  const o = c.createOscillator();
  o.type = type;
  const g = c.createGain();
  const t = c.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
  if (vibrato > 0) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 9;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Struck steel: a set of inharmonic partials that ring and die at different rates. */
function clang(c: AudioContext, base: number, gain: number, dur: number, delay = 0) {
  const ratios = [1, 1.52, 2.27, 3.08, 4.11];
  ratios.forEach((r, i) => tone(c, base * r, base * r * 0.985, dur / (1 + i * 0.45), (gain * 0.55) / (1 + i), i === 0 ? 'triangle' : 'sine', delay));
}

/** Calibre scaling: 120 mm is the reference. */
const calScale = (cal: number) => Math.max(0.4, Math.min(1.6, cal / 120));

export const sfx = {
  /** Gun report: pressure thump, muzzle blast, and an echo tail that grows with calibre. */
  fire(cal = 100) {
    const c = audio();
    if (!c) return;
    const s = calScale(cal);
    tone(c, 95 * (2 - s), 28, 0.45 * s + 0.2, 0.9, 'sine');
    noise(c, 0.25 + 0.2 * s, 'lowpass', 1200 - 400 * s, 0.6, 1.0);
    noise(c, 0.9 + 0.8 * s, 'lowpass', 350, 0.5, 0.35 * s, 0.12, 0.05); // echo tail
    noise(c, 0.5, 'bandpass', 2800, 1.2, 0.25, 0.02); // crack
  },
  /** Penetration: a sharp crack as the plate lets go, then the hiss of spall inside. */
  pen(k = 1, cal = 100) {
    const c = audio();
    if (!c) return;
    const s = calScale(cal);
    noise(c, 0.08, 'highpass', 3500, 1, 0.9 * k);
    clang(c, 520 / s, 0.5 * k, 0.5);
    noise(c, 0.55, 'bandpass', 4200, 0.7, 0.45 * k, 0.05, 0.02); // spall hiss
    tone(c, 140, 45, 0.4, 0.5 * k * s);
  },
  /** Stopped by the plate: a heavy clang with a long low ring. */
  nonpen(k = 1, cal = 100) {
    const c = audio();
    if (!c) return;
    const s = calScale(cal);
    clang(c, 310 / s, 0.9 * k, 1.1 + 0.3 * s);
    noise(c, 0.06, 'highpass', 2500, 1, 0.5 * k);
    tone(c, 110, 60, 0.5, 0.45 * k * s);
  },
  /** Ricochet: the classic descending whine with vibrato, plus the skid of metal on metal. */
  ricochet(k = 1, cal = 100) {
    const c = audio();
    if (!c) return;
    tone(c, 3400 - 600 * calScale(cal), 420, 0.75, 0.35 * k, 'sawtooth', 0, 40);
    noise(c, 0.12, 'highpass', 3000, 1, 0.45 * k);
    clang(c, 700, 0.25 * k, 0.3);
  },
  /** External burst (HESH/HE/ERA): sharp bang with a short tail. */
  blast(cal = 100) {
    const c = audio();
    if (!c) return;
    const s = calScale(cal);
    noise(c, 0.5 + 0.3 * s, 'lowpass', 1600, 0.8, 0.9);
    tone(c, 90, 38, 0.45, 0.65 * s);
  },
  /** Ammunition going up: crackles as rounds cook, then a deep thump with a long tail. */
  detonation() {
    const c = audio();
    if (!c) return;
    for (let i = 0; i < 7; i++) noise(c, 0.05, 'bandpass', 1800 + Math.random() * 2500, 2, 0.35, Math.random() * 0.35);
    noise(c, 2.6, 'lowpass', 450, 0.6, 1.2, 0.3, 0.01);
    noise(c, 0.5, 'bandpass', 1500, 1, 0.7, 0.3);
    tone(c, 62, 22, 1.9, 1.0, 'sine', 0.3);
  },
  /** Blow-out panels venting: a roaring jet. */
  whoosh() {
    const c = audio();
    if (!c) return;
    noise(c, 2.0, 'bandpass', 700, 0.5, 0.7, 0, 0.08);
    noise(c, 1.4, 'highpass', 3000, 0.7, 0.25, 0.1, 0.1);
  },
  /** Propellant fire: irregular crackling. */
  crackle() {
    const c = audio();
    if (!c) return;
    for (let i = 0; i < 9; i++) noise(c, 0.04 + Math.random() * 0.04, 'bandpass', 1500 + Math.random() * 3000, 1.5, 0.3, Math.random() * 0.9);
  },
};
