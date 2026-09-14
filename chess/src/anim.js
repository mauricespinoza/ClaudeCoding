// anim.js — poses procedurales. Cada frame se reinicia el esqueleto a su pose de
// reposo y se aplican dos capas: base (idle / marcha) y acción (golpe, parada,
// muerte…) con un peso k entre 0 y 1.

import { tween, Ease, lerp, clamp } from './util.js';

const TWO_PI = Math.PI * 2;

function resetRig(piece) {
  const nodes = piece.userData.nodes;
  for (const name in nodes) {
    const n = nodes[name];
    const rest = n.userData.rest;
    if (!rest) continue;
    n.rotation.set(rest.x, rest.y, rest.z);
    const rp = n.userData.restPos;
    if (rp) n.position.set(rp.x, rp.y, rp.z);
    n.scale.setScalar(1);
  }
}

const R = (nodes, name, x = 0, y = 0, z = 0, k = 1) => {
  const n = nodes[name];
  if (!n) return;
  n.rotation.x += x * k;
  n.rotation.y += y * k;
  n.rotation.z += z * k;
};

const MOV = (nodes, name, x = 0, y = 0, z = 0, k = 1) => {
  const n = nodes[name];
  if (!n) return;
  n.position.x += x * k;
  n.position.y += y * k;
  n.position.z += z * k;
};

// --------------------------------------------------------------- capa base

function idlePose(piece, t) {
  const { nodes, spec, anim } = piece.userData;
  const s = anim.seed;
  const breathe = Math.sin(t * 1.5 + s);
  R(nodes, 'torso', breathe * 0.028);
  R(nodes, 'head', Math.sin(t * 0.7 + s) * 0.06, Math.sin(t * 0.45 + s) * 0.14, 0);
  R(nodes, 'armR', Math.sin(t * 1.1 + s) * 0.05, 0, Math.sin(t * 0.9 + s) * 0.04);
  R(nodes, 'armL', Math.sin(t * 1.1 + s + 1) * 0.05, 0, -Math.sin(t * 0.9 + s) * 0.04);
  MOV(nodes, 'body', 0, breathe * 0.006, 0);

  if (spec.robed) {
    MOV(nodes, 'body', 0, 0.035 + Math.sin(t * 1.05 + s) * 0.022, 0);
    R(nodes, 'hips', 0, 0, Math.sin(t * 0.8 + s) * 0.03);
  }
  if (spec.mounted) {
    R(nodes, 'neck', Math.sin(t * 0.9 + s) * 0.08, Math.sin(t * 0.5) * 0.1, 0);
    R(nodes, 'tail', 0, Math.sin(t * 2.2 + s) * 0.35, 0);
    for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) R(nodes, leg, Math.sin(t + s) * 0.02);
  }
  swayCape(piece, t, 0);
  spinHalo(piece, t);
}

function swayCape(piece, t, forward) {
  const nodes = piece.userData.nodes;
  for (let i = 0; i < 4; i++) {
    const n = nodes['cape' + i];
    if (!n) break;
    const ph = t * 1.6 - i * 0.6 + piece.userData.anim.seed;
    n.rotation.x += Math.sin(ph) * 0.05 + forward * (0.25 + i * 0.12);
    n.rotation.z += Math.cos(ph * 0.8) * 0.04;
  }
}

function spinHalo(piece, t) {
  const halo = piece.userData.nodes.halo;
  if (halo) halo.rotation.y += t * 0.9;
  const orb = piece.userData.nodes.orb;
  if (orb) orb.scale.setScalar(1 + Math.sin(t * 3.2) * 0.12);
}

function walkPose(piece, phase, intensity, t) {
  const { nodes, spec } = piece.userData;
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  if (spec.mounted) {
    // galope: dos pares desfasados
    const g = phase * 1.0;
    R(nodes, 'legFL', -Math.sin(g) * 0.7 * intensity);
    R(nodes, 'legFR', -Math.sin(g + 0.5) * 0.7 * intensity);
    R(nodes, 'legBL', -Math.sin(g + 2.6) * 0.7 * intensity);
    R(nodes, 'legBR', -Math.sin(g + 3.1) * 0.7 * intensity);
    R(nodes, 'legFLL', clamp(Math.sin(g + 1.2), 0, 1) * 0.5 * intensity);
    R(nodes, 'legFRL', clamp(Math.sin(g + 1.7), 0, 1) * 0.5 * intensity);
    R(nodes, 'legBLL', clamp(Math.sin(g + 3.8), 0, 1) * 0.5 * intensity);
    R(nodes, 'legBRL', clamp(Math.sin(g + 4.3), 0, 1) * 0.5 * intensity);
    MOV(nodes, 'body', 0, (Math.abs(Math.sin(g)) * 0.05 + 0.01) * intensity, 0);
    R(nodes, 'horse', -0.12 * intensity + Math.sin(g * 2) * 0.06 * intensity);
    R(nodes, 'neck', Math.sin(g * 2) * 0.12 * intensity);
    R(nodes, 'tail', Math.sin(g * 2) * 0.2 * intensity);
    R(nodes, 'torso', -0.1 * intensity + Math.sin(g * 2) * 0.05 * intensity);
    return;
  }

  if (spec.robed) {
    // flota y se inclina hacia delante; la túnica ondea
    MOV(nodes, 'body', 0, 0.05 + Math.abs(s) * 0.02 * intensity, 0);
    R(nodes, 'body', -0.1 * intensity, 0, c * 0.05 * intensity);
    R(nodes, 'hips', 0, 0, s * 0.07 * intensity);
    R(nodes, 'armR', s * 0.18 * intensity);
    R(nodes, 'armL', -s * 0.18 * intensity);
    R(nodes, 'head', 0.05 * intensity, 0, 0);
    swayCape(piece, t, 0.5 * intensity);
    spinHalo(piece, t);
    return;
  }

  const heavy = piece.userData.spec.weight > 1.3 ? 1.4 : 1;
  R(nodes, 'legL', -s * 0.6 * intensity);
  R(nodes, 'legR', s * 0.6 * intensity);
  R(nodes, 'armR', s * 0.4 * intensity);
  R(nodes, 'armL', -s * 0.4 * intensity);
  R(nodes, 'torso', -0.07 * intensity, -s * 0.1 * intensity, 0);
  R(nodes, 'head', 0, s * 0.06 * intensity, 0);
  MOV(nodes, 'body', 0, Math.abs(s) * 0.03 * heavy * intensity, 0);
  R(nodes, 'body', 0, 0, c * 0.035 * heavy * intensity);
  swayCape(piece, t, 0.35 * intensity);
  spinHalo(piece, t);
}

// ------------------------------------------------------------ capa acción

const ACTIONS = {
  guard(nodes, k, piece) {
    R(nodes, 'torso', -0.12, 0.35, 0, k);
    R(nodes, 'armL', -1.5, 0, -0.5, k);
    R(nodes, 'armR', -0.5, 0, 0.7, k);
    R(nodes, 'legL', -0.25, 0, 0, k);
    R(nodes, 'legR', 0.2, 0, 0, k);
    R(nodes, 'head', 0.1, -0.2, 0, k);
    MOV(nodes, 'body', 0, -0.02, 0, k);
    if (piece.userData.spec.robed) MOV(nodes, 'body', 0, 0.05, 0, k);
  },
  windup(nodes, k, piece) {
    R(nodes, 'torso', 0.18, -0.5, 0, k);
    R(nodes, 'armR', -2.3, 0, -0.5, k);
    R(nodes, 'armL', -0.6, 0, 0.9, k);
    R(nodes, 'head', -0.1, -0.25, 0, k);
    R(nodes, 'legR', 0.25, 0, 0, k);
    MOV(nodes, 'body', 0, 0, -0.07, k);
  },
  strike(nodes, k, piece) {
    R(nodes, 'torso', -0.45, 0.7, 0, k);
    R(nodes, 'armR', 0.9, 0, 0.6, k);
    R(nodes, 'armL', -0.3, 0, -1.1, k);
    R(nodes, 'head', 0.25, 0.2, 0, k);
    R(nodes, 'legL', -0.5, 0, 0, k);
    R(nodes, 'legR', 0.35, 0, 0, k);
    MOV(nodes, 'body', 0, -0.03, 0.16, k);
    R(nodes, 'body', -0.15, 0, 0, k);
  },
  thrust(nodes, k) {
    R(nodes, 'torso', -0.25, 0.3, 0, k);
    R(nodes, 'armR', -1.2, 0, 0.4, k);
    R(nodes, 'legL', -0.55, 0, 0, k);
    R(nodes, 'legR', 0.3, 0, 0, k);
    MOV(nodes, 'body', 0, -0.04, 0.2, k);
  },
  parry(nodes, k) {
    R(nodes, 'torso', 0.2, -0.3, 0, k);
    R(nodes, 'armL', -2.0, 0, -0.8, k);
    R(nodes, 'armR', -0.2, 0, 1.0, k);
    R(nodes, 'head', -0.2, 0, 0, k);
    MOV(nodes, 'body', 0, 0, -0.09, k);
    R(nodes, 'body', 0.12, 0, 0, k);
  },
  cast(nodes, k) {
    R(nodes, 'torso', -0.1, 0, 0, k);
    R(nodes, 'armR', -2.4, 0, -0.3, k);
    R(nodes, 'armL', -1.6, 0, 0.6, k);
    R(nodes, 'head', -0.22, 0, 0, k);
    MOV(nodes, 'body', 0, 0.05, 0, k);
  },
  release(nodes, k) {
    R(nodes, 'torso', -0.3, 0.15, 0, k);
    R(nodes, 'armR', -0.9, 0, 0.2, k);
    R(nodes, 'armL', -1.1, 0, -0.2, k);
    R(nodes, 'head', 0.1, 0, 0, k);
    MOV(nodes, 'body', 0, 0, 0.06, k);
  },
  charge(nodes, k) {
    R(nodes, 'torso', -0.35, 0.25, 0, k);
    R(nodes, 'armR', -1.55, 0, 0.15, k);
    R(nodes, 'head', -0.15, 0, 0, k);
    R(nodes, 'neck', -0.3, 0, 0, k);
    R(nodes, 'horse', -0.1, 0, 0, k);
  },
  rear(nodes, k) {
    R(nodes, 'horse', -0.9, 0, 0, k);
    R(nodes, 'legFL', -1.1, 0, 0, k);
    R(nodes, 'legFR', -1.2, 0, 0, k);
    R(nodes, 'neck', 0.5, 0, 0, k);
    R(nodes, 'torso', 0.25, 0, 0, k);
    R(nodes, 'armR', -1.0, 0, 0, k);
  },
  hit(nodes, k, piece) {
    R(nodes, 'torso', 0.5, -0.25, 0, k);
    R(nodes, 'head', 0.6, 0, 0.2, k);
    R(nodes, 'armR', 0.7, 0, 0.7, k);
    R(nodes, 'armL', 0.5, 0, -0.9, k);
    R(nodes, 'legR', -0.3, 0, 0, k);
    MOV(nodes, 'body', 0, -0.02, -0.16, k);
    R(nodes, 'body', 0.25, 0, 0, k);
  },
  fall(nodes, k, piece) {
    const e = Ease.inQuad(k);
    R(nodes, 'body', 1.45 * e, 0, 0.25 * e);
    MOV(nodes, 'body', 0, -0.02 * e, -0.12 * e);
    R(nodes, 'torso', 0.35 * e, 0, 0);
    R(nodes, 'head', 0.5 * e, 0, 0);
    R(nodes, 'armR', 1.4 * e, 0, 1.0 * e);
    R(nodes, 'armL', 1.2 * e, 0, -1.2 * e);
    R(nodes, 'legL', -0.7 * e, 0, 0);
    R(nodes, 'legR', -0.4 * e, 0, 0);
  },
  crumble(nodes, k, piece) {
    const e = Ease.inQuad(k);
    MOV(nodes, 'body', 0, -piece.userData.spec.height * 0.75 * e, 0);
    R(nodes, 'body', 0.25 * e, 0.4 * e, 0.3 * e);
    const t = nodes.torso;
    if (t) t.scale.set(1 - e * 0.15, 1 - e * 0.5, 1 - e * 0.15);
    R(nodes, 'armR', 1.2 * e, 0, 0.8 * e);
    R(nodes, 'armL', 1.0 * e, 0, -0.8 * e);
    R(nodes, 'head', 0, 0, 0.5 * e);
  },
  dissolve(nodes, k, piece) {
    const e = Ease.outCubic(k);
    MOV(nodes, 'body', 0, 0.35 * e, 0);
    R(nodes, 'body', -0.35 * e, 0, 0);
    R(nodes, 'armR', -1.9 * e, 0, -0.5 * e);
    R(nodes, 'armL', -1.9 * e, 0, 0.5 * e);
    R(nodes, 'head', -0.6 * e, 0, 0);
    const b = nodes.body;
    if (b) b.scale.setScalar(1 + e * 0.12);
  },
  kneel(nodes, k, piece) {
    const e = Ease.outCubic(k);
    MOV(nodes, 'body', 0, -piece.userData.spec.height * 0.3 * e, 0);
    R(nodes, 'legR', -1.4 * e, 0, 0);
    R(nodes, 'legL', -0.5 * e, 0, 0.2 * e);
    R(nodes, 'torso', 0.35 * e, 0, 0);
    R(nodes, 'head', 0.55 * e, 0, 0);
    R(nodes, 'armR', 0.4 * e, 0, 0.5 * e);
    R(nodes, 'armL', 0.3 * e, 0, -0.5 * e);
  },
  cheer(nodes, k, piece) {
    const e = Ease.outBack(clamp(k, 0, 1));
    R(nodes, 'armR', -2.7 * e, 0, -0.35 * e);
    R(nodes, 'armL', -1.0 * e, 0, 0.8 * e);
    R(nodes, 'torso', -0.2 * e, 0, 0);
    R(nodes, 'head', -0.35 * e, 0, 0);
    MOV(nodes, 'body', 0, 0.03 * e, 0);
  },
  alert(nodes, k) {
    R(nodes, 'torso', 0.15, 0, 0, k);
    R(nodes, 'armL', -1.1, 0, -0.6, k);
    R(nodes, 'armR', -0.7, 0, 0.5, k);
    R(nodes, 'head', -0.2, 0, 0, k);
    MOV(nodes, 'body', 0, 0, -0.05, k);
  },
};

export function applyPieceAnim(piece, t) {
  const anim = piece.userData.anim;
  resetRig(piece);

  if (anim.walking) {
    walkPose(piece, anim.walkPhase, anim.walkIntensity ?? 1, t);
  } else {
    idlePose(piece, t + anim.seed);
  }

  if (anim.action && anim.k > 0.001) {
    const fn = ACTIONS[anim.action];
    if (fn) fn(piece.userData.nodes, anim.k, piece);
  }
  if (anim.extraAction && anim.extraK > 0.001) {
    const fn = ACTIONS[anim.extraAction];
    if (fn) fn(piece.userData.nodes, anim.extraK, piece);
  }
}

// ------------------------------------------------------------------- API

export function setAction(piece, name, k = 1) {
  piece.userData.anim.action = name;
  piece.userData.anim.k = k;
}

export function clearAction(piece) {
  piece.userData.anim.action = null;
  piece.userData.anim.k = 0;
}

/** Entra en una acción (0 → 1). */
export function enterAction(piece, name, ms, ease = Ease.outCubic) {
  piece.userData.anim.action = name;
  return tween(ms, (k) => { piece.userData.anim.k = k; }, ease);
}

/** Sale de la acción activa (1 → 0). */
export function exitAction(piece, ms, ease = Ease.inOutCubic) {
  return tween(ms, (k) => { piece.userData.anim.k = 1 - k; }, ease).then(() => clearAction(piece));
}

/** Acción rápida completa: entra, mantiene y sale. */
export async function pulseAction(piece, name, inMs, holdMs, outMs) {
  await enterAction(piece, name, inMs);
  if (holdMs) await tween(holdMs, () => {}, Ease.linear);
  await exitAction(piece, outMs);
}

export function setWalking(piece, on, intensity = 1) {
  piece.userData.anim.walking = on;
  piece.userData.anim.walkIntensity = intensity;
}

export function advanceWalk(piece, delta) {
  piece.userData.anim.walkPhase += delta;
  return piece.userData.anim.walkPhase;
}

export const DEATH_POSE = {
  p: 'fall', n: 'fall', k: 'fall', r: 'crumble', b: 'dissolve', q: 'dissolve',
};

export { ACTIONS, TWO_PI };
