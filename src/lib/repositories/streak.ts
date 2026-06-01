import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface StreakSnapshot {
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string | null;
  todayDrillCount: number;
  todayDrillDate: string | null;
  todayReviewedGame: boolean;
  todayReviewDate: string | null;
}

const DEFAULT: StreakSnapshot = {
  currentStreak: 0,
  bestStreak: 0,
  lastActiveDate: null,
  todayDrillCount: 0,
  todayDrillDate: null,
  todayReviewedGame: false,
  todayReviewDate: null,
};

type StreakRow = Database["public"]["Tables"]["user_streak"]["Row"];

function rowToStreak(row: StreakRow): StreakSnapshot {
  return {
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    lastActiveDate: row.last_active_date,
    todayDrillCount: row.today_drill_count,
    todayDrillDate: row.today_drill_date,
    todayReviewedGame: row.today_reviewed_game,
    todayReviewDate: row.today_review_date,
  };
}

export async function getStreak(
  client: SupabaseClient<Database>,
  clerkUserId: string
): Promise<StreakSnapshot> {
  const { data, error } = await client
    .from("user_streak")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToStreak(data) : { ...DEFAULT };
}

export async function saveStreak(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  snapshot: StreakSnapshot
): Promise<void> {
  const { error } = await client.from("user_streak").upsert(
    {
      clerk_user_id: clerkUserId,
      current_streak: snapshot.currentStreak,
      best_streak: snapshot.bestStreak,
      last_active_date: snapshot.lastActiveDate,
      today_drill_count: snapshot.todayDrillCount,
      today_drill_date: snapshot.todayDrillDate,
      today_reviewed_game: snapshot.todayReviewedGame,
      today_review_date: snapshot.todayReviewDate,
    },
    { onConflict: "clerk_user_id" }
  );
  if (error) throw error;
}
