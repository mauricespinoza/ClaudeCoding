// util.js — tweens conducidos por el bucle de render, easings y helpers.

const running = new Set();

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => --t * t * t + 1,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  inBack: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

let speedScale = 1;
export function setSpeedScale(v) { speedScale = v; }
export function getSpeedScale() { return speedScale; }

/** Anima durante `ms` llamando a fn(easedT, rawT). Devuelve una promesa. */
export function tween(ms, fn, ease = Ease.inOutCubic) {
  return new Promise((resolve) => {
    if (ms <= 0) { fn(1, 1); resolve(); return; }
    running.add({ dur: (ms / 1000) / speedScale, t: 0, fn, ease, resolve });
  });
}

export function wait(ms) {
  return tween(ms, () => {}, Ease.linear);
}

/** Llama fn(dt, elapsed) cada frame hasta que fn devuelva false o pasen `ms`. */
export function during(ms, fn) {
  return tween(ms, (_, raw) => fn(raw), Ease.linear);
}

export function updateTweens(dt) {
  for (const tw of Array.from(running)) {
    tw.t += dt;
    const raw = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(raw), raw);
    if (raw >= 1) { running.delete(tw); tw.resolve(); }
  }
}

export function clearTweens() {
  for (const tw of Array.from(running)) { running.delete(tw); tw.resolve(); }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Ángulo más corto entre dos rumbos (radianes). */
export function shortAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
