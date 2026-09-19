import { applyChessMove, getChessGameStatus, getLegalChessMoves, isInCheck, type ChessGameMove, type ChessGameState, type PieceType, type Side } from './chess-engine';
import type { MiddlegameTrainingPrompt } from './middlegame-training';

export type MiddlegameMoveEvaluation = {
  fulfilled: boolean;
  feedback: string;
  objective: MiddlegameTrainingPrompt['objective'];
};

const centerSquares = new Set(['c3','c4','c5','c6','d3','d4','d5','d6','e3','e4','e5','e6','f3','f4','f5','f6']);
const files = ['a','b','c','d','e','f','g','h'];

function squareName(square: { row: number; col: number }): string {
  return `${files[square.col]}${8 - square.row}`;
}

function opposite(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

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

function movedPiece(state: ChessGameState, move: ChessGameMove) {
  return state.board[move.from.row][move.from.col];
}

function mobilityOfMovedPiece(state: ChessGameState, move: ChessGameMove): number {
  const piece = state.board[move.to.row][move.to.col];
  if (!piece) return 0;
  const ownTurnState = { ...state, turn: piece.color };
  return getLegalChessMoves(ownTurnState, move.to).length;
}

function opponentCheckingMoves(state: ChessGameState): ChessGameMove[] {
  const side = opposite(state.turn);
  const sideState = { ...state, turn: side };
  return getLegalChessMoves(sideState).filter((move) => givesCheck(sideState, move));
}

export function evaluateMiddlegameMove(
  previous: ChessGameState,
  next: ChessGameState,
  move: ChessGameMove,
  prompt: MiddlegameTrainingPrompt,
): MiddlegameMoveEvaluation {
  const objective = prompt.objective;
  const piece = movedPiece(previous, move);
  const destination = squareName(move.to);
  const candidate = prompt.candidateMoves.some((candidateMove) => moveKey(candidateMove) === moveKey(move));
  const capture = isCapture(previous, move);
  const check = givesCheck(previous, move);

  if (objective === 'seguridad del rey') {
    const kingSafe = !isInCheck(next.board, previous.turn);
    const opponentChecks = opponentCheckingMoves(next);
    const castle = move.special?.startsWith('castle') === true;
    if (kingSafe && (castle || candidate || opponentChecks.length < opponentCheckingMoves(previous).length)) {
      return { objective, fulfilled: true, feedback: castle ? 'Bien: priorizaste la seguridad del rey con el enroque.' : 'Bien: la jugada mantiene al rey seguro y responde al objetivo de la posición.' };
    }
    return { objective, fulfilled: false, feedback: 'La jugada es legal, pero el objetivo era mejorar o preservar la seguridad del rey. Comprueba primero las amenazas directas contra tu rey.' };
  }

  if (objective === 'control del centro') {
    if (centerSquares.has(destination) || candidate) {
      return { objective, fulfilled: true, feedback: 'Bien: la jugada aumenta tu presencia o influencia en el centro.' };
    }
    return { objective, fulfilled: false, feedback: 'La jugada no desarrolla claramente el objetivo central. Pregunta qué casillas centrales controlas después de mover.' };
  }

  if (objective === 'táctica') {
    if (check || capture || candidate) {
      return { objective, fulfilled: true, feedback: check ? 'Bien: encontraste una jugada forzada mediante jaque.' : capture ? 'Bien: identificaste una oportunidad táctica de captura.' : 'Bien: la jugada pertenece al conjunto de candidatos tácticos de esta posición.' };
    }
    return { objective, fulfilled: false, feedback: 'No aparece una consecuencia táctica inmediata. Antes de jugar una idea posicional, busca jaques, capturas y amenazas.' };
  }

  if (objective === 'actividad de piezas') {
    const pieceTypes: PieceType[] = ['knight','bishop','rook','queen'];
    if (piece && pieceTypes.includes(piece.type)) {
      const beforeMobility = getLegalChessMoves(previous, move.from).length;
      const afterMobility = mobilityOfMovedPiece(next, move);
      if (candidate || afterMobility >= beforeMobility) {
        return { objective, fulfilled: true, feedback: 'Bien: mejoraste la actividad de una pieza y su capacidad de participar en la posición.' };
      }
    }
    return { objective, fulfilled: false, feedback: 'La jugada no mejora claramente la actividad de una pieza. Busca una pieza con pocas opciones y una casilla más útil para ella.' };
  }

  if (objective === 'ruptura de peones') {
    if (piece?.type === 'pawn' && (move.from.col !== move.to.col || candidate)) {
      return { objective, fulfilled: true, feedback: 'Bien: realizaste una ruptura o avance de peón que puede modificar la estructura y abrir líneas.' };
    }
    return { objective, fulfilled: false, feedback: 'El objetivo era buscar una ruptura de peones. Evalúa qué avance puede abrir una columna, diagonal o cambiar la estructura.' };
  }

  if (objective === 'simplificación') {
    if (capture) {
      return { objective, fulfilled: true, feedback: 'Bien: realizaste un cambio. Ahora evalúa qué final resulta y qué piezas quedan activas.' };
    }
    return { objective, fulfilled: false, feedback: 'La jugada no simplifica. Si buscas cambiar piezas, calcula qué estructura y qué final quedarán después del intercambio.' };
  }

  return { objective, fulfilled: false, feedback: 'Reevalúa la posición: identifica primero la prioridad estratégica antes de continuar.' };
}
