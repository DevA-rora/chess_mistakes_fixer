"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Clock, ArrowRight, Bot, X, Send, Loader2, Lightbulb, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type { SRSRating } from "@/lib/mock-data";
import type { CSSProperties } from "react";
import { MarkdownMessage } from "@/components/markdown-message";
import { useGamesStore } from "@/hooks/use-games-store";
import { useFlashcardsStore } from "@/hooks/use-flashcards-store";
import { useStreakStore } from "@/hooks/use-streak-store";
import { useStatsStore } from "@/hooks/use-stats-store";
import { useSquareHighlights } from "@/hooks/use-square-highlights";
import { useClickToMove } from "@/hooks/use-click-to-move";
import { styledPieces } from "@/lib/chess-pieces";
import { Chess } from "chess.js";

const Chessboard = dynamic(
  () => import("react-chessboard").then((mod) => mod.Chessboard),
  { ssr: false }
);

// Auto-rating thresholds (seconds)
const EASY_THRESHOLD = 3;
const GOOD_THRESHOLD = 10;
const HARD_THRESHOLD = 30;
const TIMEOUT_SECONDS = HARD_THRESHOLD;

function getAutoRating(elapsedSeconds: number): SRSRating {
  if (elapsedSeconds <= EASY_THRESHOLD) return "easy";
  if (elapsedSeconds <= GOOD_THRESHOLD) return "good";
  return "hard";
}

function getRatingLabel(rating: SRSRating): { label: string; color: string } {
  switch (rating) {
    case "easy":
      return { label: "Easy", color: "text-emerald-400" };
    case "good":
      return { label: "Good", color: "text-blue-400" };
    case "hard":
      return { label: "Hard", color: "text-orange-400" };
    case "again":
      return { label: "Again", color: "text-red-400" };
  }
}

/** Visual timer bar with colored threshold divisions */
function TimerBar({
  elapsed,
  total,
  running,
}: {
  elapsed: number;
  total: number;
  running: boolean;
}) {
  const pct = Math.min((elapsed / total) * 100, 100);
  const easyPct = (EASY_THRESHOLD / total) * 100;
  const goodPct = (GOOD_THRESHOLD / total) * 100;

  // Determine fill color based on current zone
  let fillColor = "bg-emerald-500";
  if (elapsed > GOOD_THRESHOLD) fillColor = "bg-orange-500";
  else if (elapsed > EASY_THRESHOLD) fillColor = "bg-blue-500";

  const timeLeft = Math.max(0, total - elapsed);
  const displaySeconds = running ? timeLeft.toFixed(1) : total.toFixed(1);

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span className="font-mono">{displaySeconds}s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">Easy ≤{EASY_THRESHOLD}s</span>
          <span className="text-blue-400">Good ≤{GOOD_THRESHOLD}s</span>
          <span className="text-orange-400">Hard ≤{HARD_THRESHOLD}s</span>
        </div>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted/40 overflow-hidden">
        {/* Threshold markers */}
        <div
          className="absolute top-0 bottom-0 w-px bg-emerald-400/50 z-10"
          style={{ left: `${easyPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-blue-400/50 z-10"
          style={{ left: `${goodPct}%` }}
        />
        {/* Fill */}
        <motion.div
          className={`absolute top-0 left-0 bottom-0 rounded-full ${fillColor}`}
          style={{ width: `${pct}%` }}
          transition={{ duration: 0.1, ease: "linear" }}
        />
      </div>
    </div>
  );
}

function getMoveHistory(
  pgn: string,
  moveNumber: number,
  isWhiteToMove: boolean
): string[] {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
    const history = chess.history();
    const halfMoves = isWhiteToMove
      ? (moveNumber - 1) * 2
      : (moveNumber - 1) * 2 + 1;
    return history.slice(0, Math.min(halfMoves, history.length));
  } catch {
    return [];
  }
}

function groupMoves(
  moves: string[]
): { number: number; white: string; black?: string }[] {
  const pairs: { number: number; white: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }
  return pairs;
}

interface VerboseMove {
  san: string;
  from: string;
  to: string;
}

function getVerboseMoveHistory(
  pgn: string,
  moveNumber: number,
  isWhiteToMove: boolean
): VerboseMove[] {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    const halfMoves = isWhiteToMove
      ? (moveNumber - 1) * 2
      : (moveNumber - 1) * 2 + 1;
    return history
      .slice(0, Math.min(halfMoves, history.length))
      .map((m) => ({ san: m.san, from: m.from, to: m.to }));
  } catch {
    return [];
  }
}

function groupVerboseMoves(
  moves: VerboseMove[]
): { number: number; white: VerboseMove; black?: VerboseMove }[] {
  const pairs: { number: number; white: VerboseMove; black?: VerboseMove }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }
  return pairs;
}

/**
 * Returns the FEN one half-move before the card's position (before the
 * opponent's last move). This lets us animate that move on the board.
 */
function getPreOpponentMoveFen(
  pgn: string,
  moveNumber: number,
  isWhiteToMove: boolean
): string | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
    const history = chess.history();
    // Half-move count up to the card's position
    const halfMovesAtCard = isWhiteToMove
      ? (moveNumber - 1) * 2
      : (moveNumber - 1) * 2 + 1;
    const halfMovesBefore = halfMovesAtCard - 1;
    if (halfMovesBefore < 0) return null;

    const replay = new Chess();
    for (let i = 0; i < Math.min(halfMovesBefore, history.length); i++) {
      replay.move(history[i]);
    }
    return replay.fen();
  } catch {
    return null;
  }
}

const boardStyles = {
  dark: {
    backgroundImage:
      "linear-gradient(rgba(209, 82, 23, 0.55), rgba(209, 82, 23, 0.55)), url('/light_wood_texture/Wood095_Color_512.jpg')",
    backgroundSize: "cover",
  },
  light: {
    backgroundImage:
      "linear-gradient(rgba(242, 217, 168, 0.55), rgba(242, 217, 168, 0.55)), url('/light_wood_texture/Wood095_Color_512.jpg')",
    backgroundSize: "cover",
  },
};

export default function DrillPage() {
  const { games } = useGamesStore();
  const { getCardsDueToday, updateFlashcard } = useFlashcardsStore();
  const { recordDrillSolve } = useStreakStore();
  const { recordCardReview } = useStatsStore();
  const cardsDueToday = getCardsDueToday();
  const [completed, setCompleted] = useState<string[]>([]);
  const [attemptResult, setAttemptResult] = useState<
    "correct" | "incorrect" | null
  >(null);
  const [userMove, setUserMove] = useState<string | null>(null);
  const [boardPosition, setBoardPosition] = useState<string | null>(null);
  const [boardAnimationDuration, setBoardAnimationDuration] = useState(300);
  const [opponentMoveAnimated, setOpponentMoveAnimated] = useState(false);
  const [autoRating, setAutoRating] = useState<SRSRating | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);
  const { handleSquareMouseDown, clearHighlights, highlightStyles } = useSquareHighlights();

  // --- AI Coach chat state ---
  const [whyOpen, setWhyOpen] = useState(false);
  const [whyMessages, setWhyMessages] = useState<{ role: "ai" | "user"; content: string }[]>([]);
  const [whyLoading, setWhyLoading] = useState(false);
  const [whyInput, setWhyInput] = useState("");
  const whyScrollRef = useRef<HTMLDivElement>(null);
  const whyInputRef = useRef<HTMLInputElement>(null);

  // --- Hint state ---
  const [hintUsed, setHintUsed] = useState(false);
  const [hintSquare, setHintSquare] = useState<string | null>(null);

  // --- Move hover & AI interactive highlight state ---
  const [moveHoverSquares, setMoveHoverSquares] = useState<Record<string, CSSProperties>>({});
  const [aiHoveredSquares, setAiHoveredSquares] = useState<Record<string, CSSProperties>>({});
  const [aiClickedArrow, setAiClickedArrow] = useState<{ startSquare: string; endSquare: string; color: string } | null>(null);
  const [aiClickedCircle, setAiClickedCircle] = useState<string | null>(null);
  const [previewLine, setPreviewLine] = useState<{
    moves: string[];
    fromFen: string;
    currentStep: number;
  } | null>(null);

  const remainingCards = cardsDueToday.filter(
    (c) => !completed.includes(c.id)
  );
  const card = remainingCards[0];
  const totalDue = cardsDueToday.length;
  const doneCount = completed.length;

  const game = card ? games.find((g) => g.id === card.gameId) : undefined;
  const isWhiteToMove = card ? card.fen.split(" ")[1] === "w" : true;

  // Compute the source square of the best move for hints
  const bestMoveFromSquare = useMemo(() => {
    if (!card) return null;
    try {
      const chess = new Chess(card.fen);
      const move = chess.move(card.bestMove);
      return move?.from ?? null;
    } catch {
      return null;
    }
  }, [card]);

  const drillMoveAttempt = useCallback(
    (from: string, to: string): boolean => {
      if (!card || attemptResult || !opponentMoveAnimated) return false;
      const chess = new Chess(card.fen);
      try {
        const move = chess.move({ from, to, promotion: "q" });
        if (!move) return false;
        const isCorrect = move.san === card.bestMove;
        const timeTaken = timerStartRef.current
          ? (performance.now() - timerStartRef.current) / 1000
          : TIMEOUT_SECONDS;
        setUserMove(move.san);
        setAttemptResult(isCorrect ? "correct" : "incorrect");
        setAutoRating(isCorrect ? (hintUsed ? "hard" : getAutoRating(timeTaken)) : "again");
        if (isCorrect) setBoardPosition(chess.fen());
        return isCorrect;
      } catch {
        return false;
      }
    },
    [card, attemptResult, opponentMoveAnimated, hintUsed]
  );

  const clickToMoveEnabled = opponentMoveAnimated && !attemptResult;
  const { handleSquareClick, clickToMoveStyles, clearSelection } = useClickToMove({
    fen: card?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    enabled: clickToMoveEnabled,
    onMoveAttempt: drillMoveAttempt,
  });

  const combinedSquareClick = useCallback(
    (args: { piece: { pieceType: string } | null; square: string }) => {
      clearHighlights();
      handleSquareClick(args);
    },
    [clearHighlights, handleSquareClick]
  );

  const combinedSquareStyles = useMemo(() => {
    const hintStyles = hintSquare ? {
      [hintSquare]: {
        boxShadow: "inset 0 0 0 4px rgba(250, 204, 21, 0.85), inset 0 0 20px rgba(250, 204, 21, 0.3)",
      },
    } : {};
    const aiCircleStyles = aiClickedCircle ? {
      [aiClickedCircle]: {
        background: "radial-gradient(circle, transparent 55%, rgba(96,165,250,0.8) 55%, rgba(96,165,250,0.8) 76%, transparent 76%)",
      },
    } : {};
    return {
      ...highlightStyles,
      ...clickToMoveStyles,
      ...hintStyles,
      ...aiCircleStyles,
      ...(previewLine ? {} : { ...moveHoverSquares, ...aiHoveredSquares }),
    };
  }, [highlightStyles, clickToMoveStyles, hintSquare, aiClickedCircle, moveHoverSquares, aiHoveredSquares, previewLine]);

  const verboseMoveHistory = useMemo(() => {
    if (!card || !game) return [];
    return getVerboseMoveHistory(game.pgn, card.moveNumber, isWhiteToMove);
  }, [card, game, isWhiteToMove]);

  const moveHistory = useMemo(() => {
    if (!card || !game) return [];
    return getMoveHistory(game.pgn, card.moveNumber, isWhiteToMove);
  }, [card, game, isWhiteToMove]);

  const groupedMoves = useMemo(() => groupVerboseMoves(verboseMoveHistory), [verboseMoveHistory]);

  // Compute the FEN before the opponent's last move
  const preOpponentFen = useMemo(() => {
    if (!card || !game) return null;
    return getPreOpponentMoveFen(game.pgn, card.moveNumber, isWhiteToMove);
  }, [card, game, isWhiteToMove]);

  // Clear circle highlights when card changes
  useEffect(() => {
    clearHighlights();
    clearSelection();
  }, [card?.id, clearHighlights, clearSelection]);

  // Timer loop — start when opponent animation finishes, stop on attempt
  useEffect(() => {
    if (!opponentMoveAnimated || attemptResult) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      timerStartRef.current = null;
      return;
    }
    timerStartRef.current = performance.now();
    timedOutRef.current = false;
    setElapsed(0);

    const tick = () => {
      if (!timerStartRef.current) return;
      const now = performance.now();
      const secs = (now - timerStartRef.current) / 1000;
      setElapsed(secs);

      if (secs >= TIMEOUT_SECONDS && !timedOutRef.current) {
        timedOutRef.current = true;
        setAttemptResult("incorrect");
        setAutoRating("again");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [opponentMoveAnimated, attemptResult]);

  // Animate opponent's move when a new card is shown
  useEffect(() => {
    if (!card || !preOpponentFen) {
      setOpponentMoveAnimated(true);
      return;
    }
    setOpponentMoveAnimated(false);

    // Step 1: Instantly jump to the position before the opponent's move (no animation)
    setBoardAnimationDuration(0);
    setBoardPosition(preOpponentFen);

    // Step 2: After a clean frame (position rendered), re-enable animation and play the forward move
    let timer2: ReturnType<typeof setTimeout>;
    const timer1 = setTimeout(() => {
      setBoardAnimationDuration(300);
      timer2 = setTimeout(() => {
        setBoardPosition(null); // animate forward to card.fen
        setOpponentMoveAnimated(true);
      }, 50);
    }, 50);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, preOpponentFen]);

  const handlePieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      piece: unknown;
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!card || !targetSquare || attemptResult || !opponentMoveAnimated) return false;

      const chess = new Chess(card.fen);
      try {
        const move = chess.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
        if (!move) return false;

        const isCorrect = move.san === card.bestMove;
        const timeTaken = timerStartRef.current
          ? (performance.now() - timerStartRef.current) / 1000
          : TIMEOUT_SECONDS;
        setUserMove(move.san);
        setAttemptResult(isCorrect ? "correct" : "incorrect");
        setAutoRating(isCorrect ? (hintUsed ? "hard" : getAutoRating(timeTaken)) : "again");

        if (isCorrect) {
          setBoardPosition(chess.fen());
        }
        return isCorrect;
      } catch {
        return false;
      }
    },
    [card, attemptResult, opponentMoveAnimated, hintUsed]
  );

  const advanceCard = useCallback((rating: SRSRating) => {
    if (!card) return;

    // SRS scheduling
    let { interval, easeFactor } = card;
    const today = new Date();
    switch (rating) {
      case "again":
        interval = 0;
        easeFactor = Math.max(1.3, easeFactor - 0.2);
        break;
      case "hard":
        interval = Math.max(1, Math.round(interval * 1.2));
        easeFactor = Math.max(1.3, easeFactor - 0.15);
        break;
      case "good":
        interval = interval === 0 ? 1 : Math.round(interval * easeFactor);
        break;
      case "easy":
        interval = interval === 0 ? 4 : Math.round(interval * easeFactor * 1.3);
        easeFactor += 0.15;
        break;
    }
    const nextReview = new Date(today);
    nextReview.setDate(nextReview.getDate() + interval);

    updateFlashcard(card.id, {
      interval,
      easeFactor,
      nextReview: nextReview.toISOString().split("T")[0],
      status: interval === 0 ? "learning" : interval >= 21 ? "mastered" : "review",
    });

    const isCorrect = attemptResult === "correct";
    const timeMs = elapsed * 1000;
    const isMastered = interval >= 21;
    recordCardReview(rating, isCorrect, timeMs, isMastered);

    setCompleted((prev) => [...prev, card.id]);
    recordDrillSolve();
    setAttemptResult(null);
    setUserMove(null);
    setBoardAnimationDuration(0); // instant reset — opponent-animation effect owns the next motion
    setBoardPosition(null);
    setOpponentMoveAnimated(false);
    setAutoRating(null);
    setElapsed(0);
    setWhyOpen(false);
    setWhyMessages([]);
    setWhyInput("");
    setHintUsed(false);
    setHintSquare(null);
    setPreviewLine(null);
    setAiHoveredSquares({});
    setAiClickedArrow(null);
    setAiClickedCircle(null);
    setMoveHoverSquares({});
  }, [card, updateFlashcard]);

  // --- AI chat interactive highlight callbacks ---
  const handleAISquaresHover = useCallback((squares: string[]) => {
    setAiHoveredSquares(
      Object.fromEntries(squares.map((sq) => [sq, { background: "rgba(96,165,250,0.45)" }]))
    );
  }, []);

  const handleAISquaresClear = useCallback(() => {
    setAiHoveredSquares({});
  }, []);

  const handleAILineClick = useCallback((moves: string[], fromFen: string) => {
    setPreviewLine({ moves, fromFen, currentStep: -1 });
    setAiClickedArrow(null);
    setAiClickedCircle(null);
  }, []);

  const handleAIMoveClick = useCallback((fromSquare: string, toSquare: string) => {
    setAiClickedArrow((prev) =>
      prev && prev.startSquare === fromSquare && prev.endSquare === toSquare
        ? null
        : { startSquare: fromSquare, endSquare: toSquare, color: "rgba(96,165,250,0.8)" }
    );
    setAiClickedCircle(null);
  }, []);

  const handleAISquareClick = useCallback((square: string) => {
    setAiClickedCircle((prev) => (prev === square ? null : square));
    setAiClickedArrow(null);
  }, []);

  const handleAIPanelClose = useCallback(() => {
    setWhyOpen(false);
    setAiHoveredSquares({});
    setAiClickedArrow(null);
    setAiClickedCircle(null);
    setPreviewLine(null);
  }, []);

  // --- Line preview FEN ---
  const previewFen = useMemo(() => {
    if (!previewLine || previewLine.currentStep < 0) return previewLine?.fromFen ?? null;
    try {
      const chess = new Chess(previewLine.fromFen);
      for (let i = 0; i <= previewLine.currentStep; i++) {
        chess.move(previewLine.moves[i]);
      }
      return chess.fen();
    } catch {
      return previewLine.fromFen;
    }
  }, [previewLine]);

  // Build game history from PGN for AI context
  const gameHistory = useMemo(() => {
    if (!game?.pgn || !card) return [];
    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const moves = chess.history({ verbose: true });
      // Only include moves up to the mistake move
      const history: { moveNumber: number; side: "white" | "black"; notation: string; eval: number; classification: string }[] = [];
      for (let i = 0; i < moves.length && i < (card.moveNumber * 2); i++) {
        history.push({
          moveNumber: Math.floor(i / 2) + 1,
          side: i % 2 === 0 ? "white" : "black",
          notation: moves[i].san,
          eval: 0, // we don't have per-move evals from drill cards
          classification: "book",
        });
      }
      return history;
    } catch {
      return [];
    }
  }, [game?.pgn, card]);

  // Parse eval string to centipawns for API
  const evalCentipawns = useMemo(() => {
    if (!card?.evaluation) return 0;
    const match = card.evaluation.match(/([+-]?\d+\.?\d*)/);
    return match ? Math.round(parseFloat(match[1]) * 100) : 0;
  }, [card?.evaluation]);

  // AI Coach: send message
  const handleWhySend = useCallback(async () => {
    if (whyLoading || !card) return;
    const userMsg = whyInput.trim();

    const chatMessages = userMsg
      ? [...whyMessages, { role: "user" as const, content: userMsg }]
      : whyMessages.length === 0
        ? [{ role: "user" as const, content: `Why was ${card.yourMove} a bad move here?` }]
        : whyMessages;

    if (userMsg) setWhyInput("");
    setWhyMessages(chatMessages);
    setWhyLoading(true);

    const side = card.fen.split(" ")[1] === "w" ? "white" : "black";
    const payload = {
      fen: card.fen,
      playedMove: card.yourMove,
      bestMove: card.bestMove,
      evalBefore: 0,
      evalAfter: evalCentipawns,
      classification: card.mistakeType,
      moveNumber: card.moveNumber,
      side,
      gameHistory,
      messages: chatMessages,
      mode: "review",
    };

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setWhyMessages([
        ...chatMessages,
        { role: "ai", content: data.reply || data.error || "Could not generate response." },
      ]);
    } catch {
      setWhyMessages([
        ...chatMessages,
        { role: "ai", content: "Failed to generate response." },
      ]);
    } finally {
      setWhyLoading(false);
    }
  }, [whyLoading, card, whyInput, whyMessages, gameHistory, evalCentipawns]);

  // Open why panel and auto-fetch initial explanation
  const whyAutoFetchRef = useRef(false);
  const handleWhyOpen = useCallback(() => {
    setWhyOpen(true);
    if (whyMessages.length === 0) {
      whyAutoFetchRef.current = true;
    } else {
      setTimeout(() => whyInputRef.current?.focus(), 50);
    }
  }, [whyMessages.length]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (whyScrollRef.current) {
      whyScrollRef.current.scrollTop = whyScrollRef.current.scrollHeight;
    }
  }, [whyMessages, whyLoading]);

  // Auto-fetch initial explanation when Why panel opens
  useEffect(() => {
    if (whyOpen && whyAutoFetchRef.current) {
      whyAutoFetchRef.current = false;
      handleWhySend();
    }
  }, [whyOpen, handleWhySend]);

  // Auto-advance only for correct answers
  useEffect(() => {
    if (!attemptResult || !autoRating) return;
    if (attemptResult !== "correct") return;

    // Phase 1 (at 1200ms): animate pieces back to card.fen (revert the user's move)
    const revertTimer = setTimeout(() => {
      setBoardAnimationDuration(300);
      setBoardPosition(null); // card.fen — undoes the user's move visually
    }, 1200);

    // Phase 2 (at 1550ms): advance to next card once revert animation has completed
    const advanceTimer = setTimeout(() => advanceCard(autoRating), 1550);

    return () => {
      clearTimeout(revertTimer);
      clearTimeout(advanceTimer);
    };
  }, [attemptResult, autoRating, advanceCard]);

  // Manual advance for incorrect answers via Enter / Space (disabled when AI chat is open)
  useEffect(() => {
    if (attemptResult !== "incorrect" || !autoRating || whyOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advanceCard(autoRating);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [attemptResult, autoRating, advanceCard, whyOpen]);

  if (!card) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 space-y-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          <CheckCircle2 className="h-20 w-20 text-primary" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center space-y-2"
        >
          <h1 className="text-2xl font-bold font-serif">All done!</h1>
          <p className="text-muted-foreground">
            You reviewed {totalDue} cards today. Come back tomorrow for more.
          </p>
        </motion.div>
      </div>
    );
  }

  const opponentName = card.opponent;
  const opponentRating = game?.opponentRating ?? 0;
  const playerRating = game?.playerRating ?? 0;

  // When playing as black, opponent (white) is on top; otherwise opponent on top
  const topName = isWhiteToMove ? opponentName : "You";
  const topRating = isWhiteToMove ? opponentRating : playerRating;
  const bottomName = isWhiteToMove ? "You" : opponentName;
  const bottomRating = isWhiteToMove ? playerRating : opponentRating;

  const previewLineControls = previewLine && (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="absolute top-2 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-0.75rem)] flex items-center justify-between px-3 py-1.5 rounded-lg border"
      style={{ backgroundColor: "rgba(23,37,84,0.85)", borderColor: "#1d4ed8" }}
    >
      <span className="text-xs font-semibold" style={{ color: "#93c5fd" }}>
        Previewing line
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 cursor-pointer"
          style={{ color: "#93c5fd" }}
          onClick={() =>
            setPreviewLine((pl) =>
              pl ? { ...pl, currentStep: Math.max(-1, pl.currentStep - 1) } : null
            )
          }
          disabled={previewLine.currentStep <= -1}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-mono font-semibold text-xs min-w-[52px] text-center" style={{ color: "#bfdbfe" }}>
          {previewLine.currentStep < 0
            ? "Start"
            : `${previewLine.currentStep + 1} / ${previewLine.moves.length}`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 cursor-pointer"
          style={{ color: "#93c5fd" }}
          onClick={() =>
            setPreviewLine((pl) =>
              pl ? { ...pl, currentStep: Math.min(pl.moves.length - 1, pl.currentStep + 1) } : null
            )
          }
          disabled={previewLine.currentStep >= previewLine.moves.length - 1}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 cursor-pointer ml-1"
          style={{ color: "#93c5fd" }}
          onClick={() => setPreviewLine(null)}
          title="Exit preview"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] py-6 px-2.5 gap-1">
      {/* Left Panel — Info */}
      <div className="w-80 flex flex-col gap-3 shrink-0 relative">
        {/* Attempt Feedback — auto-rated */}
        <AnimatePresence>
          {attemptResult && autoRating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card>
                <CardContent className="p-4 space-y-3">
                  {attemptResult === "correct" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-primary">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-bold text-sm">Correct!</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Solved in {Math.min(elapsed, TIMEOUT_SECONDS).toFixed(1)}s
                          {hintUsed && (
                            <span className="ml-1 text-yellow-400">(with hint)</span>
                          )}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-xs font-bold ${getRatingLabel(autoRating).color}`}
                        >
                          Rated: {getRatingLabel(autoRating).label}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-destructive">
                        <XCircle className="h-5 w-5" />
                        <span className="font-bold text-sm">
                          {timedOutRef.current ? "Time's up!" : "Incorrect"}
                        </span>
                      </div>
                      {userMove && (
                        <p className="text-xs text-muted-foreground">
                          You played{" "}
                          <span className="font-mono font-bold text-destructive">
                            {userMove}
                          </span>{" "}
                          — best was{" "}
                          <span className="font-mono font-bold text-primary">
                            {card.bestMove}
                          </span>
                        </p>
                      )}
                      {!userMove && (
                        <p className="text-xs text-muted-foreground">
                          The best move was{" "}
                          <span className="font-mono font-bold text-primary">
                            {card.bestMove}
                          </span>
                        </p>
                      )}
                      <Badge
                        variant={
                          card.mistakeType === "blunder"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {card.mistakeType} · {card.evaluation}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {card.explanation}
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-xs font-bold ${getRatingLabel(autoRating).color}`}
                      >
                        Rated: {getRatingLabel(autoRating).label}
                      </Badge>
                      <div className="flex gap-2 mt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer font-semibold"
                          onClick={handleWhyOpen}
                        >
                          Why?
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 cursor-pointer"
                          onClick={() => autoRating && advanceCard(autoRating)}
                        >
                          Next
                          <ArrowRight className="h-4 w-4 ml-1" />
                          <kbd className="ml-2 text-[10px] opacity-60 font-sans">↵</kbd>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Coach panel (overlay) */}
        <AnimatePresence>
          {whyOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-20 flex flex-col bg-card rounded-lg"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-base font-medium text-foreground">AI Coach</span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAIPanelClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Move context badge */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20">
                <span className="inline-block font-mono text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                  {card.evaluation}
                </span>
                <span className="inline-block font-mono text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                  Move {card.moveNumber}: {card.yourMove} → {card.bestMove}
                </span>
                <Badge
                  variant={card.mistakeType === "blunder" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {card.mistakeType}
                </Badge>
              </div>

              {/* Chat messages */}
              <div ref={whyScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {whyMessages.length === 0 && !whyLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                    <Bot className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Ask me anything about this move.
                    </p>
                  </div>
                )}
                {whyMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : ""}`}
                  >
                    {msg.role === "ai" && <Bot className="h-4 w-4 text-primary mt-1 shrink-0" />}
                    <div
                      className={`rounded-lg px-3 py-2 text-sm leading-relaxed max-w-[85%] ${
                        msg.role === "user"
                          ? "bg-primary/20 text-foreground"
                          : "bg-muted/60 text-foreground"
                      }`}
                    >
                      {msg.role === "ai" ? (
                        <MarkdownMessage
                          content={msg.content}
                          currentFen={previewLine ? undefined : card.fen}
                          onSquaresHover={handleAISquaresHover}
                          onSquaresClear={handleAISquaresClear}
                          onLineClick={handleAILineClick}
                          onMoveClick={handleAIMoveClick}
                          onSquareClick={handleAISquareClick}
                        />
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                {whyLoading && (
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary shrink-0" />
                    <div className="bg-muted/60 rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {/* Follow-up input */}
              <div className="flex gap-2 px-4 py-3 border-t border-border">
                <input
                  ref={whyInputRef}
                  type="text"
                  className="flex-1 px-3 py-2 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ask a follow-up..."
                  value={whyInput}
                  onChange={(e) => setWhyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.stopPropagation();
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleWhySend();
                    }
                    if (e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 cursor-pointer shrink-0"
                  onClick={handleWhySend}
                  disabled={!whyInput.trim() || whyLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Move History */}
        <Card className="flex-1 min-h-0">
          <CardContent className="p-4 h-full flex flex-col">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Moves
            </h3>
            <ScrollArea className="flex-1">
              <div className="font-mono text-sm">
                {groupedMoves.map((pair) => (
                  <div
                    key={pair.number}
                    className="flex items-center text-sm hover:bg-muted/30 transition-colors"
                  >
                    <span className="w-8 text-right pr-2 text-muted-foreground text-xs shrink-0 py-1">
                      {pair.number}.
                    </span>
                    <span
                      className="flex-1 px-2 py-1 cursor-default hover:bg-muted/40 rounded-l transition-colors"
                      onMouseEnter={() => setMoveHoverSquares({
                        [pair.white.from]: { background: "rgba(96,165,250,0.35)" },
                        [pair.white.to]: { background: "rgba(96,165,250,0.45)" },
                      })}
                      onMouseLeave={() => setMoveHoverSquares({})}
                    >
                      {pair.white.san}
                    </span>
                    {pair.black ? (
                      <span
                        className="flex-1 px-2 py-1 text-muted-foreground cursor-default hover:bg-muted/40 rounded-r transition-colors"
                        onMouseEnter={() => setMoveHoverSquares({
                          [pair.black!.from]: { background: "rgba(96,165,250,0.35)" },
                          [pair.black!.to]: { background: "rgba(96,165,250,0.45)" },
                        })}
                        onMouseLeave={() => setMoveHoverSquares({})}
                      >
                        {pair.black.san}
                      </span>
                    ) : (
                      <span className="flex-1" />
                    )}
                  </div>
                ))}
                {groupedMoves.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    Starting position
                  </p>
                )}
              </div>
            </ScrollArea>

            <motion.div whileTap={{ scale: 0.98 }} className="mt-3 pt-3 border-t border-border">
              <Link href="/decks">
                <Button
                  variant="outline"
                  className="w-full cursor-pointer gap-2 bg-card/70 backdrop-blur-sm border-primary/30 hover:bg-primary/10"
                >
                  <Layers className="h-4 w-4" />
                  Manage Decks
                </Button>
              </Link>
            </motion.div>
          </CardContent>
        </Card>
      </div>

      {/* Right Side — Board */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-0">
        {/* Progress bar */}
        <div className="w-[min(75vh,calc(100vh-18rem))] max-w-[90%] space-y-1 mb-2">
          <div className="flex items-center justify-between text-sm">
            <h1 className="font-bold font-serif">Drill</h1>
            <span className="text-muted-foreground font-mono text-xs">
              {doneCount}/{totalDue} completed
            </span>
          </div>
          <Progress value={(doneCount / totalDue) * 100} className="h-2" />
        </div>

        {/* Top player bar */}
        <div className="w-[min(75vh,calc(100vh-18rem))] max-w-[90%]">
          <div className="flex items-center justify-between w-full px-1 py-1.5 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-sm bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {topName[0].toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-foreground">{topName}</span>
              <span className="text-xs text-muted-foreground">({topRating})</span>
            </div>
            <div className="flex items-center gap-1.5 bg-muted/60 px-2 py-1 rounded text-xs font-mono text-muted-foreground">
              ⏱ —
            </div>
          </div>
          {/* Timer bar — when "You" is on top (playing black) */}
          {topName === "You" && (
            <div className="px-1 pb-1 flex items-center gap-2">
              <div className="flex-1">
                <TimerBar
                  elapsed={attemptResult ? Math.min(elapsed, TIMEOUT_SECONDS) : elapsed}
                  total={TIMEOUT_SECONDS}
                  running={opponentMoveAnimated && !attemptResult}
                />
              </div>
              {opponentMoveAnimated && !attemptResult && (
                <Button
                  size="sm"
                  variant={hintUsed ? "secondary" : "outline"}
                  className={`h-7 px-2 text-xs gap-1 shrink-0 cursor-pointer ${
                    hintUsed ? "text-yellow-400 border-yellow-400/40" : ""
                  }`}
                  onClick={() => {
                    if (!hintUsed && bestMoveFromSquare) {
                      setHintUsed(true);
                      setHintSquare(bestMoveFromSquare);
                    }
                  }}
                  disabled={hintUsed}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  {hintUsed ? "Hint shown" : "Hint"}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Chessboard */}
        <div className="relative rounded-lg overflow-hidden w-[min(75vh,calc(100vh-18rem))] max-w-[90%] aspect-square">
          <AnimatePresence>{previewLineControls}</AnimatePresence>
          <Chessboard
            options={{
              position: previewLine && previewFen
                ? previewFen
                : (boardPosition ?? card.fen),
              animationDurationInMs: boardAnimationDuration,
              boardOrientation: isWhiteToMove ? "white" : "black",
              allowDragging: opponentMoveAnimated && !attemptResult && !previewLine,
              onPieceDrop: previewLine ? undefined : handlePieceDrop,
              onSquareMouseDown: previewLine ? undefined : handleSquareMouseDown,
              onSquareClick: previewLine ? undefined : combinedSquareClick,
              squareStyles: combinedSquareStyles,
              boardStyle: { borderRadius: "4px" },
              pieces: styledPieces,
              darkSquareStyle: boardStyles.dark,
              lightSquareStyle: boardStyles.light,
            }}
          />
        </div>

        {/* Bottom player bar */}
        <div className="w-[min(75vh,calc(100vh-18rem))] max-w-[90%]">
          <div className="flex items-center justify-between w-full px-1 py-1.5 mt-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-sm bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {bottomName[0].toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-foreground">{bottomName}</span>
              <span className="text-xs text-muted-foreground">({bottomRating})</span>
            </div>
            <div className="flex items-center gap-1.5 bg-muted/60 px-2 py-1 rounded text-xs font-mono text-muted-foreground">
              ⏱ —
            </div>
          </div>
          {/* Timer bar — only below the "You" player */}
          {bottomName === "You" && (
            <div className="px-1 pb-1 flex items-center gap-2">
              <div className="flex-1">
                <TimerBar
                  elapsed={attemptResult ? Math.min(elapsed, TIMEOUT_SECONDS) : elapsed}
                  total={TIMEOUT_SECONDS}
                  running={opponentMoveAnimated && !attemptResult}
                />
              </div>
              {opponentMoveAnimated && !attemptResult && (
                <Button
                  size="sm"
                  variant={hintUsed ? "secondary" : "outline"}
                  className={`h-7 px-2 text-xs gap-1 shrink-0 cursor-pointer ${
                    hintUsed ? "text-yellow-400 border-yellow-400/40" : ""
                  }`}
                  onClick={() => {
                    if (!hintUsed && bestMoveFromSquare) {
                      setHintUsed(true);
                      setHintSquare(bestMoveFromSquare);
                    }
                  }}
                  disabled={hintUsed}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  {hintUsed ? "Hint shown" : "Hint"}
                </Button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
