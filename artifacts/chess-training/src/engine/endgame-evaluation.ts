import { applyChessMove, getChessGameStatus, type ChessGameMove, type ChessGameState, type Piece, type Side } from './chess-engine';
import type { EndgameTrainingPrompt } from './endgame-training';

export type EndgameTechnique =
  | 'oposición'
  | 'regla-del-cuadrado'
  | 'peón-pasado'
  | 'actividad-del-rey'
  | 'torre-activa'
  | 'mate-con-dama'
  | 'mate-con-torre'
  | 'mate-básico';

export type EndgameMoveEvaluation = {
  fulfilled: boolean;
  technique: EndgameTechnique;
  feedback: string;
};

function moveKey(move: ChessGameMove): string {
  return [move.from.row, move.from.col, move.to.row, move.to.col, move.promotion ?? '', move.special ?? ''].join(':');
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

function isOpposition(state: ChessGameState, side: Side): boolean {
  const own = kingSquare(state, side);
  const enemy = kingSquare(state, side === 'white' ? 'black' : 'white');
  if (!own || !enemy) return false;
  return (own.row === enemy.row || own.col === enemy.col) && kingDistance(own, enemy) === 2;
}

function movedPiece(previous: ChessGameState, move: ChessGameMove): Piece | null {
  return previous.board[move.from.row][move.from.col];
}

function isKingMoveImprovingTowardPawn(previous: ChessGameState, next: ChessGameState, move: ChessGameMove): boolean {
  if (movedPiece(previous, move)?.type !== 'king') return false;
  const pawn = pawnSquare(next, previous.turn);
  const before = kingSquare(previous, previous.turn);
  const after = kingSquare(next, previous.turn);
  return Boolean(pawn && before && after && kingDistance(after, pawn) < kingDistance(before, pawn));
}

function isPawnAdvance(previous: ChessGameState, move: ChessGameMove): boolean {
  return movedPiece(previous, move)?.type === 'pawn';
}

function isKingApproachingEnemy(previous: ChessGameState, next: ChessGameState, move: ChessGameMove): boolean {
  if (movedPiece(previous, move)?.type !== 'king') return false;
  const enemy = kingSquare(previous, previous.turn === 'white' ? 'black' : 'white');
  const before = kingSquare(previous, previous.turn);
  const after = kingSquare(next, previous.turn);
  return Boolean(enemy && before && after && kingDistance(after, enemy) < kingDistance(before, enemy));
}

function isRookActivity(previous: ChessGameState, move: ChessGameMove): boolean {
  if (movedPiece(previous, move)?.type !== 'rook') return false;
  if (givesCheck(previous, move)) return true;
  const captured = previous.board[move.to.row][move.to.col];
  if (captured && captured.color !== previous.turn) return true;
  const enemyKing = kingSquare(previous, previous.turn === 'white' ? 'black' : 'white');
  return Boolean(enemyKing && (move.to.row === enemyKing.row || move.to.col === enemyKing.col));
}

export function evaluateEndgameMove(
  previous: ChessGameState,
  next: ChessGameState,
  move: ChessGameMove,
  prompt: EndgameTrainingPrompt,
): EndgameMoveEvaluation {
  const candidate = prompt.candidateMoves.some((candidateMove) => moveKey(candidateMove) === moveKey(move));
  const side = previous.turn;

  if (prompt.type === 'rey-y-peon') {
    const opposition = isOpposition(next, side);
    const kingImproved = isKingMoveImprovingTowardPawn(previous, next, move);

    if (prompt.scenario === 'oposición') {
      if (candidate || opposition) {
        return { fulfilled: true, technique: 'oposición', feedback: 'Bien: mantienes o construyes la oposición. Ahora calcula qué casilla debe ceder el rey rival.' };
      }
      return { fulfilled: false, technique: 'oposición', feedback: 'La prioridad es conservar o recuperar la oposición; no avances el peón por inercia.' };
    }

    if (prompt.scenario === 'regla-del-cuadrado') {
      if (kingImproved || candidate) {
        return { fulfilled: true, technique: 'regla-del-cuadrado', feedback: 'Bien: estás coordinando el rey con el peón. Antes de avanzar, vuelve a comprobar el cuadrado del peón.' };
      }
      if (isPawnAdvance(previous, move)) {
        return { fulfilled: false, technique: 'regla-del-cuadrado', feedback: 'Has avanzado el peón. Comprueba ahora si el rey rival puede entrar en su cuadrado antes de seguir.' };
      }
      return { fulfilled: false, technique: 'regla-del-cuadrado', feedback: 'Busca una mejora concreta del rey y calcula si el peón puede escapar del cuadrado del rey defensor.' };
    }

    if (kingImproved || opposition || candidate) {
      return { fulfilled: true, technique: opposition ? 'oposición' : 'actividad-del-rey', feedback: opposition ? 'Bien: has creado la oposición y estás utilizando el rey como pieza activa.' : 'Bien: estás acercando el rey al peón y preparando su avance con más precisión.' };
    }

    if (isPawnAdvance(previous, move)) {
      return { fulfilled: false, technique: 'peón-pasado', feedback: 'No empujes el peón automáticamente: primero comprueba la actividad de ambos reyes y la posibilidad de coronar.' };
    }

    return { fulfilled: false, technique: 'actividad-del-rey', feedback: 'Busca una mejora concreta del rey antes de gastar un tiempo en el peón.' };
  }

  if (prompt.type === 'torres') {
    if (isRookActivity(previous, move)) {
      return { fulfilled: true, technique: 'torre-activa', feedback: 'Bien: la torre está activa mediante jaque, captura o control directo de la fila o columna del rey rival.' };
    }
    return { fulfilled: false, technique: 'torre-activa', feedback: 'Busca una torre realmente activa: jaque, captura útil, ataque al rey o penetración por una fila o columna.' };
  }

  if (prompt.type === 'mate-básico') {
    if (getChessGameStatus(next) === 'checkmate') {
      return { fulfilled: true, technique: 'mate-básico', feedback: 'Mate conseguido. Has coordinado las piezas y eliminado las casillas de escape.' };
    }
    if (givesCheck(previous, move) || isKingApproachingEnemy(previous, next, move)) {
      return { fulfilled: true, technique: 'mate-básico', feedback: 'Bien: estás restringiendo al rey y acercando el tuyo. Continúa reduciendo sus casillas de escape.' };
    }
    return { fulfilled: false, technique: 'mate-básico', feedback: 'Busca coordinación: restringe las casillas del rey rival y acerca tu rey antes de intentar el mate.' };
  }

  if (prompt.type === 'dama-contra-rey') {
    if (givesCheck(previous, move) || isKingApproachingEnemy(previous, next, move)) {
      return { fulfilled: true, technique: 'mate-con-dama', feedback: 'Bien: estás restringiendo al rey o acercando tu rey para preparar el mate.' };
    }
    return { fulfilled: false, technique: 'mate-con-dama', feedback: 'No des una jugada arbitraria: reduce el espacio del rey o acerca tu rey antes del mate final.' };
  }

  if (prompt.type === 'torre-contra-rey') {
    if (givesCheck(previous, move) || isKingApproachingEnemy(previous, next, move)) {
      return { fulfilled: true, technique: 'mate-con-torre', feedback: 'Bien: estás restringiendo al rey o acercando tu rey para preparar el mate con torre.' };
    }
    return { fulfilled: false, technique: 'mate-con-torre', feedback: 'Con torre contra rey, busca restringir al rey y acercar tu propio rey; no muevas la torre sin propósito.' };
  }

  return { fulfilled: false, technique: 'actividad-del-rey', feedback: 'Reevalúa el principio técnico del final antes de continuar.' };
}
