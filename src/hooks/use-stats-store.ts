"use client";

import { useState, useEffect, useCallback } from "react";
import type { SRSRating, Flashcard, Game } from "@/lib/mock-data";

const STORAGE_KEY = "chess-fixer-stats";

export interface DailyActivity {
  cardsReviewed: number;
  cardsCorrect: number;
  cardsMastered: number;
  gamesAnalyzed: number;
  gamesReviewed: number;
  drillTimeMs: number;
}

interface StatsData {
  dailyActivity: Record<string, DailyActivity>;
  totalReviews: number;
  totalCorrect: number;
  ratingBreakdown: { again: number; hard: number; good: number; easy: number };
  backfilled: boolean;
}

const EMPTY_DAY: DailyActivity = {
  cardsReviewed: 0,
  cardsCorrect: 0,
  cardsMastered: 0,
  gamesAnalyzed: 0,
  gamesReviewed: 0,
  drillTimeMs: 0,
};

const DEFAULT_DATA: StatsData = {
  dailyActivity: {},
  totalReviews: 0,
  totalCorrect: 0,
  ratingBreakdown: { again: 0, hard: 0, good: 0, easy: 0 },
  backfilled: false,
};

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function loadStats(): StatsData {
  if (typeof window === "undefined") return DEFAULT_DATA;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StatsData;
      if (parsed && typeof parsed.totalReviews === "number") return parsed;
    }
  } catch {
    // corrupted
  }
  return DEFAULT_DATA;
}

export function useStatsStore() {
  const [data, setData] = useState<StatsData>(DEFAULT_DATA);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setData(loadStats());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full
    }
  }, [data, hydrated]);

  const recordCardReview = useCallback(
    (rating: SRSRating, correct: boolean, timeMs: number, mastered: boolean) => {
      setData((prev) => {
        const today = getToday();
        const day = prev.dailyActivity[today] ?? { ...EMPTY_DAY };
        return {
          ...prev,
          dailyActivity: {
            ...prev.dailyActivity,
            [today]: {
              ...day,
              cardsReviewed: day.cardsReviewed + 1,
              cardsCorrect: day.cardsCorrect + (correct ? 1 : 0),
              cardsMastered: day.cardsMastered + (mastered ? 1 : 0),
              drillTimeMs: day.drillTimeMs + timeMs,
            },
          },
          totalReviews: prev.totalReviews + 1,
          totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
          ratingBreakdown: {
            ...prev.ratingBreakdown,
            [rating]: prev.ratingBreakdown[rating] + 1,
          },
        };
      });
    },
    []
  );

  const recordGameAnalyzed = useCallback(() => {
    setData((prev) => {
      const today = getToday();
      const day = prev.dailyActivity[today] ?? { ...EMPTY_DAY };
      return {
        ...prev,
        dailyActivity: {
          ...prev.dailyActivity,
          [today]: {
            ...day,
            gamesAnalyzed: day.gamesAnalyzed + 1,
          },
        },
      };
    });
  }, []);

  const recordGameReviewComplete = useCallback(() => {
    setData((prev) => {
      const today = getToday();
      const day = prev.dailyActivity[today] ?? { ...EMPTY_DAY };
      return {
        ...prev,
        dailyActivity: {
          ...prev.dailyActivity,
          [today]: {
            ...day,
            gamesReviewed: day.gamesReviewed + 1,
          },
        },
      };
    });
  }, []);

  const backfillFromExistingData = useCallback(
    (flashcards: Flashcard[], _games: Game[]) => {
      setData((prev) => {
        if (prev.backfilled) return prev;
        const reviewedCards = flashcards.filter((c) => c.status !== "new");
        return {
          ...prev,
          totalReviews: prev.totalReviews + reviewedCards.length,
          totalCorrect: prev.totalCorrect + Math.round(reviewedCards.length * 0.7),
          backfilled: true,
        };
      });
    },
    []
  );

  const getActivityForRange = useCallback(
    (days: number): { date: string; cardsReviewed: number }[] => {
      const result: { date: string; cardsReviewed: number }[] = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        result.push({
          date: key,
          cardsReviewed: data.dailyActivity[key]?.cardsReviewed ?? 0,
        });
      }
      return result;
    },
    [data.dailyActivity]
  );

  const getAccuracy = useCallback((): number => {
    if (data.totalReviews === 0) return 0;
    return Math.round((data.totalCorrect / data.totalReviews) * 100);
  }, [data.totalReviews, data.totalCorrect]);

  const getTodayActivity = useCallback((): DailyActivity => {
    return data.dailyActivity[getToday()] ?? { ...EMPTY_DAY };
  }, [data.dailyActivity]);

  return {
    hydrated,
    totalReviews: data.totalReviews,
    totalCorrect: data.totalCorrect,
    ratingBreakdown: data.ratingBreakdown,
    backfilled: data.backfilled,
    recordCardReview,
    recordGameAnalyzed,
    recordGameReviewComplete,
    backfillFromExistingData,
    getActivityForRange,
    getAccuracy,
    getTodayActivity,
  };
}
