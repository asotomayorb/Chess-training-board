import { createChessGameState } from './chess-engine';
import { chessGameStateToFen } from './stockfish-engine';

test('convierte la posición inicial a FEN', () => {
  expect(chessGameStateToFen(createChessGameState())).toBe(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  );
});

test('convierte correctamente turno, en passant y reloj de medio movimiento', () => {
  const state = createChessGameState();
  state.turn = 'black';
  state.board[6][4] = null;
  state.board[4][4] = { type: 'pawn', color: 'white' };
  state.enPassantTarget = { row: 5, col: 4 };
  state.halfmoveClock = 7;

  expect(chessGameStateToFen(state)).toBe(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 7 1',
  );
});
