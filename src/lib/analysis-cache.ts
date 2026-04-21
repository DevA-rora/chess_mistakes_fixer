import type { GameAnalysis } from "./mock-data";

const CACHE_KEY_PREFIX = "chess-analysis-";

/**
 * Get cached analysis for a game from localStorage.
 */
export function getCachedAnalysis(gameId: string): GameAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + gameId);
    if (!raw) return null;
    return JSON.parse(raw) as GameAnalysis;
  } catch {
    return null;
  }
}

/**
 * Save analysis to localStorage.
 */
export function saveCachedAnalysis(analysis: GameAnalysis): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_KEY_PREFIX + analysis.gameId,
      JSON.stringify(analysis)
    );
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/**
 * Check if a game has been analyzed.
 */
export function hasAnalysis(gameId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CACHE_KEY_PREFIX + gameId) !== null;
}

/**
 * Remove cached analysis for a game from localStorage.
 */
export function clearCachedAnalysis(gameId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_KEY_PREFIX + gameId);
}

/**
 * Get all cached game IDs.
 */
export function getAnalyzedGameIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_KEY_PREFIX)) {
      ids.push(key.slice(CACHE_KEY_PREFIX.length));
    }
  }
  return ids;
}
