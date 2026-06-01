"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import type { Game } from "@/lib/mock-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDataRevision } from "@/lib/supabase/data-revision";
import {
  deleteGame,
  listGames,
  updateGame as updateGameRepo,
  upsertGame,
} from "@/lib/repositories/games";

export function useGamesStore() {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const revision = useDataRevision();

  const [games, setGames] = useState<Game[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setGames([]);
      setHydrated(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const list = await listGames(client);
        if (!cancelled) {
          setGames(list);
          setHydrated(true);
        }
      } catch (err) {
        console.error("[useGamesStore] failed to load games", err);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId, revision]);

  const addGame = useCallback(
    (game: Game) => {
      if (!userId) return;
      setGames((prev) => [game, ...prev.filter((g) => g.id !== game.id)]);
      (async () => {
        try {
          await upsertGame(getSupabaseBrowserClient(), game, userId);
        } catch (err) {
          console.error("[useGamesStore] addGame failed", err);
        }
      })();
    },
    [userId]
  );

  const removeGame = useCallback(
    (gameId: string) => {
      if (!userId) return;
      setGames((prev) => prev.filter((g) => g.id !== gameId));
      (async () => {
        try {
          await deleteGame(getSupabaseBrowserClient(), gameId);
        } catch (err) {
          console.error("[useGamesStore] removeGame failed", err);
        }
      })();
    },
    [userId]
  );

  const updateGame = useCallback(
    (gameId: string, updates: Partial<Game>) => {
      if (!userId) return;
      setGames((prev) =>
        prev.map((g) => (g.id === gameId ? { ...g, ...updates } : g))
      );
      (async () => {
        try {
          await updateGameRepo(getSupabaseBrowserClient(), gameId, updates);
        } catch (err) {
          console.error("[useGamesStore] updateGame failed", err);
        }
      })();
    },
    [userId]
  );

  const getGame = useCallback(
    (gameId: string) => games.find((g) => g.id === gameId) ?? null,
    [games]
  );

  return { games, hydrated, addGame, removeGame, updateGame, getGame };
}
