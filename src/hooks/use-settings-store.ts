"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDataRevision } from "@/lib/supabase/data-revision";
import {
  listConnectedAccounts,
  upsertConnectedAccount,
  type AccountProvider,
} from "@/lib/repositories/accounts";
import { getSettings, saveSettings } from "@/lib/repositories/settings";

interface Settings {
  fixOpponentMistakes: boolean;
  chessComUsername: string | null;
  lichessUsername: string | null;
  lastChessComSync: number | null;
  lastLichessSync: number | null;
}

const DEFAULT_SETTINGS: Settings = {
  fixOpponentMistakes: false,
  chessComUsername: null,
  lichessUsername: null,
  lastChessComSync: null,
  lastLichessSync: null,
};

function timestampOrNull(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function isoOrNull(timestamp: number | null | undefined): string | null {
  if (timestamp == null) return null;
  return new Date(timestamp).toISOString();
}

export function useSettingsStore() {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const revision = useDataRevision();

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setSettings(DEFAULT_SETTINGS);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const [base, accounts] = await Promise.all([
          getSettings(client, userId),
          listConnectedAccounts(client),
        ]);
        if (cancelled) return;

        const chesscom = accounts.find((a) => a.provider === "chesscom");
        const lichess = accounts.find((a) => a.provider === "lichess");

        setSettings({
          fixOpponentMistakes: base.fixOpponentMistakes,
          chessComUsername: chesscom?.username ?? null,
          lichessUsername: lichess?.username ?? null,
          lastChessComSync: timestampOrNull(chesscom?.lastSyncAt ?? null),
          lastLichessSync: timestampOrNull(lichess?.lastSyncAt ?? null),
        });
      } catch (err) {
        console.error("[useSettingsStore] failed to load settings", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId, revision]);

  const updateSettings = useCallback(
    (updates: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));

      if (!userId) return;
      const client = getSupabaseBrowserClient();

      const accountWrites: Array<Promise<unknown>> = [];

      const updateAccount = (
        provider: AccountProvider,
        username: string | null | undefined,
        lastSync: number | null | undefined
      ) => {
        if (username === undefined && lastSync === undefined) return;
        const currentUsername =
          provider === "chesscom" ? settings.chessComUsername : settings.lichessUsername;
        const currentLastSync =
          provider === "chesscom" ? settings.lastChessComSync : settings.lastLichessSync;

        const nextUsername = username ?? currentUsername;
        if (!nextUsername) return;
        const nextSync = lastSync === undefined ? currentLastSync : lastSync;

        accountWrites.push(
          upsertConnectedAccount(client, userId, {
            provider,
            username: nextUsername,
            lastSyncAt: isoOrNull(nextSync),
          })
        );
      };

      updateAccount("chesscom", updates.chessComUsername, updates.lastChessComSync);
      updateAccount("lichess", updates.lichessUsername, updates.lastLichessSync);

      if (updates.fixOpponentMistakes !== undefined) {
        accountWrites.push(
          saveSettings(client, userId, {
            fixOpponentMistakes: updates.fixOpponentMistakes,
          })
        );
      }

      Promise.all(accountWrites).catch((err) =>
        console.error("[useSettingsStore] updateSettings failed", err)
      );
    },
    [userId, settings.chessComUsername, settings.lichessUsername, settings.lastChessComSync, settings.lastLichessSync]
  );

  return { settings, updateSettings };
}
