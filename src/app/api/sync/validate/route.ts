import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { username, platform } = (await req.json()) as {
      username?: string;
      platform?: "chesscom" | "lichess";
    };

    if (!username || !platform) {
      return NextResponse.json(
        { error: "Missing username or platform" },
        { status: 400 }
      );
    }

    const sanitized = username.trim();
    if (!sanitized || sanitized.length > 100) {
      return NextResponse.json(
        { error: "Invalid username" },
        { status: 400 }
      );
    }

    let url: string;
    if (platform === "chesscom") {
      url = `https://api.chess.com/pub/player/${encodeURIComponent(sanitized.toLowerCase())}`;
    } else {
      url = `https://lichess.org/api/user/${encodeURIComponent(sanitized)}`;
    }

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ChessMistakesFixer/1.0",
      },
    });

    if (res.status === 404) {
      return NextResponse.json({ valid: false, username: sanitized });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Platform returned status ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    // Return the canonical username from the platform
    const canonicalUsername =
      platform === "chesscom"
        ? data.username || sanitized
        : data.username || data.id || sanitized;

    return NextResponse.json({ valid: true, username: canonicalUsername });
  } catch (e) {
    console.error("Validate error:", e);
    return NextResponse.json(
      { error: "Failed to validate username" },
      { status: 500 }
    );
  }
}
