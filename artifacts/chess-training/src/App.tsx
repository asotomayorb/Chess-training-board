import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, CircleHelp, Clock3, Crown, Lightbulb, LogOut, RotateCcw, Target, Undo2, RefreshCw, XCircle } from 'lucide-react';
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
  getActiveOpeningLabel,
  classifyTrainingError,
  isExpectedMove,
  type VariantSelection,
} from '@/engine/variant-engine';
import { chooseMiddlegameTrainingPrompt, type MiddlegameTrainingPrompt } from '@/engine/middlegame-training';
import { evaluateMiddlegameMove } from '@/engine/middlegame-evaluation';
import { chooseEndgameTrainingPrompt, type EndgameTrainingPrompt } from '@/engine/endgame-training';
import { evaluateEndgameMove } from '@/engine/endgame-evaluation';
import { evaluateCompleteMove } from '@/engine/complete-training';
import { StockfishEngine, chessMoveToUci, type StockfishAnalysis, type StockfishMoveQuality } from '@/engine/stockfish-engine';
import { classifyStockfishMove, type StockfishCoachResult } from '@/engine/stockfish-coach';
import {
  applyBoardMove,
  applyChessMove,
  cloneBoard,
  createChessGameState,
  getChessGameStatus,
  getGameStatus,
  getLegalChessMoves,
  getLegalMoves,
  makeInitialBoard,
  squareFromName,
  type Board,
  type ChessGameMove,
  type ChessGameState,
  type PieceType,
  type PromotionPiece,
  type Side,
  type Square,
} from '@/engine/chess-engine';

type PracticeMode = 'free' | 'opening' | 'complete';
type TrainingFocus = 'opening' | 'middlegame' | 'endgame' | 'complete';
type PuzzleFocus = 'middlegame' | 'endgame' | 'random';
type TrainingDifficulty = 'fundamentos' | 'intermedio' | 'avanzado';
type TrainingSideChoice = OpeningColor | 'random';
type DifficultMove = {
  nodeId: string;
  notation: string;
  errors: number;
  hintsUsed: number;
  category: string;
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

function createFocusedGameState(board: Board, turn: Side = 'white'): ChessGameState {
  const base = createChessGameState();
  return {
    ...base,
    board,
    turn,
    castlingRights: { whiteKingSide: false, whiteQueenSide: false, blackKingSide: false, blackQueenSide: false },
    enPassantTarget: null,
    halfmoveClock: 0,
    positionHistory: [],
  };
}

function makeTrainingBoard(kind: 'middlegame' | 'opposition' | 'rooks' | 'queen'): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const put = (name: string, type: PieceType, color: Side) => {
    const square = squareFromName(name);
    board[square.row][square.col] = { type, color };
  };
  if (kind === 'middlegame') {
    put('e1', 'king', 'white'); put('d1', 'queen', 'white'); put('a1', 'rook', 'white'); put('h1', 'rook', 'white');
    put('c1', 'bishop', 'white'); put('f1', 'bishop', 'white'); put('b1', 'knight', 'white'); put('g1', 'knight', 'white');
    ['a2','b2','c3','d4','e4','f2','g2','h3'].forEach((s) => put(s, 'pawn', 'white'));
    put('e8', 'king', 'black'); put('d8', 'queen', 'black'); put('a8', 'rook', 'black'); put('h8', 'rook', 'black');
    put('c8', 'bishop', 'black'); put('f8', 'bishop', 'black'); put('b8', 'knight', 'black'); put('g8', 'knight', 'black');
    ['a7','b6','c5','d6','e5','f7','g7','h6'].forEach((s) => put(s, 'pawn', 'black'));
  } else if (kind === 'opposition') {
    // Posición didáctica: oposición con un tiempo de reserva en el peón.
    put('e5', 'king', 'white'); put('e3', 'pawn', 'white'); put('e7', 'king', 'black');
  } else if (kind === 'rooks') {
    put('e5', 'king', 'white'); put('a5', 'rook', 'white'); put('a6', 'pawn', 'white');
    put('g7', 'king', 'black'); put('h7', 'rook', 'black'); put('g6', 'pawn', 'black');
  } else {
    put('e5', 'king', 'white'); put('e6', 'queen', 'white'); put('h8', 'king', 'black');
  }
  return board;
}

function getOpponentSide(playerColor: OpeningColor): Side {
  return playerColor === 'white' ? 'black' : 'white';
}

function getCompleteThreatMessage(state: ChessGameState): string | null {
  if (state.turn !== 'white') return null;
  const opponentState = { ...state, turn: 'black' as Side };
  const candidates = getLegalChessMoves(opponentState);
  for (const move of candidates) {
    const next = applyChessMove(opponentState, move);
    const status = getChessGameStatus(next);
    if (status === 'check' || status === 'checkmate') {
      return `Amenaza concreta: negras puede dar jaque con ${squareName(move.from)}–${squareName(move.to)}. Comprueba primero las respuestas forzadas.`;
    }
    const target = opponentState.board[move.to.row][move.to.col];
    if (target && target.type !== 'pawn' && target.type !== 'king') {
      return `Amenaza concreta: negras puede capturar ${target.type} en ${squareName(move.to)}. Antes de seguir tu plan, revisa si esa pieza queda protegida.`;
    }
  }
  return null;
}

function Home() {
  const [board, setBoard] = useState<Board>(() => makeInitialBoard());
  const [mode, setMode] = useState<PracticeMode>('free');
  const [trainingFocus, setTrainingFocus] = useState<TrainingFocus>('complete');
  const [turn, setTurn] = useState<Side>('white');
  const [completeGame, setCompleteGame] = useState<ChessGameState>(() => createChessGameState());
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [focusCue, setFocusCue] = useState('Antes de mover, identifica la tensión de la posición.');
  const [completeFeedback, setCompleteFeedback] = useState('');
  const stockfishRef = useRef<StockfishEngine | null>(null);
  const stockfishAnalysisRequestRef = useRef(0);
  const stockfishMoveBusyRef = useRef(false);
  const stockfishOpponentBusyRef = useRef(false);
  const [stockfishAnalysis, setStockfishAnalysis] = useState<StockfishAnalysis | null>(null);
  const [stockfishLoading, setStockfishLoading] = useState(false);
  const [stockfishError, setStockfishError] = useState('');
  const [stockfishMoveQuality, setStockfishMoveQuality] = useState<StockfishMoveQuality | null>(null);
  const [stockfishCoachResult, setStockfishCoachResult] = useState<StockfishCoachResult | null>(null);
  const [stockfishMoveLoading, setStockfishMoveLoading] = useState(false);
  const [stockfishReady, setStockfishReady] = useState(false);
  const [puzzleFocus, setPuzzleFocus] = useState<PuzzleFocus>('random');
  const [trainingDifficulty, setTrainingDifficulty] = useState<TrainingDifficulty>('intermedio');
  const [completeErrors, setCompleteErrors] = useState(0);
  const [middlegameErrors, setMiddlegameErrors] = useState(0);
  const [endgameErrors, setEndgameErrors] = useState(0);
  const [endgamePrompt, setEndgamePrompt] = useState<EndgameTrainingPrompt | null>(null);
  const [middlegamePrompt, setMiddlegamePrompt] = useState<MiddlegameTrainingPrompt | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const [localOpponent, setLocalOpponent] = useState<'bot' | 'local'>('bot');
  const [showFreeChoice, setShowFreeChoice] = useState(false);
  type UndoSnapshot = { board: Board; completeGame: ChessGameState; turn: Side; lastMove: [string,string] | null; moveHistory: string[]; openingNodeId: string | null };
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [trainingSelection, setTrainingSelection] = useState<VariantSelection | null>(null);
  const [trainingPlayerColor, setTrainingPlayerColor] = useState<OpeningColor>('white');
  const [trainingSideChoice, setTrainingSideChoice] = useState<TrainingSideChoice>('random');
  const [openingNodeId, setOpeningNodeId] = useState<string | null>(null);
  const [trainingErrors, setTrainingErrors] = useState(0);
  const [moveErrors, setMoveErrors] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [trainingHintsUsed, setTrainingHintsUsed] = useState(0);
  const [trainingAttempts, setTrainingAttempts] = useState(0);
  const [trainingCorrectMoves, setTrainingCorrectMoves] = useState(0);
  const [difficultMoves, setDifficultMoves] = useState<DifficultMove[]>([]);
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'incorrect' | 'correct' | 'complete'>('idle');
  const [openingOpponentPending, setOpeningOpponentPending] = useState(false);
  const [trainingExplanation, setTrainingExplanation] = useState('');
  useEffect(() => () => {
    stockfishAnalysisRequestRef.current += 1;
    stockfishMoveBusyRef.current = false;
    stockfishRef.current?.dispose();
    stockfishRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const engine = stockfishRef.current ?? new StockfishEngine();
    stockfishRef.current = engine;
    void engine.init()
      .then(() => { if (!cancelled) setStockfishReady(true); })
      .catch((error) => {
        if (!cancelled) {
          setStockfishReady(false);
          setStockfishError(error instanceof Error ? error.message : 'No se pudo activar Stockfish.');
        }
      });
    return () => { cancelled = true; };
  }, []);

  const analyzeWithStockfish = async () => {
    if (mode !== 'complete' || stockfishLoading) return;
    setStockfishLoading(true);
    setStockfishError('');
    try {
      if (!stockfishRef.current) stockfishRef.current = new StockfishEngine();
      const analysis = await stockfishRef.current.analyze(completeGame, { depth: trainingFocus === 'middlegame' || trainingFocus === 'endgame' ? 14 : 12 });
      setStockfishAnalysis(analysis);
    } catch (error) {
      setStockfishError(error instanceof Error ? error.message : 'No se pudo analizar la posición.');
    } finally {
      setStockfishLoading(false);
    }
  };


  const legalMoves = useMemo(
    () => {
      if (!selected) return [];
      if (mode === 'complete') {
        return getLegalChessMoves(completeGame, selected).map((move) => move.to);
      }
      return getLegalMoves(board, selected);
    },
    [board, completeGame, mode, selected],
  );

  const legalKeySet = useMemo(
    () => new Set(legalMoves.map((move) => `${move.row}-${move.col}`)),
    [legalMoves],
  );

  const openingVariant = trainingSelection?.variant ?? null;
  const openingTree = trainingSelection?.tree ?? null;
  const activeOpeningLabel = mode === 'opening' && openingVariant
    ? getActiveOpeningLabel(openingTree!, openingNodeId ?? openingVariant.startNodeId) ?? openingVariant.name
    : null;
  const trainingTurno = mode === 'opening' && openingTree && openingVariant && openingNodeId
    ? getTrainingTurn(openingTree, openingVariant, openingNodeId, trainingPlayerColor)
    : null;
  const expectedNode = trainingTurno?.playerNode ?? null;
  const expectedMove = expectedNode?.move ?? null;
  const trainingComplete = mode === 'opening' && openingVariant !== null && trainingTurno !== null && trainingTurno.playerNode === null;
  const trainingAccuracy = calculateAccuracy(trainingCorrectMoves, trainingAttempts);
  const errorCategorySummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const move of difficultMoves) {
      counts.set(move.category, (counts.get(move.category) ?? 0) + move.errors);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [difficultMoves]);
  const freeGameStatus = mode === 'complete'
    ? getChessGameStatus(completeGame)
    : mode === 'free'
      ? getGameStatus(board, turn)
      : null;
  const freeGameOver = freeGameStatus === 'checkmate' || freeGameStatus === 'stalemate' || freeGameStatus?.startsWith('draw-') === true;
  const completeGameOver = mode === 'complete' && freeGameOver;
  const completeThreatMessage = mode === 'complete' && completeGame.turn === 'white' && !completeGameOver
    ? getCompleteThreatMessage(completeGame)
    : null;
  const freeTurnoLabel = turn === 'white' ? 'blancas' : 'negras';
  const isBoardGameMode = mode === 'free' || mode === 'complete';
  const freeWinnerLabel = turn === 'white' ? 'negras' : 'blancas';

  useEffect(() => {
    if (mode !== 'complete' || completeGame.turn === trainingPlayerColor || completeGameOver || stockfishOpponentBusyRef.current || stockfishMoveLoading) return;
    const timer = window.setTimeout(() => {
      if (stockfishOpponentBusyRef.current) return;
      stockfishOpponentBusyRef.current = true;
      const engine = stockfishRef.current ?? new StockfishEngine();
      stockfishRef.current = engine;
      // La dificultad se expresa como comportamiento del bot, no como un Elo FIDE exacto.
      // Stockfish limita su escala UCI_Elo inferior a la de un principiante humano,
      // por lo que usamos Skill Level 0/8/14 y calibramos las etiquetas para que
      // representen progresión de juego, evitando afirmar una equivalencia exacta.
      const skillByDifficulty: Record<TrainingDifficulty, { depth: number; skillLevel: number }> = {
        fundamentos: { depth: 8, skillLevel: 0 },
        intermedio: { depth: 11, skillLevel: 8 },
        avanzado: { depth: 14, skillLevel: 14 },
      };
      const level = skillByDifficulty[trainingDifficulty];
      void engine.analyze(completeGame, level)
        .then((analysis) => {
          const candidate = getLegalChessMoves(completeGame).find((move) => chessMoveToUci(move) === analysis.bestMove);
          const fallback = getLegalChessMoves(completeGame)[0];
          const move = candidate ?? fallback;
          if (!move) return;
          const nextGame = applyChessMove(completeGame, move);
          setCompleteGame(nextGame);
          setBoard(nextGame.board);
          const nextEndgamePrompt = chooseEndgameTrainingPrompt(nextGame);
          setEndgamePrompt(nextEndgamePrompt);
          setMiddlegamePrompt(nextEndgamePrompt ? null : chooseMiddlegameTrainingPrompt(nextGame, { difficulty: trainingDifficulty }));
          setLastMove([squareName(move.from), squareName(move.to)]);
          setMoveHistory((history) => [...history, "Rival: " + squareName(move.from) + "–" + squareName(move.to)]);
          setTurn(nextGame.turn);
          setSelected(null);
          setPromotionPending(null);
                      setFocusCue('El rival respondió con Stockfish. Vuelve a evaluar amenazas, capturas y el objetivo del ejercicio.');
        })
        .catch((error) => {
          setStockfishReady(false);
          setStockfishError(error instanceof Error ? error.message : 'Stockfish no pudo elegir la jugada rival.');
          const candidates = getLegalChessMoves(completeGame);
          if (candidates.length) {
            const move = candidates[Math.floor(Math.random() * candidates.length)];
            const nextGame = applyChessMove(completeGame, move);
            setCompleteGame(nextGame);
            setBoard(nextGame.board);
            setLastMove([squareName(move.from), squareName(move.to)]);
            setMoveHistory((history) => [...history, "Rival: " + squareName(move.from) + "–" + squareName(move.to)]);
            setTurn(nextGame.turn);
            setSelected(null);
          }
        })
        .finally(() => { stockfishOpponentBusyRef.current = false; });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mode, completeGame, completeGameOver, trainingDifficulty, stockfishMoveLoading, trainingPlayerColor]);

  const resetFreePractice = () => {
    setShowMainMenu(false);
    setSummaryDismissed(false);
    setUndoStack([]);
    const freshCompleteGame = createChessGameState();
    setCompleteGame(freshCompleteGame);
    setPromotionPending(null);
    setBoard(freshCompleteGame.board);
    setMode('free');
    setTrainingFocus('complete');
    setTurn('white');
    setSelected(null);
    setLastMove(null);
    setMoveHistory([]);
    setFocusCue('Antes de mover, identifica la tensión de la posición.');
    setCompleteFeedback('');
    setStockfishAnalysis(null);
    setStockfishError('');
    setStockfishMoveQuality(null);
    setStockfishCoachResult(null);
    setStockfishMoveLoading(false);
    stockfishAnalysisRequestRef.current += 1;
    stockfishMoveBusyRef.current = false;
    setCompleteErrors(0);
    setMiddlegameErrors(0);
    setEndgameErrors(0);
    setEndgamePrompt(null);
    setMiddlegamePrompt(null);
    setTrainingSelection(null);
    setTrainingPlayerColor('white');
    setTrainingSideChoice('random');
    setOpeningNodeId(null);
    setTrainingErrors(0);
    setMoveErrors(0);
    setHintLevel(0);
    setTrainingHintsUsed(0);
    setTrainingAttempts(0);
    setTrainingCorrectMoves(0);
    setDifficultMoves([]);
    setTrainingStatus('idle');
    setOpeningOpponentPending(false);
    setTrainingExplanation('');
  };

  const startOpeningTraining = (
    selection = chooseVariant(),
    sideChoice: TrainingSideChoice = 'random',
  ) => {
    setShowMainMenu(false);
    setSummaryDismissed(false);
    setUndoStack([]);
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
    setTrainingFocus('opening');
    setTurn(playerColor);
    setSelected(null);
    setLastMove(null);
    setMoveHistory(initialAutomaticMoves.map((move) => move.notation));
    setTrainingSelection(selection);
    setTrainingPlayerColor(playerColor);
    setTrainingSideChoice(sideChoice);
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
    // El juego inesperado se activa después de la primera decisión del jugador, no al arrancar.
  };

  const startFocusedTraining = (focus: Exclude<TrainingFocus, 'opening' | 'complete'>, sideChoice: TrainingSideChoice = trainingSideChoice) => {
    setShowMainMenu(false);
    setSummaryDismissed(false);
    setUndoStack([]);
    const kind = focus === 'middlegame'
      ? 'middlegame' as const
      : (['opposition', 'rooks', 'queen'] as const)[Math.floor(Math.random() * 3)];
    const playerColor: OpeningColor = sideChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : sideChoice;
    const freshGame = createFocusedGameState(makeTrainingBoard(kind), playerColor);
    setCompleteGame(freshGame);
    setPromotionPending(null);
    setBoard(freshGame.board);
    setMode('complete');
    setTrainingFocus(focus);
    setTurn(playerColor);
    setTrainingPlayerColor(playerColor);
    setTrainingSideChoice(sideChoice);
    setSelected(null);
    setLastMove(null);
    setMoveHistory([]);
    setFocusCue(focus === 'middlegame'
      ? 'Medio juego: identifica el objetivo de la posición y considera varias jugadas buenas, no una única línea memorizada.'
      : 'Final: la posición comienza directamente en un ejercicio técnico. Calcula el objetivo antes de mover.');
    setCompleteFeedback('');
    setStockfishAnalysis(null);
    setStockfishError('');
    setStockfishMoveQuality(null);
    setStockfishCoachResult(null);
    setStockfishMoveLoading(false);
    stockfishAnalysisRequestRef.current += 1;
    stockfishMoveBusyRef.current = false;
    setCompleteErrors(0);
    setMiddlegameErrors(0);
    setEndgameErrors(0);
    const endgame = chooseEndgameTrainingPrompt(freshGame);
    setEndgamePrompt(endgame);
    setMiddlegamePrompt(focus === 'middlegame' ? chooseMiddlegameTrainingPrompt(freshGame, { difficulty: trainingDifficulty }) : null);
    setTrainingSelection(null);
    setOpeningNodeId(null);
  };

  const startPuzzleTraining = (selection: PuzzleFocus = puzzleFocus, sideChoice: TrainingSideChoice = trainingSideChoice) => {
    const focus = selection === 'random'
      ? (Math.random() < 0.5 ? 'middlegame' : 'endgame')
      : selection;
    setPuzzleFocus(selection);
    startFocusedTraining(focus, sideChoice);
  };

  const startCompleteGame = (sideChoice: TrainingSideChoice = trainingSideChoice) => {
    setShowMainMenu(false);
    setSummaryDismissed(false);
    setUndoStack([]);
    const freshCompleteGame = createChessGameState();
    setCompleteGame(freshCompleteGame);
    setPromotionPending(null);
    setBoard(freshCompleteGame.board);
    setMode('complete');
    setTrainingFocus('complete');
    setTurn('white');
    setSelected(null);
    setLastMove(null);
    setMoveHistory([]);
    setFocusCue('Modo completo: juega la partida y aplica las ideas aprendidas durante la apertura.');
    setCompleteFeedback('');
    setStockfishAnalysis(null);
    setStockfishError('');
    setStockfishMoveQuality(null);
    setStockfishCoachResult(null);
    setStockfishMoveLoading(false);
    stockfishAnalysisRequestRef.current += 1;
    stockfishMoveBusyRef.current = false;
    setCompleteErrors(0);
    setMiddlegameErrors(0);
    setEndgameErrors(0);
    setEndgamePrompt(chooseEndgameTrainingPrompt(freshCompleteGame));
    setMiddlegamePrompt(chooseMiddlegameTrainingPrompt(freshCompleteGame, { difficulty: trainingDifficulty }));
    const playerColor: OpeningColor = sideChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : sideChoice;
    setTrainingPlayerColor(playerColor);
    setTrainingSideChoice(sideChoice);
    setTurn(playerColor);
    setTrainingSelection(null);
    setOpeningNodeId(null);
  };

  const resetTraining = () => {
    // Reiniciar en aperturas significa un ejercicio nuevo, no repetir la misma variante.
    startOpeningTraining(chooseVariant(), trainingSideChoice);
  };

  const exitTraining = () => {
    resetFreePractice();
  };
  const startFreeGame = (opponent: 'bot' | 'local', sideChoice: TrainingSideChoice = trainingSideChoice) => {
    setShowFreeChoice(false);
    setLocalOpponent(opponent);
    setTrainingSideChoice(sideChoice);
    if (opponent === 'local') {
      resetFreePractice();
      if (sideChoice !== 'random') setTrainingPlayerColor(sideChoice);
    } else {
      startCompleteGame(sideChoice);
    }
  };

  const pushUndoSnapshot = () => {
    setUndoStack((stack) => [...stack.slice(-19), { board: cloneBoard(board), completeGame, turn, lastMove, moveHistory: [...moveHistory], openingNodeId }]);
  };

  const undoLastMove = () => {
    setUndoStack((stack) => {
      const snapshot = stack[stack.length - 1];
      if (!snapshot) return stack;
      setBoard(cloneBoard(snapshot.board));
      setCompleteGame(snapshot.completeGame);
      setTurn(snapshot.turn);
      setLastMove(snapshot.lastMove);
      setMoveHistory(snapshot.moveHistory);
      setOpeningNodeId(snapshot.openingNodeId);
      setSelected(null);
      setTrainingStatus('idle');
      setHintLevel(0);
      setTrainingExplanation('');
      return stack.slice(0, -1);
    });
  };

  const goHome = () => {
    stockfishAnalysisRequestRef.current += 1;
    setShowMainMenu(true);
    setSummaryDismissed(true);
    setSelected(null);
  };

  useEffect(() => {
    if (!autoAdvance || showMainMenu || summaryDismissed || !(trainingComplete || freeGameOver)) return;
    const timer = window.setTimeout(() => continueSession(), 1200);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, showMainMenu, summaryDismissed, trainingComplete, freeGameOver]);
  
  const continueSession = () => {
    if (trainingFocus === 'opening') startOpeningTraining(undefined, trainingSideChoice);
    else if (trainingFocus === 'middlegame' || trainingFocus === 'endgame') startPuzzleTraining(puzzleFocus);
    else if (mode === 'complete') startCompleteGame(trainingSideChoice);
    else resetFreePractice();
  };


  const resetGame = () => {
    if (mode === 'opening') {
      resetTraining();
      return;
    }
    if (mode === 'complete' && (trainingFocus === 'middlegame' || trainingFocus === 'endgame')) {
      // En puzzles, reiniciar selecciona un ejercicio nuevo.
      startPuzzleTraining(puzzleFocus, trainingSideChoice);
      return;
    }
    if (mode === 'complete') {
      // En juego libre vs bot, reiniciar sí conserva el modo y solo reinicia la partida.
      startCompleteGame(trainingSideChoice);
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
      const errorCategory = expectedMove.errorCategory ?? classifyTrainingError(expectedMove, fromName, toName);
      setDifficultMoves((moves) => {
        const existingMove = moves.find((move) => move.nodeId === expectedNode.id);
        if (existingMove) {
          return moves.map((move) => (
            move.nodeId === expectedNode.id
              ? { ...move, errors: nextMoveErrors, hintsUsed: Math.max(move.hintsUsed, nextHintLevel), category: errorCategory }
              : move
          ));
        }
        return [...moves, { nodeId: expectedNode.id, notation: expectedMove.notation, errors: nextMoveErrors, hintsUsed: nextHintLevel, category: errorCategory }];
      });
      setTrainingStatus('incorrect');
      setTrainingExplanation(`Por qué: ${expectedMove.whyWrong ?? expectedMove.typicalError}\nTipo de error: ${errorCategory}.`);
      setSelected(null);
      return;
    }

    pushUndoSnapshot();
    const playerBoard = applyOpeningMove(board, expectedMove);
    const playerHistory = [...moveHistory, expectedMove.notation];
    const nextTurnPreview = getTrainingTurn(openingTree, openingVariant, expectedNode.id, trainingPlayerColor);
    const automaticMoves = nextTurnPreview.automaticNodes
      .flatMap((node) => (node.move ? [node.move] : []));
    const lastAutomaticNode = nextTurnPreview.automaticNodes[nextTurnPreview.automaticNodes.length - 1];
    const nextNodeId = lastAutomaticNode?.id ?? expectedNode.id;
    const nextTrainingTurn = getTrainingTurn(openingTree, openingVariant, nextNodeId, trainingPlayerColor);
    const isLastPlayerMove = nextTrainingTurn.playerNode === null;
    const nextBoard = automaticMoves.reduce(
      (currentBoard, move) => applyOpeningMove(currentBoard, move),
      playerBoard,
    );
    const nextHistory = [...playerHistory, ...automaticMoves.map((move) => move.notation)];

    // Primero mostramos la jugada del jugador; el rival responde después de un pequeño intervalo.
    setBoard(playerBoard);
    setLastMove([expectedMove.from, expectedMove.to]);
    setMoveHistory(playerHistory);
    setSelected(null);
    setOpeningNodeId(expectedNode.id);
    setMoveErrors(0);
    setHintLevel(0);
    setTrainingAttempts((attempts) => attempts + 1);
    setTrainingCorrectMoves((moves) => moves + 1);
    setTrainingExplanation([`Idea: ${expectedMove.concept}`, `Objetivo: ${expectedMove.objective}`, `Amenaza/clave: ${expectedMove.threat}`, `Error típico: ${expectedMove.typicalError}`, `Nivel: ${expectedMove.difficulty}`, expectedMove.explanation].join('\n'));
    setTrainingStatus('correct');

    if (!automaticMoves.length) {
      setOpeningOpponentPending(false);
      setOpeningNodeId(nextNodeId);
      setTrainingStatus(isLastPlayerMove ? 'complete' : 'correct');
      return;
    }

    setOpeningOpponentPending(true);
    window.setTimeout(() => {
      // La apertura sigue exclusivamente la línea teórica seleccionada; no hay juego inesperado.
      setBoard(nextBoard);
      const lastAppliedMove = automaticMoves[automaticMoves.length - 1] ?? expectedMove;
      setLastMove([lastAppliedMove.from, lastAppliedMove.to]);
      setMoveHistory(nextHistory);
      setOpeningNodeId(nextNodeId);
      setOpeningOpponentPending(false);
          setTrainingStatus(isLastPlayerMove ? 'complete' : 'correct');
    }, 900);
  };

  const applyCompleteMove = (move: ChessGameMove) => {
    pushUndoSnapshot();
    const previousGame = completeGame;
    const nextGame = applyChessMove(previousGame, move);
    setStockfishAnalysis(null);
    const evaluation = evaluateCompleteMove(previousGame, nextGame, move);
    const endgameEvaluation = endgamePrompt
      ? evaluateEndgameMove(previousGame, nextGame, move, endgamePrompt)
      : null;
    const middlegameEvaluation = !endgameEvaluation && middlegamePrompt
      ? evaluateMiddlegameMove(previousGame, nextGame, move, middlegamePrompt)
      : null;

    if (evaluation.immediateCapture) setCompleteErrors((errors) => errors + 1);
    if (trainingFocus === 'complete') {
      if (endgameEvaluation && !endgameEvaluation.fulfilled) setEndgameErrors((errors) => errors + 1);
      if (middlegameEvaluation && !middlegameEvaluation.fulfilled) setMiddlegameErrors((errors) => errors + 1);
    }

    const objectiveEvaluation = endgameEvaluation ?? middlegameEvaluation;
    const combinedFeedback = objectiveEvaluation
      ? `${objectiveEvaluation.feedback} ${evaluation.feedback}`
      : evaluation.feedback;

    setCompleteFeedback(combinedFeedback);
    // Recalcular el objetivo sobre la posición resultante evita entrenar con un
    // ejercicio obsoleto después de cambiar material o fase de la partida.
    if (trainingFocus === 'endgame') {
      setEndgamePrompt(chooseEndgameTrainingPrompt(nextGame));
    } else if (trainingFocus === 'middlegame') {
      setMiddlegamePrompt(chooseMiddlegameTrainingPrompt(nextGame, { difficulty: trainingDifficulty }));
    } else {
      setEndgamePrompt(chooseEndgameTrainingPrompt(nextGame));
      setMiddlegamePrompt(chooseMiddlegameTrainingPrompt(nextGame, { difficulty: trainingDifficulty }));
    }

    const nextStatus = getChessGameStatus(nextGame);
    const tacticalPosition = Boolean(
      move.promotion ||
      previousGame.board[move.to.row][move.to.col] ||
      move.special === 'en-passant' ||
      nextStatus === 'check' ||
      nextStatus === 'checkmate' ||
      evaluation.immediateCapture ||
      evaluation.newChecks > 0 ||
      evaluation.newCaptures > 0,
    );
    const periodicPosition = previousGame.positionHistory.length % 4 === 0;
    const focusedTraining = trainingFocus === 'middlegame' || trainingFocus === 'endgame';
    const shouldAutoAnalyze = previousGame.turn === trainingPlayerColor;

    if (shouldAutoAnalyze && !stockfishMoveBusyRef.current) {
      const requestId = ++stockfishAnalysisRequestRef.current;
      stockfishMoveBusyRef.current = true;
      setStockfishMoveLoading(true);
      setStockfishError('');
      if (!stockfishRef.current) stockfishRef.current = new StockfishEngine();
      void stockfishRef.current.analyzePlayedMove(previousGame, move, { depth: focusedTraining ? 14 : 12 })
        .then((quality) => {
          if (requestId !== stockfishAnalysisRequestRef.current) return;
          setStockfishMoveQuality(quality);
          const coach = classifyStockfishMove(quality, {
            objective: trainingFocus === 'middlegame' ? middlegamePrompt?.objective : undefined,
            scenario: trainingFocus === 'endgame' ? endgamePrompt?.scenario : undefined,
            state: previousGame,
          });
          setStockfishCoachResult(coach);
          if (trainingFocus === 'middlegame' && ['serious-error', 'losing', 'missed-mate'].includes(coach.quality)) {
            setMiddlegameErrors((errors) => errors + 1);
          }
          if (trainingFocus === 'endgame' && ['serious-error', 'losing', 'missed-mate'].includes(coach.quality)) {
            setEndgameErrors((errors) => errors + 1);
          }
          setCompleteFeedback((current) => current + ' ' + coach.message);
        })
        .catch((error) => {
          if (requestId !== stockfishAnalysisRequestRef.current) return;
          setStockfishError(error instanceof Error ? error.message : 'No se pudo verificar la jugada con Stockfish.');
        })
        .finally(() => {
          if (requestId === stockfishAnalysisRequestRef.current) {
            stockfishMoveBusyRef.current = false;
            setStockfishMoveLoading(false);
          }
        });
    }

    setCompleteGame(nextGame);
    setBoard(nextGame.board);
    if (trainingFocus === 'endgame') {
      if (endgameEvaluation?.fulfilled) setEndgamePrompt(chooseEndgameTrainingPrompt(nextGame));
    } else if (trainingFocus === 'middlegame') {
      if (middlegameEvaluation?.fulfilled) setMiddlegamePrompt(chooseMiddlegameTrainingPrompt(nextGame, { difficulty: trainingDifficulty }));
      setEndgamePrompt(null);
    } else {
      const reachedEndgame = chooseEndgameTrainingPrompt(nextGame);
      setEndgamePrompt(reachedEndgame);
      setMiddlegamePrompt(reachedEndgame ? null : chooseMiddlegameTrainingPrompt(nextGame, { difficulty: trainingDifficulty }));
    }
    setLastMove([squareName(move.from), squareName(move.to)]);
    setMoveHistory((history) => [...history, `${squareName(move.from)}–${squareName(move.to)}${move.promotion ? '=' + move.promotion[0].toUpperCase() : ''}`]);
    setSelected(null);
    setPromotionPending(null);
    setTurn(nextGame.turn);
    if (nextGame.turn === 'black') {
      setFocusCue(objectiveEvaluation?.fulfilled
        ? 'Objetivo cumplido. El rival está calculando; después de su respuesta, vuelve a evaluar la posición.'
        : 'Objetivo no cumplido del todo. El rival está calculando; después de su respuesta, vuelve a evaluar la posición.');
    } else {
      setFocusCue(
        getChessGameStatus(nextGame) === 'check'
          ? 'Jaque. Busca primero las respuestas legales antes de continuar.'
          : 'Bien. Ahora observa qué cambió antes de buscar la siguiente jugada.'
      );
    }
  };

  const handleSquareClick = (row: number, col: number) => {
    if (mode === 'opening' && openingOpponentPending) {
      setSelected(null);
      return;
    }
    if (mode === 'opening' && trainingComplete) {
      setSelected(null);
      return;
    }
    if ((mode === 'free' || mode === 'complete') && freeGameOver) {
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

      if (mode === 'complete') {
        const moveCandidates = getLegalChessMoves(completeGame).filter(
          (move) => move.from.row === selected.row && move.from.col === selected.col && move.to.row === row && move.to.col === col,
        );
        if (!moveCandidates.length) return;

        // En puzzles se permite exactamente una respuesta correcta por turno.
        // La capa pedagógica ya selecciona el candidato correcto para la posición.
        if (trainingFocus === 'middlegame' || trainingFocus === 'endgame') {
          const expectedPuzzleMove = (trainingFocus === 'endgame'
            ? endgamePrompt?.candidateMoves[0]
            : middlegamePrompt?.candidateMoves[0]) ?? null;
          if (!expectedPuzzleMove ||
              expectedPuzzleMove.from.row !== selected.row ||
              expectedPuzzleMove.from.col !== selected.col ||
              expectedPuzzleMove.to.row !== row ||
              expectedPuzzleMove.to.col !== col) {
            setCompleteErrors((errors) => errors + 1);
            setCompleteFeedback('Movimiento incorrecto. En este puzzle solo hay una jugada correcta en este turno. Busca la idea indicada antes de mover.');
            setSelected(null);
            return;
          }
        }

        if (moveCandidates.some((move) => move.promotion)) {
          setPromotionPending({ from: selected, to: { row, col } });
          return;
        }
        applyCompleteMove(moveCandidates[0]);
        return;
      }

      const from = squareName(selected);
      const to = squareName({ row, col });
      pushUndoSnapshot();
      const nextBoard = applyBoardMove(board, { from: selected, to: { row, col } });
      setBoard(nextBoard);
      setLastMove([from, to]);
      setMoveHistory((history) => [...history, `${from}–${to}`]);
      setSelected(null);
      setTurn((current) => (current === 'white' ? 'black' : 'white'));
      setFocusCue('Bien. Ahora observa qué cambió antes de buscar la siguiente jugada.');
      return;
    }

    if (mode === 'complete' && completeGame.turn !== trainingPlayerColor) {
      setSelected(null);
      return;
    }

    if (clickedPiece?.color === turn) {
      setSelected({ row, col });
      setFocusCue('Respira. Busca la jugada forzada y compruébala dos veces.');
      return;
    }

    setSelected(null);
  };

  const shouldRotateBoard = (mode === 'opening' || (mode === 'complete' && (trainingFocus === 'middlegame' || trainingFocus === 'endgame'))) && trainingPlayerColor === 'black';
  const displayedBoard = shouldRotateBoard
    ? board.slice().reverse().map((row) => row.slice().reverse())
    : board;

  return (
    <div className="app-grain min-h-[100dvh] overflow-x-hidden bg-[#e9e3d5]">
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1600px]">
        

        <main className="min-w-0 flex-1">
          <header className="flex min-h-[76px] items-center justify-between border-b border-[#d6cebd] px-5 py-4 sm:px-8 lg:px-12">
            <button type="button" onClick={goHome} className="rounded-lg border border-[#c6bdac] bg-[#f1ebdf] px-3 py-2 text-[11px] font-bold text-[#40564b] hover:border-[#1f5b49]">← Atrás</button>
            <h1 className="text-[clamp(1.45rem,3vw,2.2rem)] font-extrabold tracking-[-0.05em] text-[#20362e]">
              {mode === 'opening' ? 'Aperturas' : mode === 'complete' && (trainingFocus === 'middlegame' || trainingFocus === 'endgame') ? 'Puzzles' : 'Juego libre'}
            </h1>
            <select value={mode === 'opening' ? 'opening' : mode === 'complete' && (trainingFocus === 'middlegame' || trainingFocus === 'endgame') ? 'puzzles' : 'free'} onChange={(event) => {
              if (event.target.value === 'opening') startOpeningTraining();
              else if (event.target.value === 'puzzles') startPuzzleTraining();
              else if (event.target.value === 'config') { setShowMainMenu(true); setSummaryDismissed(true); }
              else startFreeGame('bot');
            }} className="max-w-[170px] rounded-lg border border-[#c6bdac] bg-[#f1ebdf] px-3 py-2 text-[11px] font-bold text-[#40564b]">
              <option value="opening">Aperturas</option><option value="puzzles">Puzzles</option><option value="free">Juego libre</option><option value="config">Configuraciones</option>
            </select>
          </header>

          <div className="training-shell mx-auto max-w-[1260px] px-5 pb-4 pt-4 sm:px-8 sm:pt-6 lg:px-12 lg:pt-6">
            <div className="training-intro mb-4 fade-up">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {mode === 'opening' && <p className="text-[18px] font-extrabold text-[#1f5b49]" data-testid="text-active-opening">{activeOpeningLabel ?? openingVariant?.name ?? 'Nueva variante'}</p>}
                  {mode === 'complete' && trainingFocus === 'middlegame' && middlegamePrompt && <p className="text-[16px] font-bold text-[#30473e]">Objetivo: {middlegamePrompt.title}</p>}
                  {mode === 'complete' && trainingFocus === 'endgame' && endgamePrompt && <p className="text-[16px] font-bold text-[#30473e]">Final: {endgamePrompt.title}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {mode === 'opening' && <span className="rounded-full bg-[#e3e8dc] px-3 py-1.5 text-[10px] font-bold text-[#40564b]">{trainingPlayerColor === 'white' ? 'Juegas blancas' : 'Juegas negras'}</span>}
                  {mode === 'complete' && trainingFocus === 'complete' && localOpponent === 'bot' && <select value={trainingDifficulty} onChange={(event) => setTrainingDifficulty(event.target.value as TrainingDifficulty)} className="rounded-full border border-[#c8c0b0] bg-[#eee8dc] px-3 py-1.5 text-[10px] font-bold text-[#5f7067]"><option value="fundamentos">Fundamentos · inicial</option><option value="intermedio">Intermedio · medio</option><option value="avanzado">Avanzado · fuerte</option></select>}
                  {(trainingFocus === 'middlegame' || trainingFocus === 'endgame') && <select value={puzzleFocus} onChange={(event) => { const value = event.target.value as PuzzleFocus; setPuzzleFocus(value); startPuzzleTraining(value); }} className="rounded-full border border-[#c8c0b0] bg-[#eee8dc] px-3 py-1.5 text-[10px] font-bold text-[#5f7067]"><option value="random">Aleatorio</option><option value="middlegame">Medio juego</option><option value="endgame">Finales</option></select>}
                </div>
              </div>
              {mode === 'opening' && trainingExplanation && <div className="mt-2 max-w-[760px] rounded-xl bg-[#e3e8dc] px-3 py-2.5 text-[11px] leading-relaxed text-[#486257]" data-testid="text-training-explanation-top">{trainingExplanation.split('\n').map((line,index)=><p key={index} className={index ? 'mt-1' : 'font-semibold text-[#30473e]'}>{line}</p>)}</div>}
              {mode === 'opening' && trainingStatus === 'incorrect' && expectedMove && hintLevel > 0 && <div className="mt-2 max-w-[760px] rounded-xl bg-[#e8dfcf] px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-[#5b6c62]" data-testid="text-training-hint-top">💡 Pista {Math.min(hintLevel,3)}: {expectedMove.hints[Math.min(hintLevel,3)-1]}</div>}
              {mode !== 'opening' && <p className="mt-2 max-w-[760px] text-[11px] leading-relaxed text-[#5f7067]">{focusCue}</p>}
            </div>

            <div className="grid items-start gap-8 xl:grid-cols-[minmax(560px,700px)_300px] xl:gap-14">
              <section className="training-board-column fade-up fade-up-delay-1">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${mode === 'opening' || turn === 'white' ? 'bg-[#f7f0df] ring-1 ring-[#b7ad9b]' : 'bg-[#263a33]'}`} />
                    <span className="text-[12px] font-bold text-[#40564b]">
                      {mode === 'opening'
                        ? (trainingComplete ? 'Variante completada' : `Tu turno · ${trainingPlayerColor === 'white' ? 'blancas' : 'negras'}`)
                        : freeGameStatus === 'checkmate'
                          ? `Jaque mate · ganan ${freeWinnerLabel}`
                          : freeGameStatus === 'stalemate'
                            ? 'Tablas por ahogado'
                            : freeGameStatus === 'check'
                              ? `Jaque · turn ${freeTurnoLabel}`
                              : `Turno de ${freeTurnoLabel}`}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#879389]">{mode === 'opening' ? 'apertura' : (trainingFocus === 'middlegame' || trainingFocus === 'endgame') ? 'puzzles' : trainingFocus === 'complete' ? 'partida completa' : 'práctica libre'}</span>
                </div>

                {promotionPending && mode === 'complete' && (
                  <div className="mb-3 rounded-xl border border-[#c9b98f] bg-[#eee4cc] p-3">
                    <p className="text-[11px] font-extrabold text-[#5f563f]">Elige la pieza de promoción</p>
                    <div className="mt-2 flex gap-2">
                      {(['queen', 'rook', 'bishop', 'knight'] as PromotionPiece[]).map((promotion) => (
                        <button
                          key={promotion}
                          type="button"
                          onClick={() => {
                            const move = getLegalChessMoves(completeGame).find(
                              (candidate) =>
                                candidate.from.row === promotionPending.from.row &&
                                candidate.from.col === promotionPending.from.col &&
                                candidate.to.row === promotionPending.to.row &&
                                candidate.to.col === promotionPending.to.col &&
                                candidate.promotion === promotion,
                            );
                            if (move) applyCompleteMove(move);
                          }}
                          className="rounded-lg border border-[#c8c0b0] bg-[#f6f0e4] px-3 py-2 text-[11px] font-bold text-[#40564b] hover:border-[#1f5b49] hover:text-[#1f5b49]"
                        >
                          {promotion === 'queen' ? 'Dama' : promotion === 'rook' ? 'Torre' : promotion === 'bishop' ? 'Alfil' : 'Caballo'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="training-board-wrap">
                  <div className="board-frame overflow-hidden rounded-[5px] border-[10px] border-[#263f35] bg-[#263f35] sm:border-[14px]">
                  <div className="grid grid-cols-8 overflow-hidden rounded-[1px]" data-testid="chess-board">
                    {displayedBoard.map((row, displayRowIndex) =>
                      row.map((piece, displayColIndex) => {
                        const rowIndex = shouldRotateBoard ? 7 - displayRowIndex : displayRowIndex;
                        const colIndex = shouldRotateBoard ? 7 - displayColIndex : displayColIndex;
                        const key = `${rowIndex}-${colIndex}`;
                        const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
                        const isLegal = legalKeySet.has(key);
                        const isLastMove = lastMove?.includes(squareName({ row: rowIndex, col: colIndex })) ?? false;
                        const isHintFrom = mode === 'opening' && trainingStatus === 'incorrect' && hintLevel >= 2 && expectedMove?.from === squareName({ row: rowIndex, col: colIndex });
                        const isHintTo = mode === 'opening' && trainingStatus === 'incorrect' && hintLevel >= 3 && expectedMove?.to === squareName({ row: rowIndex, col: colIndex });
                        const isLight = (rowIndex + colIndex) % 2 === 0;
                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => handleSquareClick(rowIndex, colIndex)}
                            data-testid={`square-${squareName({ row: rowIndex, col: colIndex })}`}
                            aria-label={`${squareName({ row: rowIndex, col: colIndex })}${piece ? ` ${piece.color} ${piece.type}` : ''}`}
                            className={`chess-square ${isLight ? 'board-light text-[#527062]' : 'board-dark text-[#e5ddc8]'} ${isSelected ? 'selected' : ''} ${isLegal ? (piece ? 'legal capture' : 'legal') : ''} ${isLastMove ? 'last-move' : ''} ${isHintFrom ? 'hint-from' : ''} ${isHintTo ? 'hint-to' : ''}`}
                          >
                            {displayColIndex === 0 && <span className="board-coord board-rank">{8 - rowIndex}</span>}
                            {displayRowIndex === 7 && <span className="board-coord board-file">{files[colIndex]}</span>}
                            {piece && (
                              <span className={`chess-piece ${piece.color === 'white' ? 'piece-white' : 'piece-black'} ${isLastMove ? 'piece-moved' : ''}`}>
                                {symbols[piece.color][piece.type]}
                              </span>
                            )}
                          </button>
                        );
                      }),
                    )}
                  </div>
                </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d1c8b7] bg-[#f2ece0] p-3">
                  <div className="flex gap-3">
                    <button type="button" onClick={undoLastMove} disabled={!undoStack.length} className="flex min-w-[54px] flex-col items-center gap-0.5 rounded-lg border border-[#c8c0b0] bg-[#f6f0e4] px-2.5 py-1.5 text-[#40564b] disabled:opacity-40" aria-label="Deshacer">
                      <Undo2 size={17}/>
                      <span className="text-[8px] font-bold uppercase tracking-[0.06em]">Deshacer</span>
                    </button>
                    <button type="button" onClick={resetGame} className="flex min-w-[54px] flex-col items-center gap-0.5 rounded-lg border border-[#c8c0b0] bg-[#f6f0e4] px-2.5 py-1.5 text-[#40564b]" aria-label="Reiniciar">
                      <RefreshCw size={17}/>
                      <span className="text-[8px] font-bold uppercase tracking-[0.06em]">Reiniciar</span>
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#718078]">Bando<select value={trainingSideChoice} onChange={(event) => {
                    const value = event.target.value as TrainingSideChoice;
                    if (mode === 'opening') startOpeningTraining(trainingSelection ?? chooseVariant(), value);
                    else if (mode === 'complete' && (trainingFocus === 'middlegame' || trainingFocus === 'endgame')) startPuzzleTraining(puzzleFocus, value);
                    else if (mode === 'complete') startCompleteGame(value);
                    else startFreeGame(localOpponent, value);
                  }} className="rounded-lg border border-[#c8c0b0] bg-[#f6f0e4] px-3 py-2 text-[10px] font-bold text-[#40564b]">
                    <option value="white">Blancas</option><option value="black">Negras</option><option value="random">Aleatorio</option>
                  </select></label>
                </div>

                <div className="mt-4 xl:hidden rounded-xl border border-[#d1c8b7] bg-[#f2ece0] p-3.5" data-testid="mobile-training-summary">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-extrabold text-[#30473e]">{mode === 'opening' ? (trainingStatus === 'incorrect' ? 'Movimiento incorrecto' : trainingStatus === 'complete' ? '✅ Variante completada' : trainingStatus === 'correct' ? 'Movimiento correcto' : `Tu turno · ${trainingPlayerColor === 'white' ? 'blancas' : 'negras'}`) : (trainingFocus === 'middlegame' || trainingFocus === 'endgame') ? '🧩 Puzzles' : trainingFocus === 'complete' ? '♟ Partida completa' : 'Práctica libre'}</p>
                    <span className="font-mono text-[10px] font-bold text-[#7b897f]">{moveHistory.length} jug.</span>
                  </div>
                  {mode === 'opening' && trainingStatus === 'incorrect' && expectedMove && hintLevel > 0 && <p className="mt-2 rounded-lg bg-[#e8dfcf] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#5b6c62]">💡 Pista {Math.min(hintLevel, 3)}: {expectedMove.hints[Math.min(hintLevel, 3) - 1]}</p>}
                  {mode === 'opening' && (trainingStatus === 'correct' || trainingStatus === 'complete') && trainingExplanation && <p className="mt-2 rounded-lg bg-[#e3e8dc] px-3 py-2 text-[11px] leading-relaxed text-[#486257]">{trainingExplanation.split('\n')[0]}</p>}
                  {mode !== 'opening' && <p className="mt-2 text-[11px] leading-relaxed text-[#5f7067]">{focusCue}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#89948a]">
                    {mode === 'opening' ? <><span>Errores {trainingErrors}</span><span>Aciertos {trainingCorrectMoves}</span><span>Precisión {trainingAccuracy}%</span><span>Pistas {trainingHintsUsed}</span></> : <span>Alertas: {completeErrors + middlegameErrors + endgameErrors}</span>}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#819087]">
                    {openingOpponentPending ? 'el rival está respondiendo…' : selected ? `${squareName(selected)} seleccionada · elige una casilla` : 'selecciona una pieza para comenzar'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#5f8073]" />
                    <span className="text-[10px] text-[#819087]">jugada legal</span>
                  </div>
                </div>
              </section>

              <aside className="hidden fade-up fade-up-delay-2 xl:block xl:pt-7">
                <div className="rounded-2xl border border-[#d1c8b7] bg-[#f2ece0] p-5 shadow-[0_12px_30px_rgba(65,70,58,.06)] sm:p-6">
                  <div className="flex items-center justify-between">
                     <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-[#7b897f]">{mode === 'opening' ? 'Entrenador de aperturas' : trainingFocus === 'middlegame' ? 'Entrenador de puzzles' : trainingFocus === 'endgame' ? 'Entrenador de puzzles' : 'Estado de la partida'}</p>
                     {mode === 'opening' ? <Lightbulb size={15} className="text-[#c38a3d]" /> : <BookOpen size={15} className="text-[#1f5b49]" />}
                  </div>
                   {mode === 'opening' ? (
                     <div className="mt-5">
                       <div className="flex items-start gap-2">
                         {trainingStatus === 'incorrect' ? <XCircle size={17} className="mt-0.5 shrink-0 text-[#aa493e]" /> : trainingStatus === 'correct' || trainingStatus === 'complete' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#1f5b49]" /> : <Target size={17} className="mt-0.5 shrink-0 text-[#1f5b49]" />}
                         {activeOpeningLabel && (
                         <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#1f5b49]" data-testid="text-active-opening">
                           Apertura activa: {activeOpeningLabel}
                         </p>
                       )}
                       <p className={`text-[16px] font-bold leading-snug tracking-[-0.03em] ${trainingStatus === 'incorrect' ? 'text-[#9e4138]' : 'text-[#30473e]'}`} data-testid="text-training-status">
                           {trainingStatus === 'incorrect' ? 'Movimiento incorrecto' : trainingStatus === 'complete' ? '✅ Variante completada' : trainingStatus === 'correct' ? 'Movimiento correcto' : trainingComplete ? '✅ Variante completada' : `Encuentra la siguiente jugada de ${trainingPlayerColor === 'white' ? 'blancas' : 'negras'}.`}
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
                                 ? difficultMoves.map((move) => `${move.notation} (${move.errors} errores, ${move.hintsUsed} pistas, ${move.category})`).join(', ')
                                 : 'ninguno'}
                             </p>
                             <p className="mt-2" data-testid="text-completion-error-patterns">
                               Patrón de errores:{' '}
                               {errorCategorySummary.length
                                 ? errorCategorySummary.map(([category, count]) => `${category}: ${count}`).join(' · ')
                                 : 'sin errores'}
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
                             : freeGameStatus === 'draw-insufficient-material'
                               ? 'Tablas por material insuficiente.'
                               : freeGameStatus === 'draw-fifty-move'
                                 ? 'Tablas por regla de las 50 jugadas.'
                                 : freeGameStatus === 'draw-repetition'
                                   ? 'Tablas por triple repetición.'
                                   : freeGameStatus === 'check'
                                     ? `Jaque. Turno de las ${freeTurnoLabel}.`
                                     : `Turno de las ${freeTurnoLabel}.`}
                       </p>
                       <p className="text-[12px] leading-relaxed text-[#6d7c73]" data-testid="text-focus-cue">
                         {freeGameOver ? 'La partida terminó. Reinicia para volver a mover.' : focusCue}
                       </p>
                       {mode === 'complete' && completeThreatMessage && !freeGameOver && (
                         <p className="mt-3 rounded-lg bg-[#eee4cc] px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-[#665b42]" data-testid="text-complete-threat">
                           ⚠️ {completeThreatMessage}
                         </p>
                       )}
                       {mode === 'complete' && endgamePrompt && !freeGameOver && (
                       <div className="mt-3 rounded-lg bg-[#e8dfcf] px-3 py-2.5" data-testid="text-endgame-objective">
                         <p className="text-[11px] font-extrabold text-[#30473e]">♔ Final: {endgamePrompt.title}</p>
                         <p className="mt-1 text-[11px] leading-relaxed text-[#486257]">{endgamePrompt.instruction}</p>
                         <p className="mt-1 text-[10px] leading-relaxed text-[#718078]">{endgamePrompt.rationale}</p>
                       </div>
                     )}
                     {mode === 'complete' && middlegamePrompt && !freeGameOver && !endgamePrompt && (
                       <div className="mt-3 rounded-lg bg-[#e3e8dc] px-3 py-2.5" data-testid="text-middlegame-objective">
                         <p className="text-[11px] font-extrabold text-[#30473e]">🎯 Objetivo: {middlegamePrompt.title}</p>
                         <p className="mt-1 text-[11px] leading-relaxed text-[#486257]">{middlegamePrompt.instruction}</p>
                         <p className="mt-1 text-[10px] leading-relaxed text-[#718078]">{middlegamePrompt.rationale}</p>
                         <button type="button" onClick={() => setMiddlegamePrompt(chooseMiddlegameTrainingPrompt(completeGame, { difficulty: trainingDifficulty }))} className="mt-2 rounded-full border border-[#c8c0b0] bg-[#f1ebdf] px-2.5 py-1 text-[9px] font-bold text-[#5f7067] hover:border-[#1f5b49] hover:text-[#1f5b49]">Nuevo objetivo</button>
                       </div>
                     )}
                     {mode === 'complete' && completeFeedback && !freeGameOver && (
                         <p className="mt-3 rounded-lg bg-[#e3e8dc] px-3 py-2.5 text-[11px] leading-relaxed text-[#486257]" data-testid="text-complete-feedback">
                           {completeFeedback}
                         </p>
                       )}
                       {mode === 'complete' && (
                         <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#89948a]" data-testid="text-complete-errors">
                           Alertas tácticas detectadas: {completeErrors} · Objetivos de medio juego no cumplidos: {middlegameErrors} · Alertas de finales: {endgameErrors}
                         </p>
                       )}
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
                      <p className="mt-1 text-[13px] font-bold text-[#334940]">{(mode === 'complete' ? completeGame.turn : turn) === 'white' ? 'blancas' : 'negras'}</p>
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
                          <span className="text-[10px] text-[#8a958c]">{index % 2 === 0 ? 'B' : 'N'}</span>
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
                   <span>{mode === 'opening' ? 'Las jugadas del rival se realizan automáticamente.' : mode === 'complete' ? 'Modo completo: también reconoce enroque, captura al paso, promoción y tablas reglamentarias.' : 'Práctica libre: juega sin una variante obligatoria.'}</span>
                 </div>
              </aside>
            </div>
          </div>
        </main>
      {showMainMenu && <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[#e9e3d5] p-5 pt-[8vh] pb-12"><div className="w-full max-w-[720px]"><div className="mb-7 text-center"><div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#1f5b49] text-[#f4ecd9]"><Crown size={32}/></div><h1 className="text-[clamp(2.2rem,7vw,4.5rem)] font-extrabold tracking-[-0.07em] text-[#20362e]">The Quiet Board</h1><p className="mt-2 text-sm text-[#6d7c73]">Entrenamiento de ajedrez</p></div><div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={()=>startOpeningTraining()} className="rounded-2xl border border-[#c8c0b0] bg-[#f5efe3] p-4 sm:p-5 text-left hover:border-[#1f5b49]"><BookOpen className="text-[#1f5b49]"/><p className="mt-4 text-xl font-extrabold text-[#30473e]">Aperturas</p><p className="mt-1 text-xs text-[#718078]">Variantes, pistas y explicación estratégica.</p></button>
        <button type="button" onClick={()=>startPuzzleTraining()} className="rounded-2xl border border-[#c8c0b0] bg-[#f5efe3] p-4 sm:p-5 text-left hover:border-[#1f5b49]"><Lightbulb className="text-[#1f5b49]"/><p className="mt-4 text-xl font-extrabold text-[#30473e]">Puzzles</p><p className="mt-1 text-xs text-[#718078]">Medio juego, finales o aleatorio.</p></button>
        <button type="button" onClick={()=>setShowFreeChoice(true)} className="rounded-2xl border border-[#c8c0b0] bg-[#f5efe3] p-4 sm:p-5 text-left hover:border-[#1f5b49]"><Target className="text-[#1f5b49]"/><p className="mt-4 text-xl font-extrabold text-[#30473e]">Juego libre</p><p className="mt-1 text-xs text-[#718078]">Elige si juegas contra el bot o contra otro jugador local.</p></button>
        <div className="rounded-2xl border border-[#c8c0b0] bg-[#f5efe3] p-4 sm:p-5"><CircleHelp className="text-[#1f5b49]"/><p className="mt-4 text-xl font-extrabold text-[#30473e]">Configuraciones</p><p className="mt-1 text-xs text-[#718078]">Avance: {autoAdvance?'automático':'normal'}.</p><div className="mt-3 flex gap-2"><button type="button" onClick={()=>setAutoAdvance(false)} className={`rounded-lg px-3 py-2 text-xs font-bold ${!autoAdvance?'bg-[#1f5b49] text-white':'bg-[#e8dfcf] text-[#40564b]'}`}>Normal</button><button type="button" onClick={()=>setAutoAdvance(true)} className={`rounded-lg px-3 py-2 text-xs font-bold ${autoAdvance?'bg-[#1f5b49] text-white':'bg-[#e8dfcf] text-[#40564b]'}`}>Automático</button></div></div>
      </div></div></div>}
      {showFreeChoice && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#20362e]/35 p-5">
        <div className="w-full max-w-[520px] rounded-3xl border border-[#c8c0b0] bg-[#f5efe3] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7b897f]">Juego libre</p><h2 className="mt-1 text-2xl font-extrabold text-[#20362e]">¿Contra quién quieres jugar?</h2></div>
            <button type="button" onClick={()=>setShowFreeChoice(false)} className="rounded-full p-2 text-[#6d7c73] hover:bg-[#e8dfcf]" aria-label="Cerrar"><XCircle size={20}/></button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={()=>startFreeGame('bot')} className="rounded-2xl bg-[#1f5b49] p-5 text-left text-white"><Target size={22}/><p className="mt-3 text-lg font-extrabold">Vs bot</p><p className="mt-1 text-xs text-white/75">Elige tu bando y la fuerza del rival.</p></button>
            <button type="button" onClick={()=>startFreeGame('local')} className="rounded-2xl border border-[#c8c0b0] bg-[#f6f0e4] p-5 text-left text-[#40564b]"><Target size={22}/><p className="mt-3 text-lg font-extrabold">Jugador local</p><p className="mt-1 text-xs text-[#718078]">Sin dificultad: dos personas comparten el dispositivo.</p></button>
          </div>
        </div>
      </div>}
      {((trainingComplete || freeGameOver) && !summaryDismissed && !showMainMenu) && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#20362e]/35 p-5"><div className="relative w-full max-w-[620px] rounded-3xl border border-[#c8c0b0] bg-[#f5efe3] p-7 shadow-2xl"><button type="button" onClick={()=>setSummaryDismissed(true)} className="absolute right-4 top-4 rounded-full p-2 text-[#6d7c73] hover:bg-[#e8dfcf]" aria-label="Cerrar resumen"><XCircle size={20}/></button><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7b897f]">Sesión finalizada</p><h2 className="mt-2 text-3xl font-extrabold text-[#20362e]">Resumen</h2>{mode==='opening'?<div className="mt-5 grid gap-2 text-sm text-[#486257]"><p>Variante: <b>{openingVariant?.name}</b></p><p>Errores: <b>{trainingErrors}</b></p><p>Aciertos: <b>{trainingCorrectMoves}</b></p><p>Precisión: <b>{trainingAccuracy}%</b></p><p>Pistas: <b>{trainingHintsUsed}</b></p></div>:<div className="mt-5 grid gap-2 text-sm text-[#486257]"><p>Jugadas: <b>{moveHistory.length}</b></p><p>Alertas tácticas: <b>{completeErrors}</b></p><p>Alertas medio juego: <b>{middlegameErrors}</b></p><p>Alertas finales: <b>{endgameErrors}</b></p></div>}<div className="mt-7 flex justify-end gap-2"><button type="button" onClick={goHome} className="rounded-lg border border-[#c8c0b0] px-4 py-2 text-xs font-bold text-[#40564b]">Inicio</button><button type="button" onClick={continueSession} className="rounded-lg bg-[#1f5b49] px-4 py-2 text-xs font-bold text-white">Continuar</button></div></div></div>}
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