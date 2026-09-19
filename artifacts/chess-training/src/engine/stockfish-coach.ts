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

export function classifyStockfishMove(quality: StockfishMoveQuality, context?: { objective?: string; scenario?: string }): StockfishCoachResult {
  const strategicReason = buildStrategicReason(context);
  const bestMate = scoreToMate(quality.bestScore);
  const playedMate = scoreToMate(quality.playedScore);

  if (quality.isBestMove) {
    return {
      quality: 'principal',
      label: 'Jugada principal',
      message: 'Stockfish considera que esta jugada coincide con su principal candidata.',
      centipawnLoss: quality.centipawnLoss,
      strategicReason,
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
      };
    }
    if (playedMate !== null && playedMate > 0) {
      return {
        quality: 'imprecise',
        label: 'Mate más lento',
        message: 'Encontraste una continuación ganadora, pero el motor ve una forma más rápida de convertir la ventaja.',
        centipawnLoss: null,
      strategicReason,
      };
    }
    return {
      quality: 'missed-mate',
      label: 'Se escapó una oportunidad de mate',
      message: 'Había una continuación de mate disponible. Revisa primero jaques, capturas y amenazas forzadas.',
      centipawnLoss: null,
      strategicReason,
    };
  }

  if (playedMate !== null && playedMate < 0) {
    return {
      quality: 'losing',
      label: 'Problema táctico serio',
      message: 'La jugada permite una secuencia de mate contra tu rey. Busca la respuesta forzada antes de continuar el plan.',
      centipawnLoss: null,
      strategicReason,
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
    };
  }
  if (loss < 20) {
    return {
      quality: 'excellent',
      label: 'Muy precisa',
      message: 'La diferencia frente a la principal candidata es pequeña; la jugada mantiene prácticamente la misma evaluación.',
      centipawnLoss: loss,
      strategicReason,
    };
  }
  if (loss < 60) {
    return {
      quality: 'reasonable',
      label: 'Razonable',
      message: 'La jugada es razonable. El motor encuentra una alternativa algo más precisa, útil para estudiar el plan.',
      centipawnLoss: loss,
      strategicReason,
    };
  }
  if (loss < 120) {
    return {
      quality: 'imprecise',
      label: 'Imprecisa',
      message: 'La posición sigue siendo jugable, pero has cedido una cantidad apreciable de evaluación. Compara las ideas de ambas jugadas.',
      centipawnLoss: loss,
      strategicReason,
    };
  }
  if (loss < 250) {
    return {
      quality: 'serious-error',
      label: 'Error importante',
      message: 'La jugada cambia de forma relevante la evaluación. Revisa qué amenaza o recurso táctico no fue considerado.',
      centipawnLoss: loss,
      strategicReason,
    };
  }
  return {
    quality: 'losing',
    label: 'Error grave',
    message: 'La jugada provoca una pérdida grande de evaluación. Antes de mover, vuelve a comprobar jaques, capturas y amenazas del rival.',
    centipawnLoss: loss,
      strategicReason,
  };
}
