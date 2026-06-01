"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import gsap from "gsap";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Flame, Target, Trophy, Zap, ArrowRight, CheckCircle2, Clock, CircleDashed } from "lucide-react";
import { type ReviewStatus } from "@/lib/mock-data";
import { useGamesStore } from "@/hooks/use-games-store";
import { useFlashcardsStore } from "@/hooks/use-flashcards-store";
import { useStreakStore } from "@/hooks/use-streak-store";
import { RequireAuth } from "@/components/require-auth";

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
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
        ease: "power2.out",
        snap: { textContent: 1 },
        onUpdate() {
          el.textContent = Math.round(Number(el.textContent || 0)) + suffix;
        },
      }
    );
  }, [value, suffix]);

  return <span ref={ref}>0{suffix}</span>;
}

const reviewStatusConfig: Record<ReviewStatus, { label: string; icon: React.ReactNode; className: string }> = {
  reviewed: {
    label: "Reviewed",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-primary/15 text-primary border-primary/25",
  },
  reviewing: {
    label: "Reviewing",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-amber-500/15 text-amber-700 border-amber-500/25 dark:text-amber-400",
  },
  "not-reviewed": {
    label: "Not Reviewed",
    icon: <CircleDashed className="h-3 w-3" />,
    className: "border-border text-muted-foreground",
  },
};

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const config = reviewStatusConfig[status];
  return (
    <Badge variant="outline" className={`text-xs gap-1.5 ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

export default function HomePage() {
  return (
    <RequireAuth title="Welcome to Chess Mistakes Fixer" description="Sign in to see your dashboard, games, and review queue.">
      <HomePageContent />
    </RequireAuth>
  );
}

function HomePageContent() {
  const { games } = useGamesStore();
  const { getCardsDueToday, flashcards } = useFlashcardsStore();
  const { streak } = useStreakStore();
  const cardsDueToday = getCardsDueToday();
  const masteredCount = flashcards.filter((c) => c.status === "mastered").length;
  const activeCount = flashcards.filter((c) => c.status !== "mastered").length;

  const statCards = [
    {
      title: "Due Today",
      value: cardsDueToday.length,
      icon: Target,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Total Active",
      value: activeCount,
      icon: Zap,
      color: "text-chart-2",
      bgColor: "bg-chart-2/10",
    },
    {
      title: "Day Streak",
      value: streak,
      icon: Flame,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      title: "Mastered",
      value: masteredCount,
      icon: Trophy,
      color: "text-chart-1",
      bgColor: "bg-chart-1/10",
    },
  ];

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold font-serif">Today&apos;s Queue</h1>
        <p className="text-muted-foreground mt-1">
          You have <span className="text-primary font-bold">{cardsDueToday.length} cards</span> due for review
        </p>
      </motion.div>

      {/* Stat Cards - GSAP animated counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <Card className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold font-mono">
                      <AnimatedCounter value={stat.value} />
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.title}</p>
                  </div>
                  <div className={`${stat.bgColor} p-2 rounded-lg`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Start Drilling CTA */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <Link href="/drill">
          <Button size="lg" className="w-full text-base font-bold py-6 cursor-pointer">
            <Zap className="mr-2 h-5 w-5" />
            Start Drilling
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </motion.div>

      {/* Recent Games */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-serif">Recent Games</h2>
          <Link href="/games" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-3">
          {games.slice(0, 3).map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
            >
              <Link href={`/review?game=${game.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">vs. {game.opponent}</span>
                          <ReviewStatusBadge status={game.reviewStatus} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {game.timeControl} · {new Date(game.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <Progress
                          value={(game.mistakesFixed / game.totalMistakes) * 100}
                          className="w-24 h-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          {game.totalMistakes === 0 ? "0 fixed" : `${game.mistakesFixed} of ${game.totalMistakes} mistakes fixed`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Import New Game */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        <Link href="/games">
          <Button variant="outline" className="w-full cursor-pointer">
            View all games
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
