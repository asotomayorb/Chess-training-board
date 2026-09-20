import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChessMove, createChessGameState, getLegalChessMoves } from './chess-engine';
import { evaluateEndgameMove } from './endgame-evaluation';
import { chooseEndgameTrainingPrompt } from './endgame-training';

function emptyPosition() {
  const state = createChessGameState();
  state.board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
  state.positionHistory = [];
  return state;
}

function move(state: ReturnType<typeof createChessGameState>, from: string, to: string) {
  const files = 'abcdefgh';
  const square = (name: string) => ({ row: 8 - Number(name[1]), col: files.indexOf(name[0]) });
  const a = square(from);
  const b = square(to);
  const found = getLegalChessMoves(state).find((candidate) =>
    candidate.from.row === a.row && candidate.from.col === a.col &&
    candidate.to.row === b.row && candidate.to.col === b.col
  );
  if (!found) throw new Error('Illegal test move ' + from + '-' + to);
  return found;
}

test('evalúa una mejora del rey en rey y peón contra rey', () => {
  const state = emptyPosition();
  state.board[4][4] = { color: 'white', type: 'pawn' };
  state.board[6][3] = { color: 'white', type: 'king' };
  state.board[0][7] = { color: 'black', type: 'king' };
  state.turn = 'white';
  const prompt = chooseEndgameTrainingPrompt(state);
  assert.ok(prompt);
  const candidate = move(state, 'd2', 'e3');
  const next = applyChessMove(state, candidate);
  const result = evaluateEndgameMove(state, next, candidate, prompt);
  assert.equal(result.fulfilled, true);
});

test('evalúa una jugada de torre que activa una línea contra el rey', () => {
  const state = emptyPosition();
  state.board[7][4] = { color: 'white', type: 'king' };
  state.board[7][0] = { color: 'white', type: 'rook' };
  state.board[0][4] = { color: 'black', type: 'king' };
  state.board[0][7] = { color: 'black', type: 'rook' };
  state.turn = 'white';
  const prompt = chooseEndgameTrainingPrompt(state);
  assert.ok(prompt);
  const candidate = move(state, 'a1', 'a8');
  const next = applyChessMove(state, candidate);
  const result = evaluateEndgameMove(state, next, candidate, prompt);
  assert.equal(result.fulfilled, true);
});

test('evalúa el patrón básico de mate con dama', () => {
  const state = emptyPosition();
  state.board[7][4] = { color: 'white', type: 'king' };
  state.board[3][3] = { color: 'white', type: 'queen' };
  state.board[0][4] = { color: 'black', type: 'king' };
  state.turn = 'white';
  const prompt = chooseEndgameTrainingPrompt(state);
  assert.ok(prompt);
  const candidate = move(state, 'e1', 'e2');
  const next = applyChessMove(state, candidate);
  const result = evaluateEndgameMove(state, next, candidate, prompt);
  assert.equal(result.fulfilled, true);
});


test('evalúa una jugada de mate básico con piezas menores', () => {
  const state = emptyPosition();
  state.board[7][4] = { color: 'white', type: 'king' };
  state.board[6][2] = { color: 'white', type: 'bishop' };
  state.board[5][4] = { color: 'white', type: 'knight' };
  state.board[0][4] = { color: 'black', type: 'king' };
  state.turn = 'white';
  const prompt = chooseEndgameTrainingPrompt(state);
  assert.ok(prompt);
  const candidate = move(state, 'e1', 'e2');
  const next = applyChessMove(state, candidate);
  const result = evaluateEndgameMove(state, next, candidate, prompt);
  assert.equal(result.technique, 'mate-básico');
  assert.equal(result.fulfilled, true);
});
