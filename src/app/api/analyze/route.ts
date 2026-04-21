import { NextRequest } from "next/server";
import { Chess } from "chess.js";
import {
  createEngine,
  type StockfishEngine,
} from "@/lib/stockfish-engine";
import type {
  GameAnalysis,
  AnalyzedMove,
  MoveClassification,
} from "@/lib/mock-data";

// Disable static prerendering for this route
export const dynamic = "force-dynamic";

// --- Win% and accuracy formulas (Lichess / Chess.com approach) ---

/** Convert centipawn evaluation to Win% (0-100) from the given player's perspective */
function evalToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Compute accuracy of a single move from Win% before and after (player's perspective) */
function computeMoveAccuracy(winBefore: number, winAfter: number): number {
  const winLoss = winBefore - winAfter;
  if (winLoss <= 0) return 100;
  const accuracy = 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669;
  return Math.max(0, Math.min(100, accuracy));
}

/** Harmonic mean of move accuracies (penalizes bad moves more than arithmetic mean) */
function harmonicMean(values: number[]): number {
  if (values.length === 0) return 0;
  const filtered = values.map((v) => Math.max(v, 0.01)); // avoid div by 0
  const sum = filtered.reduce((acc, v) => acc + 1 / v, 0);
  return filtered.length / sum;
}

// --- Eval info for classification ---

interface EvalInfo {
  score: number; // white's perspective
  bestMove: string;
  isMate: boolean;
  mateIn: number | null;
}

/** Classify a move using Win% loss and contextual factors */
function classifyMove(
  cpLoss: number,
  evalBefore: EvalInfo,
  evalAfter: EvalInfo,
  isWhiteMove: boolean
): MoveClassification {
  // Player's eval from their own perspective
  const playerEvalBefore = isWhiteMove ? evalBefore.score : -evalBefore.score;
  const playerEvalAfter = isWhiteMove ? evalAfter.score : -evalAfter.score;

  // Win% from the moving player's perspective
  const winBefore = evalToWinPercent(playerEvalBefore);
  const winAfter = evalToWinPercent(playerEvalAfter);
  const winLoss = winBefore - winAfter; // positive = player got worse

  // Eval gain for the player (positive = position improved for the mover)
  const playerEvalGain = playerEvalAfter - playerEvalBefore;

  // --- Missed Win ---
  // Player had a forced mate from their side and lost it
  const hadMate =
    evalBefore.isMate &&
    evalBefore.mateIn !== null &&
    ((isWhiteMove && evalBefore.mateIn > 0) ||
      (!isWhiteMove && evalBefore.mateIn < 0));
  const stillHasMate =
    evalAfter.isMate &&
    evalAfter.mateIn !== null &&
    ((isWhiteMove && evalAfter.mateIn > 0) ||
      (!isWhiteMove && evalAfter.mateIn < 0));

  if (hadMate && !stillHasMate && cpLoss > 50) return "miss";
  // Had a very winning position (Win% > 95) and dropped significantly
  if (winBefore > 95 && winLoss > 15) return "miss";

  // --- Blunder: massive Win% drop (≥20%) ---
  if (winLoss >= 20) return "blunder";

  // --- Mistake: significant Win% drop (≥10%) ---
  if (winLoss >= 10) return "mistake";

  // --- Inaccuracy: moderate Win% drop (≥5%) ---
  if (winLoss >= 5) return "inaccuracy";

  // --- Good: small but noticeable drop (≥2%) ---
  if (winLoss >= 2) return "good";

  // --- Excellent: tiny drop (>0.5%) ---
  if (cpLoss > 0 && winLoss > 0.5) return "excellent";

  // --- Best move territory (cpLoss ≈ 0) ---

  // Brilliant: best move that finds a stunning tactical blow
  // Position dramatically improved AND wasn't already completely winning
  if (
    cpLoss <= 5 &&
    playerEvalGain > 150 &&
    playerEvalBefore < 400 &&
    playerEvalBefore > -600
  ) {
    return "brilliant";
  }

  // Great: best move that significantly improves position
  if (
    cpLoss <= 5 &&
    playerEvalGain > 80 &&
    playerEvalBefore < 500 &&
    playerEvalBefore > -600
  ) {
    return "great";
  }

  // Default: best
  return "best";
}

/** Normalize eval from side-to-move's perspective to white's perspective */
function normalizeEval(stmEval: number, whiteToMove: boolean): number {
  return whiteToMove ? stmEval : -stmEval;
}

/** Convert UCI move to SAN using chess.js */
function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = chess.move({ from, to, promotion });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

/** Extract per-half-move clock times from PGN comments like { [%clk 1:05:23] } */
function parseClocksFromPgn(pgn: string): string[] {
  const clocks: string[] = [];
  const regex = /\[%clk\s+(\d+:\d{2}:\d{2}(?:\.\d+)?)\]/g;
  let match;
  while ((match = regex.exec(pgn)) !== null) {
    clocks.push(match[1]);
  }
  return clocks;
}

export async function POST(request: NextRequest) {
  let engine: StockfishEngine | undefined;
  try {
    const body = await request.json();
    const { gameId, pgn, depth = 16 } = body as {
      gameId: string;
      pgn: string;
      depth?: number;
    };

    if (!gameId || !pgn) {
      return Response.json(
        { error: "gameId and pgn are required" },
        { status: 400 }
      );
    }

    // Clamp depth to reasonable range
    const analysisDepth = Math.max(8, Math.min(20, depth));

    // Parse PGN into individual moves
    const chess = new Chess();
    try {
      chess.loadPgn(pgn);
    } catch {
      return Response.json({ error: "Invalid PGN" }, { status: 400 });
    }

    const history = chess.history({ verbose: true });
    if (history.length === 0) {
      return Response.json(
        { error: "No moves found in PGN" },
        { status: 400 }
      );
    }

    // Extract per-move clock times from PGN comments (if present)
    const clocks = parseClocksFromPgn(pgn);

    // Collect all positions to analyze: starting position + after each move
    const positions: string[] = [history[0].before]; // starting FEN
    for (const move of history) {
      positions.push(move.after);
    }

    // Adaptive time budget: ~20s total, split across positions, clamped 150-500ms each
    const TARGET_BUDGET_MS = 20000;
    const movetime = Math.max(150, Math.min(500, Math.floor(TARGET_BUDGET_MS / positions.length)));

    // Initialize Stockfish engine
    engine = await createEngine();

    // Analyze all positions (storing full eval info including mate data)
    const evals: EvalInfo[] = [];

    for (let i = 0; i < positions.length; i++) {
      const result = await engine.analyze(positions[i], analysisDepth, movetime);
      const whiteToMove = positions[i].includes(" w ");
      evals.push({
        score: normalizeEval(result.score, whiteToMove),
        bestMove: result.bestMove,
        isMate: result.isMate,
        mateIn: result.mateIn,
      });
    }

    // Build analyzed moves
    const analyzedMoves: AnalyzedMove[] = [];
    let blunders = 0;
    let mistakes = 0;
    let inaccuracies = 0;
    let brilliancies = 0;
    let greats = 0;
    let missedWins = 0;

    // Per-side move accuracies for game accuracy computation
    const whiteMoveAccuracies: number[] = [];
    const blackMoveAccuracies: number[] = [];

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const evalBefore = evals[i]; // position before this move
      const evalAfter = evals[i + 1]; // position after this move
      const isWhiteMove = move.color === "w";

      // Centipawn loss from the mover's perspective
      let cpLoss: number;
      if (isWhiteMove) {
        cpLoss = evalBefore.score - evalAfter.score;
      } else {
        cpLoss = evalAfter.score - evalBefore.score;
      }
      cpLoss = Math.max(0, cpLoss);

      // Win%-based classification
      const classification = classifyMove(
        cpLoss,
        evalBefore,
        evalAfter,
        isWhiteMove
      );

      // Count classifications
      if (classification === "blunder") blunders++;
      else if (classification === "mistake") mistakes++;
      else if (classification === "inaccuracy") inaccuracies++;
      else if (classification === "brilliant") brilliancies++;
      else if (classification === "great") greats++;
      else if (classification === "miss") missedWins++;

      // Compute per-move accuracy using Win%
      const playerEvalBefore = isWhiteMove
        ? evalBefore.score
        : -evalBefore.score;
      const playerEvalAfter = isWhiteMove
        ? evalAfter.score
        : -evalAfter.score;
      const winBefore = evalToWinPercent(playerEvalBefore);
      const winAfter = evalToWinPercent(playerEvalAfter);
      const moveAccuracy = computeMoveAccuracy(winBefore, winAfter);

      if (isWhiteMove) {
        whiteMoveAccuracies.push(moveAccuracy);
      } else {
        blackMoveAccuracies.push(moveAccuracy);
      }

      const bestMoveUci = evals[i].bestMove;
      const bestMoveSan = uciToSan(positions[i], bestMoveUci);

      analyzedMoves.push({
        moveNumber: Math.floor(i / 2) + 1,
        side: isWhiteMove ? "white" : "black",
        notation: move.san,
        uci: move.lan,
        fenBefore: move.before,
        fenAfter: move.after,
        eval: evalAfter.score,
        bestMove: bestMoveUci,
        bestMoveSan,
        classification,
        centipawnLoss: cpLoss,
        moveAccuracy,
        ...(clocks[i] ? { clock: clocks[i] } : {}),
      });
    }

    // Compute game accuracy per side using harmonic mean
    const whiteAccuracy =
      whiteMoveAccuracies.length > 0
        ? Math.round(harmonicMean(whiteMoveAccuracies) * 10) / 10
        : 0;
    const blackAccuracy =
      blackMoveAccuracies.length > 0
        ? Math.round(harmonicMean(blackMoveAccuracies) * 10) / 10
        : 0;

    const analysis: GameAnalysis = {
      gameId,
      analyzedAt: new Date().toISOString(),
      depth: analysisDepth,
      moves: analyzedMoves,
      startEval: evals[0].score,
      blunders,
      mistakes,
      inaccuracies,
      brilliancies,
      greats,
      missedWins,
      whiteAccuracy,
      blackAccuracy,
    };

    return Response.json(analysis);
  } catch (error) {
    console.error("Analysis error:", error);
    return Response.json(
      { error: "Analysis failed: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    );
  } finally {
    if (engine) {
      try {
        engine.quit();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
