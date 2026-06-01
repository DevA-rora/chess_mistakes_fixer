import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface ProfileInput {
  email?: string | null;
  displayName?: string | null;
}

/**
 * Ensure a `profiles` row exists for the current Clerk user.
 * Called on first sign-in to seed the profile table.
 */
export async function ensureProfile(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  input: ProfileInput = {}
): Promise<void> {
  const { error } = await client.from("profiles").upsert(
    {
      clerk_user_id: clerkUserId,
      email: input.email ?? null,
      display_name: input.displayName ?? null,
    },
    { onConflict: "clerk_user_id", ignoreDuplicates: false }
  );
  if (error) throw error;
}
