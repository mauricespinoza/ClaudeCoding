// main.js — orquesta motor, escena, combate e interfaz.

import * as THREE from 'three';
import * as E from './engine.js';
import { Board3D, squareToWorld } from './board3d.js';
import { Combat } from './combat.js';
import { UI } from './ui.js';
import { updateTweens, setSpeedScale, wait, clearTweens } from './util.js';
import { initAudio, resumeAudio, setEnabled as setAudioEnabled, sfx } from './audio.js';
import { PIECE_NAMES } from './models.js';

const SETTINGS_KEY = 'ajedrez3d.settings';

const defaults = {
  level: 3,
  mode: 'ai',        // 'ai' | 'local' | 'demo'
  humanColor: 'w',
  speed: 1,
  sound: true,
  quality: guessQuality(),
};

function guessQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  if (mem <= 3 || cores <= 3) return 'low';
  if (small || mem <= 6) return 'medium';
  return 'high';
}

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch { return { ...defaults }; }
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* modo privado */ }
}

const settings = loadSettings();
setSpeedScale(settings.speed);
setAudioEnabled(settings.sound);

const canvas = document.getElementById('scene');
const board = new Board3D(canvas, { quality: settings.quality });
const combat = new Combat(board);
const ui = new UI();

if (settings.quality === 'high') board.enableBloom();

const game = {
  state: E.newGame(),
  san: [],
  busy: false,
  over: false,
  selected: -1,
  legal: [],
  lastMove: null,
};

// ------------------------------------------------------------------ worker

let worker = null;
let workerSeq = 0;
const pending = new Map();

function startWorker() {
  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, move, error } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error) entry.reject(new Error(error));
      else entry.resolve(move);
    };
    worker.onerror = () => { worker = null; };
  } catch {
    worker = null;
  }
}
startWorker();

let inlineAI = null;
async function askEngine(level) {
  const fen = E.toFEN(game.state);
  if (worker) {
    const id = ++workerSeq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, fen, level });
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('timeout')); }
      }, 20000);
    });
  }
  if (!inlineAI) inlineAI = await import('./ai.js');
  await wait(30);
  const m = inlineAI.chooseMove(game.state, level);
  return m ? { from: m.from, to: m.to, promotion: m.promotion } : null;
}

// -------------------------------------------------------------- flujo base

function sideToMoveIsHuman() {
  if (game.over) return false;
  if (settings.mode === 'local') return true;
  if (settings.mode === 'demo') return false;
  return game.state.turn === settings.humanColor;
}

function refreshUI(extra = '') {
  const st = game.state;
  ui.setTurn(st.turn, game.busy && !sideToMoveIsHuman());
  ui.renderMoves(game.san);
  ui.renderCaptured(st.board);
  const check = E.inCheck(st);
  board.showCheck(check ? E.kingSquare(st.board, st.turn) : -1);
  if (!game.over) {
    const who = st.turn === 'w' ? 'Blancas' : 'Negras';
    const mine = sideToMoveIsHuman();
    ui.setStatus(
      check ? `¡${who} en jaque!` : `Turno de ${who}`,
      extra || (mine ? 'Toca una pieza para ver sus movimientos.'
        : settings.mode === 'demo' ? 'Partida entre dos generales.' : 'El enemigo planea su jugada…'),
    );
  }
}

function clearSelection() {
  game.selected = -1;
  game.legal = [];
  board.clearMoves();
}

function selectSquare(idx) {
  const piece = game.state.board[idx];
  if (!piece || E.colorOf(piece) !== game.state.turn) return false;
  if (settings.mode === 'ai' && E.colorOf(piece) !== settings.humanColor) return false;
  const moves = E.movesFrom(game.state, idx);
  if (!moves.length) { sfx.deny(); return false; }
  game.selected = idx;
  game.legal = moves;
  board.showSelection(idx);
  board.showMoves(moves);
  sfx.select();
  return true;
}

async function handleTap(idx) {
  resumeAudio();
  if (game.busy || game.over) return;
  if (!sideToMoveIsHuman()) return;

  if (game.selected >= 0) {
    const candidates = game.legal.filter((m) => m.to === idx);
    if (candidates.length) {
      let move = candidates[0];
      if (candidates.length > 1 && candidates[0].promotion) {
        const choice = await ui.showPromotion(game.state.turn);
        move = candidates.find((m) => m.promotion === choice) || move;
      }
      clearSelection();
      await playMove(move);
      return;
    }
    if (idx === game.selected) { clearSelection(); return; }
  }
  clearSelection();
  selectSquare(idx);
}

board.onSquareTap(handleTap);

async function playMove(move) {
  game.busy = true;
  board.enabled = false;
  clearSelection();

  const san = E.toSAN(game.state, move);
  E.makeMove(game.state, move);
  game.san.push(san);
  game.lastMove = move;

  const check = E.inCheck(game.state);
  const info = { check, checkSquare: check ? E.kingSquare(game.state.board, game.state.turn) : -1 };

  ui.renderMoves(game.san);
  await combat.play(move, info);

  board.showLastMove(move.from, move.to);
  const status = E.gameStatus(game.state);
  refreshUI();

  if (status.over) {
    await endGame(status, move);
  } else {
    game.busy = false;
    board.enabled = true;
    if (!sideToMoveIsHuman()) scheduleEngineMove();
  }
}

async function endGame(status, lastMove) {
  game.over = true;
  game.busy = false;
  board.enabled = true;
  board.clearMoves();

  if (status.reason === 'jaque mate') {
    const loser = game.state.turn;
    await combat.playMate(E.kingSquare(game.state.board, loser), lastMove ? lastMove.to : null);
  } else {
    await wait(400);
  }

  let title, sub;
  if (status.result === 'draw') {
    title = 'Tablas';
    sub = `La batalla termina en ${status.reason}.`;
  } else {
    const winner = status.result === 'w' ? 'las Blancas' : 'las Negras';
    title = status.result === 'w' ? 'Victoria del Alba' : 'Victoria de la Obsidiana';
    if (settings.mode === 'ai') {
      title = status.result === settings.humanColor ? '¡Victoria!' : 'Derrota';
    }
    sub = `Ganan ${winner} por ${status.reason}.`;
  }
  ui.setStatus(title, sub);
  ui.showGameOver(title, sub);
}

let engineTimer = null;
function scheduleEngineMove() {
  clearTimeout(engineTimer);
  engineTimer = setTimeout(runEngineMove, 220);
}

async function runEngineMove() {
  if (game.over || sideToMoveIsHuman()) return;
  game.busy = true;
  board.enabled = false;
  ui.setTurn(game.state.turn, true);
  ui.setStatus(game.state.turn === 'w' ? 'Las Blancas planean' : 'Las Negras planean', 'Calculando la ofensiva…');
  try {
    const level = settings.mode === 'demo' ? Math.min(3, settings.level) : settings.level;
    const [raw] = await Promise.all([askEngine(level), wait(260)]);
    if (!raw) { game.busy = false; return; }
    const move = E.findMove(game.state, raw.from, raw.to, raw.promotion);
    if (!move) { game.busy = false; board.enabled = true; return; }
    await playMove(move);
  } catch (err) {
    console.error(err);
    ui.toast('El motor no respondió; inténtalo de nuevo.');
    game.busy = false;
    board.enabled = true;
  }
}

// ------------------------------------------------------------------ mandos

function newGame() {
  clearTweens();
  clearTimeout(engineTimer);
  pending.clear();
  game.state = E.newGame();
  game.san = [];
  game.over = false;
  game.busy = false;
  game.lastMove = null;
  clearSelection();
  board.enabled = true;
  board.setPosition(game.state.board);
  board.showLastMove(null);
  board.showCheck(-1);
  ui.hideGameOver();
  const orient = settings.mode === 'ai' ? settings.humanColor : 'w';
  board.setOrientation(orient, false);
  refreshUI('Que comience la batalla.');
  if (!sideToMoveIsHuman()) scheduleEngineMove();
}

function undo() {
  if (game.busy) { ui.toast('Espera a que termine el combate.'); return; }
  if (!game.state.undoStack.length) return;
  clearTweens();
  const plies = settings.mode === 'local' ? 1 : 2;
  for (let i = 0; i < plies && game.state.undoStack.length; i++) {
    E.undoMove(game.state);
    game.san.pop();
  }
  game.over = false;
  ui.hideGameOver();
  clearSelection();
  board.setPosition(game.state.board);
  board.showLastMove(null);
  refreshUI('Jugada deshecha.');
  if (!sideToMoveIsHuman()) scheduleEngineMove();
}

async function hint() {
  if (game.busy || game.over) return;
  ui.toast('Consultando al oráculo…');
  try {
    const raw = await askEngine(3);
    if (!raw) return;
    const move = E.findMove(game.state, raw.from, raw.to, raw.promotion);
    if (!move) return;
    board.showSelection(move.from);
    board.showMoves([move]);
    const piece = game.state.board[move.from];
    ui.toast(`${PIECE_NAMES[E.typeOf(piece)]} de ${E.squareName(move.from)} a ${E.squareName(move.to)}`);
    setTimeout(() => { if (game.selected < 0) board.clearMoves(); }, 2600);
  } catch { ui.toast('El oráculo guarda silencio.'); }
}

const bind = (id, ev, fn) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(ev, fn);
};

bind('btn-new', 'click', () => { resumeAudio(); newGame(); });
bind('btn-undo', 'click', undo);
bind('btn-hint', 'click', hint);
bind('btn-flip', 'click', () => board.flip());
bind('btn-view', 'click', () => {
  const top = board.sphGoal.phi < 0.35;
  board.sphGoal.phi = top ? board.fitPhi() : 0.2;
  board.sphGoal.r = board.fitRadius() * (top ? 1 : 0.94);
  board.userZoomed = false;
  board.userRotated = !top;
});
bind('btn-restart', 'click', () => { ui.hideGameOver(); newGame(); });
bind('btn-close-overlay', 'click', () => ui.hideGameOver());

const levelSel = document.getElementById('sel-level');
const modeSel = document.getElementById('sel-mode');
const colorSel = document.getElementById('sel-color');
const speedSel = document.getElementById('sel-speed');
const qualitySel = document.getElementById('sel-quality');
const soundBtn = document.getElementById('btn-sound');

function syncControls() {
  if (levelSel) levelSel.value = String(settings.level);
  if (modeSel) modeSel.value = settings.mode;
  if (colorSel) colorSel.value = settings.humanColor;
  if (speedSel) speedSel.value = String(settings.speed);
  if (qualitySel) qualitySel.value = settings.quality;
  if (soundBtn) {
    soundBtn.classList.toggle('off', !settings.sound);
    soundBtn.textContent = settings.sound ? '🔊' : '🔇';
    soundBtn.title = settings.sound ? 'Silenciar' : 'Activar sonido';
  }
  document.body.classList.toggle('mode-local', settings.mode === 'local');
}

levelSel?.addEventListener('change', () => {
  settings.level = Number(levelSel.value);
  saveSettings(settings);
  ui.toast(`Nivel: ${levelSel.options[levelSel.selectedIndex].text}`);
});
modeSel?.addEventListener('change', () => {
  settings.mode = modeSel.value;
  saveSettings(settings);
  syncControls();
  newGame();
});
colorSel?.addEventListener('change', () => {
  settings.humanColor = colorSel.value;
  saveSettings(settings);
  newGame();
});
speedSel?.addEventListener('change', () => {
  settings.speed = Number(speedSel.value);
  setSpeedScale(settings.speed);
  saveSettings(settings);
});
qualitySel?.addEventListener('change', () => {
  settings.quality = qualitySel.value;
  saveSettings(settings);
  ui.toast('Calidad guardada: recargando…');
  setTimeout(() => location.reload(), 700);
});
soundBtn?.addEventListener('click', () => {
  settings.sound = !settings.sound;
  setAudioEnabled(settings.sound);
  saveSettings(settings);
  syncControls();
  if (settings.sound) { resumeAudio(); sfx.select(); }
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === 'f') board.flip();
  else if (e.key === 'u') undo();
  else if (e.key === 'h') hint();
  else if (e.key === 'n') newGame();
  else if (e.key === 'Escape') clearSelection();
});

document.addEventListener('pointerdown', () => { initAudio(); resumeAudio(); }, { once: true });

// ------------------------------------------------------------ bucle y arranque

let last = performance.now();
let time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  updateTweens(dt);
  board.update(dt, time);
  requestAnimationFrame(frame);
}

syncControls();
newGame();
requestAnimationFrame(frame);

document.getElementById('loading')?.classList.add('done');

// utilidades de depuración
window.__chess = { game, board, combat, E, THREE, ui, playMove, settings };
