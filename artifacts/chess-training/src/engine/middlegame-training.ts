import { applyChessMove, getLegalChessMoves, isInCheck, type ChessGameMove, type ChessGameState, type Piece, type Side } from './chess-engine';

export type MiddlegameObjective =
  | 'seguridad del rey'
  | 'actividad de piezas'
  | 'control del centro'
  | 'mejorar la peor pieza'
  | 'ruptura de peones'
  | 'táctica'
  | 'simplificación';

export type MiddlegameTrainingPrompt = {
  objective: MiddlegameObjective;
  title: string;
  instruction: string;
  rationale: string;
  difficulty: 'fundamentos' | 'intermedio' | 'avanzado';
  candidateMoves: ChessGameMove[];
};

const values: Record<Piece['type'], number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };

function opposite(side: Side): Side { return side === 'white' ? 'black' : 'white'; }
function centerScore(move: ChessGameMove): number {
  return [move.to.row, move.to.col].reduce((score, value) => score + (Math.abs(value - 3.5) <= 1 ? 1 : 0), 0);
}
function captures(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  return moves.filter((move) => Boolean(state.board[move.to.row][move.to.col]) || move.special === 'en-passant');
}
function checks(state: ChessGameState, moves: ChessGameMove[]): ChessGameMove[] {
  return moves.filter((move) => {
    const next = applyChessMove(state, move);
    return isInCheck(next.board, opposite(state.turn));
  });
}

export function chooseMiddlegameTrainingPrompt(
  state: ChessGameState,
  options: { random?: () => number; difficulty?: MiddlegameTrainingPrompt['difficulty'] } = {},
): MiddlegameTrainingPrompt | null {
  const moves = getLegalChessMoves(state);
  if (!moves.length) return null;
  const random = options.random ?? Math.random;
  const difficulty = options.difficulty ?? 'intermedio';
  const king = state.board.flatMap((row, r) => row.map((piece, c) => piece?.type === 'king' && piece.color === state.turn ? { row: r, col: c } : null)).filter(Boolean);
  const kingUnsafe = king.length === 1 && isInCheck(state.board, state.turn);
  const checking = checks(state, moves);
  const tactical = captures(state, moves).filter((move) => {
    const target = state.board[move.to.row][move.to.col];
    return target ? values[target.type] >= values[state.board[move.from.row][move.from.col]?.type ?? 'pawn'] : false;
  });

  const optionsByObjective: MiddlegameTrainingPrompt[] = [
    {
      objective: 'seguridad del rey',
      title: 'Protege al rey',
      instruction: kingUnsafe ? 'Estás en jaque: encuentra una respuesta legal y forzada.' : 'Antes de atacar, comprueba si tu rey está seguro y si puedes reducir amenazas contra él.',
      rationale: 'La seguridad del rey limita qué planes son tácticamente posibles.',
      difficulty: 'fundamentos',
      candidateMoves: kingUnsafe ? moves : moves.filter((move) => move.special?.startsWith('castle') || move.to.row === (state.turn === 'white' ? 7 : 0)),
    },
    {
      objective: 'control del centro',
      title: 'Pregunta por el centro',
      instruction: 'Busca una jugada que aumente tu influencia sobre las casillas centrales o presione una ruptura central.',
      rationale: 'El control central facilita la actividad de las piezas y reduce las opciones del rival.',
      difficulty: 'fundamentos',
      candidateMoves: [...moves].sort((a, b) => centerScore(b) - centerScore(a)).slice(0, 8),
    },
    {
      objective: 'táctica',
      title: 'Busca una oportunidad táctica',
      instruction: 'Comprueba primero jaques, después capturas y finalmente amenazas. No asumas que la mejor idea es posicional.',
      rationale: 'Las oportunidades tácticas pueden cambiar la prioridad de toda la posición.',
      difficulty: 'intermedio',
      candidateMoves: checking.length ? checking : tactical,
    },
    {
      objective: 'actividad de piezas',
      title: 'Activa tus piezas',
      instruction: 'Busca una pieza poco activa y mejora su casilla sin permitir una táctica inmediata.',
      rationale: 'Una pieza activa participa en más planes y aumenta la coordinación.',
      difficulty: 'fundamentos',
      candidateMoves: moves.filter((move) => {
        const piece = state.board[move.from.row][move.from.col];
        return piece?.type === 'knight' || piece?.type === 'bishop' || piece?.type === 'rook' || piece?.type === 'queen';
      }),
    },
    {
      objective: 'ruptura de peones',
      title: 'Considera una ruptura',
      instruction: 'Busca un avance de peón que cambie la estructura y abra líneas para tus piezas.',
      rationale: 'Las rupturas son decisiones irreversibles: deben evaluarse por las líneas que abren y las debilidades que crean.',
      difficulty: 'intermedio',
      candidateMoves: moves.filter((move) => state.board[move.from.row][move.from.col]?.type === 'pawn'),
    },
    {
      objective: 'simplificación',
      title: '¿Conviene cambiar piezas?',
      instruction: 'Antes de capturar, compara qué piezas desaparecerán y qué final resultará.',
      rationale: 'Simplificar no es automáticamente bueno o malo; depende de la estructura y de la actividad resultante.',
      difficulty: 'avanzado',
      candidateMoves: captures(state, moves),
    },
  ];

  const available = optionsByObjective.filter((prompt) => prompt.candidateMoves.length && (difficulty === 'avanzado' || prompt.difficulty !== 'avanzado'));
  if (!available.length) return { ...optionsByObjective[1], candidateMoves: moves.slice(0, 8) };
  const prompt = available[Math.floor(random() * available.length)];
  return { ...prompt, candidateMoves: prompt.candidateMoves.slice(0, 8) };
}
