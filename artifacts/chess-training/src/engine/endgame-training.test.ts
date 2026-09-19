import test from 'node:test';
import assert from 'node:assert/strict';
import { createChessGameState } from './chess-engine';
import { chooseEndgameTrainingPrompt, detectEndgameType } from './endgame-training';

function emptyPosition() {
  const state = createChessGameState();
  state.board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
  return state;
}

test('detecta rey y peón contra rey', () => {
  const state = emptyPosition();
  state.board[7][4] = { color: 'white', type: 'king' };
  state.board[6][4] = { color: 'white', type: 'pawn' };
  state.board[0][4] = { color: 'black', type: 'king' };
  assert.equal(detectEndgameType(state), 'rey-y-peon');
  assert.ok(chooseEndgameTrainingPrompt(state));
});

test('detecta final básico de torres', () => {
  const state = emptyPosition();
  state.board[7][4] = { color: 'white', type: 'king' };
  state.board[7][0] = { color: 'white', type: 'rook' };
  state.board[0][4] = { color: 'black', type: 'king' };
  state.board[0][0] = { color: 'black', type: 'rook' };
  assert.equal(detectEndgameType(state), 'torres');
  assert.ok(chooseEndgameTrainingPrompt(state));
});

test('detecta dama contra rey', () => {
  const state = emptyPosition();
  state.board[7][4] = { color: 'white', type: 'king' };
  state.board[3][3] = { color: 'white', type: 'queen' };
  state.board[0][4] = { color: 'black', type: 'king' };
  assert.equal(detectEndgameType(state), 'dama-contra-rey');
});
