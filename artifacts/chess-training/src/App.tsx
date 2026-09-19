import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
  classifyTrainingError,
  chooseUnexpectedSituation,
  isExpectedMove,
  type UnexpectedEvent,
  type VariantSelection,
} from '@/engine/variant-engine';
import { chooseMiddlegameTrainingPrompt, type MiddlegameTrainingPrompt } from '@/engine/middlegame-training';
import { evaluateMiddlegameMove } from '@/engine/middlegame-evaluation';
import { chooseEndgameTrainingPrompt, type EndgameTrainingPrompt } from '@/engine/endgame-training';
import { evaluateEndgameMove } from '@/engine/endgame-evaluation';
import { evaluateCompleteMove } from '@/engine/complete-training';
import { StockfishEngine, type StockfishAnalysis, type StockfishMoveQuality } from '@/engine/stockfish-engine';
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
    put('e5', 'king', 'white'); put('e6', 'pawn', 'white'); put('e7', 'king', 'black');
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
  const [stockfishAnalysis, setStockfishAnalysis] = useState<StockfishAnalysis | null>(null);
  const [stockfishLoading, setStockfishLoading] = useState(false);
  const [stockfishError, setStockfishError] = useState('');
  const [stockfishMoveQuality, setStockfishMoveQuality] = useState<StockfishMoveQuality | null>(null);
  const [stockfishCoachResult, setStockfishCoachResult] = useState<StockfishCoachResult | null>(null);
  const [stockfishMoveLoading, setStockfishMoveLoading] = useState(false);
  const [completeErrors, setCompleteErrors] = useState(0);
  const [middlegameErrors, setMiddlegameErrors] = useState(0);
  const [endgameErrors, setEndgameErrors] = useState(0);
  const [endgamePrompt, setEndgamePrompt] = useState<EndgameTrainingPrompt | null>(null);
  const [middlegamePrompt, setMiddlegamePrompt] = useState<MiddlegameTrainingPrompt | null>(null);
  const [showGuide, setShowGuide] = useState(false);
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
  const [trainingExplanation, setTrainingExplanation] = useState('');
  const [unexpectedPlayEnabled, setUnexpectedPlayEnabled] = useState(true);
  const [unexpectedDifficulty, setUnexpectedDifficulty] = useState<'fundamentos' | 'intermedio' | 'avanzado'>('intermedio');
  const [unexpectedEvent, setUnexpectedEvent] = useState<UnexpectedEvent | null>(null);
  const [unexpectedChallenge, setUnexpectedChallenge] = useState<{ event: UnexpectedEvent; resumeNodeId: string; resumeBoard: Board; resumeHistory: string[]; resumeTurn: OpeningColor } | null>(null);
  const [completeUnexpectedChallenge, setCompleteUnexpectedChallenge] = useState<{ event: UnexpectedEvent; triggeringMove: ChessGameMove } | null>(null);
  useEffect(() => () => {
    stockfishAnalysisRequestRef.current += 1;
    stockfishMoveBusyRef.current = false;
    stockfishRef.current?.dispose();
    stockfishRef.current = null;
  }, []);

  const analyzeWithStockfish = async () => {
    if (mode !== 'complete' || stockfishLoading) return;
    setStockfishLoading(true);
    setStockfishError('');
    try {
      if (!stockfishRef.current) stockfishRef.current = new StockfishEngine();
      const analysis = await stockfishRef.current.analyze(completeGame, { depth: 12 });
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
    if (mode !== 'complete' || completeGame.turn !== 'black' || completeGameOver) return;
    const timer = window.setTimeout(() => {
      const candidates = getLegalChessMoves(completeGame);
      if (!candidates.length) return;
      const checks: ChessGameMove[] = [];
      const captures: ChessGameMove[] = [];
      for (const move of candidates) {
        const target = completeGame.board[move.to.row][move.to.col];
        const next = applyChessMove(completeGame, move);
        const status = getChessGameStatus(next);
        if (status === 'check' || status === 'checkmate') checks.push(move);
        if (target || move.special === 'en-passant') captures.push(move);
      }
      const pool = checks.length ? checks : captures.length ? captures : candidates;
      const unexpected = unexpectedPlayEnabled
        ? chooseUnexpectedSituation(completeGame.board, 'black', { enabled: true, difficulty: unexpectedDifficulty })
        : null;
      const move = unexpected?.move ?? pool[Math.floor(Math.random() * pool.length)];
      const nextGame = applyChessMove(completeGame, move);
      setCompleteGame(nextGame);
      setBoard(nextGame.board);
      const nextEndgamePrompt = chooseEndgameTrainingPrompt(nextGame);
      setEndgamePrompt(nextEndgamePrompt);
      setMiddlegamePrompt(nextEndgamePrompt ? null : chooseMiddlegameTrainingPrompt(nextGame, { difficulty: unexpectedDifficulty }));
      setLastMove([squareName(move.from), squareName(move.to)]);
      setMoveHistory((history) => [...history, "Rival: " + squareName(move.from) + "–" + squareName(move.to)]);
      setTurn(nextGame.turn);
      setSelected(null);
      setPromotionPending(null);
      if (unexpected?.move) {
        setCompleteUnexpectedChallenge({ event: unexpected, triggeringMove: move });
        setUnexpectedEvent(unexpected);
        setFocusCue('Juego inesperado: antes de continuar tu plan, responde a la situación creada por el rival.');
      } else {
        setCompleteUnexpectedChallenge(null);
        setUnexpectedEvent(null);
        setFocusCue(nextEndgamePrompt
          ? 'Final detectado. Cambia el plan: actividad del rey, peones pasados y técnica del final.'
          : 'El rival movió. Antes de responder, comprueba amenazas, capturas y jugadas forzadas.');
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [mode, completeGame, completeGameOver, unexpectedPlayEnabled, unexpectedDifficulty]);

  const resetFreePractice = () => {
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
    setTrainingExplanation('');
    setUnexpectedEvent(null);
    setUnexpectedChallenge(null);
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
    setUnexpectedEvent(null);
    setUnexpectedChallenge(null);
    // El juego inesperado se activa después de la primera decisión del jugador, no al arrancar.
  };

  const startFocusedTraining = (focus: Exclude<TrainingFocus, 'opening' | 'complete'>) => {
    const kind = focus === 'middlegame'
      ? 'middlegame' as const
      : (['opposition', 'rooks', 'queen'] as const)[Math.floor(Math.random() * 3)];
    const freshGame = createFocusedGameState(makeTrainingBoard(kind), 'white');
    setCompleteGame(freshGame);
    setPromotionPending(null);
    setBoard(freshGame.board);
    setMode('complete');
    setTrainingFocus(focus);
    setTurn('white');
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
    setMiddlegamePrompt(focus === 'middlegame' ? chooseMiddlegameTrainingPrompt(freshGame, { difficulty: 'intermedio' }) : null);
    setTrainingSelection(null);
    setOpeningNodeId(null);
    setUnexpectedEvent(null);
    setUnexpectedChallenge(null);
  };

  const startCompleteGame = () => {
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
    setMiddlegamePrompt(chooseMiddlegameTrainingPrompt(freshCompleteGame, { difficulty: 'intermedio' }));
    setTrainingSelection(null);
    setOpeningNodeId(null);
    setUnexpectedEvent(null);
    setUnexpectedChallenge(null);
  };

  const resetTraining = () => {
    startOpeningTraining(trainingSelection ?? chooseVariant(), trainingSideChoice);
  };

  const exitTraining = () => {
    resetFreePractice();
  };

  const resetGame = () => {
    if (mode === 'opening') {
      resetTraining();
      return;
    }
    if (mode === 'complete') {
      startCompleteGame();
      return;
    }
    resetFreePractice();
  };

  const handleUnexpectedMove = (from: Square, to: Square) => {
    if (!unexpectedChallenge) return false;
    const move = { from, to };
    const legalResponse = getLegalMoves(board, from).some((square) => square.row === to.row && square.col === to.col);
    if (!legalResponse) return true;

    const challenge = unexpectedChallenge;
    const event = challenge.event;
    const nextBoard = applyBoardMove(board, move);
    const responseText = `${squareName(from)}–${squareName(to)}`;
    const explanation = event.type === 'amenaza'
      ? 'Respuesta válida: primero neutralizaste la amenaza y evitaste continuar de memoria.'
      : event.type === 'sacrificio'
        ? 'Respuesta válida: calculaste la posición después del sacrificio antes de continuar.'
        : 'Respuesta válida: reaccionaste a la desviación y volviste a evaluar la posición.';

    setBoard(challenge.resumeBoard);
    setLastMove(null);
    setMoveHistory(challenge.resumeHistory);
    setTurn(challenge.resumeTurn);
    setSelected(null);
    setOpeningNodeId(challenge.resumeNodeId);
    setUnexpectedChallenge(null);
    setUnexpectedEvent(null);
    setTrainingStatus('correct');
    setTrainingExplanation(`Juego inesperado superado. ${explanation}`);
    return true;
  };

  const handleOpeningMove = (from: Square, to: Square) => {
    if (unexpectedChallenge) {
      handleUnexpectedMove(from, to);
      return;
    }
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
      setUnexpectedEvent(unexpectedPlayEnabled ? chooseUnexpectedSituation(board, getOpponentSide(trainingPlayerColor), { enabled: true, difficulty: unexpectedDifficulty }) : null);
      setTrainingExplanation(`Por qué: ${expectedMove.whyWrong ?? expectedMove.typicalError}\nTipo de error: ${errorCategory}.`);
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

    const nextHistory = [
      ...moveHistory,
      expectedMove.notation,
      ...automaticMoves.map((move) => move.notation),
    ];
    setBoard(nextBoard);
    setLastMove([lastAppliedMove.from, lastAppliedMove.to]);
    setMoveHistory(nextHistory);
    setSelected(null);
    setOpeningNodeId(nextNodeId);
    setMoveErrors(0);
    setHintLevel(0);
    setTrainingAttempts((attempts) => attempts + 1);
    setTrainingCorrectMoves((moves) => moves + 1);
    const nextUnexpectedEvent = unexpectedPlayEnabled ? chooseUnexpectedSituation(nextBoard, getOpponentSide(trainingPlayerColor), { enabled: true, difficulty: unexpectedDifficulty }) : null;
    if (nextUnexpectedEvent?.move) {
      const challengeMove = nextUnexpectedEvent.move;
      const challengeBoard = applyBoardMove(nextBoard, challengeMove);
      setBoard(challengeBoard);
      setLastMove([nextUnexpectedEvent.from ?? squareName(challengeMove.from), nextUnexpectedEvent.to ?? squareName(challengeMove.to)]);
      setMoveHistory((history) => [...history, `Inesperado: ${nextUnexpectedEvent.from ?? squareName(challengeMove.from)}–${nextUnexpectedEvent.to ?? squareName(challengeMove.to)}`]);
      setUnexpectedChallenge({ event: nextUnexpectedEvent, resumeNodeId: nextNodeId, resumeBoard: nextBoard, resumeHistory: nextHistory, resumeTurn: trainingPlayerColor });
      setUnexpectedEvent(nextUnexpectedEvent);
    } else {
      setUnexpectedEvent(null);
      setUnexpectedChallenge(null);
    }
    setTrainingExplanation([`Idea: ${expectedMove.concept}`, `Objetivo: ${expectedMove.objective}`, `Amenaza/clave: ${expectedMove.threat}`, `Error típico: ${expectedMove.typicalError}`, `Nivel: ${expectedMove.difficulty}`, expectedMove.explanation].join('\n'));
    setTrainingStatus(isLastPlayerMove ? 'complete' : 'correct');
  };

  const applyCompleteMove = (move: ChessGameMove) => {
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
    if (endgameEvaluation && !endgameEvaluation.fulfilled) setEndgameErrors((errors) => errors + 1);
    if (middlegameEvaluation && !middlegameEvaluation.fulfilled) setMiddlegameErrors((errors) => errors + 1);

    const objectiveEvaluation = endgameEvaluation ?? middlegameEvaluation;
    const combinedFeedback = objectiveEvaluation
      ? `${objectiveEvaluation.feedback} ${evaluation.feedback}`
      : evaluation.feedback;

    setCompleteFeedback(combinedFeedback);
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
    const shouldAutoAnalyze = previousGame.turn === 'white' && (tacticalPosition || periodicPosition);

    if (shouldAutoAnalyze && !stockfishMoveBusyRef.current) {
      const requestId = ++stockfishAnalysisRequestRef.current;
      stockfishMoveBusyRef.current = true;
      setStockfishMoveLoading(true);
      setStockfishError('');
      if (!stockfishRef.current) stockfishRef.current = new StockfishEngine();
      void stockfishRef.current.analyzePlayedMove(previousGame, move, { depth: 10 })
        .then((quality) => {
          if (requestId !== stockfishAnalysisRequestRef.current) return;
          setStockfishMoveQuality(quality);
          const coach = classifyStockfishMove(quality);
          setStockfishCoachResult(coach);
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
    const reachedEndgame = chooseEndgameTrainingPrompt(nextGame);
    setEndgamePrompt(reachedEndgame);
    setMiddlegamePrompt(reachedEndgame ? null : chooseMiddlegameTrainingPrompt(nextGame, { difficulty: 'intermedio' }));
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
    if (mode === 'complete' && completeUnexpectedChallenge) {
      const clickedPiece = board[row][col];
      const clickedIsLegal = legalKeySet.has(`${row}-${col}`);
      if (selected && clickedIsLegal) {
        const moveCandidates = getLegalChessMoves(completeGame).filter(
          (candidate) =>
            candidate.from.row === selected.row &&
            candidate.from.col === selected.col &&
            candidate.to.row === row &&
            candidate.to.col === col,
        );
        if (!moveCandidates.length) return;
        if (moveCandidates.some((move) => move.promotion)) {
          setPromotionPending({ from: selected, to: { row, col } });
          return;
        }
        const move = moveCandidates[0];
        const nextGame = applyChessMove(completeGame, move);
        setCompleteGame(nextGame);
        setBoard(nextGame.board);
        setLastMove([squareName(move.from), squareName(move.to)]);
        setMoveHistory((history) => [...history, `${squareName(move.from)}–${squareName(move.to)}${move.promotion ? '=' + move.promotion[0].toUpperCase() : ''}`]);
        setTurn(nextGame.turn);
        setSelected(null);
        setCompleteUnexpectedChallenge(null);
        setUnexpectedEvent(null);
        setCompleteFeedback('Respuesta registrada. La situación inesperada fue integrada en la partida; ahora vuelve a comprobar jaques, capturas y amenazas.');
        setFocusCue('Respuesta realizada. Vuelve a evaluar la posición desde cero antes de continuar.');
        return;
      }
      if (clickedPiece?.color === 'white') {
        setSelected({ row, col });
        setFocusCue('Situación inesperada: identifica primero la amenaza y luego elige tu respuesta.');
        return;
      }
      setSelected(null);
      return;
    }
    if (mode === 'opening' && unexpectedChallenge) {
      const clickedPiece = board[row][col];
      const clickedIsLegal = legalKeySet.has(`${row}-${col}`);
      if (selected && clickedIsLegal) {
        handleOpeningMove(selected, { row, col });
        return;
      }
      if (clickedPiece?.color === trainingPlayerColor) {
        setSelected({ row, col });
        setFocusCue('Situación inesperada: calcula primero la respuesta antes de continuar la variante.');
        return;
      }
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
        if (moveCandidates.some((move) => move.promotion)) {
          setPromotionPending({ from: selected, to: { row, col } });
          return;
        }
        applyCompleteMove(moveCandidates[0]);
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

    if (mode === 'complete' && completeGame.turn === 'black') {
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

  const displayedBoard = trainingPlayerColor === 'black'
    ? board.slice().reverse().map((row) => row.slice().reverse())
    : board;

  return (
    <div className="app-grain min-h-[100dvh] overflow-x-hidden bg-[#e9e3d5]">
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1600px]">
        <aside className="hidden w-[238px] shrink-0 flex-col border-r border-[#d3cbb9] bg-[#ded6c6] px-5 py-7 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#1f5b49] text-[#f4ecd9] shadow-[0_8px_18px_rgba(31,91,73,.18)]">
              <Crown size={20} strokeWidth={1.8} />
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
                onClick={startCompleteGame}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${mode === 'complete' ? 'bg-[#f3eee3] shadow-sm' : 'hover:bg-[#e5ddce]'}`}
              >
                <Crown size={16} className="text-[#c38a3d]" />
                <span className="text-[12px] font-bold text-[#2c4039]">Modo completo</span>
                {mode === 'complete' && <span className="ml-auto size-1.5 rounded-full bg-[#c38a3d]" />}
              </button>
              <button type="button" onClick={() => startFocusedTraining('middlegame')} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[#e5ddce]">
                <BookOpen size={16} className="text-[#1f5b49]" /><span className="text-[12px] font-bold text-[#2c4039]">Entrenamiento de medio juego</span>
              </button>
              <button type="button" onClick={() => startFocusedTraining('endgame')} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[#e5ddce]">
                <Crown size={16} className="text-[#c38a3d]" /><span className="text-[12px] font-bold text-[#2c4039]">Entrenamiento de finales</span>
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
              <div className="flex max-w-[190px] items-center gap-1 overflow-x-auto rounded-lg border border-[#cfc5b3] bg-[#e5dece] p-1 lg:hidden" data-testid="mobile-training-modes">
                <button type="button" onClick={() => startOpeningTraining()} className={`shrink-0 rounded-md px-2 py-1.5 text-[9px] font-bold ${trainingFocus === 'opening' ? 'bg-[#1f5b49] text-[#f5efdf]' : 'text-[#5f7067]'}`}>Apertura</button>
                <button type="button" onClick={() => startFocusedTraining('middlegame')} className={`shrink-0 rounded-md px-2 py-1.5 text-[9px] font-bold ${trainingFocus === 'middlegame' ? 'bg-[#1f5b49] text-[#f5efdf]' : 'text-[#5f7067]'}`}>Medio juego</button>
                <button type="button" onClick={() => startFocusedTraining('endgame')} className={`shrink-0 rounded-md px-2 py-1.5 text-[9px] font-bold ${trainingFocus === 'endgame' ? 'bg-[#1f5b49] text-[#f5efdf]' : 'text-[#5f7067]'}`}>Final</button>
                <button type="button" onClick={startCompleteGame} className={`shrink-0 rounded-md px-2 py-1.5 text-[9px] font-bold ${trainingFocus === 'complete' && mode === 'complete' ? 'bg-[#1f5b49] text-[#f5efdf]' : 'text-[#5f7067]'}`}>Completa</button>
              </div>
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
                           className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors ${(trainingSideChoice === value) ? 'border-[#1f5b49] bg-[#1f5b49] text-[#f5efdf]' : 'border-[#c8c0b0] bg-[#eee8dc] text-[#5f7067] hover:border-[#1f5b49] hover:text-[#1f5b49]'}`}
                         >
                           {label}
                         </button>
                       ))}
                     </div>
                     <div className="mt-4 flex flex-wrap items-center gap-2">
                       <p className="text-[13px] font-semibold text-[#5f7067]" data-testid="text-new-variant">
                         Nueva variante: <span className="text-[#1f5b49]">{openingVariant?.name ?? 'seleccionando...'}</span>
                       </p>
                       <button
                         type="button"
                         onClick={() => setUnexpectedPlayEnabled((enabled) => !enabled)}
                         className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors ${unexpectedPlayEnabled ? 'border-[#1f5b49] bg-[#1f5b49] text-[#f5efdf]' : 'border-[#c8c0b0] bg-[#eee8dc] text-[#5f7067]'}`}
                         data-testid="toggle-unexpected-play"
                       >
                         {unexpectedPlayEnabled ? 'Juego inesperado: activo' : 'Juego inesperado: apagado'}
                       </button>
                       {unexpectedPlayEnabled && (
                         <select
                           value={unexpectedDifficulty}
                           onChange={(event) => setUnexpectedDifficulty(event.target.value as typeof unexpectedDifficulty)}
                           className="rounded-full border border-[#c8c0b0] bg-[#eee8dc] px-3 py-1.5 text-[10px] font-bold text-[#5f7067]"
                           aria-label="Dificultad del juego inesperado"
                         >
                           <option value="fundamentos">Inesperado: fundamentos</option>
                           <option value="intermedio">Inesperado: intermedio</option>
                           <option value="avanzado">Inesperado: avanzado</option>
                         </select>
                       )}
                     </div>
                     {unexpectedEvent && unexpectedPlayEnabled && (
                       <div className="mt-3 rounded-xl border border-[#c9b98f] bg-[#eee4cc] px-3 py-2.5" data-testid="unexpected-event">
                         <p className="text-[11px] font-extrabold text-[#5f563f]">{unexpectedEvent.title}</p>
                         <p className="mt-1 text-[11px] leading-relaxed text-[#6c634d]">{unexpectedEvent.message}</p>
                         {unexpectedEvent.concrete && unexpectedEvent.from && unexpectedEvent.to && <p className="mt-2 font-mono text-[10px] font-bold text-[#5f563f]">Situación concreta: {unexpectedEvent.from}–{unexpectedEvent.to}</p>}
                         {unexpectedChallenge && <p className="mt-2 text-[11px] font-extrabold text-[#5f563f]">Responde a esta situación para continuar el entrenamiento.</p>}
                       </div>
                     )}
                   </>
                 ) : (
                   <>
                     <h2 className="max-w-[580px] text-[clamp(2rem,4vw,3.5rem)] font-extrabold leading-[0.98] tracking-[-0.075em] text-[#20362e]">
                       Observa la<br className="hidden sm:block" /> posición.
                     </h2>
                     {mode === 'complete' && (
                       <div className="mt-4 flex flex-wrap items-center gap-2">
                         <button
                           type="button"
                           onClick={analyzeWithStockfish}
                           disabled={stockfishLoading}
                           className="rounded-full border border-[#c8c0b0] bg-[#eee8dc] px-3 py-1.5 text-[10px] font-bold text-[#5f7067] transition-colors hover:border-[#1f5b49] hover:text-[#1f5b49] disabled:cursor-not-allowed disabled:opacity-50"
                           data-testid="button-stockfish-analysis"
                         >
                           {stockfishLoading ? 'Analizando...' : completeGameOver ? 'Analizar posición final' : 'Analizar con Stockfish'}
                         </button>
                         {stockfishAnalysis && (
                           <div className="mt-2 w-full rounded-xl border border-[#c9b98f] bg-[#eee4cc] px-3 py-2.5">
                             <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#5f563f]">Análisis del motor</p>
                             <p className="mt-1 text-[11px] text-[#6c634d]">
                               Mejor jugada: <span className="font-mono font-bold">{stockfishAnalysis.bestMove}</span>
                               {stockfishAnalysis.score && (
                                 <> · Evaluación: <span className="font-mono font-bold">
                                   {stockfishAnalysis.score.type === 'mate' ? `mate en ${stockfishAnalysis.score.value}` : `${(stockfishAnalysis.score.value / 100).toFixed(2)}`}
                                 </span></>
                               )}
                             </p>
                             {stockfishAnalysis.principalVariation.length > 0 && (
                               <p className="mt-1 font-mono text-[10px] text-[#6c634d]">PV: {stockfishAnalysis.principalVariation.slice(0, 8).join(' ')}</p>
                             )}
                           </div>
                         )}
                         {stockfishError && (
                           <p className="mt-2 w-full text-[10px] font-semibold text-[#8a4b3f]">{stockfishError}</p>
                         )}
                         {stockfishMoveLoading && (
                           <p className="mt-2 w-full text-[10px] font-semibold text-[#6c634d]">Stockfish está comprobando la precisión de tu última jugada...</p>
                         )}
                         {stockfishMoveQuality && stockfishCoachResult && (
                           <div className="mt-2 w-full rounded-xl border border-[#c9b98f] bg-[#f1ead9] px-3 py-2.5">
                             <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#5f563f]">Coach de Stockfish</p>
                             <p className="mt-1 text-[11px] text-[#6c634d]">
                               <span className="font-bold">{stockfishCoachResult.label}</span> · Tu jugada <span className="font-mono font-bold">{stockfishMoveQuality.playedMove}</span> · principal <span className="font-mono font-bold">{stockfishMoveQuality.bestMove}</span>
                             </p>
                             <p className="mt-1 text-[10px] leading-relaxed text-[#6c634d]">{stockfishCoachResult.message}</p>
                             {stockfishCoachResult.centipawnLoss !== null && (
                               <p className="mt-1 text-[10px] text-[#6c634d]">Pérdida estimada: <span className="font-mono font-bold">{stockfishCoachResult.centipawnLoss} cp</span>.</p>
                             )}
                           </div>
                         )}
                         <button
                           type="button"
                           onClick={() => setUnexpectedPlayEnabled((enabled) => !enabled)}
                           className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors ${unexpectedPlayEnabled ? 'border-[#1f5b49] bg-[#1f5b49] text-[#f5efdf]' : 'border-[#c8c0b0] bg-[#eee8dc] text-[#5f7067]'}`}
                           data-testid="toggle-complete-unexpected"
                         >
                           {unexpectedPlayEnabled ? 'Juego inesperado: activo' : 'Juego inesperado: apagado'}
                         </button>
                         {unexpectedPlayEnabled && (
                           <select
                             value={unexpectedDifficulty}
                             onChange={(event) => setUnexpectedDifficulty(event.target.value as typeof unexpectedDifficulty)}
                             className="rounded-full border border-[#c8c0b0] bg-[#eee8dc] px-3 py-1.5 text-[10px] font-bold text-[#5f7067]"
                             aria-label="Dificultad del juego inesperado en modo completo"
                           >
                             <option value="fundamentos">Inesperado: fundamentos</option>
                             <option value="intermedio">Inesperado: intermedio</option>
                             <option value="avanzado">Inesperado: avanzado</option>
                           </select>
                         )}
                       </div>
                     )}
                   </>
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
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#879389]">{mode === 'opening' ? 'apertura' : trainingFocus === 'middlegame' ? 'medio juego' : trainingFocus === 'endgame' ? 'final' : trainingFocus === 'complete' ? 'partida completa' : 'práctica libre'}</span>
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

                <div className="board-frame overflow-hidden rounded-[5px] border-[10px] border-[#263f35] bg-[#263f35] sm:border-[14px]">
                  <div className="grid grid-cols-8 overflow-hidden rounded-[1px]" data-testid="chess-board">
                    {displayedBoard.map((row, displayRowIndex) =>
                      row.map((piece, displayColIndex) => {
                        const rowIndex = trainingPlayerColor === 'black' ? 7 - displayRowIndex : displayRowIndex;
                        const colIndex = trainingPlayerColor === 'black' ? 7 - displayColIndex : displayColIndex;
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
                            {displayColIndex === 0 && <span className="board-coord board-rank">{8 - rowIndex}</span>}
                            {displayRowIndex === 7 && <span className="board-coord board-file">{files[colIndex]}</span>}
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

                <div className="mt-4 xl:hidden rounded-xl border border-[#d1c8b7] bg-[#f2ece0] p-3.5" data-testid="mobile-training-summary">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-extrabold text-[#30473e]">{mode === 'opening' ? (unexpectedChallenge ? '⚠️ Responde a la situación inesperada' : trainingStatus === 'incorrect' ? 'Movimiento incorrecto' : trainingStatus === 'complete' ? '✅ Variante completada' : trainingStatus === 'correct' ? 'Movimiento correcto' : `Tu turno · ${trainingPlayerColor === 'white' ? 'blancas' : 'negras'}`) : trainingFocus === 'middlegame' ? '🎯 Medio juego' : trainingFocus === 'endgame' ? '♔ Final' : trainingFocus === 'complete' ? '♟ Partida completa' : 'Práctica libre'}</p>
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
                    {selected ? `${squareName(selected)} seleccionada · elige una casilla` : 'selecciona una pieza para comenzar'}
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
                     <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-[#7b897f]">{mode === 'opening' ? 'Entrenador de aperturas' : trainingFocus === 'middlegame' ? 'Entrenador de medio juego' : trainingFocus === 'endgame' ? 'Entrenador de finales' : 'Estado de la partida'}</p>
                     {mode === 'opening' ? <Lightbulb size={15} className="text-[#c38a3d]" /> : <BookOpen size={15} className="text-[#1f5b49]" />}
                  </div>
                   {mode === 'opening' ? (
                     <div className="mt-5">
                       <div className="flex items-start gap-2">
                         {trainingStatus === 'incorrect' ? <XCircle size={17} className="mt-0.5 shrink-0 text-[#aa493e]" /> : trainingStatus === 'correct' || trainingStatus === 'complete' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#1f5b49]" /> : <Target size={17} className="mt-0.5 shrink-0 text-[#1f5b49]" />}
                         <p className={`text-[16px] font-bold leading-snug tracking-[-0.03em] ${trainingStatus === 'incorrect' ? 'text-[#9e4138]' : 'text-[#30473e]'}`} data-testid="text-training-status">
                           {unexpectedChallenge ? '⚠️ Responde a la situación inesperada' : trainingStatus === 'incorrect' ? 'Movimiento incorrecto' : trainingStatus === 'complete' ? '✅ Variante completada' : trainingStatus === 'correct' ? 'Movimiento correcto' : trainingComplete ? '✅ Variante completada' : `Encuentra la siguiente jugada de ${trainingPlayerColor === 'white' ? 'blancas' : 'negras'}.`}
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
                       {mode === 'complete' && completeUnexpectedChallenge && !freeGameOver && (
                         <p className="mt-3 rounded-lg bg-[#eee4cc] px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-[#665b42]" data-testid="text-complete-unexpected">
                           ⚠️ Juego inesperado: responde a la situación antes de continuar tu plan.
                         </p>
                       )}
                       {mode === 'complete' && endgamePrompt && !freeGameOver && !completeUnexpectedChallenge && (
                       <div className="mt-3 rounded-lg bg-[#e8dfcf] px-3 py-2.5" data-testid="text-endgame-objective">
                         <p className="text-[11px] font-extrabold text-[#30473e]">♔ Final: {endgamePrompt.title}</p>
                         <p className="mt-1 text-[11px] leading-relaxed text-[#486257]">{endgamePrompt.instruction}</p>
                         <p className="mt-1 text-[10px] leading-relaxed text-[#718078]">{endgamePrompt.rationale}</p>
                       </div>
                     )}
                     {mode === 'complete' && middlegamePrompt && !freeGameOver && !completeUnexpectedChallenge && !endgamePrompt && (
                       <div className="mt-3 rounded-lg bg-[#e3e8dc] px-3 py-2.5" data-testid="text-middlegame-objective">
                         <p className="text-[11px] font-extrabold text-[#30473e]">🎯 Objetivo: {middlegamePrompt.title}</p>
                         <p className="mt-1 text-[11px] leading-relaxed text-[#486257]">{middlegamePrompt.instruction}</p>
                         <p className="mt-1 text-[10px] leading-relaxed text-[#718078]">{middlegamePrompt.rationale}</p>
                         <button type="button" onClick={() => setMiddlegamePrompt(chooseMiddlegameTrainingPrompt(completeGame, { difficulty: 'intermedio' }))} className="mt-2 rounded-full border border-[#c8c0b0] bg-[#f1ebdf] px-2.5 py-1 text-[9px] font-bold text-[#5f7067] hover:border-[#1f5b49] hover:text-[#1f5b49]">Nuevo objetivo</button>
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