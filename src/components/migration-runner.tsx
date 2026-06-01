"use client";

import { useMigration } from "@/hooks/use-migration";

/**
 * Mount-once side-effect component. Place inside `<ClerkProvider>` so the
 * Clerk session is available, then it auto-runs the localStorage → Supabase
 * migration on the user's first signed-in load.
 */
export function MigrationRunner() {
  useMigration();
  return null;
}
