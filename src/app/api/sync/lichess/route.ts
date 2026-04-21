import { NextRequest, NextResponse } from "next/server";
import {
  normalizeLichessGame,
  parseNdjson,
  type LichessGame,
} from "@/lib/game-sync";

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

    const user = username.trim();

    // Fetch games as NDJSON with PGN embedded in JSON
    const params = new URLSearchParams({
      max: String(MAX_GAMES),
      pgnInJson: "true",
      sort: "dateDesc",
      opening: "true",
      moves: "true",
      tags: "true",
      clocks: "true",
    });

    const gamesRes = await fetch(
      `https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`,
      {
        headers: {
          Accept: "application/x-ndjson",
          "User-Agent": USER_AGENT,
        },
      }
    );

    if (gamesRes.status === 404) {
      return NextResponse.json(
        { error: "User not found on Lichess" },
        { status: 404 }
      );
    }

    if (!gamesRes.ok) {
      return NextResponse.json(
        { error: `Lichess returned status ${gamesRes.status}` },
        { status: 502 }
      );
    }

    const body = await gamesRes.text();

    if (!body.trim()) {
      return NextResponse.json({ games: [], username: user });
    }

    const apiGames = parseNdjson<LichessGame>(body);

    // Normalize — already sorted dateDesc by the API
    const games = apiGames
      .map((g) => normalizeLichessGame(g, user))
      .filter((g): g is NonNullable<typeof g> => g !== null);

    return NextResponse.json({ games, username: user });
  } catch (e) {
    console.error("Lichess sync error:", e);
    return NextResponse.json(
      { error: "Failed to sync games from Lichess" },
      { status: 500 }
    );
  }
}
