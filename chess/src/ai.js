// ai.js — búsqueda alfa-beta con profundización iterativa y quiescencia.
import {
  W, B, other, colorOf, typeOf, fileOf, rankOf,
  generateMoves, generatePseudoMoves, makeMove, undoMove, inCheck, kingSquare, isAttacked,
} from './engine.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Tablas posicionales vistas desde las blancas (idx 0 = a1).
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, -20, -20, 10, 10, 5,
    5, -5, -10, 0, 0, -10, -5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, 5, 10, 25, 25, 10, 5, 5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 5, 10, 10, 5, 0, 0,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    5, 10, 10, 10, 10, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -10, 5, 5, 5, 5, 5, 0, -10,
    0, 0, 5, 5, 5, 5, 0, -5,
    -5, 0, 5, 5, 5, 5, 0, -5,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    20, 30, 10, 0, 0, 10, 30, 20,
    20, 20, 0, 0, 0, 0, 20, 20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
  ],
  kEnd: [
    -50, -30, -30, -30, -30, -30, -30, -50,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -50, -40, -30, -20, -20, -30, -40, -50,
  ],
};

const mirror = (i) => (7 - rankOf(i)) * 8 + fileOf(i);

export function evaluate(state) {
  const b = state.board;
  let score = 0;
  let material = 0;
  const pawnFiles = { w: new Array(8).fill(0), b: new Array(8).fill(0) };

  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const t = typeOf(p);
    if (t !== 'k' && t !== 'p') material += VALUE[t];
    if (t === 'p') pawnFiles[colorOf(p)][fileOf(i)]++;
  }
  const endgame = material <= 1300;

  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const t = typeOf(p);
    const white = colorOf(p) === W;
    const table = t === 'k' && endgame ? PST.kEnd : PST[t];
    const v = VALUE[t] + table[white ? i : mirror(i)];
    score += white ? v : -v;
  }

  // estructura de peones: doblados y aislados
  for (let f = 0; f < 8; f++) {
    for (const c of [W, B]) {
      const n = pawnFiles[c][f];
      if (!n) continue;
      const sign = c === W ? 1 : -1;
      if (n > 1) score -= sign * 12 * (n - 1);
      const left = f > 0 ? pawnFiles[c][f - 1] : 0;
      const right = f < 7 ? pawnFiles[c][f + 1] : 0;
      if (!left && !right) score -= sign * 15;
    }
  }

  // movilidad ligera
  score += 2 * (generatePseudoMoves(state, W).length - generatePseudoMoves(state, B).length);

  return state.turn === W ? score : -score; // punto de vista del que mueve
}

const MATE = 100000;

function moveScore(state, m, killers, depth) {
  if (m.captured) {
    return 10000 + VALUE[typeOf(m.captured)] * 10 - VALUE[typeOf(m.piece)];
  }
  if (m.promotion) return 9000 + VALUE[m.promotion];
  if (killers[depth] && killers[depth].from === m.from && killers[depth].to === m.to) return 8000;
  if (m.castle) return 500;
  return 0;
}

function quiesce(state, alpha, beta, ctx) {
  ctx.nodes++;
  let stand = evaluate(state);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const caps = generateMoves(state).filter((m) => m.captured || m.promotion);
  caps.sort((a, b) => moveScore(state, b, ctx.killers, 0) - moveScore(state, a, ctx.killers, 0));
  for (const m of caps) {
    makeMove(state, m, { silent: true });
    const score = -quiesce(state, -beta, -alpha, ctx);
    undoMove(state, { silent: true });
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(state, depth, alpha, beta, ctx, ply = 0) {
  if (ctx.stopped || (ctx.nodes & 1023) === 0 && performance.now() > ctx.deadline) {
    ctx.stopped = true;
    return alpha;
  }
  ctx.nodes++;

  const moves = generateMoves(state);
  if (moves.length === 0) {
    return inCheck(state) ? -MATE + ply : 0;
  }
  if (depth <= 0) return quiesce(state, alpha, beta, ctx);

  moves.sort((a, b) => moveScore(state, b, ctx.killers, ply) - moveScore(state, a, ctx.killers, ply));

  let best = -Infinity;
  let bestMove = null;
  for (const m of moves) {
    makeMove(state, m, { silent: true });
    const extension = inCheck(state) ? 1 : 0;
    const score = -search(state, depth - 1 + extension, -beta, -alpha, ctx, ply + 1);
    undoMove(state, { silent: true });
    if (ctx.stopped) break;
    if (score > best) { best = score; bestMove = m; }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!m.captured) ctx.killers[ply] = m;
      break;
    }
  }
  if (ply === 0 && bestMove) ctx.rootBest = bestMove;
  return best;
}

export const LEVELS = {
  1: { name: 'Escudero', depth: 1, time: 300, blunder: 0.45 },
  2: { name: 'Caballero', depth: 2, time: 600, blunder: 0.18 },
  3: { name: 'Capitán', depth: 3, time: 1200, blunder: 0.05 },
  4: { name: 'General', depth: 4, time: 2500, blunder: 0 },
  5: { name: 'Archimago', depth: 6, time: 5000, blunder: 0 },
};

/** Devuelve la mejor jugada para el bando en turno. */
export function chooseMove(state, level = 3) {
  const cfg = LEVELS[level] || LEVELS[3];
  const moves = generateMoves(state);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];

  // Niveles bajos: a veces juegan una jugada razonable pero no la mejor.
  if (cfg.blunder && Math.random() < cfg.blunder) {
    const scored = moves.map((m) => {
      makeMove(state, m, { silent: true });
      const v = -evaluate(state);
      undoMove(state, { silent: true });
      return { m, v };
    }).sort((a, b) => b.v - a.v);
    const pick = scored[Math.min(scored.length - 1, 1 + Math.floor(Math.random() * 3))];
    return pick.m;
  }

  const ctx = {
    nodes: 0,
    killers: [],
    deadline: performance.now() + cfg.time,
    stopped: false,
    rootBest: null,
  };
  let best = moves[0];
  for (let d = 1; d <= cfg.depth; d++) {
    ctx.rootBest = null;
    search(state, d, -Infinity, Infinity, ctx, 0);
    if (ctx.rootBest) best = ctx.rootBest;
    if (ctx.stopped) break;
  }
  return best;
}

/** Pista para el jugador humano: usa siempre un nivel decente. */
export function hintMove(state) {
  return chooseMove(state, 3);
}

export { VALUE };
