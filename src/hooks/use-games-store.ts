"use client";

import { useState, useEffect, useCallback } from "react";
import type { Game } from "@/lib/mock-data";

const STORAGE_KEY = "chess-fixer-games";

function loadGames(): Game[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Game[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // corrupted
  }
  return [];
}

export function useGamesStore() {
  const [games, setGames] = useState<Game[]>([]); // SSR-safe default
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setGames(loadGames());
    setHydrated(true);
  }, []);

  // Persist whenever games change (skip the SSR default)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    } catch {
      // storage full — silently fail
    }
  }, [games, hydrated]);

  const addGame = useCallback((game: Game) => {
    setGames((prev) => [game, ...prev]);
  }, []);

  const removeGame = useCallback((gameId: string) => {
    setGames((prev) => prev.filter((g) => g.id !== gameId));
  }, []);

  const updateGame = useCallback((gameId: string, updates: Partial<Game>) => {
    setGames((prev) =>
      prev.map((g) => (g.id === gameId ? { ...g, ...updates } : g))
    );
  }, []);

  const getGame = useCallback(
    (gameId: string) => games.find((g) => g.id === gameId) ?? null,
    [games]
  );

  return { games, hydrated, addGame, removeGame, updateGame, getGame };
}
