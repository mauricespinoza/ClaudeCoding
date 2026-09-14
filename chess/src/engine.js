// engine.js — reglas completas de ajedrez (sin dependencias).
//
// Representación: tablero de 64 casillas, idx = rank * 8 + file.
//   rank 0 = fila 1 (bandas blancas), rank 7 = fila 8.  file 0 = columna 'a'.
// Piezas: mayúsculas = blancas ('P','N','B','R','Q','K'), minúsculas = negras.

export const W = 'w';
export const B = 'b';

export const FILES = 'abcdefgh';

export const other = (c) => (c === W ? B : W);
export const colorOf = (p) => (p ? (p === p.toUpperCase() ? W : B) : null);
export const typeOf = (p) => (p ? p.toLowerCase() : null);
export const fileOf = (i) => i & 7;
export const rankOf = (i) => i >> 3;
export const sq = (file, rank) => rank * 8 + file;
export const squareName = (i) => FILES[fileOf(i)] + (rankOf(i) + 1);
export const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

const KNIGHT_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const DIAG_D = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const ORTHO_D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KING_D = [...DIAG_D, ...ORTHO_D];

export function initialBoard() {
  const b = new Array(64).fill(null);
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    b[sq(f, 0)] = back[f].toUpperCase();
    b[sq(f, 1)] = 'P';
    b[sq(f, 6)] = 'p';
    b[sq(f, 7)] = back[f];
  }
  return b;
}

export function newGame() {
  const state = {
    board: initialBoard(),
    turn: W,
    castling: { K: true, Q: true, k: true, q: true },
    ep: null,          // casilla de captura al paso disponible
    halfmove: 0,       // regla de 50 jugadas
    fullmove: 1,
    undoStack: [],
    repetition: new Map(),
  };
  countPosition(state, 1);
  return state;
}

export function cloneState(s) {
  return {
    board: s.board.slice(),
    turn: s.turn,
    castling: { ...s.castling },
    ep: s.ep,
    halfmove: s.halfmove,
    fullmove: s.fullmove,
    undoStack: [],
    repetition: new Map(s.repetition),
  };
}

export function positionKey(s) {
  return s.board.map((p) => p || '-').join('') + s.turn +
    (s.castling.K ? 'K' : '') + (s.castling.Q ? 'Q' : '') +
    (s.castling.k ? 'k' : '') + (s.castling.q ? 'q' : '') + (s.ep ?? '-');
}

function countPosition(s, delta) {
  const key = positionKey(s);
  const n = (s.repetition.get(key) || 0) + delta;
  if (n <= 0) s.repetition.delete(key);
  else s.repetition.set(key, n);
  return n;
}

// ---------------------------------------------------------------- ataques

export function isAttacked(board, target, byColor) {
  const tf = fileOf(target), tr = rankOf(target);

  // peones
  const pd = byColor === W ? -1 : 1; // desde dónde vendría el peón atacante
  for (const df of [-1, 1]) {
    const f = tf + df, r = tr + pd;
    if (!onBoard(f, r)) continue;
    const p = board[sq(f, r)];
    if (p && colorOf(p) === byColor && typeOf(p) === 'p') return true;
  }
  // caballos
  for (const [df, dr] of KNIGHT_D) {
    const f = tf + df, r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = board[sq(f, r)];
    if (p && colorOf(p) === byColor && typeOf(p) === 'n') return true;
  }
  // rey
  for (const [df, dr] of KING_D) {
    const f = tf + df, r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = board[sq(f, r)];
    if (p && colorOf(p) === byColor && typeOf(p) === 'k') return true;
  }
  // deslizantes
  const slide = (dirs, types) => {
    for (const [df, dr] of dirs) {
      let f = tf + df, r = tr + dr;
      while (onBoard(f, r)) {
        const p = board[sq(f, r)];
        if (p) {
          if (colorOf(p) === byColor && types.includes(typeOf(p))) return true;
          break;
        }
        f += df; r += dr;
      }
    }
    return false;
  };
  if (slide(DIAG_D, ['b', 'q'])) return true;
  if (slide(ORTHO_D, ['r', 'q'])) return true;
  return false;
}

export function kingSquare(board, color) {
  const k = color === W ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (board[i] === k) return i;
  return -1;
}

export function inCheck(state, color = state.turn) {
  const ks = kingSquare(state.board, color);
  return ks >= 0 && isAttacked(state.board, ks, other(color));
}

// ------------------------------------------------------------ generación

function addPawnMoves(state, from, moves) {
  const { board } = state;
  const color = colorOf(board[from]);
  const dir = color === W ? 1 : -1;
  const startRank = color === W ? 1 : 6;
  const promoRank = color === W ? 7 : 0;
  const f = fileOf(from), r = rankOf(from);

  const push = (to, extra = {}) => {
    if (rankOf(to) === promoRank) {
      for (const promo of ['q', 'r', 'b', 'n']) {
        moves.push(mkMove(state, from, to, { ...extra, promotion: promo }));
      }
    } else {
      moves.push(mkMove(state, from, to, extra));
    }
  };

  const one = sq(f, r + dir);
  if (onBoard(f, r + dir) && !board[one]) {
    push(one);
    const two = sq(f, r + 2 * dir);
    if (r === startRank && !board[two]) moves.push(mkMove(state, from, two, { double: true }));
  }
  for (const df of [-1, 1]) {
    const cf = f + df, cr = r + dir;
    if (!onBoard(cf, cr)) continue;
    const to = sq(cf, cr);
    const victim = board[to];
    if (victim && colorOf(victim) !== color) push(to);
    else if (state.ep === to) moves.push(mkMove(state, from, to, { ep: true }));
  }
}

function mkMove(state, from, to, extra = {}) {
  const board = state.board;
  const piece = board[from];
  const m = {
    from, to, piece,
    captured: null,
    capturedSquare: null,
    promotion: extra.promotion || null,
    castle: extra.castle || null,
    ep: !!extra.ep,
    double: !!extra.double,
  };
  if (m.ep) {
    m.capturedSquare = to + (colorOf(piece) === W ? -8 : 8);
    m.captured = board[m.capturedSquare];
  } else if (board[to]) {
    m.capturedSquare = to;
    m.captured = board[to];
  }
  return m;
}

export function generatePseudoMoves(state, color = state.turn) {
  const { board } = state;
  const moves = [];
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || colorOf(p) !== color) continue;
    const t = typeOf(p);
    const f = fileOf(from), r = rankOf(from);

    if (t === 'p') { addPawnMoves(state, from, moves); continue; }

    if (t === 'n' || t === 'k') {
      const dirs = t === 'n' ? KNIGHT_D : KING_D;
      for (const [df, dr] of dirs) {
        const nf = f + df, nr = r + dr;
        if (!onBoard(nf, nr)) continue;
        const to = sq(nf, nr);
        if (board[to] && colorOf(board[to]) === color) continue;
        moves.push(mkMove(state, from, to));
      }
    } else {
      const dirs = t === 'b' ? DIAG_D : t === 'r' ? ORTHO_D : KING_D;
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (onBoard(nf, nr)) {
          const to = sq(nf, nr);
          const occ = board[to];
          if (occ) {
            if (colorOf(occ) !== color) moves.push(mkMove(state, from, to));
            break;
          }
          moves.push(mkMove(state, from, to));
          nf += df; nr += dr;
        }
      }
    }
  }

  // enroques
  if (!inCheck(state, color)) {
    const rank = color === W ? 0 : 7;
    const rights = color === W ? ['K', 'Q'] : ['k', 'q'];
    const kingFrom = sq(4, rank);
    if (board[kingFrom] && typeOf(board[kingFrom]) === 'k' && colorOf(board[kingFrom]) === color) {
      if (state.castling[rights[0]] &&
        !board[sq(5, rank)] && !board[sq(6, rank)] &&
        typeOf(board[sq(7, rank)]) === 'r' && colorOf(board[sq(7, rank)]) === color &&
        !isAttacked(board, sq(5, rank), other(color)) &&
        !isAttacked(board, sq(6, rank), other(color))) {
        moves.push(mkMove(state, kingFrom, sq(6, rank), { castle: 'K' }));
      }
      if (state.castling[rights[1]] &&
        !board[sq(1, rank)] && !board[sq(2, rank)] && !board[sq(3, rank)] &&
        typeOf(board[sq(0, rank)]) === 'r' && colorOf(board[sq(0, rank)]) === color &&
        !isAttacked(board, sq(3, rank), other(color)) &&
        !isAttacked(board, sq(2, rank), other(color))) {
        moves.push(mkMove(state, kingFrom, sq(2, rank), { castle: 'Q' }));
      }
    }
  }
  return moves;
}

export function generateMoves(state, color = state.turn) {
  const pseudo = generatePseudoMoves(state, color);
  const legal = [];
  for (const m of pseudo) {
    makeMove(state, m, { silent: true });
    if (!inCheck(state, color)) legal.push(m);
    undoMove(state, { silent: true });
  }
  return legal;
}

export function movesFrom(state, from) {
  return generateMoves(state).filter((m) => m.from === from);
}

// -------------------------------------------------------------- make/undo

const ROOK_RIGHT_SQUARES = {
  0: 'Q', 7: 'K', 56: 'q', 63: 'k',
};

export function makeMove(state, move, opts = {}) {
  const b = state.board;
  const undo = {
    move,
    castling: { ...state.castling },
    ep: state.ep,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    captured: move.captured,
    capturedSquare: move.capturedSquare,
  };
  const color = colorOf(move.piece);

  if (move.capturedSquare != null) b[move.capturedSquare] = null;
  b[move.from] = null;
  b[move.to] = move.promotion
    ? (color === W ? move.promotion.toUpperCase() : move.promotion)
    : move.piece;

  // torre del enroque
  if (move.castle) {
    const rank = rankOf(move.to);
    if (move.castle === 'K') {
      b[sq(5, rank)] = b[sq(7, rank)];
      b[sq(7, rank)] = null;
      undo.rookFrom = sq(7, rank); undo.rookTo = sq(5, rank);
    } else {
      b[sq(3, rank)] = b[sq(0, rank)];
      b[sq(0, rank)] = null;
      undo.rookFrom = sq(0, rank); undo.rookTo = sq(3, rank);
    }
  }

  // derechos de enroque
  if (typeOf(move.piece) === 'k') {
    if (color === W) { state.castling.K = false; state.castling.Q = false; }
    else { state.castling.k = false; state.castling.q = false; }
  }
  if (ROOK_RIGHT_SQUARES[move.from]) state.castling[ROOK_RIGHT_SQUARES[move.from]] = false;
  if (move.capturedSquare != null && ROOK_RIGHT_SQUARES[move.capturedSquare]) {
    state.castling[ROOK_RIGHT_SQUARES[move.capturedSquare]] = false;
  }

  state.ep = move.double ? (move.from + move.to) / 2 : null;
  state.halfmove = (typeOf(move.piece) === 'p' || move.captured) ? 0 : state.halfmove + 1;
  if (color === B) state.fullmove++;
  state.turn = other(color);
  state.undoStack.push(undo);
  if (!opts.silent) countPosition(state, 1);
  return state;
}

export function undoMove(state, opts = {}) {
  const undo = state.undoStack.pop();
  if (!undo) return state;
  if (!opts.silent) countPosition(state, -1);
  const b = state.board;
  const m = undo.move;
  b[m.from] = m.piece;
  b[m.to] = null;
  if (undo.rookFrom != null) {
    b[undo.rookFrom] = b[undo.rookTo];
    b[undo.rookTo] = null;
  }
  if (undo.capturedSquare != null) b[undo.capturedSquare] = undo.captured;
  state.castling = undo.castling;
  state.ep = undo.ep;
  state.halfmove = undo.halfmove;
  state.fullmove = undo.fullmove;
  state.turn = colorOf(m.piece);
  return state;
}

// ---------------------------------------------------------------- estado

export function insufficientMaterial(board) {
  const pieces = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const t = typeOf(p);
    if (t === 'k') continue;
    if (t === 'p' || t === 'r' || t === 'q') return false;
    pieces.push({ t, color: colorOf(p), light: (fileOf(i) + rankOf(i)) % 2 === 1 });
  }
  if (pieces.length === 0) return true;                        // R vs R
  if (pieces.length === 1) return true;                        // R+menor vs R
  if (pieces.length === 2) {
    const [a, c] = pieces;
    if (a.t === 'b' && c.t === 'b' && a.light === c.light) return true; // alfiles del mismo color
    if (a.color !== c.color && a.t === 'b' && c.t === 'b') return true;
  }
  return false;
}

export function gameStatus(state) {
  const moves = generateMoves(state);
  const check = inCheck(state);
  if (moves.length === 0) {
    return check
      ? { over: true, result: other(state.turn), reason: 'jaque mate' }
      : { over: true, result: 'draw', reason: 'rey ahogado' };
  }
  if (state.halfmove >= 100) return { over: true, result: 'draw', reason: 'regla de 50 jugadas' };
  if (insufficientMaterial(state.board)) return { over: true, result: 'draw', reason: 'material insuficiente' };
  if ((state.repetition.get(positionKey(state)) || 0) >= 3) {
    return { over: true, result: 'draw', reason: 'triple repetición' };
  }
  return { over: false, check, moves };
}

// -------------------------------------------------------------------- SAN

const PIECE_LETTER = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function toSAN(state, move) {
  if (move.castle) {
    var base = move.castle === 'K' ? 'O-O' : 'O-O-O';
  } else {
    const t = typeOf(move.piece);
    let s = PIECE_LETTER[t];
    if (t === 'p') {
      if (move.captured) s += FILES[fileOf(move.from)];
    } else {
      // desambiguación
      const same = generateMoves(state, colorOf(move.piece)).filter(
        (m) => m.to === move.to && m.piece === move.piece && m.from !== move.from,
      );
      if (same.length) {
        const sameFile = same.some((m) => fileOf(m.from) === fileOf(move.from));
        const sameRank = same.some((m) => rankOf(m.from) === rankOf(move.from));
        if (!sameFile) s += FILES[fileOf(move.from)];
        else if (!sameRank) s += rankOf(move.from) + 1;
        else s += squareName(move.from);
      }
    }
    if (move.captured) s += 'x';
    s += squareName(move.to);
    if (move.promotion) s += '=' + move.promotion.toUpperCase();
    base = s;
  }
  makeMove(state, move, { silent: true });
  const opponentMoves = generateMoves(state);
  const check = inCheck(state);
  undoMove(state, { silent: true });
  if (check) base += opponentMoves.length === 0 ? '#' : '+';
  return base;
}

export function findMove(state, from, to, promotion = null) {
  return generateMoves(state).find(
    (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion),
  ) || null;
}

// -------------------------------------------------------------------- FEN

export function fromFEN(fen) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  const rows = placement.split('/');
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i;
    let file = 0;
    for (const ch of rows[i]) {
      if (/\d/.test(ch)) file += Number(ch);
      else board[sq(file++, rank)] = ch;
    }
  }
  const state = {
    board,
    turn: turn === 'b' ? B : W,
    castling: {
      K: castling.includes('K'), Q: castling.includes('Q'),
      k: castling.includes('k'), q: castling.includes('q'),
    },
    ep: ep && ep !== '-' ? sq(FILES.indexOf(ep[0]), Number(ep[1]) - 1) : null,
    halfmove: Number(half ?? 0),
    fullmove: Number(full ?? 1),
    undoStack: [],
    repetition: new Map(),
  };
  countPosition(state, 1);
  return state;
}

export function toFEN(state) {
  let placement = '';
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = state.board[sq(file, rank)];
      if (!p) empty++;
      else { if (empty) { placement += empty; empty = 0; } placement += p; }
    }
    if (empty) placement += empty;
    if (rank) placement += '/';
  }
  const c = (state.castling.K ? 'K' : '') + (state.castling.Q ? 'Q' : '') +
    (state.castling.k ? 'k' : '') + (state.castling.q ? 'q' : '');
  return [placement, state.turn, c || '-', state.ep != null ? squareName(state.ep) : '-',
    state.halfmove, state.fullmove].join(' ');
}
