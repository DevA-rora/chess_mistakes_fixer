"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { bumpDataRevision } from "@/lib/supabase/data-revision";
import {
  clearLegacyLocalStorage,
  migrateFromLocalStorage,
  MIGRATION_FLAG_KEY,
} from "@/lib/migration/from-local-storage";

interface PostgrestLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** Render a useful one-liner for both Error and Supabase PostgrestError shapes. */
function describeError(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as PostgrestLike & { name?: string; stack?: string };
    return {
      name: e.name,
      message: e.message ?? String(err),
      code: e.code,
      details: e.details,
      hint: e.hint,
    };
  }
  return { message: String(err) };
}

/**
 * Runs the one-time localStorage → Supabase migration on first signed-in
 * mount. Sets a flag in localStorage to ensure subsequent loads no-op.
 *
 * Mount once near the root (see `MigrationRunner`).
 */
export function useMigration(): void {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    if (ranRef.current) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;

    ranRef.current = true;

    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const result = await migrateFromLocalStorage(client, userId, {
          email: user?.primaryEmailAddress?.emailAddress ?? null,
          displayName: user?.fullName ?? user?.username ?? null,
        });

        if (result.migrated) {
          console.info("[migration] localStorage → Supabase complete", result.counts);
          clearLegacyLocalStorage();
        }

        localStorage.setItem(MIGRATION_FLAG_KEY, new Date().toISOString());
        bumpDataRevision();
      } catch (err) {
        console.error("[migration] failed", describeError(err));
        ranRef.current = false; // allow another attempt on next mount
      }
    })();
  }, [isLoaded, userId, user?.primaryEmailAddress?.emailAddress, user?.fullName, user?.username]);
}
