import type { Game } from "@/lib/mock-data";

// ─── Chess.com types ───────────────────────────────────────────────────────

interface ChessComPlayer {
  username: string;
  rating: number;
  result: string;
  "@id": string;
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  time_class: string;
  rules: string;
  end_time: number;
  white: ChessComPlayer;
  black: ChessComPlayer;
  accuracies?: { white: number; black: number };
}

// ─── Lichess types ─────────────────────────────────────────────────────────

interface LichessPlayer {
  user?: { name: string; id: string };
  rating?: number;
  aiLevel?: number;
}

export interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  perf: string;
  createdAt: number;
  lastMoveAt: number;
  status: string;
  winner?: "white" | "black";
  players: { white: LichessPlayer; black: LichessPlayer };
  clock?: { initial: number; increment: number; totalTime: number };
  pgn?: string;
  opening?: { eco: string; name: string; ply: number };
}

// ─── Normalization helpers ─────────────────────────────────────────────────

const CHESS_COM_LOSS_RESULTS = new Set([
  "checkmated",
  "timeout",
  "resigned",
  "lose",
  "abandoned",
  "kingofthehill",
  "threecheck",
  "bughousepartnerlose",
]);

const CHESS_COM_DRAW_RESULTS = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

function timeClassLabel(tc: string): string {
  switch (tc) {
    case "bullet":
      return "Bullet";
    case "blitz":
      return "Blitz";
    case "rapid":
      return "Rapid";
    case "classical":
      return "Classical";
    case "daily":
      return "Daily";
    default:
      return tc.charAt(0).toUpperCase() + tc.slice(1);
  }
}

function formatTimeControl(baseSeconds: number, increment: number): string {
  const mins = Math.floor(baseSeconds / 60);
  return `${mins}+${increment}`;
}

function dateFromTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function dateFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Extract a stable unique suffix from a Chess.com game URL */
function chessComGameIdFromUrl(url: string): string {
  // e.g. "https://www.chess.com/game/live/145495811202" → "145495811202"
  const parts = url.split("/");
  return parts[parts.length - 1] || url;
}

/** Extract end-of-game clock times (last white clock, last black clock) from PGN */
function extractEndClocks(pgn: string): { whiteClock: string; blackClock: string } {
  const regex = /\[%clk\s+(\d+:\d{2}:\d{2}(?:\.\d+)?)\]/g;
  const clocks: string[] = [];
  let match;
  while ((match = regex.exec(pgn)) !== null) {
    clocks.push(match[1]);
  }
  if (clocks.length < 2) return { whiteClock: "—", blackClock: "—" };
  const lastWhite = clocks.filter((_, i) => i % 2 === 0).pop() ?? "—";
  const lastBlack = clocks.filter((_, i) => i % 2 === 1).pop() ?? "—";
  return { whiteClock: lastWhite, blackClock: lastBlack };
}

// ─── Chess.com normalization ───────────────────────────────────────────────

export function normalizeChessComGame(
  game: ChessComGame,
  username: string
): Game | null {
  // Skip variants
  if (game.rules !== "chess") return null;

  const isWhite =
    game.white.username.toLowerCase() === username.toLowerCase();
  const playerSide = isWhite ? game.white : game.black;
  const opponentSide = isWhite ? game.black : game.white;

  // Determine result from the PLAYER's perspective
  let result: Game["result"];
  if (playerSide.result === "win") {
    result = "win";
  } else if (CHESS_COM_LOSS_RESULTS.has(playerSide.result)) {
    result = "loss";
  } else if (CHESS_COM_DRAW_RESULTS.has(playerSide.result)) {
    result = "draw";
  } else {
    // fallback — check opponent
    if (opponentSide.result === "win") {
      result = "loss";
    } else {
      result = "draw";
    }
  }

  // Time control label
  const tcParts = game.time_control.split("/");
  const tcBase = tcParts[tcParts.length - 1]; // handle "1/259200" daily format
  const tcSplit = tcBase.split("+");
  const baseSeconds = parseInt(tcSplit[0], 10) || 0;
  const increment = tcSplit[1] ? parseInt(tcSplit[1], 10) : 0;
  const label = timeClassLabel(game.time_class);
  const timeControl = `${label} ${formatTimeControl(baseSeconds, increment)}`;

  const { whiteClock, blackClock } = extractEndClocks(game.pgn || "");

  return {
    id: `chesscom-${chessComGameIdFromUrl(game.url)}`,
    opponent: opponentSide.username,
    opponentRating: opponentSide.rating,
    playerRating: playerSide.rating,
    playerColor: isWhite ? "white" : "black",
    date: dateFromTimestamp(game.end_time),
    timeControl,
    playerTimeLeft: isWhite ? whiteClock : blackClock,
    opponentTimeLeft: isWhite ? blackClock : whiteClock,
    result,
    blunders: 0,
    mistakes: 0,
    inaccuracies: 0,
    mistakesFixed: 0,
    totalMistakes: 0,
    pgn: game.pgn || "",
    reviewStatus: "not-reviewed",
  };
}

// ─── Lichess normalization ─────────────────────────────────────────────────

export function normalizeLichessGame(
  game: LichessGame,
  username: string
): Game | null {
  // Skip variants
  if (game.variant !== "standard") return null;

  const whiteUser = game.players.white.user;
  const blackUser = game.players.black.user;

  // Determine which side the user played
  const isWhite =
    whiteUser?.name?.toLowerCase() === username.toLowerCase() ||
    whiteUser?.id?.toLowerCase() === username.toLowerCase();

  const playerSide = isWhite ? game.players.white : game.players.black;
  const opponentSide = isWhite ? game.players.black : game.players.white;

  // Determine result
  let result: Game["result"];
  if (game.status === "draw" || game.status === "stalemate") {
    result = "draw";
  } else if (game.winner) {
    const playerWon =
      (isWhite && game.winner === "white") ||
      (!isWhite && game.winner === "black");
    result = playerWon ? "win" : "loss";
  } else {
    // No winner and not explicitly draw — treat as draw
    result = "draw";
  }

  // Opponent name
  const opponentUser = opponentSide.user;
  const opponentName = opponentUser?.name || opponentUser?.id || (opponentSide.aiLevel ? `Stockfish Level ${opponentSide.aiLevel}` : "Unknown");

  // Time control
  let timeControl = "—";
  if (game.clock) {
    const label = timeClassLabel(game.speed);
    timeControl = `${label} ${formatTimeControl(game.clock.initial, game.clock.increment)}`;
  } else if (game.speed === "correspondence") {
    timeControl = "Correspondence";
  }

  const { whiteClock, blackClock } = extractEndClocks(game.pgn || "");

  return {
    id: `lichess-${game.id}`,
    opponent: opponentName,
    opponentRating: opponentSide.rating || 0,
    playerRating: playerSide.rating || 0,
    playerColor: isWhite ? "white" : "black",
    date: dateFromMs(game.lastMoveAt || game.createdAt),
    timeControl,
    playerTimeLeft: isWhite ? whiteClock : blackClock,
    opponentTimeLeft: isWhite ? blackClock : whiteClock,
    result,
    blunders: 0,
    mistakes: 0,
    inaccuracies: 0,
    mistakesFixed: 0,
    totalMistakes: 0,
    pgn: game.pgn || "",
    reviewStatus: "not-reviewed",
  };
}

// ─── NDJSON parser ─────────────────────────────────────────────────────────

export function parseNdjson<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}
