"use client";

import type { GameAnalysis } from "./mock-data";
import { getSupabaseBrowserClient } from "./supabase/client";
import {
  deleteAnalysesForGame,
  getLatestAnalysis,
  listAnalyzedGameIds,
  saveAnalysis,
} from "./repositories/analyses";

/**
 * Backed by the `game_analyses` Supabase table since the localStorage
 * cache was retired. Keeps the synchronous-looking name on each function
 * but every call is async — call sites must `await` (or `.then`).
 */

async function getClerkUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    Clerk?: { user?: { id?: string | null } | null };
  };
  return w.Clerk?.user?.id ?? null;
}

export async function getCachedAnalysis(
  gameId: string
): Promise<GameAnalysis | null> {
  if (typeof window === "undefined") return null;
  try {
    const client = getSupabaseBrowserClient();
    return await getLatestAnalysis(client, gameId);
  } catch (err) {
    console.error("[analysis-cache] getCachedAnalysis failed", err);
    return null;
  }
}

export async function saveCachedAnalysis(analysis: GameAnalysis): Promise<void> {
  if (typeof window === "undefined") return;
  const userId = await getClerkUserId();
  if (!userId) return;
  try {
    const client = getSupabaseBrowserClient();
    await saveAnalysis(client, analysis, userId);
  } catch (err) {
    console.error("[analysis-cache] saveCachedAnalysis failed", err);
  }
}

export async function hasAnalysis(gameId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const cached = await getCachedAnalysis(gameId);
  return cached !== null;
}

export async function clearCachedAnalysis(gameId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const client = getSupabaseBrowserClient();
    await deleteAnalysesForGame(client, gameId);
  } catch (err) {
    console.error("[analysis-cache] clearCachedAnalysis failed", err);
  }
}

export async function getAnalyzedGameIds(): Promise<string[]> {
  if (typeof window === "undefined") return [];
  try {
    const client = getSupabaseBrowserClient();
    return await listAnalyzedGameIds(client);
  } catch (err) {
    console.error("[analysis-cache] getAnalyzedGameIds failed", err);
    return [];
  }
}
