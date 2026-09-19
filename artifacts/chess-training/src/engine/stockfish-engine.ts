import type { ChessGameState, Piece, Side } from './chess-engine';

export type StockfishScore =
  | { type: 'cp'; value: number }
  | { type: 'mate'; value: number };

export type StockfishAnalysis = {
  bestMove: string;
  score: StockfishScore | null;
  depth: number | null;
  principalVariation: string[];
};

export type StockfishEngineOptions = {
  depth?: number;
  workerUrl?: string;
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function pieceToFen(piece: Piece): string {
  const map: Record<Piece['type'], string> = {
    pawn: 'p',
    knight: 'n',
    bishop: 'b',
    rook: 'r',
    queen: 'q',
    king: 'k',
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

      if (!piece) {
        empty += 1;
        continue;
      }

      if (empty) {
        rank += String(empty);
        empty = 0;
      }

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

  return [
    ranks.join('/'),
    state.turn === 'white' ? 'w' : 'b',
    castling,
    enPassant,
    state.halfmoveClock,
    fullmove,
  ].join(' ');
}

function parseScore(line: string): StockfishScore | null {
  const mate = line.match(/\bscore mate (-?\d+)/);
  if (mate) return { type: 'mate', value: Number(mate[1]) };

  const cp = line.match(/\bscore cp (-?\d+)/);
  if (cp) return { type: 'cp', value: Number(cp[1]) };

  return null;
}

function parseInfo(line: string): { score: StockfishScore | null; depth: number | null; pv: string[] } | null {
  if (!line.startsWith('info ')) return null;

  const depthMatch = line.match(/\bdepth (\\d+)/);
  const pvIndex = line.indexOf(' pv ');
  const pv = pvIndex >= 0 ? line.slice(pvIndex + 4).trim().split(/\s+/).filter(Boolean) : [];

  return {
    score: parseScore(line),
    depth: depthMatch ? Number(depthMatch[1]) : null,
    pv,
  };
}

export function chessGameStateToFen(state: ChessGameState): string {
  return boardToFen(state);
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

    const workerUrl = options.workerUrl ?? `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

    this.worker = new Worker(workerUrl, { type: 'classic' });

    this.ready = new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('No se pudo crear el worker de Stockfish.'));
        return;
      }

      const timeout = window.setTimeout(() => {
        reject(new Error('Stockfish no respondió a tiempo.'));
      }, 15_000);

      this.worker.onmessage = (event: MessageEvent<string>) => {
        const line = String(event.data);

        if (line === 'uciok') {
          this.worker?.postMessage('isready');
          return;
        }

        if (line === 'readyok') {
          window.clearTimeout(timeout);
          resolve();
          return;
        }

        const info = parseInfo(line);
        if (info) {
          if (info.score) this.latestScore = info.score;
          if (info.depth !== null) this.latestDepth = info.depth;
          if (info.pv.length) this.latestPv = info.pv;
          return;
        }

        if (!line.startsWith('bestmove ')) return;

        const bestMove = line.split(/\s+/)[1];
        if (!bestMove || !this.pendingResolve) return;

        const resolveAnalysis = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject = null;

        resolveAnalysis({
          bestMove,
          score: this.latestScore,
          depth: this.latestDepth,
          principalVariation: this.latestPv,
        });
      };

      this.worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'Error del motor Stockfish.'));
      };

      this.worker.postMessage('uci');
    });

    return this.ready;
  }

  async analyze(state: ChessGameState, options: StockfishEngineOptions = {}): Promise<StockfishAnalysis> {
    await this.init(options);

    if (!this.worker) throw new Error('Stockfish no está disponible.');
    if (this.pendingResolve) throw new Error('Stockfish ya está analizando otra posición.');

    this.latestScore = null;
    this.latestDepth = null;
    this.latestPv = [];

    const depth = options.depth ?? 12;
    const fen = boardToFen(state);

    return new Promise<StockfishAnalysis>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.worker?.postMessage('stop');
      this.worker?.postMessage(`position fen ${fen}`);
      this.worker?.postMessage(`go depth ${depth}`);
    });
  }

  stop(): void {
    this.worker?.postMessage('stop');
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;

    if (this.pendingReject) {
      this.pendingReject(new Error('Análisis Stockfish cancelado.'));
    }

    this.pendingResolve = null;
    this.pendingReject = null;
  }
}

