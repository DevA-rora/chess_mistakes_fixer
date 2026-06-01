"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Flashcard, Game, GameAnalysis } from "@/lib/mock-data";
import type { Database } from "@/lib/supabase/types";
import { ensureProfile } from "@/lib/repositories/profile";
import { upsertGames } from "@/lib/repositories/games";
import { upsertFlashcards } from "@/lib/repositories/flashcards";
import { saveAnalysis } from "@/lib/repositories/analyses";
import { saveSettings } from "@/lib/repositories/settings";
import {
  upsertConnectedAccount,
  type AccountProvider,
} from "@/lib/repositories/accounts";
import { saveStreak, type StreakSnapshot } from "@/lib/repositories/streak";
import {
  bulkUpsertDailyActivity,
} from "@/lib/repositories/stats";
import type { DailyActivity } from "@/hooks/use-stats-store";

export const MIGRATION_FLAG_KEY = "chess-fixer-migrated-v1";

const LEGACY_KEYS = {
  games: "chess-fixer-games",
  flashcards: "chess-fixer-flashcards",
  stats: "chess-fixer-stats",
  streak: "chess-fixer-streak",
  settings: "chess-fixer-settings",
  analysisPrefix: "chess-analysis-",
} as const;

interface LegacySettings {
  fixOpponentMistakes?: boolean;
  chessComUsername?: string | null;
  lichessUsername?: string | null;
  lastChessComSync?: number | null;
  lastLichessSync?: number | null;
}

interface LegacyStatsData {
  dailyActivity?: Record<string, DailyActivity>;
}

interface LegacyStreakData {
  currentStreak?: number;
  bestStreak?: number;
  lastActiveDate?: string | null;
  todayDrillCount?: number;
  todayDrillDate?: string | null;
  todayReviewedGame?: boolean;
  todayReviewDate?: string | null;
}

export interface MigrationResult {
  migrated: boolean;
  counts: {
    games: number;
    flashcards: number;
    analyses: number;
    dailyActivityDays: number;
    connectedAccounts: number;
  };
}

class MigrationStepError extends Error {
  readonly stage: string;
  readonly cause: unknown;
  constructor(stage: string, cause: unknown) {
    const causeMessage =
      cause && typeof cause === "object" && "message" in cause
        ? String((cause as { message?: unknown }).message ?? cause)
        : String(cause);
    super(`[migration:${stage}] ${causeMessage}`);
    this.name = "MigrationStepError";
    this.stage = stage;
    this.cause = cause;
  }
}

async function runStep<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new MigrationStepError(stage, err);
  }
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function listAnalysisKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_KEYS.analysisPrefix)) keys.push(key);
  }
  return keys;
}

function isoFromMs(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/**
 * One-time uploader: copies every relevant localStorage namespace to
 * Supabase for the currently authenticated user. Idempotent at the row
 * level (all writes use upsert), so re-running on partial failure is
 * safe and will only fill the gaps.
 *
 * Returns the result without touching the migration flag; the caller
 * is responsible for setting it and clearing localStorage on success.
 */
export async function migrateFromLocalStorage(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  profile: { email?: string | null; displayName?: string | null } = {}
): Promise<MigrationResult> {
  if (typeof window === "undefined") {
    return {
      migrated: false,
      counts: { games: 0, flashcards: 0, analyses: 0, dailyActivityDays: 0, connectedAccounts: 0 },
    };
  }

  await runStep("ensureProfile", () =>
    ensureProfile(client, clerkUserId, profile)
  );

  const legacyGames = readJson<Game[]>(LEGACY_KEYS.games) ?? [];
  const legacyCards = readJson<Flashcard[]>(LEGACY_KEYS.flashcards) ?? [];
  const legacyStats = readJson<LegacyStatsData>(LEGACY_KEYS.stats) ?? {};
  const legacyStreak = readJson<LegacyStreakData>(LEGACY_KEYS.streak) ?? {};
  const legacySettings = readJson<LegacySettings>(LEGACY_KEYS.settings) ?? {};
  const analysisKeys = listAnalysisKeys();

  // 1. settings (no FK dependencies)
  if (legacySettings.fixOpponentMistakes !== undefined) {
    await runStep("saveSettings", () =>
      saveSettings(client, clerkUserId, {
        fixOpponentMistakes: legacySettings.fixOpponentMistakes,
      })
    );
  }

  // 2. connected accounts
  let accountCount = 0;
  const accountUpserts: Array<[AccountProvider, string, number | null | undefined]> = [];
  if (legacySettings.chessComUsername) {
    accountUpserts.push([
      "chesscom",
      legacySettings.chessComUsername,
      legacySettings.lastChessComSync,
    ]);
  }
  if (legacySettings.lichessUsername) {
    accountUpserts.push([
      "lichess",
      legacySettings.lichessUsername,
      legacySettings.lastLichessSync,
    ]);
  }
  for (const [provider, username, lastSyncMs] of accountUpserts) {
    await runStep(`upsertConnectedAccount:${provider}`, () =>
      upsertConnectedAccount(client, clerkUserId, {
        provider,
        username,
        lastSyncAt: isoFromMs(lastSyncMs),
      })
    );
    accountCount += 1;
  }

  // 3. games (parent rows for flashcards / analyses)
  if (legacyGames.length > 0) {
    await runStep("upsertGames", () =>
      upsertGames(client, legacyGames, clerkUserId)
    );
  }

  // 4. analyses (only for games we actually have rows for)
  const gameIdSet = new Set(legacyGames.map((g) => g.id));
  let analysisCount = 0;
  for (const key of analysisKeys) {
    const gameId = key.slice(LEGACY_KEYS.analysisPrefix.length);
    if (!gameIdSet.has(gameId)) continue;
    const analysis = readJson<GameAnalysis>(key);
    if (!analysis) continue;
    try {
      await saveAnalysis(client, analysis, clerkUserId);
      analysisCount += 1;
    } catch (err) {
      console.error(`[migration] failed to upload analysis for ${gameId}`, err);
    }
  }

  // 5. flashcards (FK → games)
  const orphanFreeCards = legacyCards.filter((c) => gameIdSet.has(c.gameId));
  if (orphanFreeCards.length > 0) {
    await runStep("upsertFlashcards", () =>
      upsertFlashcards(client, orphanFreeCards, clerkUserId)
    );
  }

  // 6. daily activity rollup
  const dailyEntries = legacyStats.dailyActivity ?? {};
  if (Object.keys(dailyEntries).length > 0) {
    await runStep("bulkUpsertDailyActivity", () =>
      bulkUpsertDailyActivity(client, clerkUserId, dailyEntries)
    );
  }

  // 7. streak
  if (legacyStreak.lastActiveDate || legacyStreak.bestStreak) {
    const snapshot: StreakSnapshot = {
      currentStreak: legacyStreak.currentStreak ?? 0,
      bestStreak: legacyStreak.bestStreak ?? 0,
      lastActiveDate: legacyStreak.lastActiveDate ?? null,
      todayDrillCount: legacyStreak.todayDrillCount ?? 0,
      todayDrillDate: legacyStreak.todayDrillDate ?? null,
      todayReviewedGame: legacyStreak.todayReviewedGame ?? false,
      todayReviewDate: legacyStreak.todayReviewDate ?? null,
    };
    await runStep("saveStreak", () =>
      saveStreak(client, clerkUserId, snapshot)
    );
  }

  return {
    migrated: true,
    counts: {
      games: legacyGames.length,
      flashcards: orphanFreeCards.length,
      analyses: analysisCount,
      dailyActivityDays: Object.keys(dailyEntries).length,
      connectedAccounts: accountCount,
    },
  };
}

/**
 * Removes every legacy localStorage namespace migrated above.
 * Call only after `migrateFromLocalStorage` has completed successfully.
 */
export function clearLegacyLocalStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_KEYS.games);
  localStorage.removeItem(LEGACY_KEYS.flashcards);
  localStorage.removeItem(LEGACY_KEYS.stats);
  localStorage.removeItem(LEGACY_KEYS.streak);
  localStorage.removeItem(LEGACY_KEYS.settings);

  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_KEYS.analysisPrefix)) keysToDelete.push(key);
  }
  for (const key of keysToDelete) localStorage.removeItem(key);
}
