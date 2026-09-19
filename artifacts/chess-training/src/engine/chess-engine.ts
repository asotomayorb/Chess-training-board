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
export type PromotionPiece = Exclude<PieceType, 'king' | 'pawn'>;
export type CastlingRights = { whiteKingSide: boolean; whiteQueenSide: boolean; blackKingSide: boolean; blackQueenSide: boolean; };
export type ChessGameMove = BoardMove & { promotion?: PromotionPiece; special?: 'castle-kingside' | 'castle-queenside' | 'en-passant'; };
export type ChessGameState = { board: Board; turn: Side; castlingRights: CastlingRights; enPassantTarget: Square | null; halfmoveClock: number; positionHistory: string[]; };
export type ChessGameStatus = GameStatus | 'draw-repetition' | 'draw-fifty-move' | 'draw-insufficient-material';

function cloneSquare(square: Square | null): Square | null { return square ? { ...square } : null; }
function sameSquare(a: Square, b: Square): boolean { return a.row === b.row && a.col === b.col; }
function initialCastlingRights(): CastlingRights { return { whiteKingSide: true, whiteQueenSide: true, blackKingSide: true, blackQueenSide: true }; }
function boardSquareNameForEngine(square: Square): string { return `${files[square.col]}${8 - square.row}`; }
function hasLegalEnPassantCapture(state: Pick<ChessGameState, 'board' | 'turn' | 'enPassantTarget'>): boolean {
  const target = state.enPassantTarget;
  if (!target) return false;
  const direction = state.turn === 'white' ? -1 : 1;
  const fromRow = target.row - direction;
  if (fromRow < 0 || fromRow > 7) return false;

  return [-1, 1].some((delta) => {
    const fromCol = target.col + delta;
    if (fromCol < 0 || fromCol > 7) return false;
    const pawn = state.board[fromRow][fromCol];
    if (pawn?.type !== 'pawn' || pawn.color !== state.turn) return false;

    const capturedRow = fromRow;
    const captured = state.board[capturedRow][target.col];
    if (captured?.type !== 'pawn' || captured.color === state.turn) return false;

    // FIDE repetition identity includes the en-passant target only when an
    // en-passant capture is actually legal (including king safety).
    const board = cloneBoard(state.board);
    board[fromRow][fromCol] = null;
    board[capturedRow][target.col] = null;
    board[target.row][target.col] = { ...pawn };
    return !isInCheck(board, state.turn);
  });
}
function positionKey(state: Pick<ChessGameState, 'board' | 'turn' | 'castlingRights' | 'enPassantTarget'>): string {
  const boardKey = state.board.map((row) => row.map((piece) => piece ? piece.color[0] + piece.type[0] : '--').join('')).join('/');
  const rights = [state.castlingRights.whiteKingSide ? 'K' : '', state.castlingRights.whiteQueenSide ? 'Q' : '', state.castlingRights.blackKingSide ? 'k' : '', state.castlingRights.blackQueenSide ? 'q' : ''].join('') || '-';
  const enPassant = hasLegalEnPassantCapture(state) && state.enPassantTarget ? boardSquareNameForEngine(state.enPassantTarget) : '-';
  return boardKey + ' ' + state.turn[0] + ' ' + rights + ' ' + enPassant;
}
export function createChessGameState(): ChessGameState {
  const state: ChessGameState = { board: makeInitialBoard(), turn: 'white', castlingRights: initialCastlingRights(), enPassantTarget: null, halfmoveClock: 0, positionHistory: [] };
  state.positionHistory = [positionKey(state)];
  return state;
}
function kingStart(color: Side): Square { return { row: color === 'white' ? 7 : 0, col: 4 }; }
function rookStart(color: Side, side: 'king' | 'queen'): Square { return { row: color === 'white' ? 7 : 0, col: side === 'king' ? 7 : 0 }; }
function castleDestination(color: Side, side: 'king' | 'queen'): { king: Square; rook: Square } {
  const row = color === 'white' ? 7 : 0;
  return { king: { row, col: side === 'king' ? 6 : 2 }, rook: { row, col: side === 'king' ? 5 : 3 } };
}
function canCastle(state: ChessGameState, color: Side, side: 'king' | 'queen'): boolean {
  const rights = color === 'white' ? (side === 'king' ? state.castlingRights.whiteKingSide : state.castlingRights.whiteQueenSide) : (side === 'king' ? state.castlingRights.blackKingSide : state.castlingRights.blackQueenSide);
  if (!rights) return false;
  const king = kingStart(color), rook = rookStart(color, side);
  const kingPiece = state.board[king.row][king.col], rookPiece = state.board[rook.row][rook.col];
  if (kingPiece?.type !== 'king' || kingPiece.color !== color || rookPiece?.type !== 'rook' || rookPiece.color !== color) return false;
  const row = king.row;
  if ((side === 'king' ? [5, 6] : [1, 2, 3]).some((col) => state.board[row][col] !== null)) return false;
  if (isInCheck(state.board, color)) return false;
  const enemy = color === 'white' ? 'black' : 'white';
  return (side === 'king' ? [5, 6] : [3, 2]).every((col) => !isSquareAttacked(state.board, { row, col }, enemy));
}
function getStatePseudoLegalMoves(state: ChessGameState, from: Square): ChessGameMove[] {
  const piece = state.board[from.row][from.col];
  if (!piece || piece.color !== state.turn) return [];
  const moves: ChessGameMove[] = getPseudoLegalMoves(state.board, from).map((to) => ({ from, to }));
  if (piece.type === 'pawn' && state.enPassantTarget) {
    const direction = piece.color === 'white' ? -1 : 1;
    if (state.enPassantTarget.row === from.row + direction && Math.abs(state.enPassantTarget.col - from.col) === 1 && !state.board[state.enPassantTarget.row][state.enPassantTarget.col]) {
      moves.push({ from, to: cloneSquare(state.enPassantTarget)!, special: 'en-passant' });
    }
  }
  if (piece.type === 'king') {
    if (canCastle(state, piece.color, 'king')) moves.push({ from, to: castleDestination(piece.color, 'king').king, special: 'castle-kingside' });
    if (canCastle(state, piece.color, 'queen')) moves.push({ from, to: castleDestination(piece.color, 'queen').king, special: 'castle-queenside' });
  }
  return moves;
}
const promotionPieces: PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight'];

function withPromotions(move: ChessGameMove, piece: Piece): ChessGameMove[] {
  if (piece.type !== 'pawn' || (move.to.row !== 0 && move.to.row !== 7)) return [move];
  return promotionPieces.map((promotion) => ({ ...move, promotion }));
}
function applyChessMoveUnchecked(state: ChessGameState, move: ChessGameMove): ChessGameState {
  const piece = state.board[move.from.row][move.from.col];
  if (!piece) throw new Error('Cannot move from an empty square.');
  const board = cloneBoard(state.board);
  let captured = board[move.to.row][move.to.col];
  if (move.special === 'en-passant') { captured = board[move.from.row][move.to.col]; board[move.from.row][move.to.col] = null; }
  board[move.to.row][move.to.col] = move.promotion ? { type: move.promotion, color: piece.color } : { ...piece };
  board[move.from.row][move.from.col] = null;
  const rights = { ...state.castlingRights };
  if (piece.type === 'king') { if (piece.color === 'white') { rights.whiteKingSide = false; rights.whiteQueenSide = false; } else { rights.blackKingSide = false; rights.blackQueenSide = false; } }
  if (piece.type === 'rook') {
    if (sameSquare(move.from, rookStart(piece.color, 'king'))) { if (piece.color === 'white') rights.whiteKingSide = false; else rights.blackKingSide = false; }
    if (sameSquare(move.from, rookStart(piece.color, 'queen'))) { if (piece.color === 'white') rights.whiteQueenSide = false; else rights.blackQueenSide = false; }
  }
  if (captured?.type === 'rook') {
    if (sameSquare(move.to, rookStart(captured.color, 'king'))) { if (captured.color === 'white') rights.whiteKingSide = false; else rights.blackKingSide = false; }
    if (sameSquare(move.to, rookStart(captured.color, 'queen'))) { if (captured.color === 'white') rights.whiteQueenSide = false; else rights.blackQueenSide = false; }
  }
  if (move.special === 'castle-kingside' || move.special === 'castle-queenside') {
    const side = move.special === 'castle-kingside' ? 'king' : 'queen';
    const rookFrom = rookStart(piece.color, side), rookTo = castleDestination(piece.color, side).rook;
    board[rookTo.row][rookTo.col] = board[rookFrom.row][rookFrom.col]; board[rookFrom.row][rookFrom.col] = null;
  }
  const enPassantTarget = piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2 ? { row: (move.from.row + move.to.row) / 2, col: move.from.col } : null;
  const nextState: ChessGameState = { board, turn: state.turn === 'white' ? 'black' : 'white', castlingRights: rights, enPassantTarget, halfmoveClock: piece.type === 'pawn' || Boolean(captured) ? 0 : state.halfmoveClock + 1, positionHistory: [] };
  nextState.positionHistory = [...state.positionHistory, positionKey(nextState)];
  return nextState;
}
export function getLegalChessMoves(state: ChessGameState, from?: Square): ChessGameMove[] {
  const sources = from ? [from] : Array.from({ length: 64 }, (_, i) => ({ row: Math.floor(i / 8), col: i % 8 }));
  const moves: ChessGameMove[] = [];
  for (const source of sources) {
    const piece = state.board[source.row][source.col];
    if (!piece || piece.color !== state.turn) continue;
    for (const rawMove of getStatePseudoLegalMoves(state, source)) {
      for (const move of withPromotions(rawMove, piece)) {
        const next = applyChessMoveUnchecked(state, move);
        if (!isInCheck(next.board, state.turn)) moves.push(move);
      }
    }
  }
  return moves;
}
export function isLegalChessMove(state: ChessGameState, move: ChessGameMove): boolean {
  return getLegalChessMoves(state).some((candidate) => sameSquare(candidate.from, move.from) && sameSquare(candidate.to, move.to) && candidate.promotion === move.promotion);
}
export function applyChessMove(state: ChessGameState, move: ChessGameMove): ChessGameState {
  if (!isLegalChessMove(state, move)) throw new Error('Illegal chess move.');
  return applyChessMoveUnchecked(state, move);
}
export function isThreefoldRepetition(state: ChessGameState): boolean {
  const current = positionKey(state);
  return state.positionHistory.filter((key) => key === current).length >= 3;
}
export function hasInsufficientMaterial(board: Board): boolean {
  const pieces = board.flat().filter((piece): piece is Piece => Boolean(piece));
  const nonKings = pieces.filter((piece) => piece.type !== 'king');
  if (nonKings.length === 0) return true;
  if (nonKings.some((piece) => ['pawn', 'rook', 'queen'].includes(piece.type))) return false;
  if (nonKings.length === 1) return true;
  if (nonKings.every((piece) => piece.type === 'bishop')) {
    const bishopSquares = board.flatMap((row, r) => row.map((piece, col) => piece?.type === 'bishop' ? { row: r, col, color: piece.color } : null)).filter(Boolean) as Array<{ row: number; col: number; color: Side }>;
    const colors = bishopSquares.map(({ row, col }) => (row + col) % 2);
    return colors.every((color) => color === colors[0]);
  }
  return false;
}
export function getChessGameStatus(state: ChessGameState): ChessGameStatus {
  const legalMoves = getLegalChessMoves(state);
  const inCheck = isInCheck(state.board, state.turn);
  if (inCheck && legalMoves.length === 0) return 'checkmate';
  if (!inCheck && legalMoves.length === 0) return 'stalemate';
  if (hasInsufficientMaterial(state.board)) return 'draw-insufficient-material';
  if (state.halfmoveClock >= 100) return 'draw-fifty-move';
  if (isThreefoldRepetition(state)) return 'draw-repetition';
  return inCheck ? 'check' : 'playing';
}
