import type { ChessGameMove, ChessGameState, Piece } from './chess-engine';
import { applyChessMove } from './chess-engine';

export type StockfishScore =
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number };

export type StockfishAnalysis = {
  bestMove: string;
  score: StockfishScore | null;
  depth: number | null;
  principalVariation: string[];
};

export type StockfishMoveQuality = {
  playedMove: string;
  bestMove: string;
  bestScore: StockfishScore | null;
  playedScore: StockfishScore | null;
  centipawnLoss: number | null;
  isBestMove: boolean;
};

export type StockfishEngineOptions = {
  depth?: number;
  workerUrl?: string;
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function pieceToFen(piece: Piece): string {
  const map: Record<Piece['type'], string> = {
    pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k',
  };
  const symbol = map[piece.type];
  return piece.color === 'white' ? symbol.toUpperCase() : symbol;
}

function boardToFen(state: ChessGameState): string {
  const ranks: string[] = [];
  for (let row = 0; row < 8; row += 1) {
    let empty = 0;
    let rank = '';
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece) { empty += 1; continue; }
      if (empty) { rank += String(empty); empty = 0; }
      rank += pieceToFen(piece);
    }
    if (empty) rank += String(empty);
    ranks.push(rank);
  }
  const castling = [
    state.castlingRights.whiteKingSide ? 'K' : '',
    state.castlingRights.whiteQueenSide ? 'Q' : '',
    state.castlingRights.blackKingSide ? 'k' : '',
    state.castlingRights.blackQueenSide ? 'q' : '',
  ].join('') || '-';
  const enPassant = state.enPassantTarget
    ? files[state.enPassantTarget.col] + String(8 - state.enPassantTarget.row)
    : '-';
  const fullmove = Math.max(1, Math.ceil(state.positionHistory.length / 2));
  return [ranks.join('/'), state.turn === 'white' ? 'w' : 'b', castling, enPassant, state.halfmoveClock, fullmove].join(' ');
}

function parseScore(line: string): StockfishScore | null {
  const mate = line.match(/\\bscore mate (-?\\d+)/);
  if (mate) return { type: 'mate', value: Number(mate[1]) };
  const cp = line.match(/\\bscore cp (-?\\d+)/);
  if (cp) return { type: 'cp', value: Number(cp[1]) };
  return null;
}

function parseInfo(line: string): { score: StockfishScore | null; depth: number | null; pv: string[] } | null {
  if (!line.startsWith('info ')) return null;
  const depthMatch = line.match(/\\bdepth (\\d+)/);
  const pvIndex = line.indexOf(' pv ');
  const pv = pvIndex >= 0 ? line.slice(pvIndex + 4).trim().split(/\\s+/).filter(Boolean) : [];
  return { score: parseScore(line), depth: depthMatch ? Number(depthMatch[1]) : null, pv };
}

function squareToUci(row: number, col: number): string {
  return files[col] + String(8 - row);
}

export function chessMoveToUci(move: ChessGameMove): string {
  const promotion = move.promotion ? move.promotion[0] : '';
  return squareToUci(move.from.row, move.from.col) + squareToUci(move.to.row, move.to.col) + promotion;
}

export function chessGameStateToFen(state: ChessGameState): string { return boardToFen(state); }

function centipawnLoss(bestScore: StockfishScore | null, playedScore: StockfishScore | null): number | null {
  if (!bestScore || !playedScore || bestScore.type !== 'cp' || playedScore.type !== 'cp') return null;
  return Math.max(0, bestScore.value - playedScore.value);
}

function invertScore(score: StockfishScore | null): StockfishScore | null {
  if (!score) return null;
  return { ...score, value: -score.value };
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pendingResolve: ((analysis: StockfishAnalysis) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private latestScore: StockfishScore | null = null;
  private latestDepth: number | null = null;
  private latestPv: string[] = [];

  async init(options: StockfishEngineOptions = {}): Promise<void> {
    if (this.worker && this.ready) return this.ready;
    if (typeof Worker === 'undefined') throw new Error('Este navegador no admite Web Workers para ejecutar Stockfish.');
    if (typeof WebAssembly === 'undefined') throw new Error('Este navegador no admite WebAssembly para ejecutar Stockfish.');
    const workerUrl = options.workerUrl ?? new URL('stockfish/stockfish-19-lite-single.js', window.location.origin + import.meta.env.BASE_URL).toString();
    try { this.worker = new Worker(workerUrl, { type: 'classic' }); }
    catch (error) { this.worker = null; throw new Error(error instanceof Error ? error.message : 'No se pudo crear el worker de Stockfish.'); }

    this.ready = new Promise<void>((resolve, reject) => {
      if (!this.worker) { reject(new Error('No se pudo crear el worker de Stockfish.')); return; }
      let settled = false;
      const timeout = window.setTimeout(() => fail(new Error('Stockfish no respondió a tiempo.')), 15000);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        this.ready = null;
        this.worker?.terminate();
        this.worker = null;
        reject(error);
      };
      this.worker.onmessage = (event: MessageEvent<string>) => {
        const line = String(event.data);
        if (line === 'uciok') { this.worker?.postMessage('isready'); return; }
        if (line === 'readyok') { if (settled) return; settled = true; window.clearTimeout(timeout); resolve(); return; }
        const info = parseInfo(line);
        if (info) {
          if (info.score) this.latestScore = info.score;
          if (info.depth !== null) this.latestDepth = info.depth;
          if (info.pv.length) this.latestPv = info.pv;
          return;
        }
        if (!line.startsWith('bestmove ')) return;
        const bestMove = line.split(/\\s+/)[1];
        if (!bestMove || bestMove === '(none)' || !this.pendingResolve) return;
        const resolveAnalysis = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;
        resolveAnalysis({ bestMove, score: this.latestScore, depth: this.latestDepth, principalVariation: this.latestPv });
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'Error del motor Stockfish.');
        if (this.pendingReject) {
          const rejectAnalysis = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject = null;
          rejectAnalysis(error);
        }
        fail(error);
      };
      this.worker.postMessage('uci');
    });
    return this.ready;
  }

  async analyze(state: ChessGameState, options: StockfishEngineOptions = {}): Promise<StockfishAnalysis> {
    await this.init(options);
    if (!this.worker) throw new Error('Stockfish no está disponible.');
    if (this.pendingResolve) throw new Error('Stockfish ya está analizando otra posición.');
    this.latestScore = null; this.latestDepth = null; this.latestPv = [];
    const depth = options.depth ?? 12;
    const fen = boardToFen(state);
    return new Promise<StockfishAnalysis>((resolve, reject) => {
      this.pendingResolve = resolve; this.pendingReject = reject;
      this.worker?.postMessage('stop');
      this.worker?.postMessage('ucinewgame');
      this.worker?.postMessage('position fen ' + fen);
      this.worker?.postMessage('go depth ' + depth);
    });
  }

  async analyzePlayedMove(previousState: ChessGameState, move: ChessGameMove, options: StockfishEngineOptions = {}): Promise<StockfishMoveQuality> {
    const best = await this.analyze(previousState, options);
    const nextState = applyChessMove(previousState, move);
    const opponentPerspective = await this.analyze(nextState, options);
    const playedScore = invertScore(opponentPerspective.score);
    const playedMove = chessMoveToUci(move);
    return {
      playedMove, bestMove: best.bestMove, bestScore: best.score, playedScore,
      centipawnLoss: centipawnLoss(best.score, playedScore), isBestMove: best.bestMove === playedMove,
    };
  }

  stop(): void { this.worker?.postMessage('stop'); }

  dispose(): void {
    this.worker?.terminate(); this.worker = null; this.ready = null;
    if (this.pendingReject) this.pendingReject(new Error('Análisis Stockfish cancelado.'));
    this.pendingResolve = null; this.pendingReject = null;
  }
}
