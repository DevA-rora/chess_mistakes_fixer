"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "chess-fixer-streak";

interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string | null; // ISO date string (YYYY-MM-DD)
  todayDrillCount: number; // flashcards solved today
  todayDrillDate: string | null; // which day the drill count is for
  todayReviewedGame: boolean; // whether a game was reviewed today
  todayReviewDate: string | null; // which day the review flag is for
}

const DEFAULT_DATA: StreakData = {
  currentStreak: 0,
  bestStreak: 0,
  lastActiveDate: null,
  todayDrillCount: 0,
  todayDrillDate: null,
  todayReviewedGame: false,
  todayReviewDate: null,
};

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function loadStreak(): StreakData {
  if (typeof window === "undefined") return DEFAULT_DATA;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StreakData;
      if (parsed && typeof parsed.currentStreak === "number") return parsed;
    }
  } catch {
    // corrupted
  }
  return DEFAULT_DATA;
}

/** Check if the streak is still alive (last active was today or yesterday). */
function isStreakAlive(data: StreakData): boolean {
  if (!data.lastActiveDate) return false;
  const today = new Date(getToday());
  const last = new Date(data.lastActiveDate);
  const diffDays = Math.floor(
    (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
  );
  return diffDays <= 1;
}

/** Did the user already complete a qualifying activity today? */
function hasCompletedToday(data: StreakData): boolean {
  const today = getToday();
  const drillDone = data.todayDrillDate === today && data.todayDrillCount >= 3;
  const reviewDone = data.todayReviewDate === today && data.todayReviewedGame;
  return drillDone || reviewDone;
}

export function useStreakStore() {
  const [data, setData] = useState<StreakData>(DEFAULT_DATA);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = loadStreak();
    // Reset streak if it's broken (more than 1 day gap)
    if (!isStreakAlive(loaded)) {
      setData({ ...DEFAULT_DATA });
    } else {
      setData(loaded);
    }
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full
    }
  }, [data, hydrated]);

  const incrementStreak = useCallback((current: StreakData) => {
    const today = getToday();
    // Only increment if not already counted today
    if (current.lastActiveDate === today) return current;
    const newStreak = current.currentStreak + 1;
    return {
      ...current,
      currentStreak: newStreak,
      bestStreak: Math.max(current.bestStreak, newStreak),
      lastActiveDate: today,
    };
  }, []);

  /** Call after a flashcard is solved in the drill page. */
  const recordDrillSolve = useCallback(() => {
    setData((prev) => {
      const today = getToday();
      const drillDate = prev.todayDrillDate === today ? prev.todayDrillDate : today;
      const drillCount = prev.todayDrillDate === today ? prev.todayDrillCount + 1 : 1;

      let updated: StreakData = {
        ...prev,
        todayDrillCount: drillCount,
        todayDrillDate: drillDate,
      };

      // If they just hit 3 and haven't been credited today, increment streak
      if (drillCount >= 3 && !hasCompletedToday(prev)) {
        updated = incrementStreak(updated);
      }

      return updated;
    });
  }, [incrementStreak]);

  /** Call when the user completes a game review. */
  const recordGameReview = useCallback(() => {
    setData((prev) => {
      const today = getToday();

      let updated: StreakData = {
        ...prev,
        todayReviewedGame: true,
        todayReviewDate: today,
      };

      // If they haven't been credited today, increment streak
      if (!hasCompletedToday(prev)) {
        updated = incrementStreak(updated);
      }

      return updated;
    });
  }, [incrementStreak]);

  const streak = isStreakAlive(data) ? data.currentStreak : 0;
  const isActive = streak > 0 && hasCompletedToday(data);
  const completedToday = hasCompletedToday(data);

  return {
    streak,
    bestStreak: data.bestStreak,
    isActive,
    completedToday,
    todayDrillCount: data.todayDrillDate === getToday() ? data.todayDrillCount : 0,
    recordDrillSolve,
    recordGameReview,
    hydrated,
  };
}
