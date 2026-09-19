import { applyChessMove, getChessGameStatus, getLegalChessMoves, isInCheck, type ChessGameMove, type ChessGameState, type Piece, type Side } from './chess-engine';

export type EndgameType =
  | 'rey-y-peon'
  | 'oposición'
  | 'torres'
  | 'dama-contra-rey'
  | 'torre-contra-rey'
  | 'mate-básico';

export type EndgameTrainingPrompt = {
  type: EndgameType;
  title: string;
  instruction: string;
  rationale: string;
  candidateMoves: ChessGameMove[];
};

function countPieces(state: ChessGameState, side: Side): Piece[] {
  return state.board.flat().filter((piece): piece is Piece => Boolean(piece && piece.color === side));
}

function materialSignature(state: ChessGameState, side: Side): Record<Piece['type'], number> {
  const pieces = countPieces(state, side);
  return pieces.reduce((counts, piece) => {
    counts[piece.type] += 1;
    return counts;
  }, { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 });
}

function isKingPawnVsKing(state: ChessGameState): boolean {
  const white = materialSignature(state, 'white');
  const black = materialSignature(state, 'black');
  const matches = (a: typeof white, b: typeof black) =>
    a.king === 1 && a.pawn === 1 && a.knight === 0 && a.bishop === 0 && a.rook === 0 && a.queen === 0 &&
    b.king === 1 && b.pawn === 0 && b.knight === 0 && b.bishop === 0 && b.rook === 0 && b.queen === 0;
  return matches(white, black) || matches(black, white);
}

function isRookEndgame(state: ChessGameState): boolean {
  const white = materialSignature(state, 'white');
  const black = materialSignature(state, 'black');
  return white.king === 1 && black.king === 1 &&
    white.rook >= 1 && black.rook >= 1 &&
    white.queen === 0 && black.queen === 0 &&
    white.bishop === 0 && black.bishop === 0 &&
    white.knight === 0 && black.knight === 0;
}

function isQueenMate(state: ChessGameState): boolean {
  const white = materialSignature(state, 'white');
  const black = materialSignature(state, 'black');
  const oneSide = (a: typeof white, b: typeof black) =>
    a.king === 1 && a.queen === 1 && a.rook === 0 && a.bishop === 0 && a.knight === 0 && a.pawn === 0 &&
    b.king === 1 && b.queen === 0 && b.rook === 0 && b.bishop === 0 && b.knight === 0 && b.pawn === 0;
  return oneSide(white, black) || oneSide(black, white);
}

function isRookMate(state: ChessGameState): boolean {
  const white = materialSignature(state, 'white');
  const black = materialSignature(state, 'black');
  const oneSide = (a: typeof white, b: typeof black) =>
    a.king === 1 && a.rook === 1 && a.queen === 0 && a.bishop === 0 && a.knight === 0 && a.pawn === 0 &&
    b.king === 1 && b.queen === 0 && b.rook === 0 && b.bishop === 0 && b.knight === 0 && b.pawn === 0;
  return oneSide(white, black) || oneSide(black, white);
}

function kingSquare(state: ChessGameState, side: Side) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (state.board[row][col]?.type === 'king' && state.board[row][col]?.color === side) return { row, col };
    }
  }
  return null;
}

function kingDistance(state: ChessGameState, side: Side): number {
  const square = kingSquare(state, side);
  if (!square) return 99;
  const enemy = kingSquare(state, side === 'white' ? 'black' : 'white');
  if (!enemy) return 99;
  return Math.max(Math.abs(square.row - enemy.row), Math.abs(square.col - enemy.col));
}

function centralKingMoves(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  return moves.filter((move) => {
    const piece = state.board[move.from.row][move.from.col];
    return piece?.type === 'king' && Math.max(Math.abs(move.to.row - 3.5), Math.abs(move.to.col - 3.5)) < Math.max(Math.abs(move.from.row - 3.5), Math.abs(move.from.col - 3.5));
  });
}

function checkingMoves(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  return moves.filter((move) => {
    const next = applyChessMove(state, move);
    const status = getChessGameStatus(next);
    return status === 'check' || status === 'checkmate' || isInCheck(next.board, state.turn === 'white' ? 'black' : 'white');
  });
}

export function detectEndgameType(state: ChessGameState): EndgameType | null {
  if (isKingPawnVsKing(state)) return 'rey-y-peon';
  if (isQueenMate(state)) return 'dama-contra-rey';
  if (isRookMate(state)) return 'torre-contra-rey';
  if (isRookEndgame(state)) return 'torres';
  return null;
}

export function chooseEndgameTrainingPrompt(state: ChessGameState): EndgameTrainingPrompt | null {
  const type = detectEndgameType(state);
  if (!type) return null;
  const moves = getLegalChessMoves(state);
  if (!moves.length) return null;

  if (type === 'rey-y-peon') {
    const kingMoves = centralKingMoves(state, moves);
    const pawnMoves = moves.filter((move) => state.board[move.from.row][move.from.col]?.type === 'pawn');
    const candidates = [...kingMoves, ...pawnMoves];
    return {
      type,
      title: 'Rey activo y oposición',
      instruction: 'Acerca tu rey al peón o busca la oposición antes de avanzar automáticamente el peón.',
      rationale: 'En finales de rey y peón, la actividad del rey y la oposición suelen decidir si el peón puede coronar.',
      candidateMoves: candidates.length ? candidates.slice(0, 8) : moves.slice(0, 8),
    };
  }

  if (type === 'torres') {
    const checks = checkingMoves(state, moves);
    const rookMoves = moves.filter((move) => state.board[move.from.row][move.from.col]?.type === 'rook');
    return {
      type,
      title: 'Torre activa',
      instruction: 'Busca jaques, actividad detrás del peón pasado o una posición activa de la torre.',
      rationale: 'En finales de torres, la actividad suele ser más importante que mantener la torre pasiva.',
      candidateMoves: [...checks, ...rookMoves].slice(0, 8),
    };
  }

  const checks = checkingMoves(state, moves);
  return {
    type,
    title: type === 'dama-contra-rey' ? 'Mate con dama y rey' : 'Mate con torre y rey',
    instruction: 'Reduce el espacio del rey rival y acerca tu rey antes del mate final. Busca jaques cuando sean útiles y seguros.',
    rationale: 'Los mates básicos se entrenan como un proceso: restringir, acercar el rey y ejecutar el patrón de mate.',
    candidateMoves: checks.length ? checks.slice(0, 8) : moves.slice(0, 8),
  };
}
