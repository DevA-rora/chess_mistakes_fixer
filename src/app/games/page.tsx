"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search, Download, RefreshCw, Trophy, XCircle, Minus, CheckCircle2, Clock, CircleDashed, Brain, Loader2 } from "lucide-react";
import { type ReviewStatus, type Game } from "@/lib/mock-data";
import { ImportGameModal } from "@/components/import-game-modal";
import { ConnectAccountModal } from "@/components/connect-account-modal";
import { useGamesStore } from "@/hooks/use-games-store";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { getAnalyzedGameIds } from "@/lib/analysis-cache";

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

export default function GamesPage() {
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const { games, addGame } = useGamesStore();
  const { settings, updateSettings } = useSettingsStore();
  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set());
  const openImportModal = () => setImportOpen(true);

  const hasAnyAccount = !!settings.chessComUsername || !!settings.lichessUsername;

  useEffect(() => {
    setAnalyzedIds(new Set(getAnalyzedGameIds()));
  }, []);

  const syncGames = useCallback(async () => {
    if (!settings.chessComUsername && !settings.lichessUsername) return;

    setSyncing(true);
    setSyncMessage("");

    const existingIds = new Set(games.map((g) => g.id));
    let totalNew = 0;
    const parts: string[] = [];

    try {
      // Fetch from both platforms in parallel
      const promises: Promise<{ games: Game[]; platform: string } | null>[] = [];

      if (settings.chessComUsername) {
        promises.push(
          fetch("/api/sync/chesscom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: settings.chessComUsername }),
          })
            .then(async (res) => {
              if (!res.ok) return null;
              const data = await res.json();
              return { games: data.games as Game[], platform: "Chess.com" };
            })
            .catch(() => null)
        );
      }

      if (settings.lichessUsername) {
        promises.push(
          fetch("/api/sync/lichess", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: settings.lichessUsername }),
          })
            .then(async (res) => {
              if (!res.ok) return null;
              const data = await res.json();
              return { games: data.games as Game[], platform: "Lichess" };
            })
            .catch(() => null)
        );
      }

      const results = await Promise.all(promises);

      for (const result of results) {
        if (!result) continue;
        const newGames = result.games.filter((g) => !existingIds.has(g.id));
        // Add in reverse so newest end up first (addGame prepends)
        for (let i = newGames.length - 1; i >= 0; i--) {
          addGame(newGames[i]);
          existingIds.add(newGames[i].id);
        }
        if (newGames.length > 0) {
          parts.push(`${newGames.length} from ${result.platform}`);
        }
        totalNew += newGames.length;
      }

      // Update last sync timestamps
      if (settings.chessComUsername) {
        updateSettings({ lastChessComSync: Date.now() });
      }
      if (settings.lichessUsername) {
        updateSettings({ lastLichessSync: Date.now() });
      }

      if (totalNew === 0) {
        setSyncMessage("All games already up to date!");
      } else {
        setSyncMessage(`Synced ${parts.join(", ")}`);
      }
    } catch {
      setSyncMessage("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
      // Clear message after a few seconds
      setTimeout(() => setSyncMessage(""), 5000);
    }
  }, [games, settings.chessComUsername, settings.lichessUsername, addGame, updateSettings]);

  function handleSyncClick() {
    if (!hasAnyAccount) {
      setConnectOpen(true);
    } else {
      syncGames();
    }
  }

  const filtered = games.filter((g) =>
    g.opponent.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold font-serif">Games</h1>
          <p className="text-muted-foreground mt-1">
            Review and import your Chess.com games
          </p>
        </div>
        <Button
          type="button"
          className="cursor-pointer"
          onClick={openImportModal}
          onTouchEnd={openImportModal}
        >
          <Download className="mr-2 h-4 w-4" />
          Import new game
        </Button>
        <ImportGameModal
          open={importOpen}
          onOpenChange={setImportOpen}
          onImport={addGame}
        />
        <ConnectAccountModal
          open={connectOpen}
          onOpenChange={setConnectOpen}
          onConnected={() => {
            // Auto-sync after first account connection
            setConnectOpen(false);
            setTimeout(() => syncGames(), 300);
          }}
        />
      </motion.div>

      {/* Search + Sync */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search games by opponent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button className="cursor-pointer" variant="outline" onClick={handleSyncClick} disabled={syncing}>
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {syncing ? "Syncing..." : "Sync games"}
        </Button>
      </motion.div>

      {/* Sync status message */}
      {syncMessage && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-muted-foreground"
        >
          {syncMessage}
        </motion.p>
      )}

      {/* Game List */}
      <div className="space-y-3">
        {filtered.map((game, i) => (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
          >
            <Link href={`/review?game=${game.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Result icon */}
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          game.result === "win"
                            ? "bg-primary/15 text-primary"
                            : game.result === "loss"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {game.result === "win" ? (
                          <Trophy className="h-5 w-5" />
                        ) : game.result === "loss" ? (
                          <XCircle className="h-5 w-5" />
                        ) : (
                          <Minus className="h-5 w-5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">vs. {game.opponent}</span>
                          <span className="text-xs text-muted-foreground">
                            ({game.opponentRating})
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {game.timeControl} ·{" "}
                          {new Date(game.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Review status badge + progress */}
                    <div className="flex items-center gap-4">
                      {analyzedIds.has(game.id) && (
                        <Badge variant="outline" className="text-xs gap-1.5 bg-chart-2/15 text-chart-2 border-chart-2/25">
                          <Brain className="h-3 w-3" />
                          Analyzed
                        </Badge>
                      )}
                      <ReviewStatusBadge status={game.reviewStatus} />
                      <div className="text-right min-w-[100px]">
                        <Progress
                          value={game.totalMistakes === 0 ? 0 : (game.mistakesFixed / game.totalMistakes) * 100}
                          className="h-2 mb-1"
                        />
                        <p className="text-xs text-muted-foreground">
                          {game.mistakesFixed}/{game.totalMistakes} fixed
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No games found for &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  );
}
