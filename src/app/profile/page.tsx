"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import gsap from "gsap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Flame, Trophy, Target, BarChart3, TrendingUp, Settings2, Award, Link2, Check, Pencil, X } from "lucide-react";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { useStreakStore } from "@/hooks/use-streak-store";
import { useFlashcardsStore } from "@/hooks/use-flashcards-store";
import { useGamesStore } from "@/hooks/use-games-store";
import { useStatsStore } from "@/hooks/use-stats-store";
import { ConnectAccountModal } from "@/components/connect-account-modal";
import { RequireAuth } from "@/components/require-auth";

function StreakCounter({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { textContent: 0 },
      {
        textContent: value,
        duration: 2,
        ease: "power2.out",
        snap: { textContent: 1 },
        onUpdate() {
          el.textContent = String(Math.round(Number(el.textContent || 0)));
        },
      }
    );
  }, [value]);

  return <span ref={ref}>0</span>;
}

function HeatmapCalendar({ data }: { data: { date: string; cardsReviewed: number }[] }) {
  const getIntensity = (count: number) => {
    if (count === 0) return "bg-muted/30";
    if (count <= 3) return "bg-chart-5/40";
    if (count <= 6) return "bg-chart-4/60";
    if (count <= 9) return "bg-chart-1/70";
    return "bg-primary";
  };

  // Organize into weeks (columns of 7)
  const weeks: typeof data[] = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  return (
    <div className="flex gap-1 overflow-x-auto pb-2">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((day) => (
            <div
              key={day.date}
              className={`w-3 h-3 rounded-sm ${getIntensity(day.cardsReviewed)} transition-colors`}
              title={`${day.date}: ${day.cardsReviewed} cards reviewed`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DonutChart({ mastered, active }: { mastered: number; active: number }) {
  const total = mastered + active;
  const masteredPct = total > 0 ? (mastered / total) * 100 : 0;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const masteredDash = (masteredPct / 100) * circumference;

  return (
    <div className="flex items-center justify-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160">
        {/* Background circle */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="16"
          className="text-muted"
        />
        {/* Mastered arc */}
        <motion.circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="16"
          className="text-primary"
          strokeDasharray={`${masteredDash} ${circumference - masteredDash}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${masteredDash} ${circumference - masteredDash}` }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
        />
        <text x="80" y="74" textAnchor="middle" className="fill-foreground text-2xl font-bold font-mono" fontSize="24">
          {mastered}
        </text>
        <text x="80" y="96" textAnchor="middle" className="fill-muted-foreground text-xs" fontSize="11">
          mastered
        </text>
      </svg>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm">Mastered ({mastered})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-muted" />
          <span className="text-sm">Active ({active})</span>
        </div>
      </div>
    </div>
  );
}

function MistakeCategoryBar({ category, count, maxCount, delay }: { category: string; count: number; maxCount: number; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="space-y-1"
    >
      <div className="flex justify-between text-sm">
        <span>{category}</span>
        <span className="font-mono text-muted-foreground">{count}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(count / maxCount) * 100}%` }}
          transition={{ duration: 0.8, delay: delay + 0.2, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

// ─── Platform SVG icons (shared with connect-account-modal) ──────────────

function ChessComIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 50 50" className={className} fill="none">
      <circle cx="25" cy="25" r="24" fill="#769656" />
      <path
        d="M25 10c-2.5 0-4.5 2-4.5 4.5 0 1.2.5 2.3 1.3 3.1-2.1 1.2-3.5 3.5-3.5 6.1 0 1.5.5 2.9 1.3 4.1C16.9 29.5 15 32.5 15 36h20c0-3.5-1.9-6.5-4.6-8.2.8-1.2 1.3-2.6 1.3-4.1 0-2.6-1.4-4.9-3.5-6.1.8-.8 1.3-1.9 1.3-3.1 0-2.5-2-4.5-4.5-4.5z"
        fill="white"
      />
      <rect x="14" y="37" width="22" height="3" rx="1" fill="white" />
    </svg>
  );
}

function LichessIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 50 50" className={className} fill="none">
      <circle cx="25" cy="25" r="24" fill="#312e2b" />
      <path
        d="M31.5 12c-2-1-4.5-.5-5 .5-.5 1 .5 1.5-.5 3-1 1-2 1-2 1l-1-2s-4 3-4.5 7c-.5 4 1.5 6 1 8-.5 2-1.5 3-1.5 3l-2 2v3h18v-3l-3-3c0-2 1-4 1-6s-.5-4-1.5-6c0 0-1-2.5 0-4 .5-1 2-1 2-1l-1.5-2.5z"
        fill="white"
        stroke="white"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="17.5" r="1" fill="#312e2b" />
    </svg>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth title="Sign in to see your profile" description="Your stats and connected accounts live in your account.">
      <ProfilePageContent />
    </RequireAuth>
  );
}

function ProfilePageContent() {
  const { settings, updateSettings } = useSettingsStore();
  const { streak, bestStreak } = useStreakStore();
  const { flashcards } = useFlashcardsStore();
  const { games } = useGamesStore();
  const { totalReviews, getAccuracy, getActivityForRange, backfilled, backfillFromExistingData } = useStatsStore();
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  // Backfill stats from existing data on first load
  useEffect(() => {
    if (!backfilled && flashcards.length > 0) {
      backfillFromExistingData(flashcards, games);
    }
  }, [backfilled, flashcards, games, backfillFromExistingData]);

  // Derived stats from flashcards
  const masteredCount = useMemo(() => flashcards.filter((c) => c.status === "mastered").length, [flashcards]);
  const activeCount = useMemo(() => flashcards.filter((c) => c.status !== "mastered").length, [flashcards]);
  const accuracy = getAccuracy();
  const heatmapData = getActivityForRange(90);

  // Mistake patterns: by type
  const mistakesByType = useMemo(() => {
    const counts: Record<string, number> = { Blunder: 0, Mistake: 0, Inaccuracy: 0 };
    for (const card of flashcards) {
      if (card.mistakeType === "blunder") counts.Blunder++;
      else if (card.mistakeType === "mistake") counts.Mistake++;
      else if (card.mistakeType === "inaccuracy") counts.Inaccuracy++;
    }
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .filter((c) => c.count > 0);
  }, [flashcards]);

  // Mistake patterns: by game phase
  const mistakesByPhase = useMemo(() => {
    const counts: Record<string, number> = { Opening: 0, Middlegame: 0, Endgame: 0 };
    for (const card of flashcards) {
      if (card.moveNumber <= 10) counts.Opening++;
      else if (card.moveNumber <= 30) counts.Middlegame++;
      else counts.Endgame++;
    }
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .filter((c) => c.count > 0);
  }, [flashcards]);

  const allMistakeCategories = useMemo(() => [...mistakesByType, ...mistakesByPhase], [mistakesByType, mistakesByPhase]);
  const maxCategory = allMistakeCategories.length > 0 ? Math.max(...allMistakeCategories.map((c) => c.count)) : 1;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold font-serif">Profile & Stats</h1>
        <p className="text-muted-foreground mt-1">Track your improvement over time</p>
      </motion.div>

      {/* Connected Accounts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Connected Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Chess.com */}
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <ChessComIcon className="h-8 w-8 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Chess.com</p>
                {settings.chessComUsername ? (
                  <p className="text-xs text-muted-foreground truncate">{settings.chessComUsername}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
              {settings.chessComUsername ? (
                <div className="flex items-center gap-1">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <button
                    type="button"
                    onClick={() => setConnectModalOpen(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
                    title="Change username"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ chessComUsername: null, lastChessComSync: null })}
                    className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1"
                    title="Disconnect"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => setConnectModalOpen(true)}
                >
                  Connect
                </Button>
              )}
            </div>

            {/* Lichess */}
            <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <LichessIcon className="h-8 w-8 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Lichess</p>
                {settings.lichessUsername ? (
                  <p className="text-xs text-muted-foreground truncate">{settings.lichessUsername}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not connected</p>
                )}
              </div>
              {settings.lichessUsername ? (
                <div className="flex items-center gap-1">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <button
                    type="button"
                    onClick={() => setConnectModalOpen(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
                    title="Change username"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ lichessUsername: null, lastLichessSync: null })}
                    className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1"
                    title="Disconnect"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => setConnectModalOpen(true)}
                >
                  Connect
                </Button>
              )}
            </div>

            {!settings.chessComUsername && !settings.lichessUsername && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                Connect an account to sync your games automatically.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Connect Account Modal */}
      <ConnectAccountModal
        open={connectModalOpen}
        onOpenChange={setConnectModalOpen}
      />

      {/* Training Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Training Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Fix opponent&apos;s mistakes</p>
                <p className="text-xs text-muted-foreground">
                  Also practice fixing your opponent&apos;s bad moves during review and drills
                </p>
              </div>
              <Switch
                checked={settings.fixOpponentMistakes}
                onCheckedChange={(checked) =>
                  updateSettings({ fixOpponentMistakes: checked })
                }
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { title: "Day Streak", value: streak, icon: Flame, color: "text-destructive" },
          { title: "Best Streak", value: bestStreak, icon: Award, color: "text-chart-4" },
          { title: "Mastered", value: masteredCount, icon: Trophy, color: "text-primary" },
          { title: "Total Reviewed", value: totalReviews, icon: Target, color: "text-chart-2" },
          { title: "Accuracy", value: accuracy, icon: TrendingUp, color: "text-chart-1", suffix: "%" },
        ].map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  <div>
                    <p className="text-2xl font-bold font-mono">
                      <StreakCounter value={stat.value} />
                      {stat.suffix || ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.title}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Streak Heatmap */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flame className="h-4 w-4 text-destructive" />
                Review Activity (90 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HeatmapCalendar data={heatmapData} />
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <span>Less</span>
                <div className="flex gap-0.5">
                  <div className="w-3 h-3 rounded-sm bg-muted/30" />
                  <div className="w-3 h-3 rounded-sm bg-chart-5/40" />
                  <div className="w-3 h-3 rounded-sm bg-chart-4/60" />
                  <div className="w-3 h-3 rounded-sm bg-chart-1/70" />
                  <div className="w-3 h-3 rounded-sm bg-primary" />
                </div>
                <span>More</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Donut Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                Mastered vs Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart mastered={masteredCount} active={activeCount} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Mistake Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-chart-2" />
              Mistake Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allMistakeCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No mistakes tracked yet. Review some games to see patterns here.</p>
            ) : (
              <>
                {mistakesByType.length > 0 && (
                  <div className="space-y-4 mb-6">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">By Type</p>
                    {mistakesByType.map((cat, i) => (
                      <MistakeCategoryBar
                        key={cat.category}
                        category={cat.category}
                        count={cat.count}
                        maxCount={maxCategory}
                        delay={0.8 + i * 0.1}
                      />
                    ))}
                  </div>
                )}
                {mistakesByPhase.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">By Game Phase</p>
                    {mistakesByPhase.map((cat, i) => (
                      <MistakeCategoryBar
                        key={cat.category}
                        category={cat.category}
                        count={cat.count}
                        maxCount={maxCategory}
                        delay={0.8 + (mistakesByType.length + i) * 0.1}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
