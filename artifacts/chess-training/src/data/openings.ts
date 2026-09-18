export type OpeningColor = 'white' | 'black';

export type OpeningMove = {
  color: OpeningColor;
  from: string;
  to: string;
  notation: string;
  explanation?: string;
  hints: [string, string, string];
};

export type OpeningVariant = {
  id: string;
  opening: string;
  name: string;
  moves: OpeningMove[];
};

export const italianGameVariants: OpeningVariant[] = [
  {
    id: 'giuoco-piano',
    opening: 'Apertura Italiana',
    name: 'Giuoco Piano',
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
        hints: ['', '', ''],
      },
    ],
  },
  {
    id: 'two-knights',
    opening: 'Apertura Italiana',
    name: 'Dos Caballos',
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
        hints: ['', '', ''],
      },
    ],
  },
];
