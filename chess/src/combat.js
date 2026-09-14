// combat.js — coreografía de cada jugada: marcha, duelo, muerte y avance.

import * as THREE from 'three';
import { squareToWorld } from './board3d.js';
import {
  setWalking, enterAction, exitAction, pulseAction, setAction, clearAction, DEATH_POSE,
} from './anim.js';
import { flashPiece } from './fx.js';
import { tween, during, wait, Ease, lerp, clamp, rand } from './util.js';
import { sfx } from './audio.js';
import { PALETTES } from './models.js';

const V = () => new THREE.Vector3();
const tmpA = V(), tmpB = V(), tmpC = V();

function faceDir(piece, dx, dz, instant = false, ms = 180) {
  const goal = Math.atan2(dx, dz);
  if (instant) { piece.rotation.y = goal; return Promise.resolve(); }
  const start = piece.rotation.y;
  let d = (goal - start) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return tween(ms, (t) => { piece.rotation.y = start + d * t; }, Ease.inOutCubic);
}

function faceTowards(piece, target, instant = false, ms = 180) {
  return faceDir(piece, target.x - piece.position.x, target.z - piece.position.z, instant, ms);
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += points[i].distanceTo(points[i - 1]);
  return len;
}

function samplePath(points, s, out) {
  // s ∈ [0,1] sobre la longitud total
  const total = pathLength(points);
  let target = s * total;
  for (let i = 1; i < points.length; i++) {
    const seg = points[i].distanceTo(points[i - 1]);
    if (target <= seg || i === points.length - 1) {
      const k = seg > 0 ? clamp(target / seg, 0, 1) : 1;
      out.lerpVectors(points[i - 1], points[i], k);
      return { segment: i - 1, k, total };
    }
    target -= seg;
  }
  out.copy(points[points.length - 1]);
  return { segment: points.length - 2, k: 1, total };
}

/** Desplaza una pieza a lo largo de una polilínea con su ciclo de marcha. */
async function moveThrough(piece, points, opts = {}) {
  const board = opts.board;
  const spec = piece.userData.spec;
  const total = pathLength(points);
  if (total < 0.001) return;
  const speed = (opts.speed ?? spec.walkSpeed) * (opts.rush ? 1.7 : 1);
  const duration = Math.max(260, (total / speed) * 1000);
  const cadence = spec.mounted ? 7.5 : spec.robed ? 4.2 : 9.0;
  const anim = piece.userData.anim;
  const startPhase = anim.walkPhase;
  let lastStep = Math.floor(startPhase / Math.PI);

  setWalking(piece, true, opts.intensity ?? 1);
  const pos = V();
  await during(duration, (t) => {
    const e = opts.ease ? opts.ease(t) : (t < 0.12 ? Ease.outQuad(t / 0.12) * 0.12 : t);
    const info = samplePath(points, e, pos);
    piece.position.x = pos.x;
    piece.position.z = pos.z;

    // salto/trote: altura en arco por segmento
    if (opts.hop) {
      const segs = points.length - 1;
      const local = (e * segs) % 1;
      piece.position.y = Math.sin(local * Math.PI) * opts.hop;
    }

    // rumbo: tangente del camino
    const a = points[Math.min(info.segment, points.length - 2)];
    const b = points[Math.min(info.segment + 1, points.length - 1)];
    const goal = Math.atan2(b.x - a.x, b.z - a.z);
    let d = (goal - piece.rotation.y) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    piece.rotation.y += d * 0.28;

    anim.walkPhase = startPhase + e * (total * cadence);
    const step = Math.floor(anim.walkPhase / Math.PI);
    if (step !== lastStep) {
      lastStep = step;
      if (spec.mounted) sfx.hoof();
      else if (!spec.robed) sfx.step(spec.weight);
      if (board && !spec.robed) {
        board.fx.dust(piece.position, spec.weight > 1.3 ? 5 : 2, 0x8c8270, { speed: 0.5 });
      }
    }
  });
  piece.position.y = 0;
  setWalking(piece, false);
}

function straightPath(from, to) { return [from.clone(), to.clone()]; }

/** Camino en L para el caballo (dos tramos con salto). */
function knightPath(from, to) {
  const df = to.x - from.x, dz = to.z - from.z;
  const corner = Math.abs(df) > Math.abs(dz)
    ? new THREE.Vector3(from.x + df * 0.62, 0, from.z)
    : new THREE.Vector3(from.x, 0, from.z + dz * 0.62);
  return [from.clone(), corner, to.clone()];
}

function approachPoint(from, to, distance) {
  const dir = tmpA.subVectors(to, from);
  const len = dir.length();
  if (len < 0.001) return to.clone();
  dir.multiplyScalar(1 / len);
  return to.clone().addScaledVector(dir, -Math.min(distance, len * 0.75));
}

function contactPoint(attacker, defender) {
  return tmpB.lerpVectors(attacker.position, defender.position, 0.55)
    .setY(Math.max(0.3, defender.userData.spec.worldHeight * 0.62)).clone();
}

// ------------------------------------------------------------------ muerte

async function deathSequence(board, victim, killer, opts = {}) {
  const P = PALETTES[victim.userData.color];
  const pose = DEATH_POSE[victim.userData.type] || 'fall';
  const pos = victim.position.clone();
  const mid = pos.clone().setY(victim.userData.spec.worldHeight * 0.55);

  board.detach(victim);
  flashPiece(victim, 0xffffff, 260, 1.2);

  if (!opts.silentHit) {
    await pulseAction(victim, 'hit', 110, 60, 0);
  }

  setAction(victim, pose, 0);
  const dur = pose === 'dissolve' ? 780 : pose === 'crumble' ? 700 : 620;

  if (pose === 'crumble') {
    sfx.crumble();
    board.fx.dust(pos, 18, P.stone, { speed: 1.6 });
    board.fx.shatter(mid, P.stone, 16, 2.4);
    board.fx.ring(pos, P.glow, { radius: 1.1, duration: 0.7, opacity: 0.6 });
  } else if (pose === 'dissolve') {
    sfx.magicBlast();
    board.fx.embers(pos, 30, P.glow, { radius: 0.28, height: victim.userData.spec.worldHeight });
    board.fx.flash(mid, P.glow, 1.1, 0.35);
  } else {
    sfx.impact();
    board.fx.dust(pos, 12, 0x8c8270, { speed: 1.2 });
    board.fx.sparks(mid, 14, P.metal, { speed: 2.4 });
  }
  board.fx.addShake(0.5);

  const mats = victim.userData.mats;
  mats.solid.transparent = true;
  mats.glow.transparent = true;

  await tween(dur, (t) => {
    victim.userData.anim.k = Math.min(1, t * 1.3);
    const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
    mats.solid.opacity = fade;
    mats.glow.opacity = fade;
    victim.userData.base.material.opacity = 0.5 * fade;
    if (pose === 'dissolve') {
      victim.position.y = t * 0.35;
      if (Math.random() < 0.6) {
        board.fx.embers(victim.position, 2, P.glow, { radius: 0.22, height: victim.userData.spec.worldHeight });
      }
    }
    if (pose === 'fall' && t > 0.55 && Math.random() < 0.25) {
      board.fx.dust(victim.position, 2, 0x8c8270, { speed: 0.6 });
    }
  }, Ease.linear);

  board.removePiece(victim);
  return true;
}

// ------------------------------------------------------------------ duelos

async function meleeExchange(board, attacker, defender, exchanges) {
  const contact = contactPoint(attacker, defender);
  for (let i = 0; i < exchanges; i++) {
    const last = i === exchanges - 1;
    await enterAction(attacker, 'windup', 200, Ease.outCubic);
    sfx.swoosh();
    const strikePose = attacker.userData.type === 'n' ? 'thrust' : 'strike';
    if (!last) {
      await Promise.all([
        enterAction(attacker, strikePose, 140, Ease.inQuad),
        (async () => { await wait(60); await enterAction(defender, 'parry', 110, Ease.outQuad); })(),
      ]);
      sfx.clang();
      board.fx.sparks(contact, 16, 0xffe3a0, { speed: 3.4 });
      board.fx.flash(contact, 0xfff0c0, 0.5, 0.18);
      board.fx.addShake(0.22);
      await Promise.all([
        exitAction(attacker, 180),
        exitAction(defender, 200).then(() => enterAction(defender, 'guard', 160)),
      ]);
    } else {
      await enterAction(attacker, strikePose, 130, Ease.inQuad);
      sfx.clang();
      sfx.impact();
      board.fx.sparks(contact, 26, 0xffd27f, { speed: 4.2 });
      board.fx.flash(contact, 0xffffff, 0.85, 0.22);
      board.fx.addShake(0.45);
    }
  }
}

async function hammerSmash(board, attacker, defender) {
  await enterAction(attacker, 'windup', 320, Ease.outCubic);
  await wait(90);
  sfx.swoosh();
  await enterAction(attacker, 'strike', 120, Ease.inQuad);
  const p = defender.position.clone();
  sfx.impact();
  board.fx.ring(p, 0xffc96b, { radius: 1.7, duration: 0.55, opacity: 0.85 });
  board.fx.sparks(contactPoint(attacker, defender), 30, 0xffc96b, { speed: 4.5 });
  board.fx.dust(p, 16, 0x8c8270, { speed: 2.2 });
  board.fx.addShake(0.75);
}

async function castSpell(board, attacker, defender) {
  const P = PALETTES[attacker.userData.color];
  const orb = attacker.userData.nodes.orb;
  await enterAction(attacker, 'cast', 380, Ease.outCubic);
  sfx.magicCharge();
  const orbPos = V();
  await during(520, () => {
    if (!orb) return;
    orb.getWorldPosition(orbPos);
    if (Math.random() < 0.8) {
      board.fx.spawn(
        orbPos.x + rand(-0.25, 0.25), orbPos.y + rand(-0.25, 0.25), orbPos.z + rand(-0.25, 0.25),
        { color: P.glow, size: rand(0.04, 0.09), life: 0.28, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0.2 },
      );
    }
  });
  if (orb) orb.getWorldPosition(orbPos);
  else orbPos.copy(attacker.position).setY(1);

  await enterAction(attacker, 'release', 120, Ease.inQuad);
  sfx.magicBlast();
  board.fx.flash(orbPos, P.glow, 0.9, 0.25);

  const target = defender.position.clone().setY(defender.userData.spec.worldHeight * 0.6);
  await enterAction(defender, 'guard', 140);
  await board.fx.bolt(orbPos, target, P.glow, { duration: 360, arc: 0.2, scale: 1.15 });
  board.fx.flash(target, 0xffffff, 1.3, 0.3);
  board.fx.sparks(target, 26, P.glow, { speed: 3.8 });
  board.fx.addShake(0.55);
  sfx.impact();
}

async function lanceCharge(board, attacker, defender, fromV, duelV) {
  // el caballo retrocede, se encabrita y carga
  await enterAction(attacker, 'rear', 260, Ease.outCubic);
  sfx.hoof();
  await wait(120);
  await exitAction(attacker, 160);
  setAction(attacker, 'charge', 1);
  await moveThrough(attacker, [attacker.position.clone(), duelV], {
    board, speed: attacker.userData.spec.walkSpeed * 1.9, hop: 0.06,
  });
  const contact = contactPoint(attacker, defender);
  sfx.impact();
  board.fx.sparks(contact, 30, 0xffe3a0, { speed: 4.6 });
  board.fx.flash(contact, 0xffffff, 1.0, 0.24);
  board.fx.addShake(0.7);
  clearAction(attacker);
}

// --------------------------------------------------------------- secuencias

export class Combat {
  constructor(board) {
    this.board = board;
    this.speed = 1;
  }

  focus(pos, weight = 0.4) { this.board.focusOn(pos, weight); }
  unfocus() { this.board.focusOn(null); }

  /** Reproduce una jugada completa. */
  async play(move, info = {}) {
    const board = this.board;
    const piece = board.pieceAt(move.from);
    if (!piece) return;

    const fromV = squareToWorld(move.from);
    const toV = squareToWorld(move.to);

    if (move.castle) return this.playCastle(move, piece, fromV, toV, info);

    const victimSquare = move.capturedSquare;
    const victim = victimSquare != null ? board.pieceAt(victimSquare) : null;

    if (victim) await this.playCapture(move, piece, victim, fromV, toV, info);
    else await this.playQuiet(move, piece, fromV, toV, info);

    board.relocate(piece, move.from, move.to);
    if (move.promotion) await this.playPromotion(move, piece, toV);
    await this.finishTurn(piece, move, info);
  }

  async playQuiet(move, piece, fromV, toV, info) {
    const board = this.board;
    const type = piece.userData.type;
    this.focus(toV.clone().setY(0.4), 0.12);
    if (type === 'n') {
      await moveThrough(piece, knightPath(fromV, toV), { board, hop: 0.42, speed: 3.2 });
      sfx.hoof();
      board.fx.dust(toV, 6, 0x8c8270, { speed: 1.1 });
    } else {
      await moveThrough(piece, straightPath(fromV, toV), { board });
      if (piece.userData.spec.weight > 1.3) {
        board.fx.dust(toV, 6, 0x8c8270, { speed: 0.9 });
        board.fx.addShake(0.12);
      }
    }
    await this.settle(piece);
  }

  async playCapture(move, attacker, victim, fromV, toV, info) {
    const board = this.board;
    const type = attacker.userData.type;
    const duelDist = 0.52 + victim.userData.spec.worldRadius * 0.4;
    const duelV = approachPoint(fromV, toV, duelDist);
    const midPoint = toV.clone().lerp(fromV, 0.25).setY(0.55);
    this.focus(midPoint, 0.3);

    // el defensor se gira y se pone en guardia
    faceTowards(victim, fromV, false, 240);
    enterAction(victim, 'guard', 280);

    if (type === 'n') {
      const path = knightPath(fromV, approachPoint(fromV, toV, duelDist + 0.9));
      await moveThrough(attacker, path, { board, hop: 0.38, speed: 3.0 });
      await faceTowards(attacker, toV, false, 160);
      await lanceCharge(board, attacker, victim, fromV, duelV);
    } else if (type === 'b' || type === 'q') {
      // los lanzadores atacan a distancia: avanzan poco
      const standV = approachPoint(fromV, toV, Math.min(1.6, fromV.distanceTo(toV) * 0.55));
      await moveThrough(attacker, straightPath(fromV, standV), { board });
      await faceTowards(attacker, toV, false, 160);
      await castSpell(board, attacker, victim);
    } else {
      await moveThrough(attacker, straightPath(fromV, duelV), { board });
      await faceTowards(attacker, toV, false, 160);
      if (type === 'r') await hammerSmash(board, attacker, victim);
      else await meleeExchange(board, attacker, victim, type === 'k' ? 3 : 2);
    }

    await deathSequence(board, victim, attacker);
    if (attacker.userData.anim.action) await exitAction(attacker, 220);

    // ocupa la casilla
    await moveThrough(attacker, straightPath(attacker.position.clone(), toV), { board, speed: attacker.userData.spec.walkSpeed * 0.9 });
    await this.settle(attacker);
    await pulseAction(attacker, 'cheer', 220, 140, 260);
  }

  async playCastle(move, king, fromV, toV, info) {
    const board = this.board;
    const rank = move.to >> 3;
    const kingSide = move.castle === 'K';
    const rookFrom = rank * 8 + (kingSide ? 7 : 0);
    const rookTo = rank * 8 + (kingSide ? 5 : 3);
    const rook = board.pieceAt(rookFrom);
    const rookFromV = squareToWorld(rookFrom);
    const rookToV = squareToWorld(rookTo);

    this.focus(toV.clone().lerp(rookToV, 0.5).setY(0.4), 0.2);
    sfx.castle();

    // la torre rodea al rey por detrás mientras éste avanza
    const arc = [
      rookFromV.clone(),
      rookFromV.clone().lerp(rookToV, 0.5).add(new THREE.Vector3(0, 0, (rank === 0 ? 0.75 : -0.75))),
      rookToV.clone(),
    ];
    await Promise.all([
      moveThrough(king, straightPath(fromV, toV), { board }),
      (async () => {
        if (!rook) return;
        await wait(160);
        await moveThrough(rook, arc, { board, speed: rook.userData.spec.walkSpeed * 1.8 });
        board.relocate(rook, rookFrom, rookTo);
        await this.settle(rook);
      })(),
    ]);
    board.relocate(king, move.from, move.to);
    await this.settle(king);
    // saludo entre ambos
    if (rook) {
      await Promise.all([
        pulseAction(king, 'cheer', 200, 100, 220),
        pulseAction(rook, 'cheer', 200, 100, 220),
      ]);
    }
    await this.finishTurn(king, move, info);
  }

  async playPromotion(move, pawn, toV) {
    const board = this.board;
    const color = pawn.userData.color;
    const P = PALETTES[color];
    sfx.promote();
    this.focus(toV.clone().setY(0.6), 0.32);

    await enterAction(pawn, 'kneel', 420, Ease.outCubic);
    const pillar = board.fx.ring(toV, P.glow, { radius: 1.3, duration: 0.9, opacity: 0.9 });
    await during(520, () => {
      board.fx.embers(toV, 3, P.glow, { radius: 0.3, height: 0.2 });
    });
    board.fx.flash(toV.clone().setY(0.6), 0xffffff, 2.0, 0.4);
    board.fx.addShake(0.35);

    board.removePiece(pawn);
    const promoted = board.addPiece(move.promotion, color, move.to);
    promoted.rotation.y = color === 'w' ? Math.PI : 0;
    promoted.scale.setScalar(0.1);
    await tween(620, (t) => {
      promoted.scale.setScalar(0.1 + 0.9 * t);
      promoted.position.y = (1 - t) * 0.25;
      if (Math.random() < 0.5) board.fx.embers(toV, 2, P.glow, { radius: 0.35, height: 1 });
    }, Ease.outBack);
    promoted.position.y = 0;
    promoted.scale.setScalar(1);
    await pulseAction(promoted, 'cheer', 240, 180, 300);
  }

  async settle(piece) {
    const home = piece.userData.color === 'w' ? Math.PI : 0;
    await faceDir(piece, Math.sin(home), Math.cos(home), false, 220);
    piece.position.y = 0;
  }

  async finishTurn(piece, move, info) {
    this.unfocus();
    if (info.check) {
      const board = this.board;
      const king = board.pieceAt(info.checkSquare);
      if (king) {
        sfx.check();
        flashPiece(king, 0xff4b4b, 420, 1.1);
        board.fx.ring(king.position, 0xff4b4b, { radius: 1.2, duration: 0.7, opacity: 0.8 });
        await pulseAction(king, 'alert', 180, 220, 320);
      }
    }
  }

  /** Escena final: el rey derrotado cae de rodillas. */
  async playMate(loserKingSquare, winnerSquare) {
    const board = this.board;
    const king = board.pieceAt(loserKingSquare);
    const winner = winnerSquare != null ? board.pieceAt(winnerSquare) : null;
    if (king) {
      this.focus(king.position.clone().setY(0.5), 0.4);
      sfx.defeat();
      await enterAction(king, 'kneel', 700, Ease.outCubic);
      board.fx.dust(king.position, 12, 0x8c8270, { speed: 0.9 });
      const sword = king.userData.nodes.weapon;
      if (sword) {
        await tween(400, (t) => { sword.rotation.x = sword.userData.rest.x + t * 1.4; }, Ease.inQuad);
      }
    }
    if (winner) {
      sfx.victory();
      await pulseAction(winner, 'cheer', 300, 900, 400);
    } else {
      await wait(600);
    }
    this.unfocus();
  }
}

export { moveThrough, faceTowards, deathSequence };
