import assert from 'node:assert/strict';
import test from 'node:test';
import { applyChessMove, createChessGameState, getLegalChessMoves, squareFromName, type Board, type Piece, type Side } from './chess-engine';
import { evaluateCompleteMove } from './complete-training';

function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
}

function boardWith(pieces: Array<[string, Piece]>): Board {
  const board = emptyBoard();
  for (const [name, value] of pieces) {
    const square = squareFromName(name);
    board[square.row][square.col] = value;
  }
  return board;
}

function piece(color: Side, type: Piece['type']): Piece {
  return { color, type };
}

test('complete move evaluation detects an immediately capturable moved piece', () => {
  const base = createChessGameState();
  const previous = {
    ...base,
    board: boardWith([
      ['e1', piece('white', 'king')],
      ['h1', piece('white', 'rook')],
      ['e8', piece('black', 'king')],
      ['h8', piece('black', 'rook')],
    ]),
    turn: 'white' as Side,
  };
  const move = getLegalChessMoves(previous).find(
    (candidate) => candidate.from.row === squareFromName('h1').row &&
      candidate.from.col === squareFromName('h1').col &&
      candidate.to.row === squareFromName('h7').row &&
      candidate.to.col === squareFromName('h7').col,
  );

  assert.ok(move);
  const next = applyChessMove(previous, move);
  const evaluation = evaluateCompleteMove(previous, next, move);
  assert.equal(evaluation.immediateCapture, true);
});

test('complete move evaluation does not use the player side as the opponent', () => {
  const base = createChessGameState();
  const previous = {
    ...base,
    board: boardWith([
      ['e1', piece('white', 'king')],
      ['d1', piece('white', 'queen')],
      ['e8', piece('black', 'king')],
      ['c8', piece('black', 'queen')],
    ]),
    turn: 'white' as Side,
  };
  const move = getLegalChessMoves(previous).find(
    (candidate) => candidate.from.row === squareFromName('d1').row &&
      candidate.from.col === squareFromName('d1').col &&
      candidate.to.row === squareFromName('d3').row &&
      candidate.to.col === squareFromName('d3').col,
  );

  assert.ok(move);
  const next = applyChessMove(previous, move);
  const evaluation = evaluateCompleteMove(previous, next, move);
  assert.equal(evaluation.immediateCapture, false);
  assert.ok(evaluation.feedback.length > 0);
});
