"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import type { Flashcard } from "@/lib/mock-data";
import { applyCardOperations, type CardOperation } from "@/lib/card-manager";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDataRevision } from "@/lib/supabase/data-revision";
import {
  applyFlashcardOperations as applyFlashcardOperationsRepo,
  deleteFlashcard,
  deleteFlashcardsForGame,
  listFlashcards,
  updateFlashcard as updateFlashcardRepo,
  upsertFlashcard,
  upsertFlashcards,
} from "@/lib/repositories/flashcards";

export function useFlashcardsStore() {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const revision = useDataRevision();

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setFlashcards([]);
      setHydrated(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const list = await listFlashcards(client);
        if (!cancelled) {
          setFlashcards(list);
          setHydrated(true);
        }
      } catch (err) {
        console.error("[useFlashcardsStore] failed to load flashcards", err);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId, revision]);

  const addFlashcards = useCallback(
    (cards: Flashcard[]) => {
      if (!userId || cards.length === 0) return;
      setFlashcards((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newCards = cards.filter((c) => !existingIds.has(c.id));
        return newCards.length === 0 ? prev : [...newCards, ...prev];
      });
      (async () => {
        try {
          await upsertFlashcards(getSupabaseBrowserClient(), cards, userId);
        } catch (err) {
          console.error("[useFlashcardsStore] addFlashcards failed", err);
        }
      })();
    },
    [userId]
  );

  const createFlashcard = useCallback(
    (card: Flashcard) => {
      if (!userId) return;
      setFlashcards((prev) =>
        prev.some((c) => c.id === card.id) ? prev : [card, ...prev]
      );
      (async () => {
        try {
          await upsertFlashcard(getSupabaseBrowserClient(), card, userId);
        } catch (err) {
          console.error("[useFlashcardsStore] createFlashcard failed", err);
        }
      })();
    },
    [userId]
  );

  const updateFlashcard = useCallback(
    (cardId: string, updates: Partial<Flashcard>) => {
      if (!userId) return;
      setFlashcards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, ...updates } : c))
      );
      (async () => {
        try {
          await updateFlashcardRepo(getSupabaseBrowserClient(), cardId, updates);
        } catch (err) {
          console.error("[useFlashcardsStore] updateFlashcard failed", err);
        }
      })();
    },
    [userId]
  );

  const removeFlashcardsForGame = useCallback(
    (gameId: string) => {
      if (!userId) return;
      setFlashcards((prev) => prev.filter((c) => c.gameId !== gameId));
      (async () => {
        try {
          await deleteFlashcardsForGame(getSupabaseBrowserClient(), gameId);
        } catch (err) {
          console.error("[useFlashcardsStore] removeFlashcardsForGame failed", err);
        }
      })();
    },
    [userId]
  );

  const removeFlashcard = useCallback(
    (cardId: string) => {
      if (!userId) return;
      setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
      (async () => {
        try {
          await deleteFlashcard(getSupabaseBrowserClient(), cardId);
        } catch (err) {
          console.error("[useFlashcardsStore] removeFlashcard failed", err);
        }
      })();
    },
    [userId]
  );

  const applyFlashcardOperations = useCallback(
    (operations: CardOperation[]) => {
      if (!userId || operations.length === 0) return;
      setFlashcards((prev) => applyCardOperations(prev, operations));
      (async () => {
        try {
          await applyFlashcardOperationsRepo(
            getSupabaseBrowserClient(),
            operations,
            userId
          );
        } catch (err) {
          console.error("[useFlashcardsStore] applyFlashcardOperations failed", err);
        }
      })();
    },
    [userId]
  );

  const getCardsDueToday = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    return flashcards.filter(
      (c) => c.status !== "mastered" && c.nextReview <= today
    );
  }, [flashcards]);

  return {
    flashcards,
    hydrated,
    addFlashcards,
    createFlashcard,
    updateFlashcard,
    removeFlashcard,
    removeFlashcardsForGame,
    applyFlashcardOperations,
    getCardsDueToday,
  };
}
