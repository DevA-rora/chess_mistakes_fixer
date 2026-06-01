import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ReviewMessage } from "@/lib/mock-data";

export interface PersistedCoachMessage extends ReviewMessage {
  id: string;
  createdAt: string;
  moveNumber: number | null;
}

export async function listCoachMessages(
  client: SupabaseClient<Database>,
  gameId: string
): Promise<PersistedCoachMessage[]> {
  const { data, error } = await client
    .from("coach_messages")
    .select("id, role, content, move_number, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as ReviewMessage["role"],
    content: row.content,
    moveNumber: row.move_number,
    createdAt: row.created_at,
  }));
}

export async function appendCoachMessage(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  gameId: string,
  message: ReviewMessage,
  moveNumber?: number
): Promise<void> {
  const { error } = await client.from("coach_messages").insert({
    clerk_user_id: clerkUserId,
    game_id: gameId,
    move_number: moveNumber ?? null,
    role: message.role,
    content: message.content,
  });
  if (error) throw error;
}
