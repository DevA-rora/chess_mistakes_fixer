import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SRSRating } from "@/lib/mock-data";
import type { DailyActivity } from "@/hooks/use-stats-store";

const EMPTY_DAY: DailyActivity = {
  cardsReviewed: 0,
  cardsCorrect: 0,
  cardsMastered: 0,
  gamesAnalyzed: 0,
  gamesReviewed: 0,
  drillTimeMs: 0,
};

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

type DailyRow = Database["public"]["Tables"]["daily_activity"]["Row"];

function rowToActivity(row: DailyRow): DailyActivity {
  return {
    cardsReviewed: row.cards_reviewed,
    cardsCorrect: row.cards_correct,
    cardsMastered: row.cards_mastered,
    gamesAnalyzed: row.games_analyzed,
    gamesReviewed: row.games_reviewed,
    drillTimeMs: row.drill_time_ms,
  };
}

export async function listDailyActivity(
  client: SupabaseClient<Database>
): Promise<Record<string, DailyActivity>> {
  const { data, error } = await client
    .from("daily_activity")
    .select("*")
    .order("activity_date", { ascending: false });

  if (error) throw error;
  const map: Record<string, DailyActivity> = {};
  for (const row of data ?? []) {
    map[row.activity_date] = rowToActivity(row);
  }
  return map;
}

async function getDayRow(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  date: string
): Promise<DailyActivity> {
  const { data, error } = await client
    .from("daily_activity")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .eq("activity_date", date)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToActivity(data) : { ...EMPTY_DAY };
}

async function upsertDay(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  date: string,
  activity: DailyActivity
): Promise<void> {
  const { error } = await client.from("daily_activity").upsert(
    {
      clerk_user_id: clerkUserId,
      activity_date: date,
      cards_reviewed: activity.cardsReviewed,
      cards_correct: activity.cardsCorrect,
      cards_mastered: activity.cardsMastered,
      games_analyzed: activity.gamesAnalyzed,
      games_reviewed: activity.gamesReviewed,
      drill_time_ms: activity.drillTimeMs,
    },
    { onConflict: "clerk_user_id,activity_date" }
  );
  if (error) throw error;
}

export async function bulkUpsertDailyActivity(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  entries: Record<string, DailyActivity>
): Promise<void> {
  const rows = Object.entries(entries).map(([date, a]) => ({
    clerk_user_id: clerkUserId,
    activity_date: date,
    cards_reviewed: a.cardsReviewed,
    cards_correct: a.cardsCorrect,
    cards_mastered: a.cardsMastered,
    games_analyzed: a.gamesAnalyzed,
    games_reviewed: a.gamesReviewed,
    drill_time_ms: a.drillTimeMs,
  }));

  if (rows.length === 0) return;

  const { error } = await client
    .from("daily_activity")
    .upsert(rows, { onConflict: "clerk_user_id,activity_date" });
  if (error) throw error;
}

export async function recordCardReview(
  client: SupabaseClient<Database>,
  clerkUserId: string,
  flashcardId: string,
  rating: SRSRating,
  correct: boolean,
  timeMs: number,
  mastered: boolean
): Promise<void> {
  const today = todayKey();

  const { error: logErr } = await client.from("card_reviews").insert({
    clerk_user_id: clerkUserId,
    flashcard_id: flashcardId,
    rating,
    correct,
    time_ms: timeMs,
  });
  if (logErr) throw logErr;

  const current = await getDayRow(client, clerkUserId, today);
  await upsertDay(client, clerkUserId, today, {
    ...current,
    cardsReviewed: current.cardsReviewed + 1,
    cardsCorrect: current.cardsCorrect + (correct ? 1 : 0),
    cardsMastered: current.cardsMastered + (mastered ? 1 : 0),
    drillTimeMs: current.drillTimeMs + timeMs,
  });
}

export async function recordGameAnalyzed(
  client: SupabaseClient<Database>,
  clerkUserId: string
): Promise<void> {
  const today = todayKey();
  const current = await getDayRow(client, clerkUserId, today);
  await upsertDay(client, clerkUserId, today, {
    ...current,
    gamesAnalyzed: current.gamesAnalyzed + 1,
  });
}

export async function recordGameReviewComplete(
  client: SupabaseClient<Database>,
  clerkUserId: string
): Promise<void> {
  const today = todayKey();
  const current = await getDayRow(client, clerkUserId, today);
  await upsertDay(client, clerkUserId, today, {
    ...current,
    gamesReviewed: current.gamesReviewed + 1,
  });
}

export interface CardReviewTotals {
  totalReviews: number;
  totalCorrect: number;
  ratingBreakdown: { again: number; hard: number; good: number; easy: number };
}

export async function getCardReviewTotals(
  client: SupabaseClient<Database>
): Promise<CardReviewTotals> {
  const { data, error } = await client
    .from("card_reviews")
    .select("rating, correct");

  if (error) throw error;

  const totals: CardReviewTotals = {
    totalReviews: 0,
    totalCorrect: 0,
    ratingBreakdown: { again: 0, hard: 0, good: 0, easy: 0 },
  };

  for (const r of data ?? []) {
    totals.totalReviews += 1;
    if (r.correct) totals.totalCorrect += 1;
    const rating = r.rating as SRSRating;
    if (rating in totals.ratingBreakdown) {
      totals.ratingBreakdown[rating] += 1;
    }
  }
  return totals;
}
