import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, CircleHelp, Clock3, Crown, Lightbulb, LogOut, RotateCcw, Target, XCircle } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { trainingVariantCatalog, type OpeningColor, type OpeningMove } from '@/data/openings';
import {
  calculateAccuracy,
  chooseRandomVariant,
  getProgressiveHintLevel,
  getTrainingTurn,
  isExpectedMove,
  type VariantSelection,
} from '@/engine/variant-engine';
import {
  applyBoardMove,
  cloneBoard,
  getGameStatus,
  getLegalMoves,
  makeInitialBoard,
  squareFromName,
  type Board,
  type PieceType,
  type Side,
  type Square,
} from '@/engine/chess-engine';

type PracticeMode = 'free' | 'opening';
type TrainingSideChoice = OpeningColor | 'random';
type DifficultMove = {
  nodeId: string;
  notation: string;
  errors: number;
  hintsUsed: number;
};

const queryClient = new QueryClient();
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const symbols: Record<Side, Record<PieceType, string>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

function squareName(square: Square) {
  return `${files[square.col]}${8 - square.row}`;
}

function applyOpeningMove(board: Board, move: OpeningMove): Board {
  const nextBoard = cloneBoard(board);
  const from = squareFromName(move.from);
  const to = squareFromName(move.to);
  nextBoard[to.row][to.col] = nextBoard[from.row][from.col];
  nextBoard[from.row][from.col] = null;
  return nextBoard;
}

function chooseVariant(): VariantSelection {
  return chooseRandomVariant(trainingVariantCatalog);
}

function Home() {
  const [board, setBoard] = useState<Board>(() => makeInitialBoard());
  const [mode, setMode] = useState<PracticeMode>('free');
  const [turn, setTurn] = useState<Side>('white');
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [focusCue, setFocusCue] = useState('Antes de mover, identifica la tensión de la posición.');
  const [showGuide, setShowGuide] = useState(false);
  const [trainingSelection, setTrainingSelection] = useState<VariantSelection | null>(null);
  const [trainingPlayerColor, setTrainingPlayerColor] = useState<OpeningColor>('white');
  const [openingNodeId, setOpeningNodeId] = useState<string | null>(null);
  const [trainingErrors, setTrainingErrors] = useState(0);
  const [moveErrors, setMoveErrors] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [trainingHintsUsed, setTrainingHintsUsed] = useState(0);
  const [trainingAttempts, setTrainingAttempts] = useState(0);
  const [trainingCorrectMoves, setTrainingCorrectMoves] = useState(0);
  const [difficultMoves, setDifficultMoves] = useState<DifficultMove[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'incorrect' | 'correct' | 'complete'>('idle');
  const [trainingExplanation, setTrainingExplanation] = useState('');

  const legalMoves = useMemo(
    () => (selected ? getLegalMoves(board, selected) : []),
    [board, selected],
  );

  const legalKeySet = useMemo(
    () => new Set(legalMoves.map((move) => `${move.row}-${move.col}`)),
    [legalMoves],
  );

  const openingVariant = trainingSelection?.variant ?? null;
  const openingTree = trainingSelection?.tree ?? null;
  const trainingTurno = mode === 'opening' && openingTree && openingVariant && openingNodeId
    ? getTrainingTurn(openingTree, openingVariant, openingNodeId, trainingPlayerColor)
    : null;
  const expectedNode = trainingTurno?.playerNode ?? null;
  const expectedMove = expectedNode?.move ?? null;
  const trainingComplete = mode === 'opening' && openingVariant !== null && trainingTurno !== null && trainingTurno.playerNode === null;
  const trainingAccuracy = calculateAccuracy(trainingCorrectMoves, trainingAttempts);
  const freeGameStatus = mode === 'free' ? getGameStatus(board, turn) : null;
  const freeGameOver = freeGameStatus === 'checkmate' || freeGameStatus === 'stalemate';
  const freeTurnoLabel = turn === 'white' ? 'blancas' : 'negras';
  const freeWinnerLabel = turn === 'white' ? 'negras' : 'blancas';

  const resetFreePractice = () => {
    setBoard(makeInitialBoard());
    setMode('free');
    setTurn('white');
    setSelected(null);
    setLastMove(null);
    setMoveHistory([]);
    setFocusCue('Antes de mover, identifica la tensión de la posición.');
    setTrainingSelection(null);
    setTrainingPlayerColor('white');
    setOpeningNodeId(null);
    setTrainingErrors(0);
    setMoveErrors(0);
    setHintLevel(0);
    setTrainingHintsUsed(0);
    setTrainingAttempts(0);
    setTrainingCorrectMoves(0);
    setDifficultMoves([]);
    setTrainingStatus('idle');
    setTrainingExplanation('');
  };

  const startOpeningTraining = (
    selection = chooseVariant(),
    sideChoice: TrainingSideChoice = 'random',
  ) => {
    const playerColor: OpeningColor = sideChoice === 'random'
      ? (Math.random() < 0.5 ? 'white' : 'black')
      : sideChoice;
    const initialBoard = makeInitialBoard();
    const initialTurn = getTrainingTurn(selection.tree, selection.variant, selection.variant.startNodeId, playerColor);
    const initialAutomaticMoves = initialTurn.automaticNodes.flatMap((node) => (node.move ? [node.move] : []));
    const trainingBoard = initialAutomaticMoves.reduce(
      (currentBoard, move) => applyOpeningMove(currentBoard, move),
      initialBoard,
    );

    setBoard(trainingBoard);
    setMode('opening');
    setTurn(playerColor);
    setSelected(null);
    setLastMove(null);
    setMoveHistory(initialAutomaticMoves.map((move) => move.notation));
    setTrainingSelection(selection);
    setTrainingPlayerColor(playerColor);
    setOpeningNodeId(
      initialAutomaticMoves.length
        ? initialTurn.automaticNodes[initialTurn.automaticNodes.length - 1].id
        : selection.variant.startNodeId,
    );
    setTrainingErrors(0);
    setMoveErrors(0);
    setHintLevel(0);
    setTrainingHintsUsed(0);
    setTrainingAttempts(0);
    setTrainingCorrectMoves(0);
    setDifficultMoves([]);
    setTrainingStatus('idle');
    setTrainingExplanation('');
  };

  const resetTraining = () => {
    startOpeningTraining(trainingSelection ?? chooseVariant(), trainingPlayerColor);
  };

  const exitTraining = () => {
    resetFreePractice();
  };

  const resetGame = () => {
    if (mode === 'opening') {
      resetTraining();
      return;
    }
    resetFreePractice();
  };

  const handleOpeningMove = (from: Square, to: Square) => {
    if (!expectedMove || !expectedNode || !openingVariant || !openingTree || !trainingTurno) return;

    const fromName = squareName(from);
    const toName = squareName(to);
    const isCorrect = isExpectedMove(expectedMove, fromName, toName);

    if (!isCorrect) {
      const nextMoveErrors = moveErrors + 1;
      const previousHintLevel = getProgressiveHintLevel(moveErrors);
      const nextHintLevel = getProgressiveHintLevel(nextMoveErrors);
      setTrainingErrors((errors) => errors + 1);
      setTrainingAttempts((attempts) => attempts + 1);
      setMoveErrors(nextMoveErrors);
      setHintLevel(nextHintLevel);
      if (nextHintLevel > previousHintLevel) {
        setTrainingHintsUsed((hints) => hints + 1);
      }
      setDifficultMoves((moves) => {
        const existingMove = moves.find((move) => move.nodeId === expectedNode.id);
        if (existingMove) {
          return moves.map((move) => (
            move.nodeId === expectedNode.id
              ? { ...move, errors: nextMoveErrors, hintsUsed: Math.max(move.hintsUsed, nextHintLevel) }
              : move
          ));
        }
        return [...moves, { nodeId: expectedNode.id, notation: expectedMove.notation, errors: nextMoveErrors, hintsUsed: nextHintLevel }];
      });
      setTrainingStatus('incorrect');
      setTrainingExplanation('');
      setSelected(null);
      return;
    }

    const automaticMoves = trainingTurno.automaticNodes
      .flatMap((node) => (node.move ? [node.move] : []));
    const nextBoard = [expectedMove, ...automaticMoves].reduce(
      (currentBoard, move) => applyOpeningMove(currentBoard, move),
      board,
    );
    const lastAutomaticNode = trainingTurno.automaticNodes[trainingTurno.automaticNodes.length - 1];
    const nextNodeId = lastAutomaticNode?.id ?? expectedNode.id;
    const nextTrainingTurno = getTrainingTurn(openingTree, openingVariant, nextNodeId, trainingPlayerColor);
    const isLastPlayerMove = nextTrainingTurno.playerNode === null;
    const lastAppliedMove = automaticMoves[automaticMoves.length - 1] ?? expectedMove;

    setBoard(nextBoard);
    setLastMove([lastAppliedMove.from, lastAppliedMove.to]);
    setMoveHistory((history) => [
      ...history,
      expectedMove.notation,
      ...automaticMoves.map((move) => move.notation),
    ]);
    setSelected(null);
    setOpeningNodeId(nextNodeId);
    setMoveErrors(0);
    setHintLevel(0);
    setTrainingAttempts((attempts) => attempts + 1);
    setTrainingCorrectMoves((moves) => moves + 1);
    setTrainingExplanation([`Idea: ${expectedMove.concept}`, `Objetivo: ${expectedMove.objective}`, `Amenaza/clave: ${expectedMove.threat}`, `Error típico: ${expectedMove.typicalError}`, `Nivel: ${expectedMove.difficulty}`, expectedMove.explanation].join('\n'));
    setTrainingStatus(isLastPlayerMove ? 'complete' : 'correct');
  };

  const handleSquareClick = (row: number, col: number) => {
    if (mode === 'opening' && trainingComplete) {
      setSelected(null);
      return;
    }
    if (mode === 'free' && freeGameOver) {
      setSelected(null);
      return;
    }

    const clickedPiece = board[row][col];
    const clickedIsLegal = legalKeySet.has(`${row}-${col}`);

    if (selected && clickedIsLegal) {
      if (mode === 'opening') {
        handleOpeningMove(selected, { row, col });
        return;
      }

      const from = squareName(selected);
      const to = squareName({ row, col });
      const nextBoard = applyBoardMove(board, { from: selected, to: { row, col } });
      setBoard(nextBoard);
      setLastMove([from, to]);
      setMoveHistory((history) => [...history, `${from}–${to}`]);
      setSelected(null);
      setTurn((current) => (current === 'white' ? 'black' : 'white'));
      setFocusCue('Bien. Ahora observa qué cambió antes de buscar la siguiente jugada.');
      return;
    }

    if (clickedPiece?.color === turn) {
      setSelected({ row, col });
      setFocusCue('Respira. Busca la jugada forzada y compruébala dos veces.');
      return;
    }

    setSelected(null);
  };

  return (
    <div className="app-grain min-h-[100dvh] overflow-x-hidden bg-[#e9e3d5]">
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1600px]">
        <aside className="hidden w-[238px] shrink-0 flex-col border-r border-[#d3cbb9] bg-[#ded6c6] px-5 py-7 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#1f5b49] text-[#f4ecd9] shadow-[0_8px_18px_rgba(31,91,73,.18)]">
              <Crown size={20} strokeBidth={1.8} />
            </div>
            <div>
              <p className="text-[15px] font-extrabold tracking-[-0.03em] text-[#243630]">The Quiet Board</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#718076]">sala de práctica</p>
            </div>
          </div>

          <div className="mt-14">
            <p className="px-3 font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-[#7d887b]">Tu espacio</p>
            <div className="mt-3 space-y-1 rounded-xl border border-[#c9c0ae] bg-[#e9e3d5] p-1.5">
              <button
                type="button"
                onClick={() => startOpeningTraining(undefined, trainingPlayerColor)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${mode === 'opening' ? 'bg-[#f3eee3] shadow-sm' : 'hover:bg-[#e5ddce]'}`}
              >
                <Target size={16} className="text-[#1f5b49]" />
                <span className="text-[12px] font-bold text-[#2c4039]">Entrenamiento de aperturas</span>
                {mode === 'opening' && <span className="ml-auto size-1.5 rounded-full bg-[#c38a3d]" />}
              </button>
              <button
                type="button"
                onClick={exitTraining}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${mode === 'free' ? 'bg-[#f3eee3] shadow-sm' : 'hover:bg-[#e5ddce]'}`}
              >
                <BookOpen size={16} className="text-[#6f8177]" />
                <span className="text-[12px] font-bold text-[#2c4039]">Práctica libre</span>
                {mode === 'free' && <span className="ml-auto size-1.5 rounded-full bg-[#c38a3d]" />}
              </button>
            </div>
          </div>

          <div className="mt-auto space-y-5">
            <div className="border-t border-[#c9c0ae] pt-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#7d887b]">Sesión</p>
                <Clock3 size={14} className="text-[#809087]" />
              </div>
              <p className="mt-2 font-mono text-[24px] tracking-[-0.08em] text-[#334940]">00:12:48</p>
              <p className="mt-1 text-[11px] text-[#738078]">Un comienzo tranquilo sigue siendo un comienzo.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide((current) => !current)}
              data-testid="button-open-guide"
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[#5f7067] transition-colors hover:bg-[#d4ccbb] hover:text-[#1f5b49]"
            >
              <CircleHelp size={16} />
              <span className="text-[11px] font-bold">Cómo usar esta sala</span>
              <ChevronDown size={14} className={`ml-auto transition-transform ${showGuide ? 'rotate-180' : ''}`} />
            </button>
            {showGuide && (
              <p className="rounded-lg bg-[#d4ccbb] px-3 py-2 text-[10px] leading-relaxed text-[#5f7067]">
                Selecciona una pieza y luego su destino. Puedes practicar con ambos bandos.
              </p>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex min-h-[76px] items-center justify-between border-b border-[#d6cebd] px-5 py-5 sm:px-8 lg:px-12">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-lg bg-[#1f5b49] text-[#f4ecd9]">
                <Crown size={18} />
              </div>
              <div>
                <p className="text-[13px] font-extrabold tracking-[-0.03em] text-[#243630]">The Quiet Board</p>
                <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#718076]">sala de práctica</p>
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#7d887b]">Sala de entrenamiento</p>
              <h1 className="mt-1 text-[18px] font-extrabold tracking-[-0.04em] text-[#263a33]">Una posición que merece tu atención.</h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden items-center gap-2 rounded-full border border-[#cfc5b3] bg-[#e5dece] px-3 py-1.5 sm:flex">
                <span className="size-1.5 rounded-full bg-[#c38a3d]" />
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#64766c]">tablero local</span>
              </div>
               <button
                 type="button"
                 onClick={() => (mode === 'opening' ? exitTraining() : startOpeningTraining())}
                 data-testid="button-toggle-training"
                 className="group flex items-center gap-2 rounded-lg border border-[#c6bdac] bg-[#f1ebdf] px-3 py-2 text-[11px] font-bold text-[#40564b] transition-all hover:-translate-y-0.5 hover:border-[#1f5b49] hover:text-[#1f5b49] active:translate-y-0"
               >
                 {mode === 'opening' ? <LogOut size={14} /> : <Target size={14} />}
                 <span className="hidden sm:inline">{mode === 'opening' ? 'Salir del entrenamiento' : 'Entrenamiento de aperturas'}</span>
               </button>
              <button
                type="button"
                onClick={resetGame}
                data-testid="button-reset-header"
                className="group flex items-center gap-2 rounded-lg border border-[#c6bdac] bg-[#f1ebdf] px-3 py-2 text-[11px] font-bold text-[#40564b] transition-all hover:-translate-y-0.5 hover:border-[#1f5b49] hover:text-[#1f5b49] active:translate-y-0"
              >
                <RotateCcw size={14} className="transition-transform group-hover:-rotate-45" />
                 <span className="hidden sm:inline">{mode === 'opening' ? 'Reiniciar entrenamiento' : 'Nueva partida'}</span>
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1260px] px-5 pb-12 pt-7 sm:px-8 sm:pt-10 lg:px-12 lg:pt-12">
            <div className="mb-8 flex items-end justify-between gap-5 fade-up">
              <div>
                <div className="mb-3 flex items-center gap-2">
                   <span className="rounded-full bg-[#c38a3d] px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.17em] text-[#2d3a31]">{mode === 'opening' ? 'entrenamiento 01' : 'estudio 01'}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-[#829087]">/</span>
                   <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-[#829087]">{mode === 'opening' ? 'apertura italiana' : 'la primera decisión'}</span>
                </div>
                 {mode === 'opening' ? (
                   <>
                     <h2 className="max-w-[580px] text-[clamp(2rem,4vw,3.5rem)] font-extrabold leading-[0.98] tracking-[-0.075em] text-[#20362e]">
                       Entrenamiento de<br className="hidden sm:block" /> Aperturas
                     </h2>
                     <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="training-side-selector">
                       <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b897f]">Jugar con</span>
                       {([
                         ['white', 'Blancas'],
                         ['black', 'Negras'],
                         ['random', 'Aleatorio'],
                       ] as const).map(([value, label]) => (
                         <button
                           key={value}
                           type="button"
                           onClick={() => startOpeningTraining(trainingSelection ?? chooseVariant(), value)}
                           className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors ${((value === 'random' && false) || (value !== 'random' && trainingPlayerColor === value)) ? 'border-[#1f5b49] bg-[#1f5b49] text-[#f5efdf]' : 'border-[#c8c0b0] bg-[#eee8dc] text-[#5f7067] hover:border-[#1f5b49] hover:text-[#1f5b49]'}`}
                         >
                           {label}
                         </button>
                       ))}
                     </div>
                     <p className="mt-4 text-[13px] font-semibold text-[#5f7067]" data-testid="text-new-variant">
                       Nueva variante: <span className="text-[#1f5b49]">{openingVariant?.name ?? 'seleccionando...'}</span>
                     </p>
                   </>
                 ) : (
                   <h2 className="max-w-[580px] text-[clamp(2rem,4vw,3.5rem)] font-extrabold leading-[0.98] tracking-[-0.075em] text-[#20362e]">
                     Observa la<br className="hidden sm:block" /> posición.
                   </h2>
                 )}
              </div>
              <div className="hidden max-w-[210px] pb-1 text-right sm:block">
                 <p className="text-[12px] leading-relaxed text-[#6d7c73]">{mode === 'opening' ? 'Aprende la idea detrás de cada jugada, una decisión a la vez.' : 'Sin reloj que perseguir. Sin distracciones. Solo el tablero y la próxima jugada.'}</p>
              </div>
            </div>

            <div className="grid items-start gap-8 xl:grid-cols-[minmax(560px,700px)_300px] xl:gap-14">
              <section className="fade-up fade-up-delay-1">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${mode === 'opening' || turn === 'white' ? 'bg-[#f7f0df] ring-1 ring-[#b7ad9b]' : 'bg-[#263a33]'}`} />
                    <span className="text-[12px] font-bold text-[#40564b]">
                      {mode === 'opening'
                        ? (trainingComplete ? 'Variante completada' : `Tu turn · ${trainingPlayerColor === 'white' ? 'blancas' : 'negras'}`)
                        : freeGameStatus === 'checkmate'
                          ? `Jaque mate · ganan ${freeWinnerLabel}`
                          : freeGameStatus === 'stalemate'
                            ? 'Tablas por ahogado'
                            : freeGameStatus === 'check'
                              ? `Jaque · turn ${freeTurnoLabel}`
                              : `Turnoo de ${freeTurnoLabel}`}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#879389]">{mode === 'opening' ? 'entrenamiento de aperturas' : 'práctica libre'}</span>
                </div>

                <div className="board-frame overflow-hidden rounded-[5px] border-[10px] border-[#263f35] bg-[#263f35] sm:border-[14px]">
                  <div className="grid grid-cols-8 overflow-hidden rounded-[1px]" data-testid="chess-board">
                    {board.map((row, rowIndex) =>
                      row.map((piece, colIndex) => {
                        const key = `${rowIndex}-${colIndex}`;
                        const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
                        const isLegal = legalKeySet.has(key);
                        const isLastMove = lastMove?.includes(squareName({ row: rowIndex, col: colIndex })) ?? false;
                        const isLight = (rowIndex + colIndex) % 2 === 0;
                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => handleSquareClick(rowIndex, colIndex)}
                            data-testid={`square-${squareName({ row: rowIndex, col: colIndex })}`}
                            aria-label={`${squareName({ row: rowIndex, col: colIndex })}${piece ? ` ${piece.color} ${piece.type}` : ''}`}
                            className={`chess-square ${isLight ? 'board-light text-[#527062]' : 'board-dark text-[#e5ddc8]'} ${isSelected ? 'selected' : ''} ${isLegal ? (piece ? 'legal capture' : 'legal') : ''} ${isLastMove ? 'last-move' : ''}`}
                          >
                            {colIndex === 0 && <span className="board-coord board-rank">{8 - rowIndex}</span>}
                            {rowIndex === 7 && <span className="board-coord board-file">{files[colIndex]}</span>}
                            {piece && (
                              <span className={`chess-piece ${piece.color === 'white' ? 'piece-white' : 'piece-black'}`}>
                                {symbols[piece.color][piece.type]}
                              </span>
                            )}
                          </button>
                        );
                      }),
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#819087]">
                    {selected ? `${squareName(selected)} selected · elige una casilla` : 'selecciona una pieza para comenzar'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#5f8073]" />
                    <span className="text-[10px] text-[#819087]">jugada legal</span>
                  </div>
                </div>
              </section>

              <aside className="fade-up fade-up-delay-2 xl:pt-7">
                <div className="rounded-2xl border border-[#d1c8b7] bg-[#f2ece0] p-5 shadow-[0_12px_30px_rgba(65,70,58,.06)] sm:p-6">
                  <div className="flex items-center justify-between">
                     <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-[#7b897f]">{mode === 'opening' ? 'Entrenador de aperturas' : 'Estado de la partida'}</p>
                     {mode === 'opening' ? <Lightbulb size={15} className="text-[#c38a3d]" /> : <BookOpen size={15} className="text-[#1f5b49]" />}
                  </div>
                   {mode === 'opening' ? (
                     <div className="mt-5">
                       <div className="flex items-start gap-2">
                         {trainingStatus === 'incorrect' ? <XCircle size={17} className="mt-0.5 shrink-0 text-[#aa493e]" /> : trainingStatus === 'correct' || trainingStatus === 'complete' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#1f5b49]" /> : <Target size={17} className="mt-0.5 shrink-0 text-[#1f5b49]" />}
                         <p className={`text-[16px] font-bold leading-snug tracking-[-0.03em] ${trainingStatus === 'incorrect' ? 'text-[#9e4138]' : 'text-[#30473e]'}`} data-testid="text-training-status">
                           {trainingStatus === 'incorrect' ? 'Movimiento incorrecto' : trainingStatus === 'complete' ? '✅ Variante completada' : trainingStatus === 'correct' ? 'Movimiento correcto' : trainingComplete ? '✅ Variante completada' : 'Encuentra la siguiente jugada de blancas.'}
                         </p>
                       </div>
                       {trainingStatus === 'incorrect' && expectedMove && hintLevel > 0 && (
                         <p className="mt-4 rounded-lg bg-[#e8dfcf] px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-[#5b6c62]" data-testid="text-training-hint">
                           💡 Pista {Math.min(hintLevel, 3)}: {expectedMove.hints[Math.min(hintLevel, 3) - 1]}
                         </p>
                       )}
                       {(trainingStatus === 'correct' || trainingStatus === 'complete') && trainingExplanation && (
                         <div className="mt-4 rounded-lg bg-[#e3e8dc] px-3 py-2.5 text-[12px] leading-relaxed text-[#486257]" data-testid="text-training-explanation">
                           {trainingExplanation.split('\n').map((line, index) => (
                             <p key={index} className={index === 0 ? 'font-semibold text-[#30473e]' : index === trainingExplanation.split('\n').length - 1 ? 'mt-2' : 'mt-1'}>
                               {line}
                             </p>
                           ))}
                         </div>
                       )}
                       {trainingStatus === 'complete' && (
                         <div className="mt-4 space-y-2 rounded-lg bg-[#e3e8dc] px-3 py-2.5 text-[12px] leading-relaxed text-[#486257]" data-testid="text-training-completion">
                           <p>{trainingExplanation}</p>
                           <div className="border-t border-[#cbd8c8] pt-2">
                             <p className="font-semibold text-[#30473e]" data-testid="text-completion-variant">
                               Variante entrenada: {openingVariant?.name}
                             </p>
                             <p data-testid="text-completion-errors">Errores: {trainingErrors}</p>
                             <p data-testid="text-completion-hints">Pistas utilizadas: {trainingHintsUsed}</p>
                             <p data-testid="text-completion-accuracy">Porcentaje de aciertos: {trainingAccuracy}%</p>
                             <p data-testid="text-completion-difficult-moves">
                               Movimientos donde tuvo dificultades:{' '}
                               {difficultMoves.length
                                 ? difficultMoves.map((move) => `${move.notation} (${move.errors} errores, ${move.hintsUsed} pistas)`).join(', ')
                                 : 'ninguno'}
                             </p>
                           </div>
                         </div>
                       )}
                     </div>
                   ) : (
                     <div className="mt-5 space-y-3">
                       <p className="text-[16px] font-bold leading-snug tracking-[-0.03em] text-[#30473e]" data-testid="text-free-status">
                         {freeGameStatus === 'checkmate'
                           ? `Jaque mate. Ganan las ${freeWinnerLabel}.`
                           : freeGameStatus === 'stalemate'
                             ? 'Tablas por ahogado.'
                             : freeGameStatus === 'check'
                               ? `Jaque. Turnoo de las ${freeTurnoLabel}.`
                               : `Turnoo de las ${freeTurnoLabel}.`}
                       </p>
                       <p className="text-[12px] leading-relaxed text-[#6d7c73]" data-testid="text-focus-cue">
                         {freeGameOver ? 'La partida terminó. Reinicia para volver a mover.' : focusCue}
                       </p>
                     </div>
                   )}
                  <div className="my-5 h-px bg-[#d8cfbe]" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89948a]">Jugadas realizadas</p>
                      <p className="mt-1 font-mono text-[22px] tracking-[-0.08em] text-[#334940]" data-testid="text-move-count">{String(moveHistory.length).padStart(2, '0')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89948a]">Turno</p>
                      <p className="mt-1 text-[13px] font-bold text-[#334940]">{turn === 'white' ? 'blancas' : 'negras'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[#d1c8b7] bg-[#e2dacb] p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-[#7b897f]">Registro de jugadas</p>
                    <span className="font-mono text-[9px] text-[#9aa399]">{moveHistory.length ? `${moveHistory.length} / ∞` : 'vacío'}</span>
                  </div>
                  {moveHistory.length ? (
                    <div className="mt-4 max-h-[164px] space-y-1 overflow-auto pr-1">
                      {moveHistory.map((move, index) => (
                        <div key={`${move}-${index}`} className="flex items-center justify-between border-b border-[#cec5b4] py-2 last:border-0">
                          <span className="font-mono text-[10px] text-[#8a958c]">{String(index + 1).padStart(2, '0')}</span>
                          <span className="font-mono text-[12px] font-medium text-[#3e564a]" data-testid={`move-record-${index}`}>{move}</span>
                          <span className="text-[10px] text-[#8a958c]">{index % 2 === 0 ? 'B' : 'B'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-[11px] leading-relaxed text-[#7b897f]">Tus jugadas aparecerán aquí, una decisión a la vez.</p>
                  )}
                </div>

                 {mode === 'opening' ? (
                   <div className="mt-5 space-y-2">
                     {trainingComplete && (
                       <button
                         type="button"
                          onClick={() => startOpeningTraining(undefined, trainingPlayerColor)}
                         data-testid="button-another-variant"
                         className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f5b49] px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#f5efdf] transition-all hover:-translate-y-0.5 hover:bg-[#174d3d] active:translate-y-0"
                       >
                         <RotateCcw size={14} className="transition-transform group-hover:-rotate-45" />
                         Jugar otra variante
                       </button>
                     )}
                     <button
                       type="button"
                       onClick={resetTraining}
                       data-testid="button-reset-training"
                       className={`${trainingComplete ? 'border border-[#c6bdac] bg-[#f1ebdf] text-[#40564b] hover:border-[#1f5b49] hover:text-[#1f5b49]' : 'bg-[#1f5b49] text-[#f5efdf] hover:bg-[#174d3d]'} group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.13em] transition-all hover:-translate-y-0.5 active:translate-y-0`}
                     >
                       <RotateCcw size={14} className="transition-transform group-hover:-rotate-45" />
                       Reiniciar entrenamiento
                     </button>
                     <button
                       type="button"
                       onClick={exitTraining}
                       data-testid="button-exit-training"
                       className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#718078] transition-colors hover:border-[#c6bdac] hover:text-[#1f5b49]"
                     >
                       <LogOut size={13} />
                       Salir del entrenamiento
                     </button>
                   </div>
                 ) : (
                   <button
                     type="button"
                     onClick={resetGame}
                     data-testid="button-reset-game"
                     className="group mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f5b49] px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#f5efdf] transition-all hover:-translate-y-0.5 hover:bg-[#174d3d] active:translate-y-0"
                   >
                     <RotateCcw size={14} className="transition-transform group-hover:-rotate-45" />
                     Reiniciar posición
                   </button>
                 )}
                 <div className="mt-5 flex items-center gap-2 px-1 text-[10px] leading-relaxed text-[#879389]">
                   <ArrowUpRight size={13} className="shrink-0 text-[#c38a3d]" />
                   <span>{mode === 'opening' ? 'Las jugadas del rival se realizan automáticamente.' : 'La práctica contra la computadora estará disponible próximamente.'}</span>
                 </div>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;