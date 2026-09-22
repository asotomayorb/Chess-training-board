import test from 'node:test';
import assert from 'node:assert/strict';
import { curatedPuzzleMoveUci } from './puzzle-training';

test('curated puzzles expose deterministic first moves', () => {
  assert.equal(curatedPuzzleMoveUci('middlegame', 'white'), 'c1g5');
  assert.equal(curatedPuzzleMoveUci('opposition', 'white'), 'e3e4');
  assert.equal(curatedPuzzleMoveUci('rooks', 'white'), 'a5a7');
  assert.equal(curatedPuzzleMoveUci('queen', 'white'), 'g6g7');
});

test('black exercises mirror the exact pedagogical position', () => {
  assert.equal(curatedPuzzleMoveUci('middlegame', 'black'), 'f8c4');
  assert.equal(curatedPuzzleMoveUci('opposition', 'black'), 'd6d5');
  assert.equal(curatedPuzzleMoveUci('rooks', 'black'), 'h4h2');
  assert.equal(curatedPuzzleMoveUci('queen', 'black'), 'b3b2');
});
