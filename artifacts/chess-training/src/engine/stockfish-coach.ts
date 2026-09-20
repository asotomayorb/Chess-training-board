import type { ChessGameMove, ChessGameState, PieceType } from './chess-engine';
import { applyChessMove, getLegalChessMoves, isInCheck } from './chess-engine';
import type { StockfishMoveQuality, StockfishScore } from './stockfish-engine';

export type StockfishCoachQuality =
  | 'principal'
  | 'excellent'
  | 'reasonable'
  | 'imprecise'
  | 'serious-error'
  | 'losing'
  | 'missed-mate';

export type StockfishCoachResult = {
  quality: StockfishCoachQuality;
  label: string;
  message: string;
  centipawnLoss: number | null;
  strategicReason: string;
  positionInsight: string;
};

function scoreToMate(score: StockfishScore | null): number | null {
  return score?.type === 'mate' ? score.value : null;
}

export function buildStrategicReason(context?: { objective?: string; scenario?: string }): string {
  const key = context?.objective ?? context?.scenario;
  switch (key) {
    case 'seguridad del rey': return 'La prioridad es reducir amenazas contra el rey antes de buscar mejoras posicionales.';
    case 'actividad de piezas': return 'La idea estratégica es aumentar la actividad de tus piezas y evitar que queden pasivas.';
    case 'control del centro': return 'La prioridad es disputar casillas centrales y mejorar el espacio y la coordinación.';
    case 'mejorar la peor pieza': return 'La idea es identificar tu pieza menos activa y encontrar una mejora concreta para ella.';
    case 'ruptura de peones': return 'La clave es preparar una ruptura de peones que cambie favorablemente la estructura o abra líneas.';
    case 'táctica': return 'La prioridad es calcular primero jaques, capturas y amenazas antes de elegir un plan tranquilo.';
    case 'simplificación': return 'La idea es valorar si el cambio de piezas conduce a una posición más favorable o más fácil de convertir.';
    case 'oposición': return 'La clave es la relación entre ambos reyes: un tempo puede decidir quién obtiene la oposición.';
    case 'regla-del-cuadrado': return 'La decisión depende de si el rey puede entrar en el cuadrado del peón a tiempo.';
    case 'peón-pasado': return 'La prioridad es apoyar el peón pasado y limitar al rey rival antes de avanzar sin cálculo.';
    case 'actividad-del-rey': return 'En el final, la actividad del rey suele ser una de las fuentes principales de ventaja.';
    case 'torre-activa': return 'La idea es colocar la torre donde pueda dar jaques, atacar peones o limitar al rey rival.';
    case 'mate-con-dama': return 'La técnica busca coordinar dama y rey, restringiendo progresivamente las casillas del rey rival.';
    case 'mate-con-torre': return 'La técnica busca cortar al rey con la torre y acercar después el propio rey para completar el mate.';
    default: return 'La línea principal muestra qué recurso táctico o mejora posicional considera prioritario el motor.';
  }
}

function uciToMove(state: ChessGameState, uci: string): ChessGameMove | null {
  if (!uci || uci.length < 4) return null;
  const file = (value: string) => value.charCodeAt(0) - 97;
  const rank = (value: string) => 8 - Number(value[1]);
  const from = { row: rank(uci.slice(0, 2)), col: file(uci.slice(0, 2)) };
  const to = { row: rank(uci.slice(2, 4)), col: file(uci.slice(2, 4)) };
  const promotionMap: Record<string, PieceType> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
  const promotion = uci[4] ? promotionMap[uci[4].toLowerCase()] : undefined;
  return getLegalChessMoves(state, from).find((candidate) =>
    candidate.to.row === to.row &&
    candidate.to.col === to.col &&
    candidate.promotion === promotion
  ) ?? null;
}

function squareName(square: { row: number; col: number }): string {
  return String.fromCharCode(97 + square.col) + String(8 - square.row);
}

function materialValue(type: PieceType): number {
  return ({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 } as Record<PieceType, number>)[type];
}

function describePiece(type: PieceType): string {
  return ({ pawn: 'peón', knight: 'caballo', bishop: 'alfil', rook: 'torre', queen: 'dama', king: 'rey' } as Record<PieceType, string>)[type];
}

function findImmediateTacticalResponse(state: ChessGameState): string | null {
  const moves = getLegalChessMoves(state);
  for (const move of moves) {
    const target = state.board[move.to.row][move.to.col];
    const next = applyChessMove(state, move);
    if (isInCheck(next.board, next.turn)) {
      const piece = state.board[move.from.row][move.from.col];
      return 'jaque con ' + describePiece(piece?.type ?? 'pawn') + ' en ' + squareName(move.to);
    }
    if (target && target.type !== 'king') {
      return 'captura de ' + describePiece(target.type) + ' en ' + squareName(move.to);
    }
  }
  return null;
}
function buildPositionInsight(
  state: ChessGameState | undefined,
  bestMoveUci: string,
  playedMoveUci: string,
): string {
  if (!state) return 'Compara la jugada propuesta con la línea principal para identificar la idea concreta.';
  const bestMove = uciToMove(state, bestMoveUci);
  const playedMove = uciToMove(state, playedMoveUci);
  if (!bestMove) return 'La posición no permitió reconstruir la jugada principal con suficiente información.';
  const bestPiece = state.board[bestMove.from.row][bestMove.from.col];
  const bestCaptured = state.board[bestMove.to.row][bestMove.to.col];
  const bestNext = applyChessMove(state, bestMove);
  const bestGivesCheck = isInCheck(bestNext.board, bestNext.turn);
  const playedNext = playedMove ? applyChessMove(state, playedMove) : null;
  const playedGivesCheck = playedNext ? isInCheck(playedNext.board, playedNext.turn) : false;
  const bestCaptureText = bestCaptured
    ? ` captura ${bestCaptured.type === 'knight' ? 'un caballo' : bestCaptured.type === 'bishop' ? 'un alfil' : bestCaptured.type === 'rook' ? 'una torre' : bestCaptured.type === 'queen' ? 'la dama' : 'un peón'}`
    : '';
  const bestCheckText = bestGivesCheck ? ' y da jaque' : '';
  const bestSquareText = bestPiece
    ? `${bestPiece.type === 'knight' ? 'caballo' : bestPiece.type === 'bishop' ? 'alfil' : bestPiece.type === 'rook' ? 'torre' : bestPiece.type === 'queen' ? 'dama' : bestPiece.type === 'king' ? 'rey' : 'peón'} de ${squareName(bestMove.from)} a ${squareName(bestMove.to)}`
    : `de ${squareName(bestMove.from)} a ${squareName(bestMove.to)}`;
  const materialText = bestCaptured && bestPiece && materialValue(bestCaptured.type) >= materialValue(bestPiece.type)
    ? ' La ganancia material o el cambio favorable es una parte importante de la idea.'
    : '';
  if (bestCaptureText || bestGivesCheck) {
    return `La línea empieza con ${bestSquareText}${bestCaptureText}${bestCheckText}.${materialText}`;
  }
  if (bestPiece?.type === 'king') {
    return `La jugada principal mueve el rey hacia ${squareName(bestMove.to)}, buscando mejorar su actividad y la coordinación de la posición.`;
  }
  if (playedMove && playedGivesCheck && !bestGivesCheck) {
    return 'Tu jaque obliga al rival a responder, pero el motor prioriza otra necesidad de la posición.';
  }
  if (playedMove) {
    const opponentResponse = playedNext ? findImmediateTacticalResponse(playedNext) : null;
    if (opponentResponse) {
      return `La diferencia práctica aparece después de tu jugada: el rival dispone de ${opponentResponse}. La línea principal evita o reduce este recurso.`;
    }
  }
  return `La jugada principal coloca el ${describePiece(bestPiece?.type ?? 'pawn')} en ${squareName(bestMove.to)}. La continuación del motor muestra qué mejora concreta obtiene.`;
}

export function classifyStockfishMove(quality: StockfishMoveQuality, context?: { objective?: string; scenario?: string; state?: ChessGameState }): StockfishCoachResult {
  const strategicReason = buildStrategicReason(context);
  const positionInsight = buildPositionInsight(context?.state, quality.bestMove, quality.playedMove);
  const bestMate = scoreToMate(quality.bestScore);
  const playedMate = scoreToMate(quality.playedScore);

  if (quality.isBestMove) {
    return {
      quality: 'principal',
      label: 'Jugada principal',
      message: 'Stockfish considera que esta jugada coincide con su principal candidata.',
      centipawnLoss: quality.centipawnLoss,
      strategicReason,
      positionInsight,
    };
  }

  if (bestMate !== null) {
    if (playedMate !== null && Math.abs(playedMate) <= Math.abs(bestMate)) {
      return {
        quality: 'excellent',
        label: 'Mate encontrado',
        message: 'También encontraste una continuación de mate o equivalente en el horizonte analizado.',
        centipawnLoss: null,
      strategicReason,
      positionInsight,
      };
    }
    if (playedMate !== null && playedMate > 0) {
      return {
        quality: 'imprecise',
        label: 'Mate más lento',
        message: 'Encontraste una continuación ganadora, pero el motor ve una forma más rápida de convertir la ventaja.',
        centipawnLoss: null,
      strategicReason,
      positionInsight,
      };
    }
    return {
      quality: 'missed-mate',
      label: 'Se escapó una oportunidad de mate',
      message: 'Había una continuación de mate disponible. Revisa primero jaques, capturas y amenazas forzadas.',
      centipawnLoss: null,
      strategicReason,
      positionInsight,
    };
  }

  if (playedMate !== null && playedMate < 0) {
    return {
      quality: 'losing',
      label: 'Problema táctico serio',
      message: 'La jugada permite una secuencia de mate contra tu rey. Busca la respuesta forzada antes de continuar el plan.',
      centipawnLoss: null,
      strategicReason,
      positionInsight,
    };
  }

  const loss = quality.centipawnLoss;
  if (loss === null) {
    return {
      quality: 'reasonable',
      label: 'Sin conclusión suficiente',
      message: 'El motor no obtuvo una diferencia numérica fiable para esta comparación.',
      centipawnLoss: null,
      strategicReason,
      positionInsight,
    };
  }
  if (loss < 20) {
    return {
      quality: 'excellent',
      label: 'Muy precisa',
      message: 'La diferencia frente a la principal candidata es pequeña; la jugada mantiene prácticamente la misma evaluación.',
      centipawnLoss: loss,
      strategicReason,
      positionInsight,
    };
  }
  if (loss < 60) {
    return {
      quality: 'reasonable',
      label: 'Razonable',
      message: 'La jugada es razonable. El motor encuentra una alternativa algo más precisa, útil para estudiar el plan.',
      centipawnLoss: loss,
      strategicReason,
      positionInsight,
    };
  }
  if (loss < 120) {
    return {
      quality: 'imprecise',
      label: 'Imprecisa',
      message: 'La posición sigue siendo jugable, pero has cedido una cantidad apreciable de evaluación. Compara las ideas de ambas jugadas.',
      centipawnLoss: loss,
      strategicReason,
      positionInsight,
    };
  }
  if (loss < 250) {
    return {
      quality: 'serious-error',
      label: 'Error importante',
      message: 'La jugada cambia de forma relevante la evaluación. Revisa qué amenaza o recurso táctico no fue considerado.',
      centipawnLoss: loss,
      strategicReason,
      positionInsight,
    };
  }
  return {
    quality: 'losing',
    label: 'Error grave',
    message: 'La jugada provoca una pérdida grande de evaluación. Antes de mover, vuelve a comprobar jaques, capturas y amenazas del rival.',
    centipawnLoss: loss,
      strategicReason,
      positionInsight,
  };
}
