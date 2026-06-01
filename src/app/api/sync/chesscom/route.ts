import { NextRequest, NextResponse } from "next/server";
import {
  normalizeChessComGame,
  type ChessComGame,
} from "@/lib/game-sync";
import {
  getServerClerkUserId,
  getSupabaseServerClient,
} from "@/lib/supabase/server";
import { upsertConnectedAccount } from "@/lib/repositories/accounts";

const MAX_GAMES = 50;
const USER_AGENT = "ChessMistakesFixer/1.0";

export async function POST(req: NextRequest) {
  try {
    const { username } = (await req.json()) as { username?: string };

    if (!username?.trim()) {
      return NextResponse.json(
        { error: "Missing username" },
        { status: 400 }
      );
    }

    const user = username.trim().toLowerCase();

    // 1. Fetch list of monthly archives
    const archivesRes = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`,
      { headers: { "User-Agent": USER_AGENT } }
    );

    if (archivesRes.status === 404) {
      return NextResponse.json(
        { error: "User not found on Chess.com" },
        { status: 404 }
      );
    }

    if (!archivesRes.ok) {
      return NextResponse.json(
        { error: `Chess.com returned status ${archivesRes.status}` },
        { status: 502 }
      );
    }

    const { archives } = (await archivesRes.json()) as {
      archives: string[];
    };

    if (!archives || archives.length === 0) {
      return NextResponse.json({ games: [], username: user });
    }

    // 2. Fetch the most recent archives (reverse chronological)
    // Take up to 2 months to ensure we get enough games
    const recentArchiveUrls = archives.slice(-2).reverse();

    const allApiGames: ChessComGame[] = [];

    for (const archiveUrl of recentArchiveUrls) {
      if (allApiGames.length >= MAX_GAMES) break;

      const archiveRes = await fetch(archiveUrl, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!archiveRes.ok) continue;

      const { games: monthGames } = (await archiveRes.json()) as {
        games: ChessComGame[];
      };

      if (monthGames) {
        allApiGames.push(...monthGames);
      }
    }

    // 3. Sort by end_time descending (most recent first), take up to MAX_GAMES
    allApiGames.sort((a, b) => b.end_time - a.end_time);
    const trimmed = allApiGames.slice(0, MAX_GAMES);

    // 4. Normalize
    const games = trimmed
      .map((g) => normalizeChessComGame(g, user))
      .filter((g): g is NonNullable<typeof g> => g !== null);

    // Record the successful sync server-side (defense-in-depth; the
    // client `useSettingsStore` also updates connected_accounts).
    try {
      const userId = await getServerClerkUserId();
      if (userId) {
        const supabase = await getSupabaseServerClient();
        if (supabase) {
          await upsertConnectedAccount(supabase, userId, {
            provider: "chesscom",
            username: user,
            lastSyncAt: new Date().toISOString(),
          });
        }
      }
    } catch (persistErr) {
      console.warn("[/api/sync/chesscom] failed to record sync", persistErr);
    }

    return NextResponse.json({ games, username: user });
  } catch (e) {
    console.error("Chess.com sync error:", e);
    return NextResponse.json(
      { error: "Failed to sync games from Chess.com" },
      { status: 500 }
    );
  }
}
