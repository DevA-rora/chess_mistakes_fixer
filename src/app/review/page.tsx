"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/markdown-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Bot,
  BookOpen,
  Loader2,
  Zap,
  Star,
  Check,
  ThumbsUp,
  ThumbsDown,
  Minus,
  X,
  Lightbulb,
  MessageCircle,
  Send,
  Lock,
  Swords,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { Chess } from "chess.js";
import Link from "next/link";
import { type GameAnalysis, type AnalyzedMove } from "@/lib/mock-data";
import { useGamesStore } from "@/hooks/use-games-store";
import { useFlashcardsStore } from "@/hooks/use-flashcards-store";
import { useStreakStore } from "@/hooks/use-streak-store";
import { useStatsStore } from "@/hooks/use-stats-store";
import { styledPieces } from "@/lib/chess-pieces";
import { useGameAnalysis } from "@/hooks/use-game-analysis";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { useSquareHighlights } from "@/hooks/use-square-highlights";
import { useClickToMove } from "@/hooks/use-click-to-move";
import { generateFlashcards } from "@/lib/generate-flashcards";
import { ReviewCompleteScreen } from "@/components/review-complete-screen";

const Chessboard = dynamic(
  () => import("react-chessboard").then((mod) => mod.Chessboard),
  { ssr: false }
);

// --- Types ---
type MoveClassification =
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

interface HalfMove {
  notation: string;
  fen: string;
  classification?: MoveClassification;
  eval: number; // centipawns from white's perspective
  clock?: string; // Time remaining after this move (e.g. "0:05:23")
}

interface GameMove {
  number: number;
  white: HalfMove;
  black?: HalfMove;
}

// --- Classification visual config ---
const CLS: Record<MoveClassification, { bg: string; fg: string; symbol: string }> = {
  brilliant: { bg: "#1baca6", fg: "#fff", symbol: "!!" },
  great:     { bg: "#5c8bb0", fg: "#fff", symbol: "!" },
  best:      { bg: "#96bc4b", fg: "#fff", symbol: "" },   // Star icon
  excellent: { bg: "#96bc4b", fg: "#fff", symbol: "" },   // ThumbsUp icon
  good:      { bg: "#97af8b", fg: "#fff", symbol: "" },   // Check icon
  book:      { bg: "#a88765", fg: "#fff", symbol: "" },   // BookOpen icon
  inaccuracy:{ bg: "#f7c631", fg: "#312e2b", symbol: "?!" },
  mistake:   { bg: "#e69223", fg: "#fff", symbol: "?" },
  miss:      { bg: "#fa412d", fg: "#fff", symbol: "" },   // X icon
  blunder:   { bg: "#fa412d", fg: "#fff", symbol: "??" },
};

// --- Piece figurine notation ---
function figurine(notation: string): string {
  return notation
    .replace(/^K(?=[a-h1-8x])/, "♔")
    .replace(/^Q/, "♛")
    .replace(/^R/, "♖")
    .replace(/^B(?=[a-h1-8x])/, "♗")
    .replace(/^N/, "♞");
}

// --- Eval to percentage for eval bar (sigmoid mapping) ---
function evalToPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-cp / 200)) - 1);
}

// --- Format eval for display ---
function formatEval(cp: number): string {
  if (Math.abs(cp) > 900) return cp > 0 ? "+M" : "-M";
  const val = Math.abs(cp) / 100;
  return (cp >= 0 ? "+" : "-") + val.toFixed(2);
}

// --- Constants ---
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const BAD_CLASSIFICATIONS = new Set<MoveClassification>(["inaccuracy", "mistake", "miss", "blunder"]);

/** Convert GameAnalysis into the page's display format */
function analysisToGameMoves(analysis: GameAnalysis): GameMove[] {
  const moves: GameMove[] = [];
  for (let i = 0; i < analysis.moves.length; i++) {
    const m = analysis.moves[i];
    const halfMove: HalfMove = {
      notation: m.notation,
      fen: m.fenAfter,
      classification: m.classification,
      eval: m.eval,
      ...(m.clock ? { clock: m.clock } : {}),
    };
    if (m.side === "white") {
      moves.push({ number: m.moveNumber, white: halfMove });
    } else {
      const last = moves[moves.length - 1];
      if (last && last.number === m.moveNumber) {
        last.black = halfMove;
      } else {
        // Shouldn't happen, but handle gracefully
        moves.push({ number: m.moveNumber, white: { notation: "...", fen: m.fenBefore, eval: 0 }, black: halfMove });
      }
    }
  }
  return moves;
}

type FlatHalfMove = { fen: string; moveNumber: number; side: "white" | "black"; notation: string; classification?: MoveClassification; eval: number; bestMoveSan?: string; centipawnLoss?: number; clock?: string };

/** Flatten GameMoves into a linear list for board navigation */
function flattenMoves(gameMoves: GameMove[]): FlatHalfMove[] {
  const list: FlatHalfMove[] = [];
  for (const m of gameMoves) {
    list.push({ fen: m.white.fen, moveNumber: m.number, side: "white", notation: m.white.notation, classification: m.white.classification, eval: m.white.eval, clock: m.white.clock });
    if (m.black) {
      list.push({ fen: m.black.fen, moveNumber: m.number, side: "black", notation: m.black.notation, classification: m.black.classification, eval: m.black.eval, clock: m.black.clock });
    }
  }
  return list;
}

/** Generate coach insight text for a move */
function getInsightForMove(move: AnalyzedMove | undefined, redacted = false): { text: string; detail?: string } | null {
  if (!move) return null;
  const cls = move.classification;
  const sym = CLS[cls]?.symbol ?? "";
  const name = move.notation;

  if (cls === "blunder") {
    const loss = (move.centipawnLoss / 100).toFixed(1);
    return {
      text: `${name}${sym} is a blunder!`,
      detail: redacted
        ? `This move lost ${loss} pawns of evaluation. Find the better move.`
        : `This move lost ${loss} pawns of evaluation. The best move was ${move.bestMoveSan}.`,
    };
  }
  if (cls === "miss") {
    return {
      text: `${name}${sym} missed a win`,
      detail: redacted
        ? `You had a winning continuation, but this move let it slip away. Can you find it?`
        : `You had a winning continuation with ${move.bestMoveSan}, but this move let it slip away.`,
    };
  }
  if (cls === "mistake") {
    const loss = (move.centipawnLoss / 100).toFixed(1);
    return {
      text: `${name}${sym} is a mistake`,
      detail: redacted
        ? `This move lost ${loss} pawns of evaluation. Find the stronger continuation.`
        : `This move lost ${loss} pawns of evaluation. ${move.bestMoveSan} was better.`,
    };
  }
  if (cls === "inaccuracy") {
    return {
      text: `${name}${sym} is an inaccuracy`,
      detail: redacted
        ? `A slightly imprecise move. Can you find the more accurate one?`
        : `A slightly imprecise move. ${move.bestMoveSan} was more accurate.`,
    };
  }
  if (cls === "brilliant") {
    return { text: `${name} is a brilliant move!!`, detail: "An incredible find that dramatically changes the position." };
  }
  if (cls === "great") {
    return { text: `${name} is a great move!`, detail: "A strong move that significantly improves the position." };
  }
  if (cls === "best") {
    return { text: `${name} is the best move`, detail: "This was the engine's top choice." };
  }
  if (cls === "excellent") {
    return { text: `${name} is excellent!`, detail: "Very strong move, nearly matching the engine's best." };
  }
  return null;
}

// --- Classification indicator component ---
// Icon-based classifications rendered with Lucide icons, text-based ones with characters
function ClsIcon({ cls, size }: { cls: MoveClassification; size: number }) {
  const iconSize = size <= 18 ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  switch (cls) {
    case "best":      return <Star      className={`${iconSize} fill-current`} />;
    case "excellent": return <ThumbsUp  className={`${iconSize}`} />;
    case "good":      return <Check     className={`${iconSize} stroke-[3]`} />;
    case "book":      return <BookOpen  className={`${iconSize}`} />;
    case "miss":      return <X         className={`${iconSize} stroke-[3]`} />;
    default: {
      const config = CLS[cls];
      const fs = size <= 18 ? "10px" : "12px";
      return <span style={{ fontSize: fs, fontWeight: 700, lineHeight: 1 }}>{config.symbol}</span>;
    }
  }
}

function ClassificationDot({ cls, size = 18 }: { cls: MoveClassification; size?: number }) {
  const config = CLS[cls];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: config.bg,
        color: config.fg,
      }}
    >
      <ClsIcon cls={cls} size={size} />
    </span>
  );
}

// --- Eval Bar component ---
function EvalBar({ cp, className }: { cp: number; className?: string }) {
  const whitePct = evalToPercent(cp);
  return (
    <div className={`relative w-7 rounded-sm overflow-hidden ${className ?? ""}`} style={{ backgroundColor: "#1a1816" }}>
      {/* White portion from bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-500 ease-out"
        style={{
          height: `${whitePct}%`,
          backgroundColor: "#f0f0f0",
        }}
      />
      {/* Eval text */}
      <div className="absolute inset-0 flex items-start justify-center pt-1">
        <span
          className="text-[9px] font-mono font-bold leading-none"
          style={{ color: whitePct > 55 ? "#1a1816" : "#f0f0f0" }}
        >
          {Math.abs(cp) >= 100 ? (cp > 0 ? "+" : "") + (cp / 100).toFixed(1) : (cp >= 0 ? "+" : "") + (cp / 100).toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// --- Eval Graph component ---
function EvalGraph({ points, currentIndex, classifications }: { points: number[]; currentIndex: number; classifications?: (MoveClassification | undefined)[] }) {
  const width = 360;
  const height = 60;
  const midY = height / 2;

  const toY = (cp: number) => {
    const clamped = Math.max(-300, Math.min(300, cp));
    return midY - (clamped / 300) * (midY - 4);
  };

  const pathData = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * width;
      const y = toY(p);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Area fill: two paths — one for white advantage (above mid), one for black
  const areaWhite = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * width;
      const y = Math.min(toY(p), midY);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ") + ` L ${width} ${midY} L 0 ${midY} Z`;

  const areaBlack = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * width;
      const y = Math.max(toY(p), midY);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ") + ` L ${width} ${midY} L 0 ${midY} Z`;

  const currentX = (currentIndex / Math.max(points.length - 1, 1)) * width;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 60 }}>
      {/* Background */}
      <rect x="0" y="0" width={width} height={midY} fill="#2a2825" />
      <rect x="0" y={midY} width={width} height={midY} fill="#3a3733" />
      {/* Midline */}
      <line x1="0" y1={midY} x2={width} y2={midY} stroke="#555" strokeWidth="0.5" />
      {/* Area fills */}
      <path d={areaWhite} fill="rgba(255,255,255,0.08)" />
      <path d={areaBlack} fill="rgba(0,0,0,0.15)" />
      {/* Line */}
      <path d={pathData} fill="none" stroke="#e0e0e0" strokeWidth="1.5" />
      {/* Mistake markers */}
      {points.map((p, i) => {
        const cls = classifications?.[i];
        if (!cls || !["blunder", "mistake", "miss"].includes(cls)) return null;
        const x = (i / Math.max(points.length - 1, 1)) * width;
        const y = toY(p);
        return <circle key={i} cx={x} cy={y} r="3" fill={CLS[cls].bg} />;
      })}
      {/* Current position indicator */}
      <line x1={currentX} y1="0" x2={currentX} y2={height} stroke="#fff" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

// --- Player info bar ---
function PlayerBar({ name, rating, time, isTop }: { name: string; rating: number; time: string; isTop?: boolean }) {
  return (
    <div className={`flex items-center justify-between w-full px-1 py-1.5 ${isTop ? "mb-1" : "mt-1"}`}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-sm bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
          {name[0].toUpperCase()}
        </div>
        <span className="text-sm font-semibold text-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">({rating})</span>
      </div>
      <div className="flex items-center gap-1.5 bg-muted/60 px-2 py-1 rounded text-xs font-mono text-muted-foreground">
        ⏱ {time}
      </div>
    </div>
  );
}

// --- Main Page ---
export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-48px)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <ReviewPageContent />
    </Suspense>
  );
}



// --- WhyPanel: Side panel chatbot for 'Why?' button ---
type WhyMessage = { role: "ai" | "user"; content: string };

function WhyPanel({
  current,
  currentEval,
  move,
  goToNext,
  nextDisabled,
  analysis,
  currentHalfMove,
  conversations,
  setConversations,
  currentFen,
  afterMoveFen,
  onSquaresHover,
  onSquaresClear,
  onLineClick,
  onMoveClick,
  onSquareClick,
  onPanelClose,
  timeControl,
}: {
  current: FlatHalfMove | undefined;
  currentEval: number;
  move: AnalyzedMove | undefined;
  goToNext: () => void;
  nextDisabled: boolean;
  analysis: GameAnalysis;
  currentHalfMove: number;
  conversations: Map<number, WhyMessage[]>;
  setConversations: React.Dispatch<React.SetStateAction<Map<number, WhyMessage[]>>>;
  currentFen?: string;
  afterMoveFen?: string;
  onSquaresHover?: (squares: string[]) => void;
  onSquaresClear?: () => void;
  onLineClick?: (moves: string[], fromFen: string) => void;
  onMoveClick?: (fromSquare: string, toSquare: string) => void;
  onSquareClick?: (square: string) => void;
  onPanelClose?: () => void;
  timeControl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when panel opens; clear board annotations when it closes
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      onPanelClose?.();
    }
  }, [open, onPanelClose]);

  // Derive messages from the shared cache
  const messages = useMemo(() => conversations.get(currentHalfMove) ?? [], [conversations, currentHalfMove]);
  const setMessages = useCallback(
    (msgs: WhyMessage[]) => {
      setConversations((prev) => {
        const next = new Map(prev);
        next.set(currentHalfMove, msgs);
        return next;
      });
    },
    [currentHalfMove, setConversations]
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const buildHistory = useCallback(() => {
    return analysis.moves.slice(0, currentHalfMove).map((m) => ({
      moveNumber: m.moveNumber,
      side: m.side,
      notation: m.notation,
      eval: m.eval,
      classification: m.classification,
      ...(m.clock ? { clock: m.clock } : {}),
    }));
  }, [analysis, currentHalfMove]);

  const getExplainPayload = useCallback(
    (chatMessages: { role: "ai" | "user"; content: string }[]) => {
      if (!move) return null;
      const evalBefore =
        currentHalfMove > 0 ? analysis.moves[currentHalfMove - 1].eval : analysis.startEval;
      return {
        fen: move.fenBefore,
        playedMove: move.notation,
        bestMove: move.bestMoveSan,
        evalBefore,
        evalAfter: move.eval,
        classification: move.classification,
        moveNumber: move.moveNumber,
        side: move.side,
        gameHistory: buildHistory(),
        messages: chatMessages,
        mode: "review" as const,
        ...(move.clock ? { clock: move.clock } : {}),
        ...(timeControl ? { timeControl } : {}),
      };
    },
    [move, currentHalfMove, analysis, buildHistory, timeControl]
  );

  // Fetch initial explanation when opened
  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  // Send follow-up message
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || loading || !move) return;
    const userMsg = inputValue.trim();
    setInputValue("");

    const updated = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(updated);
    setLoading(true);

    const payload = getExplainPayload(updated);
    if (!payload) {
      setMessages([...updated, { role: "ai", content: "No move data available." }]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setMessages([
        ...updated,
        { role: "ai", content: data.reply || data.error || "Could not generate response." },
      ]);
    } catch {
      setMessages([...updated, { role: "ai", content: "Failed to generate response." }]);
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, move, messages, getExplainPayload, setMessages]);

  return (
    <>
      <div className="px-4 py-2 border-b border-border flex gap-2">
        <Button
          variant="outline"
          className="cursor-pointer font-semibold"
          onClick={handleOpen}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="why-panel"
        >
          Why?
        </Button>
        <Button
          className="flex-1 cursor-pointer font-semibold"
          onClick={goToNext}
          disabled={nextDisabled}
        >
          → Next
        </Button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            id="why-panel"
            aria-label="Why explanation panel"
            className="absolute inset-0 z-20 flex flex-col bg-card"
          >
            <div className="flex flex-row items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="font-heading text-base font-medium text-foreground">AI Coach</span>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Close Why panel" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Eval / Move badge */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20">
              <span className="inline-block font-mono text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                Eval: {formatEval(currentEval)}
              </span>
              <span className="inline-block font-mono text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                Move: {figurine(current?.notation ?? "...")}
              </span>
              {move?.classification && (
                <ClassificationDot cls={move.classification} size={18} />
              )}
            </div>

            {/* Chat messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                  <Bot className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Ask me anything about this move.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
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
                        currentFen={currentFen}
                        afterMoveFen={afterMoveFen}
                        onSquaresHover={onSquaresHover}
                        onSquaresClear={onSquaresClear}
                        onLineClick={onLineClick}
                        onMoveClick={onMoveClick}
                        onSquareClick={onSquareClick}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {loading && (
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
                ref={inputRef}
                type="text"
                className="flex-1 px-3 py-2 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Ask a follow-up..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  // Always stop arrow keys from bubbling to the game navigation handler
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.stopPropagation();
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSend();
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 cursor-pointer shrink-0"
                onClick={handleSend}
                disabled={!inputValue.trim() || loading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ReviewPageContent() {
  const { games, updateGame } = useGamesStore();
  const { addFlashcards } = useFlashcardsStore();
  const { recordGameReview } = useStreakStore();
  const { recordGameAnalyzed, recordGameReviewComplete } = useStatsStore();
  const { settings } = useSettingsStore();
  const searchParams = useSearchParams();
  const gameId = searchParams.get("game") || games[0]?.id || "";
  const game = games.find((g) => g.id === gameId) ?? games[0];
  const playerColor = game?.playerColor ?? "white";

  const { analysis, error, startAnalysis, forceReanalyze } = useGameAnalysis({
    gameId: game?.id ?? "",
    pgn: game?.pgn ?? "",
    depth: 14,
    autoAnalyze: !!game,
  });

  const [currentHalfMove, setCurrentHalfMove] = useState(0);
  const [reviewPhase, setReviewPhase] = useState<"summary" | "reviewing" | "completed">("summary");

  // --- Re-attempt mode state ---
  const [reattemptMode, setReattemptMode] = useState(false);
  const [reattemptMoveIdx, setReattemptMoveIdx] = useState<number | null>(null);
  const [reattemptFeedback, setReattemptFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [boardOverrideFen, setBoardOverrideFen] = useState<string | null>(null);
  const [resolvedMoves, setResolvedMoves] = useState<Set<number>>(new Set());
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [hintTokens, setHintTokens] = useState(3);
  const [checkingMove, setCheckingMove] = useState(false);
  const { handleSquareMouseDown, clearHighlights, highlightStyles } = useSquareHighlights();

  // --- Explain chat state ---
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainMessages, setExplainMessages] = useState<{ role: "ai" | "user"; content: string }[]>([]);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainInput, setExplainInput] = useState("");
  const explainScrollRef = useRef<HTMLDivElement>(null);
  const isReanalyzingRef = useRef(false);

  // --- WhyPanel conversation cache (persists per half-move within the review session) ---
  const [whyConversations, setWhyConversations] = useState<Map<number, WhyMessage[]>>(new Map());

  // --- AI chat interactive highlighting ---
  const [aiHoveredSquares, setAiHoveredSquares] = useState<Record<string, CSSProperties>>({});
  const [aiClickedArrow, setAiClickedArrow] = useState<{ startSquare: string; endSquare: string; color: string } | null>(null);
  const [aiClickedCircle, setAiClickedCircle] = useState<string | null>(null);
  const [previewLine, setPreviewLine] = useState<{
    moves: string[];
    fromFen: string;
    currentStep: number; // -1 = base position, 0..N-1 = after move N
  } | null>(null);

  // Derive flashcards synchronously from the current analysis + game
  const generatedCards = useMemo(() => {
    if (!analysis || !game) return [];
    return generateFlashcards(analysis, game, { fixOpponentMistakes: settings.fixOpponentMistakes });
  }, [analysis, game, settings.fixOpponentMistakes]);

  const reviewedMistakeCards = useMemo(() => {
    if (!analysis || !game) return [];
    return generateFlashcards(analysis, game, { fixOpponentMistakes: false });
  }, [analysis, game]);

  // When analysis completes, update game stats. Flashcards are only added after a full review.
  useEffect(() => {
    if (!analysis || !game) return;
    updateGame(game.id, {
      blunders: analysis.blunders,
      mistakes: analysis.mistakes,
      inaccuracies: analysis.inaccuracies,
      totalMistakes: analysis.blunders + analysis.mistakes + analysis.inaccuracies + (analysis.missedWins ?? 0),
      reviewStatus: "reviewing",
    });
    recordGameAnalyzed();
    isReanalyzingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.gameId]);

  // Convert analysis data to page display format
  const gameMoves = useMemo<GameMove[]>(() => {
    if (!analysis) return [];
    return analysisToGameMoves(analysis);
  }, [analysis]);

  const allHalfMoves = useMemo(() => flattenMoves(gameMoves), [gameMoves]);
  const evalPoints = useMemo(() => allHalfMoves.map((m) => m.eval), [allHalfMoves]);

  // Indices (into allHalfMoves / analysis.moves) of the player's own bad moves
  const playerMistakeIndices = useMemo(
    () =>
      allHalfMoves
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.classification && BAD_CLASSIFICATIONS.has(m.classification) && m.side === playerColor)
        .map(({ i }) => i),
    [allHalfMoves, playerColor]
  );

  // Helper: check if all mistakes have been resolved
  const allMistakesResolved = useMemo(() => {
    if (playerMistakeIndices.length === 0) return true;
    return playerMistakeIndices.every((idx) => resolvedMoves.has(idx));
  }, [playerMistakeIndices, resolvedMoves]);

  // Try to finish the review — called when user advances past the last move
  const tryCompleteReview = useCallback(() => {
    if (!game || reviewPhase !== "reviewing") return;
    if (!allMistakesResolved) {
      // Find the first unresolved mistake and jump to it
      const firstUnresolved = playerMistakeIndices.find((idx) => !resolvedMoves.has(idx));
      if (firstUnresolved !== undefined) {
        setCurrentHalfMove(firstUnresolved);
      }
      return;
    }
    updateGame(game.id, { reviewStatus: "reviewed" });
    if (generatedCards.length > 0) addFlashcards(generatedCards);
    recordGameReview();
    recordGameReviewComplete();
    setReviewPhase("completed");
  }, [
    game,
    reviewPhase,
    allMistakesResolved,
    playerMistakeIndices,
    resolvedMoves,
    updateGame,
    generatedCards,
    addFlashcards,
    recordGameReview,
    recordGameReviewComplete,
  ]);

  // Get the AnalyzedMove for the current half-move (for coach insight)
  const currentAnalyzedMove = useMemo(() => {
    if (!analysis) return undefined;
    return analysis.moves[currentHalfMove];
  }, [analysis, currentHalfMove]);

  const current = allHalfMoves[currentHalfMove];
  const currentEval = current?.eval ?? 0;
  const insight = getInsightForMove(currentAnalyzedMove);

  // Compute clock display for both sides at the current position
  const { whiteClock, blackClock } = useMemo(() => {
    let wc: string | undefined;
    let bc: string | undefined;
    for (let i = currentHalfMove; i >= 0; i--) {
      const hm = allHalfMoves[i];
      if (!hm) continue;
      if (hm.side === "white" && !wc && hm.clock) wc = hm.clock;
      if (hm.side === "black" && !bc && hm.clock) bc = hm.clock;
      if (wc && bc) break;
    }
    return { whiteClock: wc, blackClock: bc };
  }, [allHalfMoves, currentHalfMove]);
  const playerClock = playerColor === "white" ? whiteClock : blackClock;
  const opponentClock = playerColor === "white" ? blackClock : whiteClock;

  // --- AI chat callbacks (stable, no deps needed) ---
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
    setAiHoveredSquares({});
    setAiClickedArrow(null);
    setAiClickedCircle(null);
    setPreviewLine(null);
  }, []);

  // --- Re-attempt helpers ---
  const exitReattemptMode = useCallback(() => {    setReattemptMode(false);
    setReattemptFeedback(null);
    setBoardOverrideFen(null);
    setHintSquare(null);
    setExplainOpen(false);
    setExplainMessages([]);
    setExplainInput("");
    setCheckingMove(false);
    if (reattemptMoveIdx !== null) {
      setResolvedMoves((prev) => new Set(prev).add(reattemptMoveIdx));
    }
    setReattemptMoveIdx(null);
    // Advance to next move (completion is handled by the useEffect)
    setCurrentHalfMove((prev) => Math.min(allHalfMoves.length - 1, prev + 1));
  }, [reattemptMoveIdx, allHalfMoves.length]);

  const enterReattemptMode = useCallback(
    (idx: number) => {
      if (!analysis) return;
      const moveData = analysis.moves[idx];
      if (!moveData) return;
      setReattemptMode(true);
      setReattemptMoveIdx(idx);
      setReattemptFeedback(null);
      setBoardOverrideFen(moveData.fenBefore);
      setHintSquare(null);
      setCheckingMove(false);
      setExplainOpen(false);
      setExplainMessages([]);
      setExplainInput("");
      setPreviewLine(null);
      setAiClickedArrow(null);
      setAiClickedCircle(null);
    },
    [analysis]
  );

  // --- Piece drop handler for re-attempt mode ---
  const handleReattemptDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare || !analysis || reattemptMoveIdx === null || reattemptFeedback === "correct" || checkingMove) return false;

      const moveData = analysis.moves[reattemptMoveIdx];
      const chess = new Chess(moveData.fenBefore);

      try {
        const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
        if (!move) return false;

        const newFen = chess.fen();

        // Exact best move match → instant correct
        if (move.san === moveData.bestMoveSan) {
          setBoardOverrideFen(newFen);
          setReattemptFeedback("correct");
          setTimeout(() => exitReattemptMode(), 1200);
          return true;
        }

        // Otherwise, show the move and check with Stockfish
        setBoardOverrideFen(newFen);
        setCheckingMove(true);

        (async () => {
          try {
            const res = await fetch("/api/evaluate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fen: newFen, depth: 12 }),
            });
            if (res.ok) {
              const evalResult = await res.json();
              const evalBefore =
                reattemptMoveIdx > 0 ? analysis.moves[reattemptMoveIdx - 1].eval : analysis.startEval;
              const isWhiteMove = moveData.side === "white";
              const playerBefore = isWhiteMove ? evalBefore : -evalBefore;
              const playerAfter = isWhiteMove ? evalResult.score : -evalResult.score;
              const cpLoss = Math.max(0, playerBefore - playerAfter);

              if (cpLoss <= 30) {
                // Excellent move — accept
                setCheckingMove(false);
                setReattemptFeedback("correct");
                setTimeout(() => exitReattemptMode(), 1200);
                return;
              }
            }
          } catch {
            // eval failure — treat as incorrect
          }

          // Incorrect move — reset after brief feedback
          setCheckingMove(false);
          setReattemptFeedback("incorrect");
          setTimeout(() => {
            setBoardOverrideFen(moveData.fenBefore);
            setReattemptFeedback(null);
          }, 1000);
        })();

        return true;
      } catch {
        return false;
      }
    },
    [analysis, reattemptMoveIdx, reattemptFeedback, checkingMove, exitReattemptMode]
  );

  // --- Click-to-move for re-attempt mode ---
  const reattemptMoveAttempt = useCallback(
    (from: string, to: string): boolean => {
      if (!analysis || reattemptMoveIdx === null || reattemptFeedback === "correct" || checkingMove) return false;
      const moveData = analysis.moves[reattemptMoveIdx];
      const chess = new Chess(moveData.fenBefore);
      try {
        const move = chess.move({ from, to, promotion: "q" });
        if (!move) return false;
        const newFen = chess.fen();
        if (move.san === moveData.bestMoveSan) {
          setBoardOverrideFen(newFen);
          setReattemptFeedback("correct");
          setTimeout(() => exitReattemptMode(), 1200);
          return true;
        }
        setBoardOverrideFen(newFen);
        setCheckingMove(true);
        (async () => {
          try {
            const res = await fetch("/api/evaluate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fen: newFen, depth: 12 }),
            });
            if (res.ok) {
              const evalResult = await res.json();
              const evalBefore =
                reattemptMoveIdx > 0 ? analysis.moves[reattemptMoveIdx - 1].eval : analysis.startEval;
              const isWhiteMove = moveData.side === "white";
              const playerBefore = isWhiteMove ? evalBefore : -evalBefore;
              const playerAfter = isWhiteMove ? evalResult.score : -evalResult.score;
              const cpLoss = Math.max(0, playerBefore - playerAfter);
              if (cpLoss <= 30) {
                setCheckingMove(false);
                setReattemptFeedback("correct");
                setTimeout(() => exitReattemptMode(), 1200);
                return;
              }
            }
          } catch { /* treat as incorrect */ }
          setCheckingMove(false);
          setReattemptFeedback("incorrect");
          setTimeout(() => {
            setBoardOverrideFen(moveData.fenBefore);
            setReattemptFeedback(null);
          }, 1000);
        })();
        return true;
      } catch {
        return false;
      }
    },
    [analysis, reattemptMoveIdx, reattemptFeedback, checkingMove, exitReattemptMode]
  );

  const reattemptClickEnabled = reattemptMode && reattemptFeedback !== "correct" && !checkingMove;
  const reattemptFen = useMemo(() => {
    if (!analysis || reattemptMoveIdx === null) return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    return analysis.moves[reattemptMoveIdx].fenBefore;
  }, [analysis, reattemptMoveIdx]);

  const { handleSquareClick: reattemptSquareClick, clickToMoveStyles: reattemptClickStyles, clearSelection: clearReattemptSelection } = useClickToMove({
    fen: reattemptFen,
    enabled: reattemptClickEnabled,
    onMoveAttempt: reattemptMoveAttempt,
  });

  const handleReviewSquareClick = useCallback(
    (args: { piece: { pieceType: string } | null; square: string }) => {
      clearHighlights();
      reattemptSquareClick(args);
    },
    [clearHighlights, reattemptSquareClick]
  );

  // --- Hint handler ---
  const handleHint = useCallback(() => {
    if (hintTokens <= 0 || !analysis || reattemptMoveIdx === null) return;
    const moveData = analysis.moves[reattemptMoveIdx];
    const fromSquare = moveData.bestMove.substring(0, 2);
    setHintSquare(fromSquare);
    setHintTokens((prev) => prev - 1);
  }, [hintTokens, analysis, reattemptMoveIdx]);

  // --- Explain handlers ---

  // Build game history up to the current re-attempt move (moves + evals for AI context)
  const buildGameHistoryPayload = useCallback(
    (moveIdx: number) => {
      if (!analysis) return [];
      return analysis.moves.slice(0, moveIdx).map((m) => ({
        moveNumber: m.moveNumber,
        side: m.side,
        notation: m.notation,
        eval: m.eval,
        classification: m.classification,
        ...(m.clock ? { clock: m.clock } : {}),
      }));
    },
    [analysis]
  );

  const handleExplain = useCallback(async () => {
    if (!analysis || reattemptMoveIdx === null) return;
    setExplainOpen(true);

    if (explainMessages.length > 0) return;

    const moveData = analysis.moves[reattemptMoveIdx];
    const evalBefore =
      reattemptMoveIdx > 0 ? analysis.moves[reattemptMoveIdx - 1].eval : analysis.startEval;
    setExplainLoading(true);

    const initialQuestion = `Why was ${moveData.notation} a bad move here?`;

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: moveData.fenBefore,
          playedMove: moveData.notation,
          bestMove: moveData.bestMoveSan,
          evalBefore,
          evalAfter: moveData.eval,
          classification: moveData.classification,
          moveNumber: moveData.moveNumber,
          side: moveData.side,
          gameHistory: buildGameHistoryPayload(reattemptMoveIdx),
          messages: [{ role: "user", content: initialQuestion }],
          mode: "reattempt",
          ...(moveData.clock ? { clock: moveData.clock } : {}),
          ...(game?.timeControl ? { timeControl: game.timeControl } : {}),
        }),
      });
      const data = await res.json();
      setExplainMessages([
        { role: "user", content: initialQuestion },
        { role: "ai", content: data.reply || data.error || "Could not generate explanation." },
      ]);
    } catch {
      setExplainMessages([
        { role: "user", content: initialQuestion },
        { role: "ai", content: "Failed to generate explanation. Please try again." },
      ]);
    } finally {
      setExplainLoading(false);
    }
  }, [analysis, reattemptMoveIdx, explainMessages.length, buildGameHistoryPayload]);

  const handleExplainSend = useCallback(async () => {
    if (!explainInput.trim() || explainLoading || !analysis || reattemptMoveIdx === null) return;
    const moveData = analysis.moves[reattemptMoveIdx];
    const evalBefore =
      reattemptMoveIdx > 0 ? analysis.moves[reattemptMoveIdx - 1].eval : analysis.startEval;
    const userMsg = explainInput.trim();
    setExplainInput("");

    const updated = [...explainMessages, { role: "user" as const, content: userMsg }];
    setExplainMessages(updated);
    setExplainLoading(true);

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: moveData.fenBefore,
          playedMove: moveData.notation,
          bestMove: moveData.bestMoveSan,
          evalBefore,
          evalAfter: moveData.eval,
          classification: moveData.classification,
          moveNumber: moveData.moveNumber,
          side: moveData.side,
          gameHistory: buildGameHistoryPayload(reattemptMoveIdx),
          messages: updated,
          mode: "reattempt",
          ...(moveData.clock ? { clock: moveData.clock } : {}),
          ...(game?.timeControl ? { timeControl: game.timeControl } : {}),
        }),
      });
      const data = await res.json();
      setExplainMessages([
        ...updated,
        { role: "ai", content: data.reply || data.error || "Could not generate response." },
      ]);
    } catch {
      setExplainMessages([...updated, { role: "ai", content: "Failed to generate response." }]);
    } finally {
      setExplainLoading(false);
    }
  }, [explainInput, explainLoading, explainMessages, analysis, reattemptMoveIdx, buildGameHistoryPayload]);

  // Scroll explain chat to bottom
  useEffect(() => {
    if (explainScrollRef.current) {
      explainScrollRef.current.scrollTop = explainScrollRef.current.scrollHeight;
    }
  }, [explainMessages, explainLoading]);

  // --- Navigation ---
  const goTo = useCallback(
    (idx: number) => {
      if (reattemptMode) return;
      setPreviewLine(null);
      if (idx >= allHalfMoves.length) {
        // Past the last move — try to complete the review
        setCurrentHalfMove(allHalfMoves.length - 1);
        tryCompleteReview();
        return;
      }
      setCurrentHalfMove(Math.max(0, Math.min(allHalfMoves.length - 1, idx)));
    },
    [allHalfMoves.length, reattemptMode, tryCompleteReview]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (allHalfMoves.length === 0) return;

      // Preview mode: arrow keys step through the line
      if (previewLine) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setPreviewLine((pl) =>
            pl ? { ...pl, currentStep: Math.min(pl.moves.length - 1, pl.currentStep + 1) } : null
          );
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setPreviewLine((pl) =>
            pl ? { ...pl, currentStep: Math.max(-1, pl.currentStep - 1) } : null
          );
        } else if (e.key === "Escape") {
          setPreviewLine(null);
        }
        return;
      }

      // Block navigation during re-attempt
      if (reattemptMode) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentHalfMove((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        // At the last move — attempt to finish the review
        if (currentHalfMove >= allHalfMoves.length - 1) {
          tryCompleteReview();
          return;
        }
        const currentMoveData = allHalfMoves[currentHalfMove];
        const isPlayerMove = currentMoveData?.side === playerColor;
        const shouldReattempt =
          currentMoveData?.classification &&
          BAD_CLASSIFICATIONS.has(currentMoveData.classification) &&
          !resolvedMoves.has(currentHalfMove) &&
          (isPlayerMove || settings.fixOpponentMistakes);
        if (shouldReattempt) {
          enterReattemptMode(currentHalfMove);
        } else {
          setCurrentHalfMove((prev) => Math.min(allHalfMoves.length - 1, prev + 1));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allHalfMoves, reattemptMode, resolvedMoves, currentHalfMove, enterReattemptMode, playerColor, settings.fixOpponentMistakes, previewLine, tryCompleteReview]);

  // Reset position when game changes
  useEffect(() => {
    setCurrentHalfMove(0);
    setResolvedMoves(new Set());
    setReattemptMode(false);
    setReattemptMoveIdx(null);
    setReattemptFeedback(null);
    setBoardOverrideFen(null);
    setHintSquare(null);
  }, [gameId]);

  // Which full move row is selected?
  const selectedMoveNumber = current?.moveNumber;
  const selectedSide = current?.side;

  // Computed values for re-attempt mode (must be before early returns)
  const reattemptAnalyzedMove =
    reattemptMoveIdx !== null && analysis ? analysis.moves[reattemptMoveIdx] : undefined;

  // Clear circle highlights and click-to-move selection when navigating moves
  useEffect(() => {
    clearHighlights();
    clearReattemptSelection();
    setAiClickedArrow(null);
    setAiClickedCircle(null);
  }, [currentHalfMove, clearHighlights, clearReattemptSelection]);

  const customSquareStyles = useMemo(() => {
    const hintStyles = (hintSquare && reattemptMode) ? {
      [hintSquare]: {
        background: "radial-gradient(circle, rgba(255,235,59,0.65) 40%, transparent 70%)",
        borderRadius: "50%",
      },
    } : {};
    const aiCircleStyles = aiClickedCircle ? {
      [aiClickedCircle]: {
        background: "radial-gradient(circle, transparent 55%, rgba(96,165,250,0.8) 55%, rgba(96,165,250,0.8) 76%, transparent 76%)",
      },
    } : {};
    return {
      ...highlightStyles,
      ...reattemptClickStyles,
      ...hintStyles,
      ...aiCircleStyles,
      ...(previewLine ? {} : aiHoveredSquares),
    };
  }, [hintSquare, reattemptMode, highlightStyles, reattemptClickStyles, aiHoveredSquares, previewLine, aiClickedCircle]);

  // Compute the FEN to show during line preview
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

  // --- Review completed screen (shown during active session) ---
  if (reviewPhase === "completed" && analysis && game) {
    return (
      <ReviewCompleteScreen
        game={game}
        analysis={analysis}
        playerColor={playerColor}
        reviewedFlashcards={reviewedMistakeCards}
        onReReview={() => {
          isReanalyzingRef.current = true;
          forceReanalyze();
          updateGame(game.id, { reviewStatus: "not-reviewed" });
          setReviewPhase("summary");
          setCurrentHalfMove(0);
          setResolvedMoves(new Set());
        }}
      />
    );
  }

  const isAlreadyReviewed = game?.reviewStatus === "reviewed";
  const hasNoGame = !game;

  // Revisited reviewed games should still show the completion experience (with carousel)
  if (isAlreadyReviewed && analysis && game) {
    return (
      <ReviewCompleteScreen
        game={game}
        analysis={analysis}
        playerColor={playerColor}
        reviewedFlashcards={reviewedMistakeCards}
        onReReview={() => {
          isReanalyzingRef.current = true;
          forceReanalyze();
          updateGame(game.id, { reviewStatus: "not-reviewed" });
          setReviewPhase("summary");
          setCurrentHalfMove(0);
          setResolvedMoves(new Set());
        }}
      />
    );
  }

  // --- Already-reviewed or no game to review ---

  if (isAlreadyReviewed || hasNoGame) {
    return (
      <div className="flex h-[calc(100vh-48px)] items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center text-center max-w-lg"
        >
          {/* Decorative icon cluster */}
          <div className="relative mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
              className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shadow-lg shadow-primary/5"
            >
              <Swords className="h-11 w-11 text-primary/70" />
            </motion.div>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35, type: "spring", stiffness: 300, damping: 15 }}
              className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center"
            >
              <Check className="h-4 w-4 text-emerald-400" />
            </motion.div>
          </div>

          {/* Heading */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-2xl font-bold font-serif tracking-tight mb-2"
          >
            {isAlreadyReviewed ? "Game Already Reviewed" : "No Game Selected"}
          </motion.h2>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-muted-foreground text-sm leading-relaxed mb-1 max-w-sm"
          >
            {isAlreadyReviewed
              ? `You've already reviewed your game against ${game.opponent}. Your mistakes have been converted into flashcards for spaced repetition practice.`
              : "Select a game from your library to begin a move-by-move review with engine analysis."}
          </motion.p>

          {/* Subtle stat badges for reviewed game */}
          {isAlreadyReviewed && game && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="flex items-center gap-2 mt-3 mb-6"
            >
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                {game.blunders} blunders
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                {game.mistakes} mistakes
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                {game.inaccuracies} inaccuracies
              </span>
            </motion.div>
          )}

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className={`flex flex-col sm:flex-row gap-3 ${isAlreadyReviewed ? "" : "mt-6"}`}
          >
            {isAlreadyReviewed && (
              <Button
                variant="outline"
                size="lg"
                className="gap-2 cursor-pointer font-semibold px-6 py-6 text-sm rounded-xl border-border hover:bg-muted/50 transition-colors"
                onClick={() => {
                  isReanalyzingRef.current = true;
                  forceReanalyze();
                  if (game) updateGame(game.id, { reviewStatus: "not-reviewed" });
                  setReviewPhase("summary");
                  setCurrentHalfMove(0);
                  setResolvedMoves(new Set());
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Re-analyse Game
              </Button>
            )}
            <Link href="/games">
              <Button
                size="lg"
                className="gap-2 cursor-pointer font-semibold px-8 py-6 text-base rounded-xl shadow-md hover:shadow-lg transition-shadow"
              >
                <Swords className="h-4 w-4" />
                Pick Another Game
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>

          {/* Subtle hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.65 }}
            className="text-xs text-muted-foreground mt-4"
          >
            Import new games or select an unreviewed one to continue improving
          </motion.p>
        </motion.div>
      </div>
    );
  }

  // --- No analysis state: auto-analyzing loading screen ---
  if (!analysis) {
    return (
      <div className="flex h-[calc(100vh-48px)] items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-6 text-center max-w-md px-6"
        >
          <Link href="/games" className="self-start">
            <Button variant="ghost" size="sm" className="gap-2 cursor-pointer text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to Games
            </Button>
          </Link>

          {error ? (
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <Zap className="h-8 w-8 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1">Analysis Failed</h3>
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>
              </div>
              <Button className="w-full cursor-pointer font-semibold" size="lg" onClick={startAnalysis}>
                <Zap className="mr-2 h-4 w-4" /> Retry Analysis
              </Button>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Analyzing Your Game</h3>
                <p className="text-sm text-muted-foreground">
                  Running Stockfish 18 engine analysis on every move...
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                vs {game.opponent} ({game.opponentRating}) · {game.date} · {game.timeControl}
              </p>
              <p className="text-xs text-muted-foreground animate-pulse">
                This may take 30–60 seconds depending on game length
              </p>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // --- Summary screen: Chess.com-style game review overview ---
  if (reviewPhase === "summary") {
    // Compute per-side classification counts
    const whiteMoves = analysis.moves.filter((m) => m.side === "white");
    const blackMoves = analysis.moves.filter((m) => m.side === "black");

    function countCls(moves: AnalyzedMove[], cls: MoveClassification) {
      return moves.filter((m) => m.classification === cls).length;
    }

    const classificationRows: { label: string; cls: MoveClassification }[] = [
      { label: "Brilliant", cls: "brilliant" },
      { label: "Great", cls: "great" },
      { label: "Best", cls: "best" },
      { label: "Excellent", cls: "excellent" },
      { label: "Good", cls: "good" },
      { label: "Book", cls: "book" },
      { label: "Inaccuracy", cls: "inaccuracy" },
      { label: "Mistake", cls: "mistake" },
      { label: "Missed Win", cls: "miss" },
      { label: "Blunder", cls: "blunder" },
    ];

    // Generate coach message based on analysis results
    const totalBadMoves = analysis.blunders + analysis.mistakes + analysis.inaccuracies + (analysis.missedWins ?? 0);
    const playerAccuracy = playerColor === "white" ? (analysis.whiteAccuracy ?? 0) : (analysis.blackAccuracy ?? 0);
    let coachMessage: string;
    if (totalBadMoves === 0) {
      coachMessage = "An incredible game! You played near-perfect chess.";
    } else if (playerAccuracy > 90) {
      coachMessage = "A very strong game with just a few things to clean up. Let's take a look!";
    } else if (playerAccuracy > 75) {
      coachMessage = "There are some great moves to review in an otherwise tough game. Let's take a look!";
    } else if (totalBadMoves > 6) {
      coachMessage = "A rough game with several key moments. Let's learn from the mistakes!";
    } else {
      coachMessage = "A solid effort with a few areas to improve. Let's review the critical moments!";
    }

    // Phase rating: compute avg centipawn loss per phase
    function getPhaseRating(moves: AnalyzedMove[]) {
      if (moves.length === 0) return null;
      const avgCpl = moves.reduce((s, m) => s + m.centipawnLoss, 0) / moves.length;
      if (avgCpl < 15) return { icon: "check", color: "#96bc4b" }; // checkmark = excellent
      if (avgCpl < 40) return { icon: "thumbsUp", color: "#96bc4b" }; // thumbs up = good
      if (avgCpl < 80) return { icon: "minus", color: "#f7c631" }; // neutral
      return { icon: "thumbsDown", color: "#fa412d" }; // poor
    }

    // Split moves into phases by standard chess thresholds
    const whiteOpening = whiteMoves.filter((m) => m.moveNumber <= 10);
    const whiteMiddle = whiteMoves.filter((m) => m.moveNumber > 10 && m.moveNumber <= 25);
    const whiteEnd = whiteMoves.filter((m) => m.moveNumber > 25);
    const blackOpening = blackMoves.filter((m) => m.moveNumber <= 10);
    const blackMiddle = blackMoves.filter((m) => m.moveNumber > 10 && m.moveNumber <= 25);
    const blackEnd = blackMoves.filter((m) => m.moveNumber > 25);

    // Only show phases where at least one side has moves
    const phases = [
      { label: "Opening", white: whiteOpening, black: blackOpening },
      { label: "Middlegame", white: whiteMiddle, black: blackMiddle },
      { label: "Endgame", white: whiteEnd, black: blackEnd },
    ].filter(({ white, black }) => white.length > 0 || black.length > 0);

    function PhaseIcon({ rating }: { rating: ReturnType<typeof getPhaseRating> }) {
      if (!rating) return <Minus className="h-5 w-5 text-muted-foreground" />;
      if (rating.icon === "check") return <Check className="h-5 w-5" style={{ color: rating.color }} />;
      if (rating.icon === "thumbsUp") return <ThumbsUp className="h-5 w-5" style={{ color: rating.color }} />;
      if (rating.icon === "thumbsDown") return <ThumbsDown className="h-5 w-5" style={{ color: rating.color }} />;
      return <Minus className="h-5 w-5" style={{ color: rating.color }} />;
    }

    return (
      <div className="flex h-[calc(100vh-48px)] overflow-hidden justify-center">
        {/* LEFT: Board Section */}
        <div className="flex items-center justify-center min-w-0 pr-1">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col w-[min(75vh,calc(100vw-420px))]"
          >
            {/* Opponent bar */}
            <div className="flex gap-1.5">
              <div className="w-7 shrink-0" />
              <PlayerBar name={game.opponent} rating={game.opponentRating} time={opponentClock ?? "—"} isTop />
            </div>

            {/* Board + Eval bar */}
            <div className="flex gap-1.5">
              <EvalBar cp={0} className="self-stretch" />
              <div className="flex-1 aspect-square min-w-0 rounded overflow-hidden">
                <Chessboard
                  options={{
                    position: STARTING_FEN,
                    animationDurationInMs: 250,
                    boardOrientation: playerColor,
                    boardStyle: { borderRadius: "2px" },
                    pieces: styledPieces,
                    darkSquareStyle: {
                      backgroundImage:
                        "linear-gradient(rgba(209, 82, 23, 0.55), rgba(209, 82, 23, 0.55)), url('/light_wood_texture/Wood095_Color_512.jpg')",
                      backgroundSize: "cover",
                    },
                    lightSquareStyle: {
                      backgroundImage:
                        "linear-gradient(rgba(242, 217, 168, 0.55), rgba(242, 217, 168, 0.55)), url('/light_wood_texture/Wood095_Color_512.jpg')",
                      backgroundSize: "cover",
                    },
                    allowDragging: false,
                  }}
                />
              </div>
            </div>

            {/* Player bar */}
            <div className="flex gap-1.5">
              <div className="w-7 shrink-0" />
              <PlayerBar name="You" rating={game.playerRating} time={playerClock ?? "—"} />
            </div>
          </motion.div>
        </div>

        {/* RIGHT: Summary Panel */}
        <div className="flex items-stretch pl-1">
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="w-[380px] flex flex-col border-x border-border bg-card"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3" style={{ backgroundColor: "#3d3b37" }}>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
              <h2 className="text-base font-bold text-white">Game Review</h2>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-5 space-y-4">
              {/* Coach message */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 rounded-xl px-4 py-3 text-sm text-foreground leading-relaxed" style={{ backgroundColor: "#f0f0f0", color: "#1a1816" }}>
                  {coachMessage}
                </div>
              </div>

              {/* Eval Graph */}
              <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "#262421" }}>
                <EvalGraph
                  points={evalPoints}
                  currentIndex={-1}
                  classifications={allHalfMoves.map((m) => m.classification)}
                />
              </div>

              {/* Player names row */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">You</p>
                </div>
                <div />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{game.opponent}</p>
                </div>
              </div>

              {/* Players row */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
                    Y
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-semibold">Players</p>
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
                    {game.opponent[0].toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Accuracy row */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
                <div className="flex justify-center">
                  <span className="text-2xl font-bold px-4 py-1 rounded-md" style={{ backgroundColor: "#3d3b37", color: "#fff" }}>
                    {(analysis.whiteAccuracy ?? 0).toFixed(1)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-semibold">Accuracy</p>
                <div className="flex justify-center">
                  <span className="text-2xl font-bold px-4 py-1 rounded-md" style={{ backgroundColor: "#3d3b37", color: "#fff" }}>
                    {(analysis.blackAccuracy ?? 0).toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Classification breakdown */}
              <div className="space-y-0.5">
                {classificationRows.map(({ label, cls }) => {
                  const wCount = countCls(whiteMoves, cls);
                  const bCount = countCls(blackMoves, cls);
                  const important = ["brilliant", "great", "best", "mistake", "miss", "blunder"].includes(cls);
                  if (wCount === 0 && bCount === 0 && !important) return null;

                  const config = CLS[cls];
                  return (
                    <div key={cls} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5">
                      <div className="flex justify-center">
                        <span className="text-base font-bold" style={{ color: config.bg }}>
                          {wCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 min-w-[120px] justify-center">
                        <ClassificationDot cls={cls} size={22} />
                        <span className="text-xs text-muted-foreground font-semibold">{label}</span>
                      </div>
                      <div className="flex justify-center">
                        <span className="text-base font-bold" style={{ color: config.bg }}>
                          {bCount}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Expand divider */}
              <div className="flex justify-center py-1">
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Game Rating */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2">
                <div className="flex justify-center">
                  <span className="text-lg font-bold px-3 py-0.5 rounded-md" style={{ backgroundColor: "#3d3b37", color: "#fff" }}>
                    {game.playerRating}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-semibold">Game Rating</p>
                <div className="flex justify-center">
                  <span className="text-lg font-bold px-3 py-0.5 rounded-md" style={{ backgroundColor: "#3d3b37", color: "#fff" }}>
                    {game.opponentRating}
                  </span>
                </div>
              </div>

              {/* Phase ratings */}
              {phases.map(({ label, white, black }) => (
                <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1">
                  <div className="flex justify-center">
                    <PhaseIcon rating={getPhaseRating(white)} />
                  </div>
                  <p className="text-xs text-muted-foreground font-semibold min-w-[120px] text-center">{label}</p>
                  <div className="flex justify-center">
                    <PhaseIcon rating={getPhaseRating(black)} />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Start Review button */}
          <div className="px-5 py-4 border-t border-border">
            <Button
              className="w-full cursor-pointer font-bold text-lg py-6"
              size="lg"
              onClick={() => {
                setReviewPhase("reviewing");
              }}
              style={{ backgroundColor: "#81b64c", color: "#fff" }}
            >
              Start Review
            </Button>
          </div>
        </motion.div>
        </div>
      </div>
    );
  }

  // --- Analysis available ---
  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden justify-center">
      {/* LEFT: Board Section */}
      <div className="flex items-center justify-center min-w-0 pr-1">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col w-[min(75vh,calc(100vw-420px))]"
        >
          {/* Opponent bar */}
          <div className="flex gap-1.5">
            <div className="w-7 shrink-0" />
            <PlayerBar name={game.opponent} rating={game.opponentRating} time={opponentClock ?? "—"} isTop />
          </div>

          {/* Board + Eval bar */}
          <div className="flex gap-1.5">
            {/* Eval bar hides during re-attempt */}
            {reattemptMode ? (
              <div className="w-7 shrink-0" />
            ) : (
              <EvalBar cp={currentEval} className="self-stretch" />
            )}
            <div className="flex-1 aspect-square min-w-0 rounded overflow-hidden relative">
              <AnimatePresence>
                {previewLine && (
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
                            pl
                              ? { ...pl, currentStep: Math.min(pl.moves.length - 1, pl.currentStep + 1) }
                              : null
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
                        title="Exit preview (Esc)"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <Chessboard
                options={{
                  position: previewLine && previewFen
                    ? previewFen
                    : reattemptMode && boardOverrideFen
                      ? boardOverrideFen
                      : (current?.fen ?? STARTING_FEN),
                  animationDurationInMs: 250,
                  boardOrientation: playerColor,
                  boardStyle: { borderRadius: "2px" },
                  pieces: styledPieces,
                  darkSquareStyle: {
                    backgroundImage:
                      "linear-gradient(rgba(209, 82, 23, 0.55), rgba(209, 82, 23, 0.55)), url('/light_wood_texture/Wood095_Color_512.jpg')",
                    backgroundSize: "cover",
                  },
                  lightSquareStyle: {
                    backgroundImage:
                      "linear-gradient(rgba(242, 217, 168, 0.55), rgba(242, 217, 168, 0.55)), url('/light_wood_texture/Wood095_Color_512.jpg')",
                    backgroundSize: "cover",
                  },
                  allowDragging: !previewLine && reattemptMode && reattemptFeedback !== "correct" && !checkingMove,
                  onPieceDrop: (!previewLine && reattemptMode) ? handleReattemptDrop : undefined,
                  onSquareMouseDown: previewLine ? undefined : handleSquareMouseDown,
                  onSquareClick: previewLine ? undefined : handleReviewSquareClick,
                  squareStyles: customSquareStyles,
                  arrows: aiClickedArrow ? [aiClickedArrow] : [],
                }}
              />

              {/* Re-attempt feedback overlay */}
              <AnimatePresence>
                {reattemptFeedback === "correct" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    style={{ backgroundColor: "rgba(129, 182, 76, 0.25)" }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="bg-[#81b64c] rounded-full p-4"
                    >
                      <Check className="h-10 w-10 text-white stroke-[3]" />
                    </motion.div>
                  </motion.div>
                )}
                {reattemptFeedback === "incorrect" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    style={{ backgroundColor: "rgba(250, 65, 45, 0.2)" }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="bg-[#fa412d] rounded-full p-4"
                    >
                      <X className="h-10 w-10 text-white stroke-[3]" />
                    </motion.div>
                  </motion.div>
                )}
                {checkingMove && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
                  >
                    <Loader2 className="h-10 w-10 animate-spin text-white" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Player bar */}
          <div className="flex gap-1.5">
            <div className="w-7 shrink-0" />
            <PlayerBar name="You" rating={game.playerRating} time={playerClock ?? "—"} />
          </div>
        </motion.div>
      </div>

      {/* RIGHT: Review Panel */}
      <div className="flex items-stretch pl-1">
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="w-[380px] flex flex-col border-x border-border bg-card relative"
      >
        {/* Panel Header — changes during re-attempt */}
        {reattemptMode ? (
          <div className="px-4 py-3 border-b border-border" style={{ backgroundColor: "rgba(129, 182, 76, 0.15)" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#81b64c" }}>
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: "#81b64c" }}>
                  Your turn — find the best move
                </h2>
                {reattemptAnalyzedMove && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{figurine(reattemptAnalyzedMove.notation)}</span> was a{" "}
                    <span style={{ color: CLS[reattemptAnalyzedMove.classification]?.bg }}>
                      {reattemptAnalyzedMove.classification}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Link href="/games">
                <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h2 className="text-base font-bold">Game Review</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{analysis.blunders} blunders</span>
              <span>·</span>
              <span>{analysis.mistakes} mistakes</span>
              <span>·</span>
              <span>{analysis.inaccuracies} inaccuracies</span>
            </div>
          </div>
        )}

        {/* Re-attempt actions panel */}
        {reattemptMode ? (
          <div className="px-4 py-3 border-b border-border space-y-3">
            {/* Classification detail */}
            {reattemptAnalyzedMove && (
              <div className="flex items-start gap-3">
                <ClassificationDot cls={reattemptAnalyzedMove.classification} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {getInsightForMove(reattemptAnalyzedMove, true)?.detail}
                  </p>
                </div>
              </div>
            )}

            {/* Hint + Explain buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 cursor-pointer gap-2"
                onClick={handleHint}
                disabled={hintTokens <= 0 || reattemptFeedback === "correct"}
              >
                <Lightbulb className="h-4 w-4" />
                Hint
                <span className="text-xs text-muted-foreground ml-1">({hintTokens})</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 cursor-pointer gap-2"
                onClick={handleExplain}
                disabled={reattemptFeedback === "correct"}
              >
                <MessageCircle className="h-4 w-4" />
                Explain
              </Button>
            </div>

            {/* Feedback messages */}
            <AnimatePresence mode="wait">
              {reattemptFeedback === "correct" && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: "rgba(129, 182, 76, 0.15)" }}
                >
                  <Check className="h-4 w-4" style={{ color: "#81b64c" }} />
                  <span className="text-sm font-semibold" style={{ color: "#81b64c" }}>
                    Correct! Great find.
                  </span>
                </motion.div>
              )}
              {reattemptFeedback === "incorrect" && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: "rgba(250, 65, 45, 0.12)" }}
                >
                  <X className="h-4 w-4 text-[#fa412d]" />
                  <span className="text-sm font-medium text-[#fa412d]">Not quite — try again</span>
                </motion.div>
              )}
              {checkingMove && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Analyzing your move…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            {/* Normal Coach Insight */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {insight?.text ?? `${figurine(current?.notation ?? "...")} played`}
                    </p>
                    <span
                      className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: currentEval >= 0 ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.3)",
                        color: currentEval >= 0 ? "#f0f0f0" : "#aaa",
                      }}
                    >
                      {formatEval(currentEval)}
                    </span>
                  </div>
                  {insight?.detail && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.detail}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Why + Next buttons and AI Coach overlay */}
            <WhyPanel
              current={current}
              currentEval={currentEval}
              move={currentAnalyzedMove}
              goToNext={() => {
                // At the last move — attempt to finish the review
                if (currentHalfMove >= allHalfMoves.length - 1) {
                  tryCompleteReview();
                  return;
                }
                const isPlayerMove = current?.side === playerColor;
                const shouldReattempt =
                  current?.classification &&
                  BAD_CLASSIFICATIONS.has(current.classification) &&
                  !resolvedMoves.has(currentHalfMove) &&
                  (isPlayerMove || settings.fixOpponentMistakes);
                if (shouldReattempt) {
                  enterReattemptMode(currentHalfMove);
                } else {
                  goTo(currentHalfMove + 1);
                }
              }}
              nextDisabled={false}
              analysis={analysis}
              currentHalfMove={currentHalfMove}
              conversations={whyConversations}
              setConversations={setWhyConversations}
              currentFen={previewLine ? undefined : currentAnalyzedMove?.fenBefore}
              afterMoveFen={previewLine ? undefined : currentAnalyzedMove?.fenAfter}
              onSquaresHover={handleAISquaresHover}
              onSquaresClear={handleAISquaresClear}
              onLineClick={handleAILineClick}
              onMoveClick={handleAIMoveClick}
              onSquareClick={handleAISquareClick}
              onPanelClose={handleAIPanelClose}
              timeControl={game.timeControl}
            />
          </>
        )}

        {/* Explain Chat Panel (slides in during re-attempt) */}
        {explainOpen && reattemptMode && (
          <div className="border-b border-border flex flex-col" style={{ maxHeight: "40%" }}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold">AI Coach</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 cursor-pointer"
                onClick={() => setExplainOpen(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div ref={explainScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {explainMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "ai" && <Bot className="h-4 w-4 text-primary mt-1 shrink-0" />}
                  <div
                    className={`rounded-lg px-3 py-2 text-xs leading-relaxed max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary/20 text-foreground"
                        : "bg-muted/60 text-foreground"
                    }`}
                  >
                    {msg.role === "ai" ? (
                      <MarkdownMessage
                        content={msg.content}
                        currentFen={previewLine ? undefined : reattemptAnalyzedMove?.fenBefore}
                        afterMoveFen={previewLine ? undefined : reattemptAnalyzedMove?.fenAfter}
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
              {explainLoading && (
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary shrink-0" />
                  <div className="bg-muted/60 rounded-lg px-3 py-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 px-4 py-2 border-t border-border">
              <input
                type="text"
                className="flex-1 px-3 py-1.5 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Ask a follow-up…"
                value={explainInput}
                onChange={(e) => setExplainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleExplainSend();
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 cursor-pointer shrink-0"
                onClick={handleExplainSend}
                disabled={!explainInput.trim() || explainLoading}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Move List — redacted during re-attempt */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="divide-y divide-border/50">
            {gameMoves.map((move) => {
              const isWhiteSelected = selectedMoveNumber === move.number && selectedSide === "white";
              const isBlackSelected = selectedMoveNumber === move.number && selectedSide === "black";

              const whiteIdx = allHalfMoves.findIndex(
                (h) => h.moveNumber === move.number && h.side === "white"
              );
              const blackIdx = allHalfMoves.findIndex(
                (h) => h.moveNumber === move.number && h.side === "black"
              );

              // Redact moves after re-attempt position
              const isWhiteRedacted = reattemptMode && reattemptMoveIdx !== null && whiteIdx > reattemptMoveIdx;
              const isBlackRedacted = reattemptMode && reattemptMoveIdx !== null && blackIdx > reattemptMoveIdx;

              return (
                <div key={move.number} className="flex items-center text-sm hover:bg-muted/30 transition-colors pr-4">
                  {/* Move number */}
                  <div className="w-10 text-right pr-2 text-muted-foreground text-xs font-mono shrink-0 py-1.5">
                    {move.number}.
                  </div>

                  {/* White move */}
                  {isWhiteRedacted ? (
                    <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5">
                      <Lock className="h-3 w-3 text-muted-foreground/40" />
                      <span className="font-mono text-sm text-muted-foreground/40">•••</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => goTo(whiteIdx)}
                      disabled={reattemptMode}
                      className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 transition-colors text-left ${
                        reattemptMode ? "cursor-default" : "cursor-pointer"
                      } ${isWhiteSelected ? "bg-primary/20" : reattemptMode ? "" : "hover:bg-muted/40"}`}
                    >
                      {move.white.classification && (
                        <ClassificationDot cls={move.white.classification} />
                      )}
                      <span
                        className={`font-mono text-sm ${
                          isWhiteSelected ? "text-foreground font-semibold" : "text-foreground/80"
                        }`}
                      >
                        {figurine(move.white.notation)}
                      </span>
                    </button>
                  )}

                  {/* Black move */}
                  {move.black ? (
                    isBlackRedacted ? (
                      <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5">
                        <Lock className="h-3 w-3 text-muted-foreground/40" />
                        <span className="font-mono text-sm text-muted-foreground/40">•••</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => goTo(blackIdx)}
                        disabled={reattemptMode}
                        className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 transition-colors text-left ${
                          reattemptMode ? "cursor-default" : "cursor-pointer"
                        } ${isBlackSelected ? "bg-primary/20" : reattemptMode ? "" : "hover:bg-muted/40"}`}
                      >
                        {move.black.classification && (
                          <ClassificationDot cls={move.black.classification} />
                        )}
                        <span
                          className={`font-mono text-sm ${
                            isBlackSelected ? "text-foreground font-semibold" : "text-foreground/80"
                          }`}
                        >
                          {figurine(move.black.notation)}
                        </span>
                      </button>
                    )
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Eval Graph */}
        <div className="border-t border-border">
          <EvalGraph points={evalPoints} currentIndex={currentHalfMove} classifications={allHalfMoves.map(m => m.classification)} />
        </div>

        {/* Navigation Controls — disabled during re-attempt */}
        <div className="flex items-center justify-center gap-1 px-4 py-2 border-t border-border">
          <Button variant="ghost" size="icon" className="h-9 w-9 cursor-pointer" onClick={() => goTo(0)} disabled={reattemptMode}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 cursor-pointer" onClick={() => goTo(currentHalfMove - 1)} disabled={reattemptMode}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 cursor-pointer" disabled={reattemptMode}>
            <Play className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 cursor-pointer" onClick={() => goTo(currentHalfMove + 1)} disabled={reattemptMode}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 cursor-pointer" onClick={() => goTo(allHalfMoves.length - 1)} disabled={reattemptMode}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
