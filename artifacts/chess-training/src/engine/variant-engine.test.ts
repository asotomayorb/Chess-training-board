import assert from 'node:assert/strict';
import test from 'node:test';
import { italianGameTrainingTree, trainingVariantCatalog } from '@/data/openings';
import { applyBoardMove, makeInitialBoard, squareFromName } from './chess-engine';
import {
  calculateAccuracy,
  chooseRandomVariant,
  getProgressiveHintLevel,
  getTrainingTurn,
  getActiveOpeningLabel,
  getVariantNodePath,
  getVariantSequence,
  isExpectedMove,
  classifyTrainingError,
  chooseUnexpectedEvent,
  chooseUnexpectedSituation,
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


test('activates the opening name first and the specific variant only after the branch is unique', () => {
  assert.ok(giuocoPiano);
  const labels = [
    ['italian-root', null],
    ['italian-node-e4', 'Apertura Italiana'],
    ['italian-node-e5', 'Apertura Italiana'],
    ['italian-node-nf3', 'Apertura Italiana'],
    ['italian-node-nc6', 'Apertura Italiana'],
    ['italian-node-bc4', 'Apertura Italiana'],
    ['italian-node-bc5', 'Giuoco Piano'],
    ['italian-node-b4', 'Gambito Evans'],
  ] as const;
  for (const [nodeId, expected] of labels) {
    assert.equal(getActiveOpeningLabel(italianGameTrainingTree, nodeId), expected);
  }
  assert.equal(getActiveOpeningLabel(italianGameTrainingTree, 'italian-node-nf6'), 'Dos Caballos');
  assert.equal(getActiveOpeningLabel(italianGameTrainingTree, 'italian-node-be7'), 'Defensa Húngara');
  assert.equal(getActiveOpeningLabel(italianGameTrainingTree, 'italian-node-nxf7'), 'Ataque Fegatello');
});

test('all black opening decisions expose three progressive hints', () => {
  const blackMoves = getVariantSequence(italianGameTrainingTree, giuocoPiano)
    .concat(getVariantSequence(italianGameTrainingTree, twoKnights))
    .filter((move) => move.color === 'black');
  for (const move of blackMoves) {
    assert.ok(move.hints.every((hint) => hint.trim().length > 0), `missing hint for ${move.notation}`);
  }
});

test('selects both current variants and supports future selection criteria', () => {
  const first = chooseRandomVariant(trainingVariantCatalog, { random: () => 0 });
  const last = chooseRandomVariant(trainingVariantCatalog, { random: () => 0.999999 });
  assert.equal(first.variant.id, 'giuoco-piano');
  assert.equal(last.variant.id, 'hungarian-defense');
  assert.equal(first.tree.id, 'italian-game');
  assert.equal(chooseRandomVariant(trainingVariantCatalog, { tags: ['amenaza'], random: () => 0 }).variant.id, 'two-knights');
  assert.equal(chooseRandomVariant(trainingVariantCatalog, { excludeVariantIds: ['giuoco-piano'], random: () => 0 }).variant.id, 'two-knights');
  assert.equal(chooseRandomVariant(trainingVariantCatalog, { weights: { 'giuoco-piano': 0, 'two-knights': 1 }, random: () => 0 }).variant.id, 'two-knights');
});

test('advances through the selected branch one player move and response at a time', () => {
  assert.ok(giuocoPiano);
  const rootTurn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, giuocoPiano.startNodeId);
  assert.equal(rootTurn.playerNode?.move?.notation, 'e4');
  assert.deepEqual(rootTurn.automaticNodes.map((node) => node.move?.notation), []);

  const afterE4Turn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, rootTurn.playerNode!.id);
  assert.equal(afterE4Turn.playerNode?.move?.notation, 'Cf3');
  assert.deepEqual(afterE4Turn.automaticNodes.map((node) => node.move?.notation), ['e5']);

  const afterE5Turn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, afterE4Turn.automaticNodes[0]!.id);
  assert.equal(afterE5Turn.playerNode?.move?.notation, 'Cf3');
  assert.deepEqual(afterE5Turn.automaticNodes.map((node) => node.move?.notation), []);

  const afterNf3Turn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, afterE5Turn.playerNode!.id);
  assert.equal(afterNf3Turn.playerNode?.move?.notation, 'Ac4');
  assert.deepEqual(afterNf3Turn.automaticNodes.map((node) => node.move?.notation), ['Cc6']);

  const afterNc6Turn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, afterNf3Turn.automaticNodes[0]!.id);
  assert.equal(afterNc6Turn.playerNode?.move?.notation, 'Ac4');
  assert.deepEqual(afterNc6Turn.automaticNodes.map((node) => node.move?.notation), []);

  const afterBc4Turn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, afterNc6Turn.playerNode!.id);
  assert.equal(afterBc4Turn.playerNode, null);
  assert.deepEqual(afterBc4Turn.automaticNodes.map((node) => node.move?.notation), ['Ac5']);
  const completeTurn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, afterBc4Turn.automaticNodes[0]!.id);
  assert.equal(completeTurn.playerNode, null);
});

test('Defensa Húngara mantiene decisiones posteriores a Ae7 y sus pistas corresponden a cada jugada', () => {
  const hungarian = italianGameTrainingTree.branches.find((branch) => branch.id === 'hungarian-defense');
  assert.ok(hungarian);
  assert.deepEqual(
    getVariantSequence(italianGameTrainingTree, hungarian).map((move) => move.notation),
    ['e4', 'e5', 'Cf3', 'Cc6', 'Ac4', 'Ae7', 'd4', 'exd4', 'Cxd4'],
  );
  assert.equal(getActiveOpeningLabel(italianGameTrainingTree, 'italian-node-be7'), 'Defensa Húngara');
  assert.equal(getTrainingTurn(italianGameTrainingTree, hungarian, 'italian-node-be7', 'white').playerNode?.move?.notation, 'd4');
  const afterD4 = getTrainingTurn(italianGameTrainingTree, hungarian, 'italian-node-hungarian-d4', 'white');
  assert.equal(afterD4.playerNode?.move?.notation, 'Cxd4');
  assert.deepEqual(afterD4.automaticNodes.map((node) => node.move?.notation), ['exd4']);
  const current = getVariantSequence(italianGameTrainingTree, hungarian).find((move) => move.id === 'italian-move-hungarian-d4');
  assert.ok(current);
  assert.match(current.hints[1], /d4/i);
  assert.match(current.hints[2], /d4/i);
});

test('black training starts with the first white move and does not skip black decision', () => {
  assert.ok(giuocoPiano);
  const rootTurn = getTrainingTurn(italianGameTrainingTree, giuocoPiano, giuocoPiano.startNodeId, 'black');
  assert.equal(rootTurn.playerNode?.move?.notation, 'e5');
  assert.deepEqual(rootTurn.automaticNodes.map((node) => node.move?.notation), ['e4']);
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

test('classifies opening mistakes and generates unexpected-play events by difficulty', () => {
  assert.ok(giuocoPiano);
  const move = getVariantSequence(italianGameTrainingTree, giuocoPiano)[4]!;
  assert.equal(classifyTrainingError(move, 'a2', 'a3'), 'amenaza ignorada');
  assert.equal(chooseUnexpectedEvent({ difficulty: 'fundamentos', random: () => 0 })?.type, 'amenaza');
  assert.equal(chooseUnexpectedEvent({ enabled: false, random: () => 0 }) , null);
  assert.equal(chooseUnexpectedEvent({ difficulty: 'avanzado', random: () => 0.999999 })?.type, 'cambio de plan');
});

test('detects a concrete legal unexpected situation on a real board', () => {
  let board = makeInitialBoard();
  board = applyBoardMove(board, { from: squareFromName('e2'), to: squareFromName('e4') });
  board = applyBoardMove(board, { from: squareFromName('e7'), to: squareFromName('e5') });
  board = applyBoardMove(board, { from: squareFromName('g1'), to: squareFromName('f3') });
  const event = chooseUnexpectedSituation(board, 'black', { difficulty: 'intermedio', random: () => 0 });
  assert.ok(event);
  assert.equal(event?.concrete, true);
  assert.ok(event?.from);
  assert.ok(event?.to);
  assert.ok(event?.move);
});
