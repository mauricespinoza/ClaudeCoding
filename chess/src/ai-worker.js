// ai-worker.js — la búsqueda corre fuera del hilo principal para no frenar la animación.
import { fromFEN, findMove } from './engine.js';
import { chooseMove } from './ai.js';

self.onmessage = (e) => {
  const { id, fen, level } = e.data;
  try {
    const state = fromFEN(fen);
    const move = chooseMove(state, level);
    self.postMessage({
      id,
      move: move ? { from: move.from, to: move.to, promotion: move.promotion } : null,
    });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
