export type MistakeType = "blunder" | "mistake" | "inaccuracy";
export type CardStatus = "new" | "learning" | "review" | "mastered";
export type SRSRating = "again" | "hard" | "good" | "easy";
export type ReviewStatus = "reviewed" | "reviewing" | "not-reviewed";

export interface Game {
  id: string;
  opponent: string;
  opponentRating: number;
  playerRating: number;
  playerColor: "white" | "black";
  date: string;
  timeControl: string;
  playerTimeLeft: string;
  opponentTimeLeft: string;
  result: "win" | "loss" | "draw";
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  mistakesFixed: number;
  totalMistakes: number;
  pgn: string;
  reviewStatus: ReviewStatus;
}

export interface Flashcard {
  id: string;
  gameId: string;
  opponent: string;
  moveNumber: number;
  timeRemaining?: string;
  fen: string;
  yourMove: string;
  bestMove: string;
  evaluation: string;
  mistakeType: MistakeType;
  explanation: string;
  status: CardStatus;
  nextReview: string;
  interval: number;
  easeFactor: number;
}

export interface ReviewMessage {
  role: "ai" | "user";
  content: string;
}

export interface DailyStats {
  date: string;
  cardsReviewed: number;
}

export interface MistakeCategory {
  category: string;
  count: number;
  color: string;
}

// --- Analysis types ---

export type MoveClassification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";

export interface AnalyzedMove {
  moveNumber: number;
  side: "white" | "black";
  notation: string; // SAN (e.g., "Nf3")
  uci: string; // UCI (e.g., "g1f3")
  fenBefore: string; // FEN before this move
  fenAfter: string; // FEN after this move
  eval: number; // Centipawns from white's perspective AFTER this move
  bestMove: string; // UCI best move for the position BEFORE this move
  bestMoveSan: string; // SAN best move
  classification: MoveClassification;
  centipawnLoss: number; // How many centipawns were lost by this move (0 for best)
  moveAccuracy: number; // 0-100, accuracy of this individual move
  clock?: string; // Time remaining after this move (e.g. "0:05:23")
}

export interface GameAnalysis {
  gameId: string;
  analyzedAt: string;
  depth: number;
  moves: AnalyzedMove[];
  /** Eval of the starting position from white's perspective */
  startEval: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  brilliancies: number;
  greats: number;
  missedWins: number;
  whiteAccuracy: number;
  blackAccuracy: number;
}

// No seed games — users import their own
export const games: Game[] = [];

// No seed flashcards — generated from analyzed games
export const flashcards: Flashcard[] = [];

// Stats
export const userStats = {
  streak: 14,
  dueToday: 8,
  totalActive: 23,
  mastered: 34,
  accuracy: 72,
  totalReviewed: 156,
  averageEase: 2.5,
};

// Daily review history for heatmap (last 90 days)
export const dailyStats: DailyStats[] = Array.from({ length: 90 }, (_, i) => {
  const date = new Date("2026-04-09");
  date.setDate(date.getDate() - i);
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  return {
    date: date.toISOString().split("T")[0],
    cardsReviewed: i < 14 ? Math.floor(Math.random() * 12) + 3 : isWeekend ? Math.floor(Math.random() * 5) : Math.floor(Math.random() * 8),
  };
});

// Mistake categories
export const mistakeCategories: MistakeCategory[] = [
  { category: "Tactical oversight", count: 12, color: "var(--chart-1)" },
  { category: "Positional error", count: 8, color: "var(--chart-2)" },
  { category: "Endgame technique", count: 6, color: "var(--chart-3)" },
  { category: "Opening inaccuracy", count: 5, color: "var(--chart-4)" },
  { category: "Time pressure", count: 3, color: "var(--chart-5)" },
];


