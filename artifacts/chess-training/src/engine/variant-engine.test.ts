import assert from 'node:assert/strict';
import test from 'node:test';
import { italianGameTrainingTree, trainingVariantCatalog } from '@/data/openings';
import {
  calculateAccuracy,
  chooseRandomVariant,
  getProgressiveHintLevel,
  getTrainingTurn,
  getVariantNodePath,
  getVariantSequence,
  isExpectedMove,
} from './variant-engine';

const [giuocoPiano, twoKnights] = italianGameTrainingTree.branches;

test('represents the Italian Game as a shared tree with stable node and move IDs', () => {
  assert.ok(giuocoPiano);
  assert.ok(twoKnights);

  const giuocoPath = getVariantNodePath(italianGameTrainingTree, giuocoPiano);
  const twoKnightsPath = getVariantNodePath(italianGameTrainingTree, twoKnights);
  assert.deepEqual(getVariantSequence(italianGameTrainingTree, giuocoPiano).map((move) => move.notation), ['e4', 'e5', 'Cf3', 'Cc6', 'Ac4', 'Ac5']);
  assert.deepEqual(getVariantSequence(italianGameTrainingTree, twoKnights).map((move) => move.notation), ['e4', 'e5', 'Cf3', 'Cc6', 'Ac4', 'Cf6']);
  assert.deepEqual(giuocoPath.slice(0, -1).map((node) => node.id), twoKnightsPath.slice(0, -1).map((node) => node.id));
  assert.equal(new Set(getVariantSequence(italianGameTrainingTree, giuocoPiano).map((move) => move.id)).size, 6);
  assert.equal(new Set(getVariantSequence(italianGameTrainingTree, twoKnights).map((move) => move.id)).size, 6);
});

test('selects both current variants and supports future selection criteria', () => {
  const first = chooseRandomVariant(trainingVariantCatalog, { random: () => 0 });
  const last = chooseRandomVariant(trainingVariantCatalog, { random: () => 0.999999 });
  assert.equal(first.variant.id, 'giuoco-piano');
  assert.equal(last.variant.id, 'two-knights');
  assert.equal(first.tree.id, 'italian-game');
  assert.equal(chooseRandomVariant(trainingVariantCatalog, { tags: ['amenaza'], random: () => 0 }).variant.id, 'two-knights');
  assert.equal(chooseRandomVariant(trainingVariantCatalog, { excludeVariantIds: ['giuoco-piano'], random: () => 0 }).variant.id, 'two-knights');
  assert.equal(chooseRandomVariant(trainingVariantCatalog, { weights: { 'giuoco-piano': 0, 'two-knights': 1 }, random: () => 0 }).variant.id, 'two-knights');
});

test('advances through the selected branch one player move and response at a time', () => {
  assert.ok(giuocoPiano);
  const rootTurn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, giuocoPiano.startNodeId);
  assert.equal(rootTurn.playerNode?.move?.notation, 'e4');
  assert.deepEqual(rootTurn.automaticNodes.map((node) => node.move?.notation), ['e5']);

  const afterE5Turn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, rootTurn.automaticNodes[0]!.id);
  assert.equal(afterE5Turn.playerNode?.move?.notation, 'Cf3');
  assert.deepEqual(afterE5Turn.automaticNodes.map((node) => node.move?.notation), ['Cc6']);

  const afterNc6Turn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, afterE5Turn.automaticNodes[0]!.id);
  assert.equal(afterNc6Turn.playerNode?.move?.notation, 'Ac4');
  assert.deepEqual(afterNc6Turn.automaticNodes.map((node) => node.move?.notation), ['Ac5']);
  const completeTurn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, afterNc6Turn.automaticNodes[0]!.id);
  assert.equal(completeTurn.playerNode, null);
});

test('validates exact moves, exposes progressive hints and calculates the final score', () => {
  assert.ok(giuocoPiano);
  const firstMove = getVariantSequence(italianGameTrainingTree, giuocoPiano)[0]!;
  assert.equal(isExpectedMove(firstMove, 'e2', 'e4'), true);
  assert.equal(isExpectedMove(firstMove, 'd2', 'd4'), false);
  assert.deepEqual([1, 2, 3, 3].map((errors) => getProgressiveHintLevel(errors)), [1, 2, 3, 3]);
  assert.equal(calculateAccuracy(3, 4), 75);
  assert.equal(calculateAccuracy(3, 3), 100);
});

test('reset starts the selected branch at its stable root node', () => {
  assert.ok(twoKnights);
  const resetTurn = getTrainingTurn(italianGameTrainingTree, twoKnights, twoKnights.startNodeId);
  assert.equal(resetTurn.currentNode.id, 'italian-root');
  assert.equal(resetTurn.playerNode?.id, 'italian-node-e4');
});