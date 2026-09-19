import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStockfishMove } from './stockfish-coach';
import type { StockfishMoveQuality } from './stockfish-engine';

function quality(overrides: Partial<StockfishMoveQuality> = {}): StockfishMoveQuality {
  return {
    playedMove: 'e2e4',
    bestMove: 'e2e4',
    bestScore: { type: 'cp', value: 30 },
    playedScore: { type: 'cp', value: 30 },
    centipawnLoss: 0,
    isBestMove: true,
    ...overrides,
  };
}

test('clasifica la jugada principal sin llamarla automáticamente perfecta', () => {
  const result = classifyStockfishMove(quality());
  assert.equal(result.quality, 'principal');
  assert.equal(result.label, 'Jugada principal');
});

test('distingue una jugada razonable de una imprecisa', () => {
  assert.equal(
    classifyStockfishMove(quality({ bestMove: 'd2d4', isBestMove: false, centipawnLoss: 45 })).quality,
    'reasonable',
  );
  assert.equal(
    classifyStockfishMove(quality({ bestMove: 'd2d4', isBestMove: false, centipawnLoss: 80 })).quality,
    'imprecise',
  );
});

test('clasifica pérdidas grandes como errores serios o graves', () => {
  assert.equal(
    classifyStockfishMove(quality({ bestMove: 'd2d4', isBestMove: false, centipawnLoss: 180 })).quality,
    'serious-error',
  );
  assert.equal(
    classifyStockfishMove(quality({ bestMove: 'd2d4', isBestMove: false, centipawnLoss: 320 })).quality,
    'losing',
  );
});

test('maneja correctamente las oportunidades de mate', () => {
  const missed = classifyStockfishMove(quality({
    bestMove: 'h7h8',
    isBestMove: false,
    bestScore: { type: 'mate', value: 2 },
    playedScore: { type: 'cp', value: 50 },
    centipawnLoss: null,
  }));
  assert.equal(missed.quality, 'missed-mate');

  const slower = classifyStockfishMove(quality({
    bestMove: 'h7h8',
    isBestMove: false,
    bestScore: { type: 'mate', value: 1 },
    playedScore: { type: 'mate', value: 3 },
    centipawnLoss: null,
  }));
  assert.equal(slower.quality, 'imprecise');
});

test('detecta que la jugada permite mate contra el jugador', () => {
  const result = classifyStockfishMove(quality({
    bestMove: 'e2e3',
    isBestMove: false,
    bestScore: { type: 'cp', value: 20 },
    playedScore: { type: 'mate', value: -1 },
    centipawnLoss: null,
  }));
  assert.equal(result.quality, 'losing');
});
