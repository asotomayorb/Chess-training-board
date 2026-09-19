import test from 'node:test';
import assert from 'node:assert/strict';
import { createChessGameState } from './chess-engine';
import { chessGameStateToFen, chessMoveToUci } from './stockfish-engine';

test('convierte la posición inicial a FEN', () => {
  assert.equal(
    chessGameStateToFen(createChessGameState()),
    'rnbqkbnr/pppppppp/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  );
});

test('convierte correctamente turno, en passant y reloj de medio movimiento', () => {
  const state = createChessGameState();
  state.turn = 'black';
  state.board[6][4] = null;
  state.board[4][4] = { type: 'pawn', color: 'white' };
  state.enPassantTarget = { row: 5, col: 4 };
  state.halfmoveClock = 7;

  assert.equal(
    chessGameStateToFen(state),
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 7 1',
  );
});

test('convierte una jugada normal y una promoción a UCI', () => {
  assert.equal(chessMoveToUci({ from: { row: 6, col: 4 }, to: { row: 4, col: 4 } }), 'e2e4');
  assert.equal(
    chessMoveToUci({ from: { row: 1, col: 0 }, to: { row: 0, col: 0 }, promotion: 'queen' }),
    'a7a8q',
  );
});
