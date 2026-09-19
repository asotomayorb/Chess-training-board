import { applyChessMove, getChessGameStatus, getLegalChessMoves, isInCheck, type ChessGameMove, type ChessGameState, type Piece, type Side } from './chess-engine';

export type EndgameType =
  | 'rey-y-peon'
  | 'oposición'
  | 'torres'
  | 'dama-contra-rey'
  | 'torre-contra-rey'
  | 'mate-básico';

export type EndgameScenario =
  | 'oposición'
  | 'regla-del-cuadrado'
  | 'peón-pasado'
  | 'actividad-del-rey'
  | 'torre-activa'
  | 'mate-con-dama'
  | 'mate-con-torre';

export type EndgameTrainingPrompt = {
  type: EndgameType;
  scenario: EndgameScenario;
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
  const matches = (a: typeof white, b: typeof white) =>
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
  const oneSide = (a: typeof white, b: typeof white) =>
    a.king === 1 && a.queen === 1 && a.rook === 0 && a.bishop === 0 && a.knight === 0 && a.pawn === 0 &&
    b.king === 1 && b.queen === 0 && b.rook === 0 && b.bishop === 0 && b.knight === 0 && b.pawn === 0;
  return oneSide(white, black) || oneSide(black, white);
}

function isRookMate(state: ChessGameState): boolean {
  const white = materialSignature(state, 'white');
  const black = materialSignature(state, 'black');
  const oneSide = (a: typeof white, b: typeof white) =>
    a.king === 1 && a.rook === 1 && a.queen === 0 && a.bishop === 0 && a.knight === 0 && a.pawn === 0 &&
    b.king === 1 && b.queen === 0 && b.bishop === 0 && b.knight === 0 && b.rook === 0 && b.pawn === 0;
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

function pawnSquare(state: ChessGameState, side: Side) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (state.board[row][col]?.type === 'pawn' && state.board[row][col]?.color === side) return { row, col };
    }
  }
  return null;
}

function kingDistance(a: { row: number; col: number } | null, b: { row: number; col: number } | null): number {
  if (!a || !b) return 99;
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function centralKingMoves(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  return moves.filter((move) => {
    const piece = state.board[move.from.row][move.from.col];
    return piece?.type === 'king' &&
      Math.max(Math.abs(move.to.row - 3.5), Math.abs(move.to.col - 3.5)) <
      Math.max(Math.abs(move.from.row - 3.5), Math.abs(move.from.col - 3.5));
  });
}

function checkingMoves(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  return moves.filter((move) => {
    const next = applyChessMove(state, move);
    const status = getChessGameStatus(next);
    return status === 'check' || status === 'checkmate' ||
      isInCheck(next.board, state.turn === 'white' ? 'black' : 'white');
  });
}

function isOpposition(state: ChessGameState, side: Side): boolean {
  const own = kingSquare(state, side);
  const enemy = kingSquare(state, side === 'white' ? 'black' : 'white');
  if (!own || !enemy) return false;
  return (own.row === enemy.row || own.col === enemy.col) && kingDistance(own, enemy) === 2;
}

function kingMovesTowardPawn(state: ChessGameState, side: Side, moves: ChessGameMove[]): ChessGameMove[] {
  const pawn = pawnSquare(state, side);
  const king = kingSquare(state, side);
  if (!pawn || !king) return [];
  return moves.filter((move) => {
    const piece = state.board[move.from.row][move.from.col];
    if (piece?.type !== 'king') return false;
    return Math.max(Math.abs(move.to.row - pawn.row), Math.abs(move.to.col - pawn.col)) <
      Math.max(Math.abs(move.from.row - pawn.row), Math.abs(move.from.col - pawn.col));
  });
}

function pawnMoves(state: ChessGameState, side: Side, moves: ChessGameMove[]): ChessGameMove[] {
  return moves.filter((move) => state.board[move.from.row][move.from.col]?.type === 'pawn' &&
    state.board[move.from.row][move.from.col]?.color === side);
}

function kingMovesTowardEnemy(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  const enemy = kingSquare(state, state.turn === 'white' ? 'black' : 'white');
  const own = kingSquare(state, state.turn);
  if (!enemy || !own) return [];
  return moves.filter((move) => state.board[move.from.row][move.from.col]?.type === 'king' &&
    kingDistance(move.to, enemy) < kingDistance(own, enemy));
}

function activeRookMoves(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  const enemyKing = kingSquare(state, state.turn === 'white' ? 'black' : 'white');
  return moves.filter((move) => {
    if (state.board[move.from.row][move.from.col]?.type !== 'rook') return false;
    if (enemyKing && (move.to.row === enemyKing.row || move.to.col === enemyKing.col)) return true;
    const target = state.board[move.to.row][move.to.col];
    return Boolean(target && target.color !== state.turn);
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
    const side = state.turn;
    const kingMoves = kingMovesTowardPawn(state, side, moves);
    const pawnMoveList = pawnMoves(state, side, moves);
    const opposition = isOpposition(state, side);

    if (opposition) {
      const reserveMoves = pawnMoveList.filter((move) => !kingMoves.includes(move));
      return {
        type,
        scenario: 'oposición',
        title: 'Oposición y tiempo de reserva',
        instruction: 'Los reyes ya están en oposición. Busca un tiempo de reserva con el peón para devolver la jugada al rival sin ceder la oposición.',
        rationale: 'Cuando la oposición ya está construida, un tempo de peón puede transferir la obligación de mover al rival y conservar la penetración.',
        candidateMoves: reserveMoves.length ? reserveMoves : moves.filter((move) => move.from.row !== move.to.row || move.from.col !== move.to.col).slice(0, 8),
      };
    }

    const candidates = [...kingMoves, ...pawnMoveList];
    return {
      type,
      scenario: kingMoves.length ? 'actividad-del-rey' : 'regla-del-cuadrado',
      title: kingMoves.length ? 'Rey activo y peón pasado' : 'Regla del cuadrado',
      instruction: kingMoves.length
        ? 'Antes de avanzar automáticamente el peón, mejora la posición de tu rey y calcula la coronación.'
        : 'Antes de mover el peón, comprueba la regla del cuadrado y si el rey rival puede alcanzarlo.',
      rationale: kingMoves.length
        ? 'En finales de rey y peón, la actividad del rey suele decidir el resultado.'
        : 'La regla del cuadrado permite saber rápidamente si el rey defensor alcanza al peón.',
      candidateMoves: candidates.length ? candidates.slice(0, 8) : moves.slice(0, 8),
    };
  }

  if (type === 'torres') {
    const checks = checkingMoves(state, moves);
    const rookMoves = activeRookMoves(state, moves);
    return {
      type,
      scenario: 'torre-activa',
      title: 'Torre activa',
      instruction: 'Busca jaques, actividad detrás de un peón pasado, ataque lateral o una invasión activa.',
      rationale: 'En finales de torres, la actividad puede ser más importante que mantener la torre pasiva.',
      candidateMoves: [...checks, ...rookMoves].slice(0, 8),
    };
  }

  const checks = checkingMoves(state, moves);
  const kingMoves = kingMovesTowardEnemy(state, moves);
  const scenario = type === 'dama-contra-rey' ? 'mate-con-dama' : 'mate-con-torre';
  return {
    type,
    scenario,
    title: type === 'dama-contra-rey' ? 'Mate con dama y rey' : 'Mate con torre y rey',
    instruction: 'Reduce el espacio del rey rival, acerca tu rey y ejecuta el patrón de mate. No des jaques sin propósito.',
    rationale: 'Los mates básicos se entrenan como un proceso: restringir, acercar el rey y ejecutar el mate.',
    candidateMoves: [...checks, ...kingMoves].slice(0, 8),
  };
}
