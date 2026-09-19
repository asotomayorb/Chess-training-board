import { applyChessMove, getChessGameStatus, getLegalChessMoves, type ChessGameMove, type ChessGameState, type Side } from './chess-engine';

export type CompleteMoveEvaluation = {
  feedback: string;
  immediateCapture: boolean;
  newChecks: number;
  newCaptures: number;
};

function oppositeSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

function movesForSide(state: ChessGameState, side: Side): ChessGameMove[] {
  return getLegalChessMoves({ ...state, turn: side });
}

function moveKey(move: ChessGameMove): string {
  return [
    move.from.row,
    move.from.col,
    move.to.row,
    move.to.col,
    move.promotion ?? '',
    move.special ?? '',
  ].join(':');
}

function checkingMoves(state: ChessGameState, side: Side): Set<string> {
  const result = new Set<string>();
  const sideState = { ...state, turn: side };
  for (const move of movesForSide(state, side)) {
    const next = applyChessMove(sideState, move);
    const status = getChessGameStatus(next);
    if (status === 'check' || status === 'checkmate') {
      result.add(moveKey(move));
    }
  }
  return result;
}

function captureMoves(state: ChessGameState, side: Side): Set<string> {
  const result = new Set<string>();
  const sideState = { ...state, turn: side };
  for (const move of movesForSide(state, side)) {
    const target = sideState.board[move.to.row][move.to.col];
    if (target || move.special === 'en-passant') result.add(moveKey(move));
  }
  return result;
}

export function evaluateCompleteMove(
  previous: ChessGameState,
  next: ChessGameState,
  move: ChessGameMove,
): CompleteMoveEvaluation {
  const status = getChessGameStatus(next);
  if (status === 'checkmate') {
    return {
      feedback: 'Excelente: la jugada produjo jaque mate.',
      immediateCapture: false,
      newChecks: 0,
      newCaptures: 0,
    };
  }
  if (status === 'check') {
    return {
      feedback: 'Jaque. Ahora el rival debe responder a una amenaza forzada.',
      immediateCapture: false,
      newChecks: 0,
      newCaptures: 0,
    };
  }

  const playerSide = previous.turn;
  const opponentSide = oppositeSide(playerSide);
  const opponentMoves = movesForSide(next, opponentSide);
  const movedPiece = next.board[move.to.row][move.to.col];
  const immediateCapture = Boolean(
    movedPiece &&
    opponentMoves.some((reply) => reply.to.row === move.to.row && reply.to.col === move.to.col),
  );

  const beforeChecks = checkingMoves(previous, opponentSide);
  const afterChecks = checkingMoves(next, opponentSide);
  const beforeCaptures = captureMoves(previous, opponentSide);
  const afterCaptures = captureMoves(next, opponentSide);

  const newChecks = [...afterChecks].filter((key) => !beforeChecks.has(key)).length;
  const newCaptures = [...afterCaptures].filter((key) => !beforeCaptures.has(key)).length;

  if (immediateCapture) {
    return {
      feedback: 'Atención: tu pieza movida queda capturable de inmediato. Calcula si existe una compensación concreta antes de continuar.',
      immediateCapture,
      newChecks,
      newCaptures,
    };
  }
  if (newChecks > 0 || newCaptures > 0) {
    return {
      feedback: 'La posición cambió: el rival ganó nuevas opciones forzadas. Antes de seguir tu plan, comprueba jaques, capturas y amenazas.',
      immediateCapture,
      newChecks,
      newCaptures,
    };
  }
  return {
    feedback: 'Jugada registrada. Mantén la rutina: comprueba jaques, capturas y amenazas antes de tu próxima decisión.',
    immediateCapture,
    newChecks,
    newCaptures,
  };
}
