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
    for (const node of remainingNodes.slice(playerIndex + 1)) {
      if (node.move?.color === playerColor) break;
      automaticNodes.push(node);
    }
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