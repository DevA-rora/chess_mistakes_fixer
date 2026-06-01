"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import type { SRSRating } from "@/lib/mock-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDataRevision } from "@/lib/supabase/data-revision";
import {
  bulkUpsertDailyActivity,
  getCardReviewTotals,
  listDailyActivity,
  recordCardReview as recordCardReviewRepo,
  recordGameAnalyzed as recordGameAnalyzedRepo,
  recordGameReviewComplete as recordGameReviewCompleteRepo,
  type CardReviewTotals,
} from "@/lib/repositories/stats";

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
  totals: CardReviewTotals;
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
  totals: {
    totalReviews: 0,
    totalCorrect: 0,
    ratingBreakdown: { again: 0, hard: 0, good: 0, easy: 0 },
  },
};

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

export function useStatsStore() {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const revision = useDataRevision();

  const [data, setData] = useState<StatsData>(DEFAULT_DATA);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setData(DEFAULT_DATA);
      setHydrated(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const [dailyActivity, totals] = await Promise.all([
          listDailyActivity(client),
          getCardReviewTotals(client),
        ]);
        if (!cancelled) {
          setData({ dailyActivity, totals });
          setHydrated(true);
        }
      } catch (err) {
        console.error("[useStatsStore] failed to load stats", err);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId, revision]);

  const recordCardReview = useCallback(
    (
      rating: SRSRating,
      correct: boolean,
      timeMs: number,
      mastered: boolean,
      flashcardId?: string
    ) => {
      if (!userId) return;

      const today = todayKey();
      setData((prev) => {
        const day = prev.dailyActivity[today] ?? { ...EMPTY_DAY };
        return {
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
          totals: {
            totalReviews: prev.totals.totalReviews + 1,
            totalCorrect: prev.totals.totalCorrect + (correct ? 1 : 0),
            ratingBreakdown: {
              ...prev.totals.ratingBreakdown,
              [rating]: prev.totals.ratingBreakdown[rating] + 1,
            },
          },
        };
      });

      if (!flashcardId) {
        console.warn(
          "[useStatsStore] recordCardReview called without flashcardId; review log not persisted"
        );
        return;
      }

      (async () => {
        try {
          await recordCardReviewRepo(
            getSupabaseBrowserClient(),
            userId,
            flashcardId,
            rating,
            correct,
            timeMs,
            mastered
          );
        } catch (err) {
          console.error("[useStatsStore] recordCardReview failed", err);
        }
      })();
    },
    [userId]
  );

  const recordGameAnalyzed = useCallback(() => {
    if (!userId) return;
    const today = todayKey();
    setData((prev) => {
      const day = prev.dailyActivity[today] ?? { ...EMPTY_DAY };
      return {
        ...prev,
        dailyActivity: {
          ...prev.dailyActivity,
          [today]: { ...day, gamesAnalyzed: day.gamesAnalyzed + 1 },
        },
      };
    });
    (async () => {
      try {
        await recordGameAnalyzedRepo(getSupabaseBrowserClient(), userId);
      } catch (err) {
        console.error("[useStatsStore] recordGameAnalyzed failed", err);
      }
    })();
  }, [userId]);

  const recordGameReviewComplete = useCallback(() => {
    if (!userId) return;
    const today = todayKey();
    setData((prev) => {
      const day = prev.dailyActivity[today] ?? { ...EMPTY_DAY };
      return {
        ...prev,
        dailyActivity: {
          ...prev.dailyActivity,
          [today]: { ...day, gamesReviewed: day.gamesReviewed + 1 },
        },
      };
    });
    (async () => {
      try {
        await recordGameReviewCompleteRepo(getSupabaseBrowserClient(), userId);
      } catch (err) {
        console.error("[useStatsStore] recordGameReviewComplete failed", err);
      }
    })();
  }, [userId]);

  // Kept for API parity with the previous localStorage-backed hook so
  // existing call sites compile. Data is now authoritative in Supabase
  // — no client-side backfill is ever needed.
  const backfillFromExistingData = useCallback(
    (...args: unknown[]) => {
      void args;
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
    if (data.totals.totalReviews === 0) return 0;
    return Math.round((data.totals.totalCorrect / data.totals.totalReviews) * 100);
  }, [data.totals.totalReviews, data.totals.totalCorrect]);

  const getTodayActivity = useCallback((): DailyActivity => {
    return data.dailyActivity[todayKey()] ?? { ...EMPTY_DAY };
  }, [data.dailyActivity]);

  return {
    hydrated,
    totalReviews: data.totals.totalReviews,
    totalCorrect: data.totals.totalCorrect,
    ratingBreakdown: data.totals.ratingBreakdown,
    // Whenever signed in we already have authoritative data from Supabase.
    backfilled: true,
    recordCardReview,
    recordGameAnalyzed,
    recordGameReviewComplete,
    backfillFromExistingData,
    bulkUpsertDailyActivity: useCallback(
      async (entries: Record<string, DailyActivity>) => {
        if (!userId) return;
        try {
          await bulkUpsertDailyActivity(
            getSupabaseBrowserClient(),
            userId,
            entries
          );
        } catch (err) {
          console.error("[useStatsStore] bulkUpsertDailyActivity failed", err);
        }
      },
      [userId]
    ),
    getActivityForRange,
    getAccuracy,
    getTodayActivity,
  };
}
