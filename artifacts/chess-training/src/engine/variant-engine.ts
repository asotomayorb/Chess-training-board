import {
  applyBoardMove,
  getAllLegalMoves,
  getGameStatus,
  type Board,
  type BoardMove,
  type Side,
} from './chess-engine';
import type {
  OpeningColor,
  OpeningMove,
  OpeningVariant,
  VariantCatalog,
  VariantNode,
  VariantTag,
  VariantTree,
  TrainingErrorCategory,
} from '@/data/openings';

export function classifyTrainingError(expectedMove: OpeningMove, from: string, to: string): TrainingErrorCategory {
  const context = [expectedMove.concept, expectedMove.objective, expectedMove.threat, expectedMove.typicalError].join(' ').toLowerCase();
  if (/captur|material|peón/.test(context)) return 'captura prematura';
  if (/amenaza|ataca|presión|táctic/.test(context)) return 'amenaza ignorada';
  if (/gambito|sacrificio|táctic/.test(context)) return 'táctica';
  if (/desarroll|caballo|alfil|enroque/.test(context)) return 'desarrollo';
  if (/tiempo|repetir|mismo/.test(context)) return 'pérdida de tiempo';
  if (/debil|rey|estructura|peones/.test(context)) return 'debilitamiento';
  return 'plan incorrecto';
}

export type UnexpectedEventType = 'amenaza' | 'gambito' | 'desviación' | 'sacrificio' | 'cambio de plan';

export type UnexpectedEvent = {
  type: UnexpectedEventType;
  title: string;
  message: string;
  difficulty: 'fundamentos' | 'intermedio' | 'avanzado';
  move?: BoardMove;
  from?: string;
  to?: string;
  concrete?: boolean;
};

const unexpectedEventCatalog: UnexpectedEvent[] = [
  { type: 'amenaza', title: '⚠️ Atención: posible amenaza', message: 'Antes de ejecutar tu plan, comprueba qué amenaza acaba de aparecer.', difficulty: 'fundamentos' },
  { type: 'gambito', title: '♟️ Juego inesperado: gambito', message: 'El rival puede ofrecer material para ganar tiempos o iniciativa.', difficulty: 'intermedio' },
  { type: 'desviación', title: '↪️ Juego inesperado: desviación', message: 'La posición puede apartarse de la línea conocida. Busca la idea, no solo la memoria.', difficulty: 'intermedio' },
  { type: 'sacrificio', title: '⚔️ Juego inesperado: sacrificio', message: 'El rival puede entregar material a cambio de actividad o amenazas.', difficulty: 'avanzado' },
  { type: 'cambio de plan', title: '🔄 Juego inesperado: cambio de plan', message: 'El rival puede cambiar su plan. Reevalúa centro, seguridad del rey y piezas activas.', difficulty: 'avanzado' },
];

export type UnexpectedEventOptions = {
  enabled?: boolean;
  difficulty?: 'fundamentos' | 'intermedio' | 'avanzado';
  random?: () => number;
};

function boardSquareName(square: { row: number; col: number }): string {
  return String.fromCharCode(97 + square.col) + String(8 - square.row);
}

function oppositeSide(side: Side): Side {
  return side === 'white' ? 'black' : 'white';
}

function pieceValue(type: string): number {
  return type === 'queen' ? 9 : type === 'rook' ? 5 : type === 'bishop' || type === 'knight' ? 3 : type === 'pawn' ? 1 : 100;
}

export function chooseUnexpectedSituation(board: Board, sideToMove: Side, options: UnexpectedEventOptions = {}): UnexpectedEvent | null {
  if (options.enabled === false) return null;
  const legalMoves = getAllLegalMoves(board, sideToMove);
  if (!legalMoves.length) return null;

  const difficulty = options.difficulty ?? 'intermedio';
  const randomValue = Math.min(Math.max((options.random ?? Math.random)(), 0), 0.999999);
  const opponent = oppositeSide(sideToMove);

  const checkMoves = legalMoves.filter(
    (move) => getGameStatus(applyBoardMove(board, move), opponent) === 'check',
  );

  const capturableOffers = legalMoves.filter((move) => {
    const movedPiece = board[move.from.row][move.from.col];
    if (!movedPiece || movedPiece.type === 'king') return false;
    const next = applyBoardMove(board, move);
    return getAllLegalMoves(next, opponent).some(
      (reply) =>
        reply.to.row === move.to.row &&
        reply.to.col === move.to.col &&
        pieceValue(movedPiece.type) >= 3,
    );
  });

  const captures = legalMoves.filter((move) => Boolean(board[move.to.row][move.to.col]));
  const randomMove = legalMoves[Math.floor(randomValue * legalMoves.length)];

  if (difficulty === 'fundamentos') {
    const move = checkMoves[0] ?? randomMove;
    return {
      type: 'amenaza',
      title: '⚠️ Amenaza real en la posición',
      message: checkMoves.length
        ? 'El rival tiene una jugada legal que da jaque: ' + boardSquareName(move.from) + '–' + boardSquareName(move.to) + '. Comprueba primero esta amenaza antes de seguir tu plan.'
        : 'El rival ha cambiado la posición. Antes de continuar tu plan, comprueba jaques, capturas y amenazas inmediatas.',
      difficulty,
      move,
      from: boardSquareName(move.from),
      to: boardSquareName(move.to),
      concrete: checkMoves.length > 0,
    };
  }

  if (difficulty === 'intermedio') {
    const move = capturableOffers[0] ?? captures[0] ?? randomMove;
    return {
      type: capturableOffers.length ? 'sacrificio' : 'gambito',
      title: capturableOffers.length ? '⚔️ Juego inesperado: sacrificio' : '♟️ Juego inesperado: presión sobre material',
      message: capturableOffers.length
        ? 'El rival ofrece material de forma concreta. No captures automáticamente: calcula qué obtiene a cambio.'
        : captures.length
          ? 'El rival cambia material de forma inesperada. Comprueba si aceptar el cambio favorece tu plan.'
          : 'El rival se desvía de la línea esperada. Reevalúa la posición antes de continuar de memoria.',
      difficulty,
      move,
      from: boardSquareName(move.from),
      to: boardSquareName(move.to),
      concrete: true,
    };
  }

  return {
    type: 'cambio de plan',
    title: '🔄 Juego inesperado: cambio de plan',
    message: 'El rival cambia el plan de forma inesperada. Reevalúa centro, seguridad del rey, piezas activas y amenazas antes de responder.',
    difficulty,
    move: randomMove,
    from: boardSquareName(randomMove.from),
    to: boardSquareName(randomMove.to),
    concrete: true,
  };
}
export function chooseUnexpectedEvent(options: UnexpectedEventOptions = {}): UnexpectedEvent | null {
  if (options.enabled === false) return null;
  const levels = options.difficulty === 'fundamentos'
    ? ['fundamentos']
    : options.difficulty === 'intermedio'
      ? ['fundamentos', 'intermedio']
      : ['fundamentos', 'intermedio', 'avanzado'];
  const candidates = unexpectedEventCatalog.filter((event) => levels.includes(event.difficulty));
  if (!candidates.length) return null;
  const randomValue = Math.min(Math.max((options.random ?? Math.random)(), 0), 0.999999);
  return candidates[Math.floor(randomValue * candidates.length)];
}

export type VariantSelection = {
  tree: VariantTree;
  variant: OpeningVariant;
};

export type VariantSelectionOptions = {
  levels?: readonly string[];
  tags?: readonly VariantTag[];
  excludeVariantIds?: readonly string[];
  weights?: Readonly<Record<string, number>>;
  random?: () => number;
};

export type TrainingTurn = {
  currentNode: VariantNode;
  playerNode: VariantNode | null;
  automaticNodes: VariantNode[];
};

function getVariantEntries(source: VariantTree | VariantCatalog): VariantSelection[] {
  if ('branches' in source) {
    return source.branches.map((variant) => ({ tree: source, variant }));
  }

  return source.trees.flatMap((tree) => (
    tree.branches.map((variant) => ({ tree, variant }))
  ));
}

export function chooseRandomVariant(
  source: VariantTree | VariantCatalog,
  options: VariantSelectionOptions = {},
): VariantSelection {
  const levels = options.levels ? new Set(options.levels) : null;
  const tags = options.tags ? new Set(options.tags) : null;
  const excludedIds = new Set(options.excludeVariantIds ?? []);
  const candidates = getVariantEntries(source).filter(({ variant }) => (
    (!levels || levels.has(variant.level)) &&
    (!tags || variant.tags.some((tag) => tags.has(tag))) &&
    !excludedIds.has(variant.id)
  ));

  if (candidates.length === 0) {
    throw new Error('Cannot choose a training variant: no branches match the selection criteria.');
  }

  const getWeight = (variant: OpeningVariant) => Math.max(options.weights?.[variant.id] ?? 1, 0);
  const totalWeight = candidates.reduce((total, { variant }) => total + getWeight(variant), 0);
  const randomValue = options.random ?? Math.random;

  if (totalWeight <= 0) {
    throw new Error('Cannot choose a training variant: all branch weights are zero.');
  }

  let threshold = randomValue() * totalWeight;
  for (const candidate of candidates) {
    threshold -= getWeight(candidate.variant);
    if (threshold < 0) return candidate;
  }

  return candidates[candidates.length - 1];
}

function findNode(node: VariantNode, nodeId: string): VariantNode | null {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

function findPath(node: VariantNode, targetNodeId: string, path: VariantNode[] = []): VariantNode[] | null {
  const nextPath = [...path, node];
  if (node.id === targetNodeId) return nextPath;

  for (const child of node.children) {
    const found = findPath(child, targetNodeId, nextPath);
    if (found) return found;
  }
  return null;
}

export function getVariantNodePath(tree: VariantTree, variant: OpeningVariant): VariantNode[] {
  const startNode = findNode(tree.root, variant.startNodeId);
  if (!startNode) {
    throw new Error(`Variant "${variant.id}" references missing start node "${variant.startNodeId}".`);
  }

  const path = findPath(startNode, variant.leafNodeId);
  if (!path) {
    throw new Error(`Variant "${variant.id}" has no path to leaf node "${variant.leafNodeId}".`);
  }

  return path;
}

export function getActiveOpeningLabel(tree: VariantTree, nodeId: string): string | null {
  if (nodeId === tree.root.id) return null;
  const matching = tree.branches.filter((branch) => {
    const path = getVariantNodePath(tree, branch);
    return path.some((node) => node.id === nodeId);
  });
  if (!matching.length) return null;

  // Una variante puede compartir varias jugadas con otra línea. La nombramos
  // cuando su propio final ya fue alcanzado; por ejemplo, ...Ac5 activa
  // Giuoco Piano aunque el Gambito Evans comparta esa posición como punto
  // de partida de su continuación 4.b4.
  const completedHere = matching.filter((branch) => (branch.activationNodeId ?? branch.leafNodeId) === nodeId);
  if (completedHere.length === 1) return completedHere[0].name;
  if (matching.length === 1) return matching[0].name;
  return tree.opening;
}

export function getVariantSequence(tree: VariantTree, variant: OpeningVariant): OpeningMove[] {
  return getVariantNodePath(tree, variant)
    .map((node) => node.move)
    .filter((move): move is OpeningMove => move !== null);
}

export function getTrainingTurn(
  tree: VariantTree,
  variant: OpeningVariant,
  currentNodeId: string,
  playerColor: OpeningColor = 'white',
): TrainingTurn {
  const path = getVariantNodePath(tree, variant);
  const currentIndex = path.findIndex((node) => node.id === currentNodeId);

  if (currentIndex === -1) {
    throw new Error(`Current node "${currentNodeId}" is not part of variant "${variant.id}".`);
  }

  const remainingNodes = path.slice(currentIndex + 1);
  const playerIndex = remainingNodes.findIndex((node) => node.move?.color === playerColor);
  const playerNode = playerIndex === -1 ? null : remainingNodes[playerIndex];
  const automaticNodes: VariantNode[] = [];
  if (playerNode) {
    // Automatic moves are the opponent's moves before the next player decision.
    automaticNodes.push(...remainingNodes.slice(0, playerIndex));
  } else {
    // If the line ends after the player's last move, still play the final
    // opponent response before marking the training complete.
    automaticNodes.push(...remainingNodes.filter((node) => node.move?.color !== playerColor));
  }

  return {
    currentNode: path[currentIndex],
    playerNode,
    automaticNodes,
  };
}

export function getTrainingLength(tree: VariantTree, variant: OpeningVariant, playerColor: OpeningColor = 'white'): number {
  return getVariantSequence(tree, variant).filter((move) => move.color === playerColor).length;
}

export function isExpectedMove(expectedMove: OpeningMove | null, from: string, to: string): boolean {
  return expectedMove !== null && expectedMove.from === from && expectedMove.to === to;
}

export function getProgressiveHintLevel(errorCount: number, maxHints = 3): number {
  return Math.min(Math.max(errorCount, 0), maxHints);
}

export function calculateAccuracy(correctMoves: number, attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.round((correctMoves / attempts) * 100);
}