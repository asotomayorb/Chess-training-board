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
};

function scoreToMate(score: StockfishScore | null): number | null {
  return score?.type === 'mate' ? score.value : null;
}

export function classifyStockfishMove(quality: StockfishMoveQuality): StockfishCoachResult {
  const bestMate = scoreToMate(quality.bestScore);
  const playedMate = scoreToMate(quality.playedScore);

  if (quality.isBestMove) {
    return {
      quality: 'principal',
      label: 'Jugada principal',
      message: 'Stockfish considera que esta jugada coincide con su principal candidata.',
      centipawnLoss: quality.centipawnLoss,
    };
  }

  if (bestMate !== null) {
    if (playedMate !== null && Math.abs(playedMate) <= Math.abs(bestMate)) {
      return {
        quality: 'excellent',
        label: 'Mate encontrado',
        message: 'También encontraste una continuación de mate o equivalente en el horizonte analizado.',
        centipawnLoss: null,
      };
    }
    if (playedMate !== null && playedMate > 0) {
      return {
        quality: 'imprecise',
        label: 'Mate más lento',
        message: 'Encontraste una continuación ganadora, pero el motor ve una forma más rápida de convertir la ventaja.',
        centipawnLoss: null,
      };
    }
    return {
      quality: 'missed-mate',
      label: 'Se escapó una oportunidad de mate',
      message: 'Había una continuación de mate disponible. Revisa primero jaques, capturas y amenazas forzadas.',
      centipawnLoss: null,
    };
  }

  if (playedMate !== null && playedMate < 0) {
    return {
      quality: 'losing',
      label: 'Problema táctico serio',
      message: 'La jugada permite una secuencia de mate contra tu rey. Busca la respuesta forzada antes de continuar el plan.',
      centipawnLoss: null,
    };
  }

  const loss = quality.centipawnLoss;
  if (loss === null) {
    return {
      quality: 'reasonable',
      label: 'Sin conclusión suficiente',
      message: 'El motor no obtuvo una diferencia numérica fiable para esta comparación.',
      centipawnLoss: null,
    };
  }
  if (loss < 20) {
    return {
      quality: 'excellent',
      label: 'Muy precisa',
      message: 'La diferencia frente a la principal candidata es pequeña; la jugada mantiene prácticamente la misma evaluación.',
      centipawnLoss: loss,
    };
  }
  if (loss < 60) {
    return {
      quality: 'reasonable',
      label: 'Razonable',
      message: 'La jugada es razonable. El motor encuentra una alternativa algo más precisa, útil para estudiar el plan.',
      centipawnLoss: loss,
    };
  }
  if (loss < 120) {
    return {
      quality: 'imprecise',
      label: 'Imprecisa',
      message: 'La posición sigue siendo jugable, pero has cedido una cantidad apreciable de evaluación. Compara las ideas de ambas jugadas.',
      centipawnLoss: loss,
    };
  }
  if (loss < 250) {
    return {
      quality: 'serious-error',
      label: 'Error importante',
      message: 'La jugada cambia de forma relevante la evaluación. Revisa qué amenaza o recurso táctico no fue considerado.',
      centipawnLoss: loss,
    };
  }
  return {
    quality: 'losing',
    label: 'Error grave',
    message: 'La jugada provoca una pérdida grande de evaluación. Antes de mover, vuelve a comprobar jaques, capturas y amenazas del rival.',
    centipawnLoss: loss,
  };
}
