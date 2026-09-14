// ui.js — panel lateral, lista de jugadas, capturas y diálogos.

import { PIECE_NAMES } from './models.js';

const GLYPH = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor() {
    this.el = {
      status: $('#status'),
      statusSub: $('#status-sub'),
      turnW: $('#turn-w'),
      turnB: $('#turn-b'),
      moves: $('#move-list'),
      capW: $('#captured-w'),
      capB: $('#captured-b'),
      advW: $('#adv-w'),
      advB: $('#adv-b'),
      overlay: $('#overlay'),
      overlayTitle: $('#overlay-title'),
      overlaySub: $('#overlay-sub'),
      promo: $('#promo'),
      promoChoices: $('#promo-choices'),
      toast: $('#toast'),
      panel: $('#panel'),
      thinking: $('#thinking'),
    };
    this.toastTimer = null;

    $('#panel-toggle').addEventListener('click', () => {
      this.el.panel.classList.toggle('open');
    });
    document.querySelectorAll('[data-close-panel]').forEach((b) =>
      b.addEventListener('click', () => this.el.panel.classList.remove('open')));
  }

  setStatus(main, sub = '') {
    this.el.status.textContent = main;
    this.el.statusSub.textContent = sub;
  }

  setTurn(color, thinking = false) {
    this.el.turnW.classList.toggle('active', color === 'w');
    this.el.turnB.classList.toggle('active', color === 'b');
    this.el.thinking.classList.toggle('on', thinking);
  }

  renderMoves(sanList) {
    const rows = [];
    for (let i = 0; i < sanList.length; i += 2) {
      rows.push(`<li><span class="num">${i / 2 + 1}.</span>
        <span class="san w">${sanList[i] ?? ''}</span>
        <span class="san b">${sanList[i + 1] ?? ''}</span></li>`);
    }
    this.el.moves.innerHTML = rows.join('') || '<li class="empty">La partida aún no comienza.</li>';
    this.el.moves.scrollTop = this.el.moves.scrollHeight;
  }

  renderCaptured(board) {
    const alive = { w: {}, b: {} };
    for (const p of board) {
      if (!p) continue;
      const c = p === p.toUpperCase() ? 'w' : 'b';
      const t = p.toLowerCase();
      alive[c][t] = (alive[c][t] || 0) + 1;
    }
    const full = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const lost = { w: [], b: [] };
    let score = { w: 0, b: 0 };
    for (const c of ['w', 'b']) {
      for (const t of ['q', 'r', 'b', 'n', 'p']) {
        const missing = full[t] - (alive[c][t] || 0);
        for (let i = 0; i < missing; i++) lost[c].push(t);
        score[c] += (alive[c][t] || 0) * VALUE[t];
      }
    }
    // las piezas perdidas por negras las capturaron las blancas
    this.el.capW.innerHTML = lost.b.map((t) => `<span title="${PIECE_NAMES[t]}">${GLYPH.b[t]}</span>`).join('');
    this.el.capB.innerHTML = lost.w.map((t) => `<span title="${PIECE_NAMES[t]}">${GLYPH.w[t]}</span>`).join('');
    const diff = score.w - score.b;
    this.el.advW.textContent = diff > 0 ? `+${diff}` : '';
    this.el.advB.textContent = diff < 0 ? `+${-diff}` : '';
  }

  showPromotion(color) {
    return new Promise((resolve) => {
      this.el.promoChoices.innerHTML = ['q', 'r', 'b', 'n'].map((t) =>
        `<button data-piece="${t}"><span class="glyph">${GLYPH[color][t]}</span><span>${PIECE_NAMES[t]}</span></button>`).join('');
      this.el.promo.classList.add('on');
      const onClick = (e) => {
        const btn = e.target.closest('button[data-piece]');
        if (!btn) return;
        this.el.promo.classList.remove('on');
        this.el.promoChoices.removeEventListener('click', onClick);
        resolve(btn.dataset.piece);
      };
      this.el.promoChoices.addEventListener('click', onClick);
    });
  }

  showGameOver(title, sub) {
    this.el.overlayTitle.textContent = title;
    this.el.overlaySub.textContent = sub;
    this.el.overlay.classList.add('on');
  }

  hideGameOver() { this.el.overlay.classList.remove('on'); }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('on'), 2200);
  }
}

export { GLYPH };
