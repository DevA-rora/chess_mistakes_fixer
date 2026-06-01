import type {
  AnalyzedMove,
  CardStatus,
  Flashcard,
  Game,
  GameAnalysis,
  MistakeType,
  ReviewStatus,
} from "@/lib/mock-data";
import type { Tables, TablesInsert } from "@/lib/supabase/types";

type GameRow = Tables<"games">;
type FlashcardRow = Tables<"flashcards">;
type AnalysisRow = Tables<"game_analyses">;

const VALID_REVIEW_STATUS: ReadonlySet<ReviewStatus> = new Set([
  "reviewed",
  "reviewing",
  "not-reviewed",
]);

const VALID_CARD_STATUS: ReadonlySet<CardStatus> = new Set([
  "new",
  "learning",
  "review",
  "mastered",
]);

function inferSource(id: string): GameRow["source"] {
  if (id.startsWith("chesscom-")) return "chesscom";
  if (id.startsWith("lichess-")) return "lichess";
  if (id.startsWith("fen-")) return "fen";
  return "pgn";
}

function deriveSourceGameId(id: string, source: string): string | null {
  const prefix = `${source}-`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

export function gameToRow(
  game: Game,
  clerkUserId: string
): TablesInsert<"games"> {
  const source = inferSource(game.id);
  return {
    id: game.id,
    clerk_user_id: clerkUserId,
    source,
    source_game_id: deriveSourceGameId(game.id, source),
    opponent: game.opponent,
    opponent_rating: game.opponentRating,
    player_rating: game.playerRating,
    player_color: game.playerColor,
    played_at: game.date,
    time_control: game.timeControl,
    player_time_left: game.playerTimeLeft || null,
    opponent_time_left: game.opponentTimeLeft || null,
    result: game.result,
    blunders: game.blunders,
    mistakes: game.mistakes,
    inaccuracies: game.inaccuracies,
    mistakes_fixed: game.mistakesFixed,
    total_mistakes: game.totalMistakes,
    pgn: game.pgn,
    review_status: game.reviewStatus,
  };
}

export function rowToGame(row: GameRow): Game {
  const reviewStatus = VALID_REVIEW_STATUS.has(row.review_status as ReviewStatus)
    ? (row.review_status as ReviewStatus)
    : "not-reviewed";

  return {
    id: row.id,
    opponent: row.opponent,
    opponentRating: row.opponent_rating,
    playerRating: row.player_rating,
    playerColor: row.player_color as Game["playerColor"],
    date: row.played_at,
    timeControl: row.time_control,
    playerTimeLeft: row.player_time_left ?? "—",
    opponentTimeLeft: row.opponent_time_left ?? "—",
    result: row.result as Game["result"],
    blunders: row.blunders,
    mistakes: row.mistakes,
    inaccuracies: row.inaccuracies,
    mistakesFixed: row.mistakes_fixed,
    totalMistakes: row.total_mistakes,
    pgn: row.pgn,
    reviewStatus,
  };
}

export function flashcardToRow(
  card: Flashcard,
  clerkUserId: string
): TablesInsert<"flashcards"> {
  return {
    id: card.id,
    clerk_user_id: clerkUserId,
    game_id: card.gameId,
    opponent: card.opponent,
    move_number: card.moveNumber,
    time_remaining: card.timeRemaining ?? null,
    fen: card.fen,
    your_move: card.yourMove,
    best_move: card.bestMove,
    evaluation: card.evaluation,
    mistake_type: card.mistakeType,
    explanation: card.explanation,
    status: card.status,
    next_review: card.nextReview,
    interval: card.interval,
    ease_factor: card.easeFactor,
  };
}

export function rowToFlashcard(row: FlashcardRow): Flashcard {
  const status = VALID_CARD_STATUS.has(row.status as CardStatus)
    ? (row.status as CardStatus)
    : "new";

  return {
    id: row.id,
    gameId: row.game_id,
    opponent: row.opponent,
    moveNumber: row.move_number,
    timeRemaining: row.time_remaining ?? undefined,
    fen: row.fen,
    yourMove: row.your_move,
    bestMove: row.best_move,
    evaluation: row.evaluation,
    mistakeType: row.mistake_type as MistakeType,
    explanation: row.explanation,
    status,
    nextReview: row.next_review,
    interval: row.interval,
    easeFactor: Number(row.ease_factor),
  };
}

export function analysisToRow(
  analysis: GameAnalysis,
  clerkUserId: string
): TablesInsert<"game_analyses"> {
  return {
    game_id: analysis.gameId,
    clerk_user_id: clerkUserId,
    depth: analysis.depth,
    start_eval: analysis.startEval,
    blunders: analysis.blunders,
    mistakes: analysis.mistakes,
    inaccuracies: analysis.inaccuracies,
    brilliancies: analysis.brilliancies,
    greats: analysis.greats,
    missed_wins: analysis.missedWins,
    white_accuracy: analysis.whiteAccuracy,
    black_accuracy: analysis.blackAccuracy,
    moves: analysis.moves as unknown as TablesInsert<"game_analyses">["moves"],
    analyzed_at: analysis.analyzedAt,
  };
}

export function rowToAnalysis(row: AnalysisRow): GameAnalysis {
  return {
    gameId: row.game_id,
    analyzedAt: row.analyzed_at,
    depth: row.depth,
    moves: (row.moves as unknown as AnalyzedMove[]) ?? [],
    startEval: row.start_eval,
    blunders: row.blunders,
    mistakes: row.mistakes,
    inaccuracies: row.inaccuracies,
    brilliancies: row.brilliancies,
    greats: row.greats,
    missedWins: row.missed_wins,
    whiteAccuracy: Number(row.white_accuracy),
    blackAccuracy: Number(row.black_accuracy),
  };
}
