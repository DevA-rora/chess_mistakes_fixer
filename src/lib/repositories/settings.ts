import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

export interface UserSettings {
  fixOpponentMistakes: boolean;
  preferences: Record<string, Json>;
}

const DEFAULT_SETTINGS: UserSettings = {
  fixOpponentMistakes: false,
  preferences: {},
};

export async function getSettings(
  client: SupabaseClient<Database>,
  clerkUserId: string
): Promise<UserSettings> {
  const { data, error } = await client
    .from("user_settings")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...DEFAULT_SETTINGS };

  return {
    fixOpponentMistakes: data.fix_opponent_mistakes,
    preferences: (data.preferences as Record<string, Json>) ?? {},
  };
}

export async function saveSettings(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  updates: Partial<UserSettings>
): Promise<void> {
  const current = await getSettings(client, clerkUserId);
  const merged: UserSettings = {
    fixOpponentMistakes: updates.fixOpponentMistakes ?? current.fixOpponentMistakes,
    preferences: { ...current.preferences, ...(updates.preferences ?? {}) },
  };

  const { error } = await client.from("user_settings").upsert(
    {
      clerk_user_id: clerkUserId,
      fix_opponent_mistakes: merged.fixOpponentMistakes,
      preferences: merged.preferences as unknown as Json,
    },
    { onConflict: "clerk_user_id" }
  );
  if (error) throw error;
}
