import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { GameAnalysis } from "@/lib/mock-data";
import { analysisToRow, rowToAnalysis } from "./mappers";

/**
 * Returns the latest analysis (highest depth, most recently analyzed)
 * for the given game id, or null if none exists.
 */
export async function getLatestAnalysis(
  client: SupabaseClient<Database>,
  gameId: string
): Promise<GameAnalysis | null> {
  const { data, error } = await client
    .from("game_analyses")
    .select("*")
    .eq("game_id", gameId)
    .order("depth", { ascending: false })
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToAnalysis(data) : null;
}

export async function listAnalyzedGameIds(
  client: SupabaseClient<Database>
): Promise<string[]> {
  const { data, error } = await client
    .from("game_analyses")
    .select("game_id");

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.game_id)));
}

/**
 * Saves an analysis. If an analysis at the same depth already exists, replaces it.
 */
export async function saveAnalysis(
  client: SupabaseClient<Database>,
  analysis: GameAnalysis,
  clerkUserId: string
): Promise<void> {
  const row = analysisToRow(analysis, clerkUserId);
  const { error } = await client
    .from("game_analyses")
    .upsert(row, { onConflict: "game_id,depth" });
  if (error) throw error;
}

export async function deleteAnalysesForGame(
  client: SupabaseClient<Database>,
  gameId: string
): Promise<void> {
  const { error } = await client
    .from("game_analyses")
    .delete()
    .eq("game_id", gameId);
  if (error) throw error;
}
