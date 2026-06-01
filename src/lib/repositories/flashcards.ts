import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "@/lib/supabase/types";
import type { Flashcard } from "@/lib/mock-data";
import type { CardOperation } from "@/lib/card-manager";
import { flashcardToRow, rowToFlashcard } from "./mappers";

type FlashcardUpdate = TablesUpdate<"flashcards">;

export async function listFlashcards(
  client: SupabaseClient<Database>
): Promise<Flashcard[]> {
  const { data, error } = await client
    .from("flashcards")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToFlashcard);
}

export async function upsertFlashcard(
  client: SupabaseClient<Database>,
  card: Flashcard,
  clerkUserId: string
): Promise<void> {
  const row = flashcardToRow(card, clerkUserId);
  const { error } = await client.from("flashcards").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertFlashcards(
  client: SupabaseClient<Database>,
  cards: Flashcard[],
  clerkUserId: string
): Promise<void> {
  if (cards.length === 0) return;
  const rows = cards.map((c) => flashcardToRow(c, clerkUserId));
  const { error } = await client.from("flashcards").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function updateFlashcard(
  client: SupabaseClient<Database>,
  cardId: string,
  updates: Partial<Flashcard>
): Promise<void> {
  const patch: FlashcardUpdate = {};
  if (updates.opponent !== undefined) patch.opponent = updates.opponent;
  if (updates.moveNumber !== undefined) patch.move_number = updates.moveNumber;
  if (updates.timeRemaining !== undefined) patch.time_remaining = updates.timeRemaining;
  if (updates.fen !== undefined) patch.fen = updates.fen;
  if (updates.yourMove !== undefined) patch.your_move = updates.yourMove;
  if (updates.bestMove !== undefined) patch.best_move = updates.bestMove;
  if (updates.evaluation !== undefined) patch.evaluation = updates.evaluation;
  if (updates.mistakeType !== undefined) patch.mistake_type = updates.mistakeType;
  if (updates.explanation !== undefined) patch.explanation = updates.explanation;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.nextReview !== undefined) patch.next_review = updates.nextReview;
  if (updates.interval !== undefined) patch.interval = updates.interval;
  if (updates.easeFactor !== undefined) patch.ease_factor = updates.easeFactor;

  if (Object.keys(patch).length === 0) return;

  const { error } = await client
    .from("flashcards")
    .update(patch)
    .eq("id", cardId);
  if (error) throw error;
}

export async function deleteFlashcard(
  client: SupabaseClient<Database>,
  cardId: string
): Promise<void> {
  const { error } = await client.from("flashcards").delete().eq("id", cardId);
  if (error) throw error;
}

export async function deleteFlashcardsForGame(
  client: SupabaseClient<Database>,
  gameId: string
): Promise<void> {
  const { error } = await client.from("flashcards").delete().eq("game_id", gameId);
  if (error) throw error;
}

export async function applyFlashcardOperations(
  client: SupabaseClient<Database>,
  operations: CardOperation[],
  clerkUserId: string
): Promise<void> {
  const upserts: Flashcard[] = [];
  const deletes: string[] = [];

  for (const op of operations) {
    if (op.type === "create") {
      upserts.push(op.card);
    } else if (op.type === "delete") {
      deletes.push(op.id);
    } else if (op.type === "update") {
      await updateFlashcard(client, op.id, op.updates);
    }
  }

  if (upserts.length > 0) {
    await upsertFlashcards(client, upserts, clerkUserId);
  }

  if (deletes.length > 0) {
    const { error } = await client
      .from("flashcards")
      .delete()
      .in("id", deletes);
    if (error) throw error;
  }
}
