import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBoardMove,
  getGameStatus,
  getLegalMoves,
  isInCheck,
  isLegalMove,
  isSquareAttacked,
  makeInitialBoard,
  squareFromName,
  type Board,
  type Piece,
  type Side,
} from './chess-engine';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
}

function boardWith(pieces: Array<[string, Piece]>): Board {
  const board = emptyBoard();
  pieces.forEach(([name, piece]) => {
    const square = squareFromName(name);
    board[square.row][square.col] = piece;
  });
  return board;
}

function piece(color: Side, type: Piece['type']): Piece {
  return { color, type };
}

function hasMove(board: Board, from: string, to: string): boolean {
  const destinations = getLegalMoves(board, squareFromName(from));
  const target = squareFromName(to);
  return destinations.some((destination) => destination.row === target.row && destination.col === target.col);
}

test('the king cannot enter a square attacked by an enemy rook', () => {
  const board = boardWith([
    ['e1', piece('white', 'king')],
    ['e8', piece('black', 'rook')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(hasMove(board, 'e1', 'e2'), false);
});

test('a king cannot remain in check', () => {
  const board = boardWith([
    ['e1', piece('white', 'king')],
    ['e8', piece('black', 'rook')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(isInCheck(board, 'white'), true);
  assert.equal(isLegalMove(board, { from: squareFromName('e1'), to: squareFromName('e2') }), false);
});

test('a pinned non-king piece cannot expose its own king', () => {
  const board = boardWith([
    ['e1', piece('white', 'king')],
    ['e2', piece('white', 'rook')],
    ['e8', piece('black', 'rook')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(hasMove(board, 'e2', 'a2'), false);
  assert.equal(hasMove(board, 'e2', 'e3'), true);
});

test('capturing the enemy king is rejected and never generated as a move', () => {
  const board = boardWith([
    ['e1', piece('white', 'rook')],
    ['e8', piece('black', 'king')],
    ['h8', piece('white', 'king')],
  ]);
  assert.equal(hasMove(board, 'e1', 'e8'), false);
  assert.equal(isLegalMove(board, { from: squareFromName('e1'), to: squareFromName('e8') }), false);
  assert.throws(
    () => applyBoardMove(board, { from: squareFromName('e1'), to: squareFromName('e8') }),
    /Capturing the king/,
  );
  assert.equal(getGameStatus(board, 'black'), 'check');
});

test('detects a simple check', () => {
  const board = boardWith([
    ['e1', piece('white', 'king')],
    ['e8', piece('black', 'rook')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(getGameStatus(board, 'white'), 'check');
});

test('detects checkmate when the checked king has no legal escape', () => {
  const board = boardWith([
    ['a1', piece('white', 'king')],
    ['b2', piece('black', 'queen')],
    ['b8', piece('black', 'rook')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(getGameStatus(board, 'white'), 'checkmate');
});

test('detects stalemate when the side to move is not in check but has no moves', () => {
  const board = boardWith([
    ['a1', piece('white', 'king')],
    ['c2', piece('black', 'queen')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(getGameStatus(board, 'white'), 'stalemate');
});

test('allows a legal king move that escapes check', () => {
  const board = boardWith([
    ['e1', piece('white', 'king')],
    ['e8', piece('black', 'rook')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(isLegalMove(board, { from: squareFromName('e1'), to: squareFromName('d1') }), true);
  assert.equal(getGameStatus(applyBoardMove(board, { from: squareFromName('e1'), to: squareFromName('d1') }), 'black'), 'playing');
});

test('a king cannot capture a protected enemy piece', () => {
  const board = boardWith([
    ['e1', piece('white', 'king')],
    ['e2', piece('black', 'rook')],
    ['b5', piece('black', 'bishop')],
    ['h8', piece('black', 'king')],
  ]);
  assert.equal(hasMove(board, 'e1', 'e2'), false);
  assert.equal(isLegalMove(board, { from: squareFromName('e1'), to: squareFromName('e2') }), false);
});

test('detects attacks from pawns, knights, bishops, rooks, queens and kings', () => {
  const attackCases: Array<[string, Piece['type'], string]> = [
    ['e2', 'pawn', 'd1'],
    ['c3', 'knight', 'e2'],
    ['c3', 'bishop', 'f6'],
    ['a3', 'rook', 'a6'],
    ['d4', 'queen', 'h4'],
    ['e4', 'king', 'f5'],
  ];

  attackCases.forEach(([attackerSquare, attackerType, targetSquare]) => {
    const board = boardWith([
      [attackerSquare, piece('black', attackerType)],
      ['h8', piece('black', 'king')],
      ['a1', piece('white', 'king')],
    ]);
    assert.equal(isSquareAttacked(board, squareFromName(targetSquare), 'black'), true, `${attackerType} attack was not detected`);
  });
});

test('a reset returns a finished position to a fresh playable board', () => {
  const resetBoard = makeInitialBoard();
  assert.equal(getGameStatus(resetBoard, 'white'), 'playing');
  assert.equal(getGameStatus(resetBoard, 'black'), 'playing');
  assert.equal(resetBoard[7][4]?.type, 'king');
  assert.equal(resetBoard[0][4]?.type, 'king');
});