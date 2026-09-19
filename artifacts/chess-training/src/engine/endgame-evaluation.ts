import { applyChessMove, getChessGameStatus, getLegalChessMoves, type ChessGameMove, type ChessGameState, type Piece, type Side } from './chess-engine';
import type { EndgameTrainingPrompt } from './endgame-training';

export type EndgameTechnique =
  | 'oposición'
  | 'regla-del-cuadrado'
  | 'peón-pasado'
  | 'actividad-del-rey'
  | 'torre-activa'
  | 'mate-con-dama'
  | 'mate-con-torre';

export type EndgameMoveEvaluation = {
  fulfilled: boolean;
  technique: EndgameTechnique;
  feedback: string;
};

function moveKey(move: ChessGameMove): string {
  return [move.from.row, move.from.col, move.to.row, move.to.col, move.promotion ?? '', move.special ?? ''].join(':');
}

function isCapture(state: ChessGameState, move: ChessGameMove): boolean {
  return Boolean(state.board[move.to.row][move.to.col]) || move.special === 'en-passant';
}

function givesCheck(state: ChessGameState, move: ChessGameMove): boolean {
  const next = applyChessMove(state, move);
  const status = getChessGameStatus(next);
  return status === 'check' || status === 'checkmate';
}

function kingSquare(state: ChessGameState, side: Side) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (piece?.type === 'king' && piece.color === side) return { row, col };
    }
  }
  return null;
}

function pawnSquare(state: ChessGameState, side: Side) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (piece?.type === 'pawn' && piece.color === side) return { row, col };
    }
  }
  return null;
}

function kingDistance(a: { row: number; col: number } | null, b: { row: number; col: number } | null): number {
  if (!a || !b) return 99;
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function isOpposition(previous: ChessGameState, next: ChessGameState, side: Side): boolean {
  const own = kingSquare(next, side);
  const enemy = kingSquare(next, side === 'white' ? 'black' : 'white');
  if (!own || !enemy) return false;
  return own.row === enemy.row || own.col === enemy.col
    ? kingDistance(own, enemy) === 2
    : false;
}

function movedPiece(previous: ChessGameState, move: ChessGameMove): Piece | null {
  return previous.board[move.from.row][move.from.col];
}

export function evaluateEndgameMove(
  previous: ChessGameState,
  next: ChessGameState,
  move: ChessGameMove,
  prompt: EndgameTrainingPrompt,
): EndgameMoveEvaluation {
  const candidate = prompt.candidateMoves.some((candidateMove) => moveKey(candidateMove) === moveKey(move));
  const piece = movedPiece(previous, move);
  const side = previous.turn;

  if (prompt.type === 'rey-y-peon') {
    const ownKingBefore = kingSquare(previous, side);
    const ownKingAfter = kingSquare(next, side);
    const enemyKing = kingSquare(next, side === 'white' ? 'black' : 'white');
    const ownPawn = pawnSquare(next, side);
    const movedKing = piece?.type === 'king';
    const kingImproved = movedKing && kingDistance(ownKingAfter, ownPawn) < kingDistance(ownKingBefore, ownPawn);
    const opposition = isOpposition(previous, next, side);
    if (candidate || opposition || kingImproved) {
      return { fulfilled: true, technique: opposition ? 'oposición' : 'actividad-del-rey', feedback: opposition
        ? 'Bien: has creado una posición de oposición. Ahora calcula quién debe ceder la casilla clave.'
        : 'Bien: estás utilizando el rey activamente. En este final, el rey suele ser la pieza decisiva.' };
    }
    if (ownPawn && enemyKing && piece?.type === 'pawn') {
      return { fulfilled: false, technique: 'regla-del-cuadrado', feedback: 'Antes de avanzar el peón, comprueba la regla del cuadrado y si el rey rival puede alcanzarlo.' };
    }
    return { fulfilled: false, technique: 'oposición', feedback: 'Busca la oposición o una mejora concreta del rey antes de empujar el peón automáticamente.' };
  }

  if (prompt.type === 'torres') {
    const rook = piece?.type === 'rook';
    if (candidate || rook || givesCheck(previous, move)) {
      return { fulfilled: true, technique: 'torre-activa', feedback: 'Bien: estás buscando actividad de torre, jaques útiles o una posición activa.' };
    }
    return { fulfilled: false, technique: 'torre-activa', feedback: 'Busca una torre activa: jaques, ataque lateral y actividad detrás de peones pasados.' };
  }

  if (prompt.type === 'dama-contra-rey') {
    if (givesCheck(previous, move) || candidate || piece?.type === 'king') {
      return { fulfilled: true, technique: 'mate-con-dama', feedback: 'Bien: aplicas el método de restringir al rey, acercar tu rey y ejecutar el mate.' };
    }
    return { fulfilled: false, technique: 'mate-con-dama', feedback: 'No persigas al rey con jaques sin plan: primero reduce su espacio y acerca tu rey.' };
  }

  if (prompt.type === 'torre-contra-rey') {
    if (givesCheck(previous, move) || candidate || piece?.type === 'king') {
      return { fulfilled: true, technique: 'mate-con-torre', feedback: 'Bien: estás trabajando la técnica de restricción, rey de apoyo y mate con torre.' };
    }
    return { fulfilled: false, technique: 'mate-con-torre', feedback: 'Con torre contra rey, restringe al rey y acerca tu propio rey antes del mate final.' };
  }

  if (isCapture(previous, move)) {
    return { fulfilled: true, technique: 'actividad-del-rey', feedback: 'Cambio realizado. Comprueba ahora qué final resulta y qué plan técnico exige.' };
  }

  return { fulfilled: false, technique: 'actividad-del-rey', feedback: 'Reevalúa el principio técnico del final antes de continuar.' };
}
