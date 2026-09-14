// audio.js — efectos de sonido sintetizados (sin archivos externos).

let ctx = null;
let master = null;
let enabled = true;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

export function resumeAudio() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setEnabled(v) {
  enabled = v;
  if (master) master.gain.value = v ? 0.5 : 0;
}

export function isEnabled() { return enabled; }

function now() { return ctx.currentTime; }

function noiseBuffer(seconds = 1) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

let sharedNoise = null;
function noiseSource() {
  if (!sharedNoise) sharedNoise = noiseBuffer(2);
  const src = ctx.createBufferSource();
  src.buffer = sharedNoise;
  src.loop = true;
  return src;
}

function env(node, t0, attack, decay, peak = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g);
  return g;
}

function tone(freq, t0, dur, type = 'sine', gain = 0.3, detune = 0) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.detune.value = detune;
  const g = env(osc, t0, 0.005, dur, gain);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.1);
  return osc;
}

function guard() {
  if (!enabled) return false;
  if (!ctx) initAudio();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

export const sfx = {
  select() {
    if (!guard()) return;
    const t = now();
    tone(660, t, 0.08, 'triangle', 0.12);
    tone(990, t + 0.03, 0.08, 'triangle', 0.07);
  },
  deny() {
    if (!guard()) return;
    const t = now();
    tone(150, t, 0.12, 'square', 0.1);
    tone(110, t + 0.05, 0.14, 'square', 0.08);
  },
  step(weight = 1) {
    if (!guard()) return;
    const t = now();
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(260 / weight, t);
    const g = env(src, t, 0.004, 0.09 * weight, 0.12 * weight);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.25);
    tone(70 / weight + 30, t, 0.08 * weight, 'sine', 0.14 * weight);
  },
  hoof() {
    if (!guard()) return;
    const t = now();
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
    const g = env(src, t, 0.002, 0.05, 0.18);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.15);
    tone(160, t, 0.06, 'sine', 0.1);
  },
  swoosh() {
    if (!guard()) return;
    const t = now();
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    const g = env(src, t, 0.03, 0.16, 0.16);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.4);
  },
  clang() {
    if (!guard()) return;
    const t = now();
    const freqs = [1860, 2540, 3320, 4680];
    freqs.forEach((f, i) => tone(f, t, 0.5 - i * 0.08, 'triangle', 0.12 - i * 0.02, i * 7));
    const src = noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass'; bp.frequency.value = 2000;
    const g = env(src, t, 0.002, 0.09, 0.3);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.2);
  },
  impact() {
    if (!guard()) return;
    const t = now();
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    const g = env(src, t, 0.002, 0.35, 0.4);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.6);
    tone(90, t, 0.3, 'sine', 0.35);
    tone(55, t + 0.02, 0.4, 'sine', 0.3);
  },
  crumble() {
    if (!guard()) return;
    const t = now();
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.7);
    const g = env(src, t, 0.01, 0.7, 0.3);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 1);
  },
  magicCharge() {
    if (!guard()) return;
    const t = now();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.55);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(f); f.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.8);
  },
  magicBlast() {
    if (!guard()) return;
    const t = now();
    tone(1200, t, 0.25, 'sine', 0.2);
    tone(600, t + 0.02, 0.4, 'sawtooth', 0.14);
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 900;
    const g = env(src, t, 0.005, 0.4, 0.25);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.6);
  },
  check() {
    if (!guard()) return;
    const t = now();
    tone(440, t, 0.35, 'sawtooth', 0.12);
    tone(466, t, 0.35, 'sawtooth', 0.1);
    tone(220, t + 0.12, 0.4, 'triangle', 0.12);
  },
  promote() {
    if (!guard()) return;
    const t = now();
    [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.5, 'triangle', 0.16));
  },
  castle() {
    if (!guard()) return;
    const t = now();
    tone(320, t, 0.2, 'square', 0.08);
    tone(480, t + 0.12, 0.25, 'square', 0.08);
  },
  victory() {
    if (!guard()) return;
    const t = now();
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.12, 0.9, 'triangle', 0.18));
  },
  defeat() {
    if (!guard()) return;
    const t = now();
    [392, 349, 311, 233].forEach((f, i) => tone(f, t + i * 0.18, 1.1, 'sawtooth', 0.14));
  },
};
