"use client";

import { useEffect, useRef, useCallback, useLayoutEffect, memo, useState } from "react";
import { motion } from "motion/react";
import gsap from "gsap";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Trophy, Swords, ArrowRight, ChevronLeft, ChevronRight, Crosshair, AlertTriangle, CircleAlert, CircleX, Clock } from "lucide-react";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import type { Game, Flashcard, GameAnalysis, MistakeType } from "@/lib/mock-data";
import { styledPieces } from "@/lib/chess-pieces";

const Chessboard = dynamic(
  () => import("react-chessboard").then((mod) => mod.Chessboard),
  { ssr: false }
);

// --- Mistake type visual config ---
const MISTAKE_CONFIG: Record<MistakeType, { bg: string; fg: string; label: string; icon: typeof CircleX }> = {
  blunder:    { bg: "#fa412d", fg: "#fff", label: "Blunder", icon: CircleX },
  mistake:    { bg: "#e69223", fg: "#fff", label: "Mistake", icon: AlertTriangle },
  inaccuracy: { bg: "#f7c631", fg: "#312e2b", label: "Inaccuracy", icon: CircleAlert },
};

// --- Animated counter (same pattern as dashboard) ---
function AnimatedCounter({ value, suffix = "", delay = 0 }: { value: number; suffix?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { textContent: 0 },
      {
        textContent: value,
        duration: 1.5,
        delay,
        ease: "power2.out",
        snap: { textContent: 1 },
        onUpdate() {
          el.textContent = Math.round(Number(el.textContent || 0)) + suffix;
        },
      }
    );
  }, [value, suffix, delay]);
  return <span ref={ref}>0{suffix}</span>;
}

const STACK_VISIBLE_CARDS = 5;
const STACK_OFFSET_PX = 20;

/**
 * Memo'd mini-board so the expensive Chessboard never re-renders when only
 * the card's stack position changes (GSAP Flip handles that via transforms).
 */
const MiniBoard = memo(function MiniBoard({ fen }: { fen: string }) {
  return (
    <div className="h-[9.5rem] w-full overflow-hidden pointer-events-none">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: fen.includes(" b ") ? "black" : "white",
          allowDragging: false,
          boardStyle: { borderRadius: "0px" },
          pieces: styledPieces,
          darkSquareStyle: { backgroundColor: "#779952" },
          lightSquareStyle: { backgroundColor: "#edeed1" },
        }}
      />
    </div>
  );
});

function FlashcardSlider({ flashcards }: { flashcards: Flashcard[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const frontRef = useRef(0);
  const tweenRef = useRef<gsap.core.Timeline | null>(null);
  const n = flashcards.length;

  // Compute GSAP target values for a given stack position
  const calcProps = useCallback(
    (stackPos: number) => {
      const depth = Math.min(stackPos, STACK_VISIBLE_CARDS - 1);
      const off = (STACK_VISIBLE_CARDS - 1 - depth) * STACK_OFFSET_PX;
      const half = ((STACK_VISIBLE_CARDS - 1) * STACK_OFFSET_PX) / 2;
      return {
        x: -off + half,
        y: off - half,
        scale: 1 - depth * 0.04,
        autoAlpha: stackPos >= STACK_VISIBLE_CARDS ? 0 : 1 - depth * 0.1,
        zIndex: n - stackPos,
      };
    },
    [n],
  );

  const getItems = useCallback(
    () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-carousel-card]") ?? []),
    [],
  );

  // Apply initial positions synchronously before first paint
  useLayoutEffect(() => {
    getItems().forEach((el, i) => {
      const pos = (i - frontRef.current + n) % n;
      const p = calcProps(pos);
      gsap.set(el, {
        xPercent: -50,
        yPercent: -50,
        x: p.x,
        y: p.y,
        scale: p.scale,
        autoAlpha: p.autoAlpha,
        zIndex: p.zIndex,
        pointerEvents: pos === 0 ? "auto" : "none",
      });
    });
  }, [n, getItems, calcProps]);

  // Pure GSAP rotation — no React state changes, no re-renders
  const rotate = useCallback(
    (dir: "next" | "prev") => {
      if (n < 2) return;
      tweenRef.current?.kill();
      frontRef.current =
        dir === "next"
          ? (frontRef.current + 1) % n
          : (frontRef.current - 1 + n) % n;
      const front = frontRef.current;
      const items = getItems();

      const tl = gsap.timeline();
      items.forEach((el, i) => {
        const pos = (i - front + n) % n;
        const p = calcProps(pos);
        // zIndex + pointer-events set immediately so layering is correct throughout
        gsap.set(el, { zIndex: p.zIndex, pointerEvents: pos === 0 ? "auto" : "none" });
        tl.to(
          el,
          { x: p.x, y: p.y, scale: p.scale, autoAlpha: p.autoAlpha, duration: 0.35, ease: "power2.inOut" },
          0,
        );
      });
      tweenRef.current = tl;
    },
    [n, getItems, calcProps],
  );

  useEffect(() => () => { tweenRef.current?.kill(); }, []);

  const handlePrev = useCallback(() => rotate("prev"), [rotate]);
  const handleNext = useCallback(() => rotate("next"), [rotate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePrev, handleNext]);

  return (
    <div className="w-full">
      <div className="relative mx-auto h-[24rem] w-full max-w-md overflow-hidden">
        <ul ref={listRef} className="relative h-full w-full list-none p-0 m-0">
          {flashcards.map((card) => {
            const config = MISTAKE_CONFIG[card.mistakeType] ?? MISTAKE_CONFIG.blunder;
            const Icon = config.icon;
            return (
              <li
                key={card.id}
                data-carousel-card
                className="absolute left-1/2 top-[43%] w-56 flex flex-col rounded-xl border border-border bg-card shadow-lg overflow-hidden will-change-transform"
                style={{ visibility: "hidden", contain: "layout style paint", cursor: n > 1 ? "pointer" : "default" }}
                onClick={n > 1 ? handleNext : undefined}
              >
                <MiniBoard fen={card.fen} />

                {/* Card content */}
                <div className="p-3 flex flex-col gap-1.5">
                  {/* Mistake badge */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: config.bg, color: config.fg }}
                    >
                      <Icon className="h-3 w-3" />
                      {config.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Move {card.moveNumber}
                    </span>
                    {card.timeRemaining && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                        <Clock className="h-3 w-3" />
                        {card.timeRemaining}
                      </span>
                    )}
                  </div>

                  {/* Moves comparison */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-destructive/80 line-through font-mono">{card.yourMove}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-emerald-400 font-mono font-semibold">{card.bestMove}</span>
                  </div>

                  {/* Eval */}
                  <p className="text-[10px] text-muted-foreground leading-tight truncate">
                    {card.evaluation}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-center gap-3 mt-1">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full cursor-pointer border-border hover:bg-muted/50"
          onClick={handlePrev}
          aria-label="Previous card"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground font-medium">
          Tap card or use arrows
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full cursor-pointer border-border hover:bg-muted/50"
          onClick={handleNext}
          aria-label="Next card"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// --- Main component ---
interface ReviewCompleteScreenProps {
  game: Game;
  analysis: GameAnalysis;
  playerColor: "white" | "black";
  reviewedFlashcards: Flashcard[];
  onReReview: () => void;
}

export function ReviewCompleteScreen({
  game,
  analysis,
  playerColor,
  reviewedFlashcards,
  onReReview,
}: ReviewCompleteScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fire confetti on mount
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const confettiModule = await import("@hiseb/confetti");
        const confetti = confettiModule.default;
        const positions = [
          { x: window.innerWidth * 0.5, y: window.innerHeight * 0.35 },
          { x: window.innerWidth * 0.25, y: window.innerHeight * 0.25 },
          { x: window.innerWidth * 0.75, y: window.innerHeight * 0.25 },
        ];
        positions.forEach((position, i) => {
          setTimeout(() => {
            if (!cancelled) {
              confetti({ position, count: 80, size: 1.2, velocity: 250 });
            }
          }, i * 250);
        });
      } catch {
        // Confetti is non-critical — fail silently
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Lottie trophy animation with fallback to static icon
  const [lottieError, setLottieError] = useState(false);
  const dotLottieRefCb = useCallback((dotLottie: DotLottie | null) => {
    if (!dotLottie) return;
    dotLottie.addEventListener("loadError", () => setLottieError(true));
    dotLottie.addEventListener("complete", () => dotLottie.pause());
  }, []);

  const accuracy = playerColor === "white" ? analysis.whiteAccuracy : analysis.blackAccuracy;

  // Compute player-only mistake counts (analysis.blunders etc. count both sides)
  const playerMoves = analysis.moves.filter((m) => m.side === playerColor);
  const playerBlunders = playerMoves.filter((m) => m.classification === "blunder").length;
  const playerMistakes = playerMoves.filter((m) => m.classification === "mistake").length;
  const playerInaccuracies = playerMoves.filter((m) => m.classification === "inaccuracy").length;
  const totalMistakes = playerBlunders + playerMistakes + playerInaccuracies;

  const stats = [
    {
      label: "Accuracy",
      value: Math.round(accuracy),
      suffix: "%",
      icon: Crosshair,
      color: "text-emerald-400",
      bgColor: "bg-emerald-400/10",
    },
    {
      label: "Blunders",
      value: playerBlunders,
      suffix: "",
      icon: CircleX,
      color: "text-red-400",
      bgColor: "bg-red-400/10",
    },
    {
      label: "Mistakes",
      value: playerMistakes,
      suffix: "",
      icon: AlertTriangle,
      color: "text-orange-400",
      bgColor: "bg-orange-400/10",
    },
    {
      label: "Inaccuracies",
      value: playerInaccuracies,
      suffix: "",
      icon: CircleAlert,
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/10",
    },
  ];

  return (
    <div
      ref={containerRef}
      className="pt-10 px-6 pb-3"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center text-center max-w-2xl w-full mx-auto"
      >
        {/* Trophy animation / icon */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
          className="relative mb-6"
        >
          {lottieError ? (
            <>
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/15 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <Trophy className="h-10 w-10 text-emerald-400" />
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 12 }}
                className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-emerald-500/25 border border-emerald-500/30 flex items-center justify-center"
              >
                <span className="text-sm">🎉</span>
              </motion.div>
            </>
          ) : (
            <DotLottieReact
              src="https://lottie.host/295cdb44-8ff7-45ce-94d1-cebbd8ffcfab/0MEbGx9Xp2.lottie"
              autoplay
              width={256}
              height={256}
              dotLottieRefCallback={dotLottieRefCb}
            />
          )}
        </motion.div>

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold font-serif tracking-tight mb-2"
        >
          Review Complete!
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-md"
        >
          You reviewed all{" "}
          <span className="text-foreground font-semibold">{totalMistakes} mistake{totalMistakes !== 1 ? "s" : ""}</span>{" "}
          in your game against{" "}
          <span className="text-foreground font-semibold">{game.opponent}</span>.
          {reviewedFlashcards.length > 0 && " Your reviewed mistakes are ready as practice cards."}
        </motion.p>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-8"
        >
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/50 px-3 py-3"
              >
                <div className={`w-8 h-8 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <span className="text-xl font-bold font-mono tabular-nums">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} delay={0.6 + i * 0.1} />
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">{stat.label}</span>
              </div>
            );
          })}
        </motion.div>

        {/* No flashcards message */}
        {reviewedFlashcards.length === 0 && totalMistakes === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mb-8 px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5"
          >
            <p className="text-sm text-emerald-400 font-medium">
              No mistakes found — great game! 🎯
            </p>
          </motion.div>
        )}

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Link href="/drill">
            <Button
              size="lg"
              className="gap-2 cursor-pointer font-semibold px-8 py-6 text-base rounded-xl shadow-md hover:shadow-lg transition-shadow"
            >
              Start Drilling
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/games">
            <Button
              variant="outline"
              size="lg"
              className="gap-2 cursor-pointer font-semibold px-6 py-6 text-sm rounded-xl border-border hover:bg-muted/50 transition-colors"
            >
              <Swords className="h-4 w-4" />
              Review Another Game
            </Button>
          </Link>
        </motion.div>

        {/* Flashcard slider section */}
        {reviewedFlashcards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="w-full mt-8"
          >
            {/* Section heading */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Reviewed Mistakes
              </h3>
              <span className="inline-flex items-center justify-center text-[11px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                {reviewedFlashcards.length}
              </span>
            </div>

            <FlashcardSlider flashcards={reviewedFlashcards} />
          </motion.div>
        )}

        {/* Re-review link */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ delay: 1 }}
          whileHover={{ opacity: 0.8 }}
          className="mt-4 text-xs text-muted-foreground underline underline-offset-2 cursor-pointer"
          onClick={onReReview}
        >
          Re-analyse this game
        </motion.button>
      </motion.div>
    </div>
  );
}
