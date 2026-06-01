"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type ClerkSession = {
  getToken: () => Promise<string | null>;
};

type WindowWithClerk = Window & {
  Clerk?: {
    session?: ClerkSession | null;
  };
};

let cached: SupabaseClient<Database> | null = null;

/**
 * Browser-side Supabase client. Pulls the Clerk session token on every request
 * so RLS policies (`auth.jwt() ->> 'sub'`) see the current Clerk user id.
 *
 * Uses a module-level singleton to avoid duplicate WebSocket connections in dev.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  cached = createBrowserClient<Database>(url, publishableKey, {
    accessToken: async () => {
      if (typeof window === "undefined") return null;
      const session = (window as WindowWithClerk).Clerk?.session;
      if (!session) return null;
      try {
        return (await session.getToken()) ?? null;
      } catch {
        return null;
      }
    },
  });

  return cached;
}
