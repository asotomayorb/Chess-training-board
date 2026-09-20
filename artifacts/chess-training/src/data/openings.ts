export type OpeningColor = 'white' | 'black';

export type TrainingErrorCategory =
  | 'desarrollo'
  | 'amenaza ignorada'
  | 'pérdida de tiempo'
  | 'táctica'
  | 'captura prematura'
  | 'debilitamiento'
  | 'plan incorrecto';

export type VariantTag = 'amenaza' | 'gambito' | 'desviación' | 'sacrificio' | 'cambio de plan' | (string & {});

export type OpeningMove = {
  id: string;
  color: OpeningColor;
  from: string;
  to: string;
  notation: string;
  explanation: string;
  concept: string;
  objective: string;
  threat: string;
  typicalError: string;
  /** Pedagogical category used when the player misses this decision. */
  errorCategory?: TrainingErrorCategory;
  /** Short explanation shown after an error. */
  whyWrong?: string;
  difficulty: 'fundamentos' | 'intermedio' | 'avanzado';
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
  /** Position where the specific variant name becomes active; defaults to leafNodeId. */
  activationNodeId?: string;
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
  concept: 'Desarrollo y centro',
  objective: 'Tomar espacio central y liberar el alfil de f1.',
  threat: 'La respuesta negra puede disputar inmediatamente el centro.',
  typicalError: 'Mover peones laterales o jugar sin reclamar el centro.',
  difficulty: 'fundamentos',
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
  concept: 'Lucha por el centro',
  objective: 'Igualar la disputa central y abrir líneas para el desarrollo negro.',
  threat: 'Las blancas ya amenazan con controlar más espacio central.',
  typicalError: 'Ignorar el centro y desarrollar lentamente.',
  difficulty: 'fundamentos',
  hints: ['responde al avance blanco con el peón de rey para disputar el centro.', 'El peón de e7 puede avanzar dos casillas hasta e5 y abre líneas para el alfil y la dama.', 'La jugada correcta es e5.'],
};

const italianNf3: OpeningMove = {
  id: 'italian-move-nf3',
  color: 'white',
  from: 'g1',
  to: 'f3',
  notation: 'Cf3',
  explanation: 'Desarrolla una pieza, controla e5 y prepara el enroque.',
  concept: 'Desarrollo con tempo',
  objective: 'Desarrollar una pieza hacia el centro, atacar e5 y preparar el enroque.',
  threat: 'El peón e5 queda bajo presión.',
  typicalError: 'Mover el caballo a una casilla periférica o repetir movimientos de peón.',
  difficulty: 'fundamentos',
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
  concept: 'Desarrollo y defensa',
  objective: 'Desarrollar el caballo y sostener e5 con una pieza activa.',
  threat: 'Las blancas ejercen presión sobre e5.',
  typicalError: 'Defender pasivamente sin desarrollar piezas.',
  difficulty: 'fundamentos',
  hints: ['desarrolla el caballo de dama hacia una casilla central.', 'Desde b8, el caballo puede ir a c6 y defender e5 mientras controla d4.', 'La jugada correcta es Cc6.'],
};

const italianBc4: OpeningMove = {
  id: 'italian-move-bc4',
  color: 'white',
  from: 'f1',
  to: 'c4',
  notation: 'Ac4',
  explanation: 'El alfil apunta hacia f7, una zona sensible del rey negro, y completa el desarrollo inicial.',
  concept: 'Desarrollo y presión sobre f7',
  objective: 'Completar el desarrollo inicial y crear presión sobre el punto más vulnerable de la posición negra.',
  threat: 'La diagonal hacia f7 puede generar tácticas tempranas.',
  typicalError: 'Atacar f7 demasiado pronto sin completar el desarrollo.',
  difficulty: 'fundamentos',
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
  concept: 'Desarrollo simétrico',
  objective: 'Activar el alfil, controlar el centro y mantener una estructura armoniosa.',
  threat: 'El alfil blanco ya apunta a f7.',
  typicalError: 'Perder tiempos con la misma pieza sin una razón concreta.',
  difficulty: 'fundamentos',
  hints: ['activa el alfil de rey hacia una diagonal central.', 'Desde f8, el alfil puede ocupar c5 y mirar hacia f2.', 'La jugada correcta es Ac5.'],
};

const italianNf6: OpeningMove = {
  id: 'italian-move-nf6',
  color: 'black',
  from: 'g8',
  to: 'f6',
  notation: 'Cf6',
  explanation: 'El segundo caballo ataca e4 y plantea la idea característica de esta defensa.',
  concept: 'Desarrollo con ataque',
  objective: 'Desarrollar el caballo atacando e4 y obligando a las blancas a responder con criterio.',
  threat: 'El peón e4 queda directamente atacado.',
  typicalError: 'Ignorar la amenaza sobre e4 y jugar una jugada lenta.',
  difficulty: 'fundamentos',
  hints: ['busca la segunda pieza menor que puede atacar directamente el centro blanco.', 'El caballo de g8 puede saltar a f6 y presionar e4.', 'La jugada correcta es Cf6.'],
};

const italianBe7: OpeningMove = {
  id: 'italian-move-be7',
  color: 'black',
  from: 'f8',
  to: 'e7',
  notation: 'Ae7',
  explanation: 'Las negras desarrollan el alfil de forma sólida y reducen la presión directa sobre f7.',
  concept: 'Defensa sólida',
  objective: 'Completar el desarrollo y mantener una posición compacta.',
  threat: 'Las blancas conservan más espacio y pueden preparar el enroque.',
  typicalError: 'Buscar tácticas inmediatas sin terminar el desarrollo.',
  difficulty: 'intermedio',
  hints: ['busca una respuesta sólida que desarrolle el alfil sin entrar en la línea de Ac5.', 'El alfil de f8 puede retirarse a e7, preparando un desarrollo compacto.', 'La jugada correcta es Ae7.'],
};

const hungarianD4: OpeningMove = {
  id: 'italian-move-hungarian-d4',
  color: 'white',
  from: 'd2',
  to: 'd4',
  notation: 'd4',
  explanation: 'Las blancas abren el centro mientras las negras aún completan su desarrollo.',
  concept: 'Ruptura central',
  objective: 'Abrir líneas y aprovechar la ventaja de espacio sin retrasar el desarrollo.',
  threat: 'La presión central puede obligar a las negras a definir la estructura.',
  typicalError: 'Abrir el centro sin comprobar qué capturas quedan disponibles.',
  difficulty: 'intermedio',
  hints: ['busca la ruptura de peón que desafía directamente el centro negro.', 'El peón de d2 puede avanzar dos casillas hasta d4.', 'La jugada correcta es d4.'],
};

const hungarianExd4: OpeningMove = {
  id: 'italian-move-hungarian-exd4',
  color: 'black',
  from: 'e5',
  to: 'd4',
  notation: 'exd4',
  explanation: 'Las negras aceptan la ruptura y cambian la estructura central antes de completar el desarrollo.',
  concept: 'Respuesta central',
  objective: 'Resolver la tensión del centro y evitar quedar pasivas.',
  threat: 'El peón negro ocupa d4 y condiciona la recaptura blanca.',
  typicalError: 'Ignorar la tensión central y perder la oportunidad de simplificarla.',
  difficulty: 'intermedio',
  hints: ['responde a la ruptura central capturando el peón que acaba de entrar en d4.', 'El peón de e5 puede capturar en d4.', 'La jugada correcta es exd4.'],
};

const hungarianNxd4: OpeningMove = {
  id: 'italian-move-hungarian-nxd4',
  color: 'white',
  from: 'f3',
  to: 'd4',
  notation: 'Cxd4',
  explanation: 'El caballo recaptura en d4 y queda centralizado después de la ruptura.',
  concept: 'Recaptura con desarrollo',
  objective: 'Recuperar el peón manteniendo una pieza activa en el centro.',
  threat: 'El caballo centralizado aumenta la presión sobre las casillas centrales.',
  typicalError: 'Recapturar automáticamente sin comprobar las piezas que pueden atacar al caballo.',
  difficulty: 'intermedio',
  hints: ['recaptura con una pieza desarrollada y centraliza el caballo.', 'El caballo de f3 puede capturar en d4.', 'La jugada correcta es Cxd4.'],
};

const italianB4: OpeningMove = {
  id: 'italian-move-b4',
  color: 'white',
  from: 'b2',
  to: 'b4',
  notation: 'b4',
  explanation: 'El peón de b4 ofrece un peón para desviar al alfil negro y ganar tiempos de desarrollo.',
  concept: 'Gambito y ganancia de tiempos',
  objective: 'Desviar el alfil de c5 y aprovechar la pérdida de tiempos de las negras.',
  threat: 'El peón b4 ataca al alfil de c5.',
  typicalError: 'Jugar el gambito sin considerar la recuperación del peón y el desarrollo.',
  difficulty: 'avanzado',
  hints: [
    'busca una ruptura de peón en el flanco de dama que ataque al alfil.',
    'El peón de b2 puede avanzar dos casillas desde la posición inicial.',
    'La jugada correcta es b4.',
  ],
};

const italianBxb4: OpeningMove = {
  id: 'italian-move-bxb4',
  color: 'black',
  from: 'c5',
  to: 'b4',
  notation: 'Axb4',
  explanation: 'Las negras aceptan el peón y deben prepararse para la presión y el desarrollo rápido de las blancas.',
  concept: 'Aceptación del gambito',
  objective: 'Capturar el peón sin perder de vista el desarrollo y la seguridad del rey.',
  threat: 'Las blancas pueden jugar c3 para ganar otro tiempo sobre el alfil.',
  typicalError: 'Aferrarse al material y olvidar el desarrollo.',
  difficulty: 'avanzado',
  hints: ['el alfil de c5 puede capturar el peón que acaba de avanzar a b4.', 'Acepta el gambito solo después de comprobar qué tiempos concede a las blancas.', 'La jugada correcta es Axb4.'],
};

const italianC3: OpeningMove = {
  id: 'italian-move-c3',
  color: 'white',
  from: 'c2',
  to: 'c3',
  notation: 'c3',
  explanation: 'El peón prepara d4 y ataca indirectamente al alfil, buscando abrir el centro con ganancia de tiempos.',
  concept: 'Preparación de d4',
  objective: 'Construir un centro fuerte y continuar ganando tiempos de desarrollo.',
  threat: 'La ruptura d4 puede abrir el centro mientras el alfil negro busca seguridad.',
  typicalError: 'Jugar c3 sin una idea central clara.',
  difficulty: 'avanzado',
  hints: [
    'piensa qué peón puede preparar una ruptura central y ganar espacio.',
    'El peón de c2 puede avanzar una casilla.',
    'La jugada correcta es c3.',
  ],
};

const italianBa5: OpeningMove = {
  id: 'italian-move-ba5',
  color: 'black',
  from: 'b4',
  to: 'a5',
  notation: 'Aa5',
  explanation: 'El alfil se retira y conserva su diagonal mientras las negras intentan completar el desarrollo.',
  concept: 'Retirada con propósito',
  objective: 'Salvar el alfil manteniendo actividad y preparar la defensa del centro.',
  threat: 'Las blancas pueden continuar con d4 y abrir el centro.',
  typicalError: 'Retirar una pieza sin considerar qué casillas y tiempos conserva.',
  difficulty: 'avanzado',
  hints: ['retira el alfil atacado conservando una diagonal activa.', 'Desde b4, la casilla a5 mantiene el alfil fuera del alcance inmediato del peón c3.', 'La jugada correcta es Aa5.'],
};

const italianNg5: OpeningMove = {
  id: 'italian-move-ng5',
  color: 'white',
  from: 'f3',
  to: 'g5',
  notation: 'Cg5',
  explanation: 'El caballo entra en g5 para aumentar la presión sobre f7 y crear amenazas tácticas.',
  concept: 'Presión táctica',
  objective: 'Concentrar piezas sobre f7 y forzar una respuesta precisa.',
  threat: 'La presión sobre f7 puede generar tácticas contra el rey negro.',
  typicalError: 'Lanzar el caballo sin calcular la respuesta central ...d5.',
  difficulty: 'avanzado',
  hints: ['busca una casilla activa para el caballo que ya está en f3.', 'El caballo puede saltar a g5 y aumentar la presión sobre f7.', 'La jugada correcta es Cg5.'],
};

const italianD5: OpeningMove = {
  id: 'italian-move-d5',
  color: 'black',
  from: 'd7',
  to: 'd5',
  notation: 'd5',
  explanation: 'Las negras contraatacan en el centro para responder a la presión sobre f7 y liberar líneas.',
  concept: 'Contraataque central',
  objective: 'Golpear el centro antes de que las blancas concreten su ataque.',
  threat: 'El peón e4 queda expuesto a cambios y capturas en el centro.',
  typicalError: 'Defender pasivamente f7 y permitir que las blancas acumulen piezas.',
  difficulty: 'avanzado',
  hints: ['en lugar de defender pasivamente f7, golpea el centro de inmediato.', 'El peón de d7 puede avanzar a d5 para atacar el centro blanco y abrir líneas.', 'La jugada correcta es d5.'],
};

const italianExd5: OpeningMove = {
  id: 'italian-move-exd5',
  color: 'white',
  from: 'e4',
  to: 'd5',
  notation: 'exd5',
  explanation: 'Las blancas aceptan el cambio central y abren líneas para sus piezas.',
  concept: 'Apertura del centro',
  objective: 'Aclarar la tensión central y mantener la iniciativa.',
  threat: 'El caballo negro de f6 puede recuperar en d5.',
  typicalError: 'Capturar automáticamente sin considerar el desarrollo posterior.',
  difficulty: 'avanzado',
  hints: ['responde a la ruptura negra resolviendo la tensión central.', 'El peón de e4 puede capturar en d5 y abrir líneas para las piezas blancas.', 'La jugada correcta es exd5.'],
};

const italianNxd5: OpeningMove = {
  id: 'italian-move-nxd5',
  color: 'black',
  from: 'f6',
  to: 'd5',
  notation: 'Cxd5',
  explanation: 'El caballo recupera el peón y centraliza su posición.',
  concept: 'Recaptura y centralización',
  objective: 'Recuperar material mientras se mantiene una pieza activa en el centro.',
  threat: 'Las blancas pueden explotar la posición del caballo con presión sobre f7.',
  typicalError: 'Recapturar sin evaluar las amenazas tácticas sobre f7.',
  difficulty: 'avanzado',
  hints: ['recupera el peón con una pieza desarrollada.', 'El caballo de f6 puede capturar en d5 y ocupar una casilla central activa.', 'La jugada correcta es Cxd5.'],
};

const italianNxf7: OpeningMove = {
  id: 'italian-move-nxf7',
  color: 'white',
  from: 'g5',
  to: 'f7',
  notation: 'Cxf7',
  explanation: 'El caballo captura en f7 y fuerza al rey negro a responder, entrando en una secuencia táctica conocida.',
  concept: 'Ataque al rey',
  objective: 'Explotar la vulnerabilidad de f7 y obtener iniciativa mediante amenazas concretas.',
  threat: 'El caballo ataca la torre h8 y crea amenazas contra el rey.',
  typicalError: 'Confundir la táctica con un simple sacrificio sin calcular la continuación.',
  difficulty: 'avanzado',
  hints: ['busca la captura táctica sobre el punto f7.', 'El caballo de g5 puede tomar f7 y atacar la torre h8, creando una secuencia forzada.', 'La jugada correcta es Cxf7.'],
};

const italianGiuocoPianoLeaf: VariantNode = {
  id: 'italian-node-bc5',
  move: italianBc5,
  children: [],
};

const italianEvansBa5Node: VariantNode = {
  id: 'italian-node-ba5',
  move: italianBa5,
  children: [],
};

const italianEvansC3Node: VariantNode = {
  id: 'italian-node-c3',
  move: italianC3,
  children: [italianEvansBa5Node],
};

const italianEvansBxb4Node: VariantNode = {
  id: 'italian-node-bxb4',
  move: italianBxb4,
  children: [italianEvansC3Node],
};

const italianEvansB4Node: VariantNode = {
  id: 'italian-node-b4',
  move: italianB4,
  children: [italianEvansBxb4Node],
};

italianGiuocoPianoLeaf.children.push(italianEvansB4Node);

const italianHungarianNxd4Leaf: VariantNode = {
  id: 'italian-node-hungarian-nxd4',
  move: hungarianNxd4,
  children: [],
};

const italianHungarianExd4Node: VariantNode = {
  id: 'italian-node-hungarian-exd4',
  move: hungarianExd4,
  children: [italianHungarianNxd4Leaf],
};

const italianHungarianD4Node: VariantNode = {
  id: 'italian-node-hungarian-d4',
  move: hungarianD4,
  children: [italianHungarianExd4Node],
};

const italianHungarianLeaf: VariantNode = {
  id: 'italian-node-be7',
  move: italianBe7,
  children: [italianHungarianD4Node],
};

const italianFriedLiverLeaf: VariantNode = {
  id: 'italian-node-nxf7',
  move: italianNxf7,
  children: [],
};

const italianNxd5Node: VariantNode = {
  id: 'italian-node-nxd5',
  move: italianNxd5,
  children: [italianFriedLiverLeaf],
};

const italianExd5Node: VariantNode = {
  id: 'italian-node-exd5',
  move: italianExd5,
  children: [italianNxd5Node],
};

const italianD5Node: VariantNode = {
  id: 'italian-node-d5',
  move: italianD5,
  children: [italianExd5Node],
};

const italianNg5Node: VariantNode = {
  id: 'italian-node-ng5',
  move: italianNg5,
  children: [italianD5Node],
};

const italianTwoKnightsLeaf: VariantNode = {
  id: 'italian-node-nf6',
  move: italianNf6,
  children: [italianNg5Node],
};

const italianBc4Node: VariantNode = {
  id: 'italian-node-bc4',
  move: italianBc4,
  children: [italianGiuocoPianoLeaf, italianTwoKnightsLeaf, italianHungarianLeaf],
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
    {
      id: 'fried-liver',
      opening: 'Apertura Italiana',
      name: 'Ataque Fegatello',
      defense: 'Dos Caballos · línea táctica',
      level: 'Avanzado',
      tags: ['amenaza', 'sacrificio'],
      typicalErrors: [
        'Jugar Cg5 sin calcular la respuesta ...d5.',
        'Capturar en f7 sin valorar las amenazas posteriores.',
      ],
      startNodeId: 'italian-root',
      leafNodeId: 'italian-node-nxf7',
    },
    {
      id: 'evans-gambit',
      opening: 'Apertura Italiana',
      name: 'Gambito Evans',
      defense: 'Gambito sobre c5',
      level: 'Avanzado',
      tags: ['gambito', 'cambio de plan'],
      typicalErrors: [
        'Jugar b4 sin entender la compensación por el peón.',
        'Buscar recuperar el peón en lugar de desarrollar con tiempos.',
      ],
      startNodeId: 'italian-root',
      leafNodeId: 'italian-node-ba5',
    },
    {
      id: 'hungarian-defense',
      opening: 'Apertura Italiana',
      name: 'Defensa Húngara',
      defense: '3...Ae7',
      level: 'Intermedio',
      tags: ['cambio de plan'],
      typicalErrors: [
        'Esperar la misma estructura que en la Defensa Clásica.',
        'No adaptar el plan cuando las negras renuncian a ...Ac5.',
      ],
      startNodeId: 'italian-root',
      leafNodeId: 'italian-node-hungarian-nxd4',
      activationNodeId: 'italian-node-be7',
    },
  ],
};

export const trainingVariantCatalog: VariantCatalog = {
  trees: [italianGameTrainingTree],
};

/** Compatibility export for consumers that still need the two Italian branches. */
export const italianGameVariants = italianGameTrainingTree.branches;