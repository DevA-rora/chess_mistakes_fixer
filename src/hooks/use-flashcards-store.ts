"use client";

import { useState, useEffect, useCallback } from "react";
import type { Flashcard } from "@/lib/mock-data";
import { applyCardOperations, type CardOperation } from "@/lib/card-manager";

const STORAGE_KEY = "chess-fixer-flashcards";

function loadFlashcards(): Flashcard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Flashcard[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // corrupted
  }
  return [];
}

export function useFlashcardsStore() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFlashcards(loadFlashcards());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flashcards));
    } catch {
      // storage full
    }
  }, [flashcards, hydrated]);

  const addFlashcards = useCallback((cards: Flashcard[]) => {
    setFlashcards((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const newCards = cards.filter((c) => !existingIds.has(c.id));
      if (newCards.length === 0) return prev;
      return [...newCards, ...prev];
    });
  }, []);

  const createFlashcard = useCallback((card: Flashcard) => {
    setFlashcards((prev) => {
      if (prev.some((c) => c.id === card.id)) return prev;
      return [card, ...prev];
    });
  }, []);

  const updateFlashcard = useCallback(
    (cardId: string, updates: Partial<Flashcard>) => {
      setFlashcards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const removeFlashcardsForGame = useCallback((gameId: string) => {
    setFlashcards((prev) => prev.filter((c) => c.gameId !== gameId));
  }, []);

  const removeFlashcard = useCallback((cardId: string) => {
    setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
  }, []);

  const applyFlashcardOperations = useCallback((operations: CardOperation[]) => {
    if (operations.length === 0) return;
    setFlashcards((prev) => applyCardOperations(prev, operations));
  }, []);

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
