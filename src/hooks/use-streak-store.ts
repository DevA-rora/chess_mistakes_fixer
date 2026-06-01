"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDataRevision } from "@/lib/supabase/data-revision";
import { getStreak, saveStreak, type StreakSnapshot } from "@/lib/repositories/streak";

const DEFAULT: StreakSnapshot = {
  currentStreak: 0,
  bestStreak: 0,
  lastActiveDate: null,
  todayDrillCount: 0,
  todayDrillDate: null,
  todayReviewedGame: false,
  todayReviewDate: null,
};

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function isStreakAlive(snapshot: StreakSnapshot): boolean {
  if (!snapshot.lastActiveDate) return false;
  const today = new Date(todayKey());
  const last = new Date(snapshot.lastActiveDate);
  const diffDays = Math.floor(
    (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDays <= 1;
}

function hasCompletedToday(snapshot: StreakSnapshot): boolean {
  const today = todayKey();
  const drillDone =
    snapshot.todayDrillDate === today && snapshot.todayDrillCount >= 3;
  const reviewDone =
    snapshot.todayReviewDate === today && snapshot.todayReviewedGame;
  return drillDone || reviewDone;
}

function bumpStreak(current: StreakSnapshot): StreakSnapshot {
  const today = todayKey();
  if (current.lastActiveDate === today) return current;
  const newStreak = current.currentStreak + 1;
  return {
    ...current,
    currentStreak: newStreak,
    bestStreak: Math.max(current.bestStreak, newStreak),
    lastActiveDate: today,
  };
}

export function useStreakStore() {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;
  const revision = useDataRevision();

  const [snapshot, setSnapshot] = useState<StreakSnapshot>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      setSnapshot(DEFAULT);
      setHydrated(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        const loaded = await getStreak(client, userId);
        if (!cancelled) {
          setSnapshot(isStreakAlive(loaded) ? loaded : { ...DEFAULT });
          setHydrated(true);
        }
      } catch (err) {
        console.error("[useStreakStore] failed to load streak", err);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, userId, revision]);

  const persist = useCallback(
    (next: StreakSnapshot) => {
      if (!userId) return;
      (async () => {
        try {
          await saveStreak(getSupabaseBrowserClient(), userId, next);
        } catch (err) {
          console.error("[useStreakStore] saveStreak failed", err);
        }
      })();
    },
    [userId]
  );

  const recordDrillSolve = useCallback(() => {
    if (!userId) return;
    setSnapshot((prev) => {
      const today = todayKey();
      const drillDate = prev.todayDrillDate === today ? prev.todayDrillDate : today;
      const drillCount =
        prev.todayDrillDate === today ? prev.todayDrillCount + 1 : 1;

      let updated: StreakSnapshot = {
        ...prev,
        todayDrillCount: drillCount,
        todayDrillDate: drillDate,
      };

      if (drillCount >= 3 && !hasCompletedToday(prev)) {
        updated = bumpStreak(updated);
      }

      persist(updated);
      return updated;
    });
  }, [persist, userId]);

  const recordGameReview = useCallback(() => {
    if (!userId) return;
    setSnapshot((prev) => {
      const today = todayKey();
      let updated: StreakSnapshot = {
        ...prev,
        todayReviewedGame: true,
        todayReviewDate: today,
      };
      if (!hasCompletedToday(prev)) {
        updated = bumpStreak(updated);
      }
      persist(updated);
      return updated;
    });
  }, [persist, userId]);

  const alive = isStreakAlive(snapshot);
  const streak = alive ? snapshot.currentStreak : 0;
  const completedToday = hasCompletedToday(snapshot);
  const isActive = streak > 0 && completedToday;

  return {
    streak,
    bestStreak: snapshot.bestStreak,
    isActive,
    completedToday,
    todayDrillCount:
      snapshot.todayDrillDate === todayKey() ? snapshot.todayDrillCount : 0,
    recordDrillSolve,
    recordGameReview,
    hydrated,
  };
}
