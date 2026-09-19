export type Side = 'white' | 'black';
export type PieceType = 'rook' | 'knight' | 'bishop' | 'queen' | 'king' | 'pawn';
export type Piece = { type: PieceType; color: Side };
export type Board = Array<Array<Piece | null>>;
export type Square = { row: number; col: number };
export type BoardMove = { from: Square; to: Square };
export type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const knightOffsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const kingOffsets = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];
const rookDirections = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const bishopDirections = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const queenDirections = [...rookDirections, ...bishopDirections];

export function makeInitialBoard(): Board {
  const backRank: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  return [
    backRank.map((type) => ({ type, color: 'black' as Side })),
    Array.from({ length: 8 }, () => ({ type: 'pawn', color: 'black' as Side })),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array.from({ length: 8 }, () => ({ type: 'pawn', color: 'white' as Side })),
    backRank.map((type) => ({ type, color: 'white' as Side })),
  ];
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getPiece(board: Board, square: Square): Piece | null {
  return board[square.row]?.[square.col] ?? null;
}

function addIfAvailable(board: Board, from: Square, row: number, col: number, moves: Square[]): boolean {
  if (!inBounds(row, col)) return false;
  const piece = getPiece(board, from);
  const destination = board[row][col];
  if (!piece) return false;
  if (!destination) {
    moves.push({ row, col });
    return true;
  }
  if (destination.color !== piece.color && destination.type !== 'king') {
    moves.push({ row, col });
  }
  return false;
}

function addSlidingMoves(board: Board, from: Square, directions: number[][], moves: Square[]): void {
  directions.forEach(([rowDelta, colDelta]) => {
    let row = from.row + rowDelta;
    let col = from.col + colDelta;
    while (addIfAvailable(board, from, row, col, moves)) {
      row += rowDelta;
      col += colDelta;
    }
  });
}

/**
 * Generates moves that respect piece geometry and occupancy only.
 * Self-check is intentionally handled by getLegalMoves after simulation.
 */
export function getPseudoLegalMoves(board: Board, from: Square): Square[] {
  const piece = getPiece(board, from);
  if (!piece) return [];
  const moves: Square[] = [];

  if (piece.type === 'pawn') {
    const direction = piece.color === 'white' ? -1 : 1;
    const startRow = piece.color === 'white' ? 6 : 1;
    const oneStepRow = from.row + direction;
    if (inBounds(oneStepRow, from.col) && !board[oneStepRow][from.col]) {
      moves.push({ row: oneStepRow, col: from.col });
      const twoStepRow = from.row + direction * 2;
      if (from.row === startRow && !board[twoStepRow][from.col]) {
        moves.push({ row: twoStepRow, col: from.col });
      }
    }
    [-1, 1].forEach((colDelta) => {
      const row = from.row + direction;
      const col = from.col + colDelta;
      const destination = inBounds(row, col) ? board[row][col] : null;
      if (destination && destination.color !== piece.color && destination.type !== 'king') {
        moves.push({ row, col });
      }
    });
    return moves;
  }

  if (piece.type === 'knight') {
    knightOffsets.forEach(([rowDelta, colDelta]) => {
      addIfAvailable(board, from, from.row + rowDelta, from.col + colDelta, moves);
    });
    return moves;
  }

  if (piece.type === 'king') {
    kingOffsets.forEach(([rowDelta, colDelta]) => {
      addIfAvailable(board, from, from.row + rowDelta, from.col + colDelta, moves);
    });
    return moves;
  }

  if (piece.type === 'rook') addSlidingMoves(board, from, rookDirections, moves);
  if (piece.type === 'bishop') addSlidingMoves(board, from, bishopDirections, moves);
  if (piece.type === 'queen') addSlidingMoves(board, from, queenDirections, moves);
  return moves;
}

function rayAttacks(board: Board, from: Square, target: Square, directions: number[][]): boolean {
  for (const [rowDelta, colDelta] of directions) {
    let row = from.row + rowDelta;
    let col = from.col + colDelta;
    while (inBounds(row, col)) {
      if (row === target.row && col === target.col) return true;
      if (board[row][col]) break;
      row += rowDelta;
      col += colDelta;
    }
  }
  return false;
}

/**
 * Checks attacks independently from legal moves. This is important for kings
 * and pawns: a pawn attacks diagonally without moving forward, and a king
 * attacks adjacent squares even when moving there would expose itself.
 */
export function isSquareAttacked(board: Board, target: Square, byColor: Side): boolean {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.color !== byColor) continue;
      const from = { row, col };

      if (piece.type === 'pawn') {
        const direction = byColor === 'white' ? -1 : 1;
        if (target.row === row + direction && Math.abs(target.col - col) === 1) return true;
      } else if (piece.type === 'knight') {
        if (knightOffsets.some(([rowDelta, colDelta]) => target.row === row + rowDelta && target.col === col + colDelta)) {
          return true;
        }
      } else if (piece.type === 'king') {
        if (Math.max(Math.abs(target.row - row), Math.abs(target.col - col)) === 1) return true;
      } else if (
        (piece.type === 'rook' && rayAttacks(board, from, target, rookDirections)) ||
        (piece.type === 'bishop' && rayAttacks(board, from, target, bishopDirections)) ||
        (piece.type === 'queen' && rayAttacks(board, from, target, queenDirections))
      ) {
        return true;
      }
    }
  }
  return false;
}

export function findKing(board: Board, color: Side): Square | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece?.color === color && piece.type === 'king') return { row, col };
    }
  }
  return null;
}

export function isInCheck(board: Board, color: Side): boolean {
  const king = findKing(board, color);
  return king ? isSquareAttacked(board, king, color === 'white' ? 'black' : 'white') : false;
}

/**
 * Applies a basic move after it has passed candidate generation. The special
 * move boundary lives here for future castling, promotion and en passant.
 */
export function applyBoardMove(board: Board, move: BoardMove): Board {
  const piece = getPiece(board, move.from);
  const destination = getPiece(board, move.to);
  if (!piece) throw new Error('Cannot move from an empty square.');
  if (destination?.color === piece.color) throw new Error('Cannot capture a piece of the same color.');
  if (destination?.type === 'king') throw new Error('Capturing the king is not a legal move.');

  const nextBoard = cloneBoard(board);
  nextBoard[move.to.row][move.to.col] = nextBoard[move.from.row][move.from.col];
  nextBoard[move.from.row][move.from.col] = null;
  return nextBoard;
}

export function getLegalMoves(board: Board, from: Square): Square[] {
  const piece = getPiece(board, from);
  if (!piece) return [];
  return getPseudoLegalMoves(board, from).filter((to) => (
    !isInCheck(applyBoardMove(board, { from, to }), piece.color)
  ));
}

export function isLegalMove(board: Board, move: BoardMove): boolean {
  return getLegalMoves(board, move.from).some((to) => to.row === move.to.row && to.col === move.to.col);
}

export function getAllLegalMoves(board: Board, color: Side): BoardMove[] {
  const moves: BoardMove[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const from = { row, col };
      if (getPiece(board, from)?.color !== color) continue;
      getLegalMoves(board, from).forEach((to) => moves.push({ from, to }));
    }
  }
  return moves;
}

export function getGameStatus(board: Board, sideToMove: Side): GameStatus {
  const inCheck = isInCheck(board, sideToMove);
  const hasLegalMove = getAllLegalMoves(board, sideToMove).length > 0;
  if (inCheck && !hasLegalMove) return 'checkmate';
  if (!inCheck && !hasLegalMove) return 'stalemate';
  if (inCheck) return 'check';
  return 'playing';
}

export function squareFromName(name: string): Square {
  return { row: 8 - Number(name[1]), col: files.indexOf(name[0]) };
}