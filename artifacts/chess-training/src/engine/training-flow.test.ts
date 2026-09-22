import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpeningTrainingColor } from './training-flow';

const variant = (name: string, defense: string) => ({ name, defense } as never);

test('opening roles keep attacks/openings with White', () => {
  assert.equal(getOpeningTrainingColor(variant('Giuoco Piano', 'Defensa clásica')), 'white');
  assert.equal(getOpeningTrainingColor(variant('Ataque Fegatello', 'Dos Caballos · línea táctica')), 'white');
  assert.equal(getOpeningTrainingColor(variant('Gambito Evans', 'Gambito sobre c5')), 'white');
});

test('named defenses keep the exercise with Black', () => {
  assert.equal(getOpeningTrainingColor(variant('Dos Caballos', 'Defensa de los Dos Caballos')), 'black');
  assert.equal(getOpeningTrainingColor(variant('Defensa Húngara', '3...Ae7')), 'black');
});
