import type { OpeningColor } from '@/data/openings';

export type CuratedPuzzleKind = 'middlegame' | 'opposition' | 'rooks' | 'queen';

const baseMoves: Record<CuratedPuzzleKind, string> = {
  middlegame: 'c1g5',
  opposition: 'e3e4',
  rooks: 'a5a7',
  queen: 'g6g7',
};

function mirrorSquare(square: string): string {
  const files = 'abcdefgh';
  return files[7 - files.indexOf(square[0])] + String(9 - Number(square[1]));
}

export function curatedPuzzleMoveUci(kind: CuratedPuzzleKind, playerColor: OpeningColor): string {
  const base = baseMoves[kind];
  if (playerColor === 'white') return base;
  return mirrorSquare(base.slice(0, 2)) + mirrorSquare(base.slice(2, 4)) + base.slice(4);
}
