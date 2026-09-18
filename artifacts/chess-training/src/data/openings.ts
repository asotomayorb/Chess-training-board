export type OpeningColor = 'white' | 'black';

export type VariantTag = 'amenaza' | 'gambito' | 'desviación' | 'sacrificio' | 'cambio de plan';

export type OpeningMove = {
  color: OpeningColor;
  from: string;
  to: string;
  notation: string;
  explanation: string;
  hints: [string, string, string];
};

export type OpeningVariant = {
  id: string;
  opening: string;
  name: string;
  defense: string;
  level: string;
  tags: VariantTag[];
  typicalErrors: string[];
  /** Ordered sequence for this training branch. */
  moves: OpeningMove[];
};

export type VariantTree = {
  id: string;
  name: string;
  opening: string;
  branches: OpeningVariant[];
};

export type VariantCatalog = {
  trees: VariantTree[];
};

export const italianGameTrainingTree: VariantTree = {
  id: 'italian-game',
  name: 'Apertura Italiana',
  opening: 'Apertura Italiana',
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
    moves: [
      {
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
      },
      {
        color: 'black',
        from: 'e7',
        to: 'e5',
        notation: 'e5',
        explanation: 'Las negras ocupan el centro y mantienen simetría en la apertura.',
        hints: ['', '', ''],
      },
      {
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
      },
      {
        color: 'black',
        from: 'b8',
        to: 'c6',
        notation: 'Cc6',
        explanation: 'Las negras desarrollan una pieza y refuerzan el control de e5 y d4.',
        hints: ['', '', ''],
      },
      {
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
      },
      {
        color: 'black',
        from: 'f8',
        to: 'c5',
        notation: 'Ac5',
        explanation: 'El alfil negro se activa sobre la diagonal que apunta al centro.',
        hints: ['', '', ''],
      },
    ],
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
    moves: [
      {
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
      },
      {
        color: 'black',
        from: 'e7',
        to: 'e5',
        notation: 'e5',
        explanation: 'Las negras disputan el centro y abren líneas para sus piezas menores.',
        hints: ['', '', ''],
      },
      {
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
      },
      {
        color: 'black',
        from: 'b8',
        to: 'c6',
        notation: 'Cc6',
        explanation: 'El caballo se desarrolla hacia una casilla activa y presiona el centro.',
        hints: ['', '', ''],
      },
      {
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
      },
      {
        color: 'black',
        from: 'g8',
        to: 'f6',
        notation: 'Cf6',
        explanation: 'El segundo caballo ataca e4 y plantea la idea característica de esta defensa.',
        hints: ['', '', ''],
      },
    ],
    },
  ],
};

export const trainingVariantCatalog: VariantCatalog = {
  trees: [italianGameTrainingTree],
};

/** Compatibility export for the current Italian Game UI and future data consumers. */
export const italianGameVariants = italianGameTrainingTree.branches;
