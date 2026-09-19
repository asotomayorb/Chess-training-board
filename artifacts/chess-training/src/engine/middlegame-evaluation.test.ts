import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChessMove, createChessGameState, getLegalChessMoves, type ChessGameMove } from './chess-engine';
import { evaluateMiddlegameMove } from './middlegame-evaluation';
import type { MiddlegameTrainingPrompt } from './middlegame-training';

function move(state: ReturnType<typeof createChessGameState>, from: string, to: string): ChessGameMove {
  const files = 'abcdefgh';
  const square = (name: string) => ({ row: 8 - Number(name[1]), col: files.indexOf(name[0]) });
  const fromSquare = square(from);
  const toSquare = square(to);
  const found = getLegalChessMoves(state).find(
    (candidate) =>
      candidate.from.row === fromSquare.row &&
      candidate.from.col === fromSquare.col &&
      candidate.to.row === toSquare.row &&
      candidate.to.col === toSquare.col,
  );
  if (!found) throw new Error(`Illegal test move ${from}-${to}`);
  return found;
}

function prompt(objective: MiddlegameTrainingPrompt['objective'], candidateMoves: ChessGameMove[]): MiddlegameTrainingPrompt {
  return {
    objective,
    title: objective,
    instruction: 'Entrena este objetivo.',
    rationale: 'Prueba del evaluador.',
    difficulty: 'intermedio',
    candidateMoves,
  };
}

test('evalúa una decisión de control del centro', () => {
  const state = createChessGameState();
  const e4 = move(state, 'e2', 'e4');
  const next = applyChessMove(state, e4);
  const result = evaluateMiddlegameMove(state, next, e4, prompt('control del centro', [e4]));
  assert.equal(result.fulfilled, true);
});

test('evalúa actividad de piezas con desarrollo de caballo', () => {
  const state = createChessGameState();
  const nc3 = move(state, 'b1', 'c3');
  const next = applyChessMove(state, nc3);
  const result = evaluateMiddlegameMove(state, next, nc3, prompt('actividad de piezas', [nc3]));
  assert.equal(result.fulfilled, true);
});

test('no considera automáticamente buena una jugada que no cumple el objetivo táctico', () => {
  const state = createChessGameState();
  const a3 = move(state, 'a2', 'a3');
  const next = applyChessMove(state, a3);
  const result = evaluateMiddlegameMove(state, next, a3, prompt('táctica', []));
  assert.equal(result.fulfilled, false);
});
