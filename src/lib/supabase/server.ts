import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-side Supabase client for use inside Next.js route handlers and
 * server components. Forwards the Clerk JWT from the incoming request so
 * RLS policies see the same `auth.jwt() ->> 'sub'` as the browser.
 *
 * Returns `null` when the request is unauthenticated.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const { getToken } = await auth();

  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    accessToken: async () => (await getToken()) ?? null,
  });
}

/**
 * Convenience: returns the current Clerk user id (sub claim) for the
 * incoming server request, or null when unauthenticated.
 */
export async function getServerClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}
