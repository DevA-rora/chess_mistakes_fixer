import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type AccountProvider = "chesscom" | "lichess";

export interface ConnectedAccount {
  provider: AccountProvider;
  username: string;
  lastSyncAt: string | null;
}

export async function listConnectedAccounts(
  client: SupabaseClient<Database>
): Promise<ConnectedAccount[]> {
  const { data, error } = await client
    .from("connected_accounts")
    .select("provider, username, last_sync_at");

  if (error) throw error;
  return (data ?? []).map((row) => ({
    provider: row.provider as AccountProvider,
    username: row.username,
    lastSyncAt: row.last_sync_at,
  }));
}

export async function upsertConnectedAccount(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  account: ConnectedAccount
): Promise<void> {
  const { error } = await client.from("connected_accounts").upsert(
    {
      clerk_user_id: clerkUserId,
      provider: account.provider,
      username: account.username,
      last_sync_at: account.lastSyncAt,
    },
    { onConflict: "clerk_user_id,provider" }
  );
  if (error) throw error;
}

export async function deleteConnectedAccount(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  provider: AccountProvider
): Promise<void> {
  const { error } = await client
    .from("connected_accounts")
    .delete()
    .eq("clerk_user_id", clerkUserId)
    .eq("provider", provider);
  if (error) throw error;
}
