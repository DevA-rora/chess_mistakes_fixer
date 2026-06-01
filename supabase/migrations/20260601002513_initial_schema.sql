-- =====================================================================
-- Chess Mistakes Fixer — initial schema
-- All user-scoped tables key off Clerk's user id (auth.jwt() ->> 'sub')
-- RLS is enabled everywhere; one 'owner' policy per table.
-- =====================================================================

-- Helper: current Clerk user id from JWT
create or replace function public.clerk_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'sub', '')
$$;

comment on function public.clerk_user_id() is
  'Returns the Clerk user id (sub claim) from the verified JWT, or empty string when unauthenticated.';

-- =====================================================================
-- profiles
-- =====================================================================
create table public.profiles (
  clerk_user_id text primary key,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_owner" on public.profiles
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- connected_accounts (chess.com, lichess, future providers)
-- =====================================================================
create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  provider text not null check (provider in ('chesscom', 'lichess')),
  username text not null,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clerk_user_id, provider)
);

create index connected_accounts_user_idx on public.connected_accounts (clerk_user_id);

alter table public.connected_accounts enable row level security;

create policy "connected_accounts_owner" on public.connected_accounts
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- games
-- =====================================================================
create table public.games (
  id text primary key,
  clerk_user_id text not null,
  source text not null check (source in ('chesscom', 'lichess', 'pgn', 'fen')),
  source_game_id text,
  opponent text not null,
  opponent_rating integer not null default 0,
  player_rating integer not null default 0,
  player_color text not null check (player_color in ('white', 'black')),
  played_at date not null,
  time_control text not null,
  player_time_left text,
  opponent_time_left text,
  result text not null check (result in ('win', 'loss', 'draw')),
  blunders integer not null default 0,
  mistakes integer not null default 0,
  inaccuracies integer not null default 0,
  mistakes_fixed integer not null default 0,
  total_mistakes integer not null default 0,
  pgn text not null default '',
  review_status text not null default 'not-reviewed'
    check (review_status in ('reviewed', 'reviewing', 'not-reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_user_played_idx on public.games (clerk_user_id, played_at desc);

alter table public.games enable row level security;

create policy "games_owner" on public.games
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- game_analyses (1:N with games — re-analysis at higher depth allowed)
-- =====================================================================
create table public.game_analyses (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  clerk_user_id text not null,
  depth integer not null,
  start_eval integer not null default 0,
  blunders integer not null default 0,
  mistakes integer not null default 0,
  inaccuracies integer not null default 0,
  brilliancies integer not null default 0,
  greats integer not null default 0,
  missed_wins integer not null default 0,
  white_accuracy numeric(5,2) not null default 0,
  black_accuracy numeric(5,2) not null default 0,
  moves jsonb not null default '[]'::jsonb,
  analyzed_at timestamptz not null default now(),
  unique (game_id, depth)
);

create index game_analyses_user_idx on public.game_analyses (clerk_user_id);
create index game_analyses_game_idx on public.game_analyses (game_id);

alter table public.game_analyses enable row level security;

create policy "game_analyses_owner" on public.game_analyses
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- flashcards (SRS cards generated from mistakes)
-- =====================================================================
create table public.flashcards (
  id text primary key,
  clerk_user_id text not null,
  game_id text not null references public.games(id) on delete cascade,
  opponent text not null,
  move_number integer not null,
  time_remaining text,
  fen text not null,
  your_move text not null,
  best_move text not null,
  evaluation text not null,
  mistake_type text not null check (mistake_type in ('blunder', 'mistake', 'inaccuracy')),
  explanation text not null,
  status text not null default 'new'
    check (status in ('new', 'learning', 'review', 'mastered')),
  next_review date not null default current_date,
  interval integer not null default 0,
  ease_factor numeric(4,2) not null default 2.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_user_due_idx on public.flashcards (clerk_user_id, next_review)
  where status <> 'mastered';
create index flashcards_game_idx on public.flashcards (game_id);

alter table public.flashcards enable row level security;

create policy "flashcards_owner" on public.flashcards
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- card_reviews (append-only review log)
-- =====================================================================
create table public.card_reviews (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  flashcard_id text not null references public.flashcards(id) on delete cascade,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  correct boolean not null,
  time_ms integer not null default 0,
  reviewed_at timestamptz not null default now()
);

create index card_reviews_user_time_idx on public.card_reviews (clerk_user_id, reviewed_at desc);
create index card_reviews_card_idx on public.card_reviews (flashcard_id);

alter table public.card_reviews enable row level security;

create policy "card_reviews_owner" on public.card_reviews
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- daily_activity (per-day rollup)
-- =====================================================================
create table public.daily_activity (
  clerk_user_id text not null,
  activity_date date not null,
  cards_reviewed integer not null default 0,
  cards_correct integer not null default 0,
  cards_mastered integer not null default 0,
  games_analyzed integer not null default 0,
  games_reviewed integer not null default 0,
  drill_time_ms integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (clerk_user_id, activity_date)
);

create index daily_activity_user_date_idx on public.daily_activity (clerk_user_id, activity_date desc);

alter table public.daily_activity enable row level security;

create policy "daily_activity_owner" on public.daily_activity
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- user_streak (singleton per user)
-- =====================================================================
create table public.user_streak (
  clerk_user_id text primary key,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_active_date date,
  today_drill_count integer not null default 0,
  today_drill_date date,
  today_reviewed_game boolean not null default false,
  today_review_date date,
  updated_at timestamptz not null default now()
);

alter table public.user_streak enable row level security;

create policy "user_streak_owner" on public.user_streak
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- user_settings (singleton per user, jsonb escape hatch for future flags)
-- =====================================================================
create table public.user_settings (
  clerk_user_id text primary key,
  fix_opponent_mistakes boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_owner" on public.user_settings
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- coach_messages (AI coach chat history, per game / optional per move)
-- =====================================================================
create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  game_id text not null references public.games(id) on delete cascade,
  move_number integer,
  role text not null check (role in ('ai', 'user')),
  content text not null,
  created_at timestamptz not null default now()
);

create index coach_messages_game_move_idx on public.coach_messages (game_id, move_number);
create index coach_messages_user_idx on public.coach_messages (clerk_user_id);

alter table public.coach_messages enable row level security;

create policy "coach_messages_owner" on public.coach_messages
  for all to authenticated
  using (clerk_user_id = (select public.clerk_user_id()))
  with check (clerk_user_id = (select public.clerk_user_id()));

-- =====================================================================
-- updated_at trigger (DRY — applies to all tables with updated_at)
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger touch_connected_accounts before update on public.connected_accounts
  for each row execute function public.touch_updated_at();
create trigger touch_games before update on public.games
  for each row execute function public.touch_updated_at();
create trigger touch_flashcards before update on public.flashcards
  for each row execute function public.touch_updated_at();
create trigger touch_daily_activity before update on public.daily_activity
  for each row execute function public.touch_updated_at();
create trigger touch_user_streak before update on public.user_streak
  for each row execute function public.touch_updated_at();
create trigger touch_user_settings before update on public.user_settings
  for each row execute function public.touch_updated_at();
