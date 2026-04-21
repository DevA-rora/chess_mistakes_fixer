import { NextRequest } from "next/server";
import { createEngine } from "@/lib/stockfish-engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fen: unknown = body.fen;
    const depth: number = typeof body.depth === "number" ? body.depth : 14;

    if (!fen || typeof fen !== "string") {
      return Response.json({ error: "FEN position required" }, { status: 400 });
    }

    const engine = await createEngine();
    const result = await engine.analyze(fen, depth);

    // Convert score from side-to-move perspective to white's perspective
    const isWhiteToMove = fen.split(" ")[1] === "w";
    const scoreFromWhite = isWhiteToMove ? result.score : -result.score;

    return Response.json({
      score: scoreFromWhite,
      bestMove: result.bestMove,
      isMate: result.isMate,
      mateIn: result.mateIn,
      depth: result.depth,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
