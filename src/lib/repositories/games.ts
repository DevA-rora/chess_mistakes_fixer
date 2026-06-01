import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "@/lib/supabase/types";
import type { Game } from "@/lib/mock-data";
import { gameToRow, rowToGame } from "./mappers";

type GameUpdate = TablesUpdate<"games">;

export async function listGames(
  client: SupabaseClient<Database>
): Promise<Game[]> {
  const { data, error } = await client
    .from("games")
    .select("*")
    .order("played_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToGame);
}

export async function getGame(
  client: SupabaseClient<Database>,
  gameId: string
): Promise<Game | null> {
  const { data, error } = await client
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToGame(data) : null;
}

export async function upsertGame(
  client: SupabaseClient<Database>,
  game: Game,
  clerkUserId: string
): Promise<void> {
  const row = gameToRow(game, clerkUserId);
  const { error } = await client.from("games").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertGames(
  client: SupabaseClient<Database>,
  games: Game[],
  clerkUserId: string
): Promise<void> {
  if (games.length === 0) return;
  const rows = games.map((g) => gameToRow(g, clerkUserId));
  const { error } = await client.from("games").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function updateGame(
  client: SupabaseClient<Database>,
  gameId: string,
  updates: Partial<Game>
): Promise<void> {
  const patch: GameUpdate = {};
  if (updates.opponent !== undefined) patch.opponent = updates.opponent;
  if (updates.opponentRating !== undefined) patch.opponent_rating = updates.opponentRating;
  if (updates.playerRating !== undefined) patch.player_rating = updates.playerRating;
  if (updates.playerColor !== undefined) patch.player_color = updates.playerColor;
  if (updates.date !== undefined) patch.played_at = updates.date;
  if (updates.timeControl !== undefined) patch.time_control = updates.timeControl;
  if (updates.playerTimeLeft !== undefined) patch.player_time_left = updates.playerTimeLeft;
  if (updates.opponentTimeLeft !== undefined) patch.opponent_time_left = updates.opponentTimeLeft;
  if (updates.result !== undefined) patch.result = updates.result;
  if (updates.blunders !== undefined) patch.blunders = updates.blunders;
  if (updates.mistakes !== undefined) patch.mistakes = updates.mistakes;
  if (updates.inaccuracies !== undefined) patch.inaccuracies = updates.inaccuracies;
  if (updates.mistakesFixed !== undefined) patch.mistakes_fixed = updates.mistakesFixed;
  if (updates.totalMistakes !== undefined) patch.total_mistakes = updates.totalMistakes;
  if (updates.pgn !== undefined) patch.pgn = updates.pgn;
  if (updates.reviewStatus !== undefined) patch.review_status = updates.reviewStatus;

  if (Object.keys(patch).length === 0) return;

  const { error } = await client.from("games").update(patch).eq("id", gameId);
  if (error) throw error;
}

export async function deleteGame(
  client: SupabaseClient<Database>,
  gameId: string
): Promise<void> {
  const { error } = await client.from("games").delete().eq("id", gameId);
  if (error) throw error;
}
