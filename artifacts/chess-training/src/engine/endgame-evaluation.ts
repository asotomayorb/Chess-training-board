import { applyChessMove, getChessGameStatus, getLegalChessMoves, type ChessGameMove, type ChessGameState } from './chess-engine';
import type { EndgameTrainingPrompt } from './endgame-training';

export type EndgameMoveEvaluation = {
  fulfilled: boolean;
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

export function evaluateEndgameMove(
  previous: ChessGameState,
  next: ChessGameState,
  move: ChessGameMove,
  prompt: EndgameTrainingPrompt,
): EndgameMoveEvaluation {
  const candidate = prompt.candidateMoves.some((candidateMove) => moveKey(candidateMove) === moveKey(move));

  if (prompt.type === 'rey-y-peon') {
    const piece = previous.board[move.from.row][move.from.col];
    if (candidate || piece?.type === 'king' || piece?.type === 'pawn') {
      return { fulfilled: true, feedback: 'Bien: estás aplicando el principio de actividad del rey, oposición o avance calculado del peón.' };
    }
    return { fulfilled: false, feedback: 'En este final, prioriza el rey y la oposición antes de avanzar el peón por inercia.' };
  }

  if (prompt.type === 'torres') {
    if (candidate || givesCheck(previous, move) || previous.board[move.from.row][move.from.col]?.type === 'rook') {
      return { fulfilled: true, feedback: 'Bien: estás buscando actividad de torre, jaques útiles o una posición activa.' };
    }
    return { fulfilled: false, feedback: 'Busca una torre activa: jaques, actividad detrás de peones pasados y defensa desde posiciones activas.' };
  }

  if (prompt.type === 'dama-contra-rey' || prompt.type === 'torre-contra-rey') {
    if (givesCheck(previous, move) || candidate || previous.board[move.from.row][move.from.col]?.type === 'king') {
      return { fulfilled: true, feedback: 'Bien: estás trabajando el patrón de mate mediante restricción, acercamiento del rey o jaque útil.' };
    }
    return { fulfilled: false, feedback: 'No olvides el método del mate básico: restringe al rey rival, acerca tu rey y solo entonces busca el mate.' };
  }

  if (isCapture(previous, move)) {
    return { fulfilled: true, feedback: 'Cambio realizado. Comprueba ahora si el final resultante conserva la técnica que buscas.' };
  }

  return { fulfilled: false, feedback: 'Reevalúa el principio técnico del final antes de continuar.' };
}
