import type { GameAnalysis, AnalyzedMove, Flashcard, MistakeType, Game } from "./mock-data";

/**
 * Generate SRS flashcards from a game analysis.
 * Only creates cards for blunders, mistakes, and inaccuracies.
 * By default only the player's own mistakes; set fixOpponentMistakes to include opponent's too.
 */
export function generateFlashcards(
  analysis: GameAnalysis,
  game: Game,
  options?: { fixOpponentMistakes?: boolean }
): Flashcard[] {
  const validTypes: Set<string> = new Set(["blunder", "mistake", "inaccuracy", "miss"]);
  const fixOpponent = options?.fixOpponentMistakes ?? false;
  const mistakeMoves = analysis.moves.filter(
    (m) =>
      validTypes.has(m.classification) &&
      (m.side === game.playerColor || fixOpponent)
  );

  const getPlayerTimeRemaining = (moveIndex: number): string | undefined => {
    const move = analysis.moves[moveIndex];
    if (!move) return undefined;

    if (move.side === game.playerColor) {
      return move.clock;
    }

    for (let i = moveIndex - 1; i >= 0; i--) {
      const priorMove = analysis.moves[i];
      if (priorMove?.side === game.playerColor && priorMove.clock) {
        return priorMove.clock;
      }
    }

    return undefined;
  };

  return mistakeMoves.map((move) => {
    // Normalize "miss" (missed win) to "blunder" for the MistakeType field
    const mistakeType: MistakeType =
      move.classification === "miss" ? "blunder" : (move.classification as MistakeType);

    const moveIndex = analysis.moves.findIndex(
      (candidate) =>
        candidate.moveNumber === move.moveNumber &&
        candidate.side === move.side &&
        candidate.notation === move.notation &&
        candidate.fenBefore === move.fenBefore
    );

    return {
      id: `fc-${analysis.gameId}-${move.moveNumber}-${move.side}`,
      gameId: analysis.gameId,
      opponent: game.opponent,
      moveNumber: move.moveNumber,
      timeRemaining: moveIndex >= 0 ? getPlayerTimeRemaining(moveIndex) : undefined,
      fen: move.fenBefore,
      yourMove: move.notation,
      bestMove: move.bestMoveSan,
      evaluation: formatEvalLoss(move),
      mistakeType,
      explanation: generateExplanation(move),
      status: "new" as const,
      nextReview: new Date().toISOString().split("T")[0],
      interval: 0,
      easeFactor: 2.5,
    };
  });
}

function formatEvalLoss(move: AnalyzedMove): string {
  const loss = (move.centipawnLoss / 100).toFixed(1);
  return `Lost ${loss} pawns of evaluation`;
}

function generateExplanation(move: AnalyzedMove): string {
  const cls = move.classification;
  const played = move.notation;
  const best = move.bestMoveSan;

  if (cls === "blunder") {
    return `You played ${played} but ${best} was much stronger. This cost significant evaluation.`;
  }
  if (cls === "miss") {
    return `You played ${played} and missed a winning continuation. ${best} would have been decisive.`;
  }
  if (cls === "mistake") {
    return `${played} was imprecise. ${best} was the better continuation.`;
  }
  return `${played} is a slight inaccuracy. ${best} was more accurate.`;
}
