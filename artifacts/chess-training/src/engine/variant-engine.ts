import type {
  OpeningColor,
  OpeningMove,
  OpeningVariant,
  VariantCatalog,
  VariantTree,
} from '@/data/openings';

export type TrainingMovePair = {
  playerMove: OpeningMove | null;
  opponentMove: OpeningMove | null;
};

export function chooseRandomVariant(source: VariantTree | VariantCatalog): OpeningVariant {
  const branches = 'branches' in source
    ? source.branches
    : source.trees.flatMap((tree) => tree.branches);

  if (branches.length === 0) {
    throw new Error('Cannot choose a training variant from an empty catalog.');
  }

  return branches[Math.floor(Math.random() * branches.length)] ?? branches[0];
}

export function getTrainingMovePair(
  variant: OpeningVariant,
  step: number,
  playerColor: OpeningColor = 'white',
): TrainingMovePair {
  const playerMoves = variant.moves.filter((move) => move.color === playerColor);
  const playerMove = playerMoves[step] ?? null;

  if (!playerMove) {
    return { playerMove: null, opponentMove: null };
  }

  const playerMoveIndex = variant.moves.indexOf(playerMove);
  const opponentMove = variant.moves[playerMoveIndex + 1];

  return {
    playerMove,
    opponentMove: opponentMove && opponentMove.color !== playerColor ? opponentMove : null,
  };
}

export function getTrainingLength(variant: OpeningVariant, playerColor: OpeningColor = 'white'): number {
  return variant.moves.filter((move) => move.color === playerColor).length;
}

export function calculateAccuracy(correctMoves: number, attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.round((correctMoves / attempts) * 100);
}