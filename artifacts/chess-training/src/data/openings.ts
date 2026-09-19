export type OpeningColor = 'white' | 'black';

export type VariantTag = 'amenaza' | 'gambito' | 'desviación' | 'sacrificio' | 'cambio de plan' | (string & {});

export type OpeningMove = {
  id: string;
  color: OpeningColor;
  from: string;
  to: string;
  notation: string;
  explanation: string;
  hints: [string, string, string];
};

export type VariantNode = {
  /** Stable identifier for the position reached after this node's move. */
  id: string;
  move: OpeningMove | null;
  children: VariantNode[];
};

export type OpeningVariant = {
  id: string;
  opening: string;
  name: string;
  defense: string;
  level: string;
  tags: VariantTag[];
  typicalErrors: string[];
  /** The training line is the path from startNodeId to leafNodeId in the tree. */
  startNodeId: string;
  leafNodeId: string;
};

export type VariantTree = {
  id: string;
  name: string;
  opening: string;
  root: VariantNode;
  branches: OpeningVariant[];
};

export type VariantCatalog = {
  trees: VariantTree[];
};

const italianE4: OpeningMove = {
  id: 'italian-move-e4',
  color: 'white',
  from: 'e2',
  to: 'e4',
  notation: 'e4',
  explanation: 'Controla el centro y abre líneas para el alfil de f1 y la dama.',
  hints: [
    'busca una jugada de peón que dispute el centro desde el primer movimiento.',
    'El peón de rey puede avanzar dos casillas y dejar libre a tu alfil.',
    'La jugada correcta es e4.',
  ],
};

const italianE5: OpeningMove = {
  id: 'italian-move-e5',
  color: 'black',
  from: 'e7',
  to: 'e5',
  notation: 'e5',
  explanation: 'Las negras ocupan el centro y abren líneas para sus piezas menores.',
  hints: ['', '', ''],
};

const italianNf3: OpeningMove = {
  id: 'italian-move-nf3',
  color: 'white',
  from: 'g1',
  to: 'f3',
  notation: 'Cf3',
  explanation: 'Desarrolla una pieza, controla e5 y prepara el enroque.',
  hints: [
    'desarrolla tu caballo de rey hacia una casilla central activa.',
    'El caballo puede atacar e5 y ocupar f3 desde g1.',
    'La jugada correcta es Cf3.',
  ],
};

const italianNc6: OpeningMove = {
  id: 'italian-move-nc6',
  color: 'black',
  from: 'b8',
  to: 'c6',
  notation: 'Cc6',
  explanation: 'Las negras desarrollan una pieza y refuerzan el control de e5 y d4.',
  hints: ['', '', ''],
};

const italianBc4: OpeningMove = {
  id: 'italian-move-bc4',
  color: 'white',
  from: 'f1',
  to: 'c4',
  notation: 'Ac4',
  explanation: 'El alfil apunta hacia f7, una zona sensible del rey negro, y completa el desarrollo inicial.',
  hints: [
    'activa el alfil que quedó libre después de avanzar el peón de rey.',
    'Desde c4, el alfil mira directamente hacia f7.',
    'La jugada correcta es Ac4.',
  ],
};

const italianBc5: OpeningMove = {
  id: 'italian-move-bc5',
  color: 'black',
  from: 'f8',
  to: 'c5',
  notation: 'Ac5',
  explanation: 'El alfil negro se activa sobre la diagonal que apunta al centro.',
  hints: ['', '', ''],
};

const italianNf6: OpeningMove = {
  id: 'italian-move-nf6',
  color: 'black',
  from: 'g8',
  to: 'f6',
  notation: 'Cf6',
  explanation: 'El segundo caballo ataca e4 y plantea la idea característica de esta defensa.',
  hints: ['', '', ''],
};

const italianGiuocoPianoLeaf: VariantNode = {
  id: 'italian-node-bc5',
  move: italianBc5,
  children: [],
};

const italianTwoKnightsLeaf: VariantNode = {
  id: 'italian-node-nf6',
  move: italianNf6,
  children: [],
};

const italianBc4Node: VariantNode = {
  id: 'italian-node-bc4',
  move: italianBc4,
  children: [italianGiuocoPianoLeaf, italianTwoKnightsLeaf],
};

const italianNc6Node: VariantNode = {
  id: 'italian-node-nc6',
  move: italianNc6,
  children: [italianBc4Node],
};

const italianNf3Node: VariantNode = {
  id: 'italian-node-nf3',
  move: italianNf3,
  children: [italianNc6Node],
};

const italianE5Node: VariantNode = {
  id: 'italian-node-e5',
  move: italianE5,
  children: [italianNf3Node],
};

const italianE4Node: VariantNode = {
  id: 'italian-node-e4',
  move: italianE4,
  children: [italianE5Node],
};

const italianRoot: VariantNode = {
  id: 'italian-root',
  move: null,
  children: [italianE4Node],
};

export const italianGameTrainingTree: VariantTree = {
  id: 'italian-game',
  name: 'Apertura Italiana',
  opening: 'Apertura Italiana',
  root: italianRoot,
  branches: [
    {
      id: 'giuoco-piano',
      opening: 'Apertura Italiana',
      name: 'Giuoco Piano',
      defense: 'Defensa clásica',
      level: 'Fundamentos',
      tags: ['cambio de plan'],
      typicalErrors: [
        'Retrasar el desarrollo del caballo de rey.',
        'Mover el mismo peón varias veces antes de completar el desarrollo.',
      ],
      startNodeId: 'italian-root',
      leafNodeId: 'italian-node-bc5',
    },
    {
      id: 'two-knights',
      opening: 'Apertura Italiana',
      name: 'Dos Caballos',
      defense: 'Defensa de los Dos Caballos',
      level: 'Fundamentos',
      tags: ['amenaza', 'cambio de plan'],
      typicalErrors: [
        'Confundir la casilla de desarrollo del caballo de rey.',
        'No reconocer la presión temprana sobre el centro blanco.',
      ],
      startNodeId: 'italian-root',
      leafNodeId: 'italian-node-nf6',
    },
  ],
};

export const trainingVariantCatalog: VariantCatalog = {
  trees: [italianGameTrainingTree],
};

/** Compatibility export for consumers that still need the two Italian branches. */
export const italianGameVariants = italianGameTrainingTree.branches;