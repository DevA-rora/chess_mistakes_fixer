import { NextRequest } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { Content } from "@google/genai";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "ai" | "user";
  content: string;
}

interface MoveContext {
  moveNumber: number;
  side: "white" | "black";
  notation: string;
  eval: number; // centipawns from white's perspective after this move
  classification: string;
  clock?: string; // Time remaining after this move
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      fen,
      playedMove,
      bestMove,
      evalBefore,
      evalAfter,
      classification,
      moveNumber,
      side,
      gameHistory,
      messages,
      mode,
      clock,
      timeControl,
    } = body as {
      fen: string;
      playedMove: string;
      bestMove: string;
      evalBefore: number;
      evalAfter: number;
      classification: string;
      moveNumber: number;
      side: string;
      gameHistory: MoveContext[];
      messages: ChatMessage[];
      mode?: "review" | "reattempt";
      clock?: string;
      timeControl?: string;
    };

    const isReattempt = mode === "reattempt";

    if (!gemini) {
      return Response.json({
        reply: generateFallbackExplanation(playedMove, bestMove, classification, evalBefore, evalAfter, isReattempt),
      });
    }

    // Build a compact game-so-far summary with evals
    const historyLines = buildGameHistory(gameHistory);

    // Eval formatted for display
    const evalBeforeStr = formatCp(evalBefore);
    const evalAfterStr = formatCp(evalAfter);

    // Build optional time context
    const timeLines: string[] = [];
    if (timeControl) timeLines.push(`Time control: ${timeControl}`);
    if (clock) timeLines.push(`Player's clock when this move was played: ${clock} remaining`);

    const systemPrompt = buildSystemPrompt({
      isReattempt,
      fen,
      side,
      moveNumber,
      playedMove,
      classification,
      evalBeforeStr,
      evalAfterStr,
      timeLines,
      historyLines,
      bestMove,
    });

    const chatMessages: ChatMessage[] =
      messages?.length > 0
        ? messages
        : [
            {
              role: "user",
              content: `Why was ${playedMove} a bad move here?`,
            },
          ];

    const contents: Content[] = chatMessages.map((m) => ({
      role: m.role === "ai" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const reply = await generateWithRetry(gemini, GEMINI_MODEL, contents, systemPrompt);
    return Response.json({ reply });
  } catch (err) {
    console.error("[/api/explain] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Explanation failed" },
      { status: 500 }
    );
  }
}

async function generateWithRetry(
  client: NonNullable<typeof gemini>,
  model: string,
  contents: Content[],
  systemInstruction: string,
  maxAttempts = 4
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      if (response.text) return response.text;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Only retry on transient 503/overload errors
      const isRetryable = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("overload");
      if (!isRetryable || attempt === maxAttempts) throw err;
    }

    // Exponential backoff: 1s, 2s, 4s
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
  }
  throw lastErr;
}

function formatCp(cp: number): string {
  const sign = cp >= 0 ? "+" : "";
  if (Math.abs(cp) >= 10000) return cp > 0 ? "+M" : "-M";
  return `${sign}${(cp / 100).toFixed(2)}`;
}

function buildSystemPrompt({
  isReattempt,
  fen,
  side,
  moveNumber,
  playedMove,
  classification,
  evalBeforeStr,
  evalAfterStr,
  timeLines,
  historyLines,
  bestMove,
}: {
  isReattempt: boolean;
  fen: string;
  side: string;
  moveNumber: number;
  playedMove: string;
  classification: string;
  evalBeforeStr: string;
  evalAfterStr: string;
  timeLines: string[];
  historyLines: string;
  bestMove: string;
}): string {
  const persona =
    "You are a chess prodigy at Magnus Carlsen's level, explaining ideas clearly to a casual-to-intermediate player.";

  const sharedRules = [
    "- Keep answers to 2-4 sentences unless the player asks for more detail.",
    "- Use plain English. Avoid engine jargon like 'centipawn loss'. Use phrases like 'gives up about half a pawn of advantage' instead.",
    "- Be encouraging. The goal is learning, not shame.",
    "- When referencing move sequences, always use numbered notation with spaces (e.g. '3... dxc4 4. Nf3', not '3...dxc4'). Single moves can be written plainly (e.g. 'Nf3').",
  ];

  const contextLines = [
    "POSITION CONTEXT:",
    `FEN before the move: ${fen}`,
    `Player is playing as: ${side}`,
    `Move number: ${moveNumber}`,
    `The player played: ${playedMove} (classified as: ${classification})`,
    `Evaluation before the move: ${evalBeforeStr} (from White's perspective)`,
    `Evaluation after the move: ${evalAfterStr} (from White's perspective)`,
    ...(timeLines.length > 0 ? ["", "TIME CONTEXT:", ...timeLines] : []),
    "",
    "GAME HISTORY (moves with evaluations from White's perspective):",
    historyLines,
  ];

  if (isReattempt) {
    return [
      persona,
      "",
      "CRITICAL RULES:",
      "- NEVER reveal the best move or any specific alternative move. The player is trying to find it themselves.",
      "- If the player asks what the best move is, refuse politely and offer a hint about what to look for instead.",
      "- You may hint at themes, piece types, or tactical ideas (e.g. 'look for a knight move that forks', 'consider developing your pieces') but never name the specific square or full move.",
      "- If time pressure context is available, you may mention it as a contributing factor (e.g. 'with only 30 seconds left, it's understandable...').",
      ...sharedRules,
      "",
      ...contextLines,
      "",
      "You have access to the engine's best move internally for your reasoning, but you must NEVER disclose it.",
      `[INTERNAL — do not reveal: engine best move is ${bestMove}]`,
    ].join("\n");
  }

  return [
    persona,
    "",
    "RULES:",
    "- You may reference the best move and explain concrete variations when it helps the player understand.",
    "- If time pressure context is available, factor it into your explanation (e.g. 'with only 30 seconds left, this is an understandable slip').",
    ...sharedRules,
    "",
    ...contextLines,
    `The engine's best move was: ${bestMove}`,
  ].join("\n");
}

function buildGameHistory(moves: MoveContext[]): string {
  if (!moves || moves.length === 0) return "(no moves yet)";

  const lines: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const w = moves[i];
    const b = moves[i + 1];
    const num = w.moveNumber;
    let line = `${num}. ${w.notation} (${formatCp(w.eval)})`;
    if (w.clock) line += ` {${w.clock}}`;
    if (b) {
      line += ` ${b.notation} (${formatCp(b.eval)})`;
      if (b.clock) line += ` {${b.clock}}`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function generateFallbackExplanation(
  playedMove: string,
  bestMove: string,
  classification: string,
  evalBefore: number,
  evalAfter: number,
  isReattempt: boolean
): string {
  const swingPawns = Math.abs(evalAfter - evalBefore) / 100;
  const swingStr = swingPawns.toFixed(1);

  if (isReattempt) {
    switch (classification) {
      case "blunder":
        return `${playedMove} was a blunder that shifted the evaluation by about ${swingStr} pawns. Look carefully at what your opponent can do after this move — there may be a tactic you missed. Try to find a move that keeps your pieces active and avoids leaving anything undefended.`;
      case "mistake":
        return `${playedMove} was a mistake, giving up roughly ${swingStr} pawns of advantage. Think about what changed in the position — did this move leave a piece unprotected, or give your opponent a strong response? There's a more active alternative.`;
      case "miss":
        return `With ${playedMove}, you missed a strong opportunity. The position had a much better continuation that would have given you a decisive edge. Look for forcing moves — checks, captures, and threats — before settling on a quiet move.`;
      case "inaccuracy":
        return `${playedMove} is slightly imprecise. While not losing, there's a more accurate move that keeps stronger pressure. Think about which pieces aren't working at their best.`;
      default:
        return `${playedMove} wasn't the strongest choice here. Consider what your pieces are doing and whether there's a more active alternative that improves your position.`;
    }
  }

  // Normal review mode — can reveal the best move
  switch (classification) {
    case "blunder":
      return `${playedMove} was a blunder that shifted the evaluation by about ${swingStr} pawns. ${bestMove} was much stronger — it maintains better piece activity and avoids leaving material or key squares undefended.`;
    case "mistake":
      return `${playedMove} was a mistake, costing roughly ${swingStr} pawns. ${bestMove} was the stronger continuation, keeping better control of the position.`;
    case "miss":
      return `You missed a winning opportunity with ${bestMove}. Instead, ${playedMove} let the advantage slip. When you have a strong position, look for forcing moves — checks, captures, and threats.`;
    case "inaccuracy":
      return `${playedMove} is slightly inaccurate. ${bestMove} was more precise and keeps stronger pressure on the opponent.`;
    case "brilliant":
      return `${playedMove} is a brilliant move! An incredible find that dramatically changes the position. This is the kind of creative play that wins games.`;
    case "great":
      return `${playedMove} is a great move! A strong choice that significantly improves your position.`;
    case "best":
      return `${playedMove} is the engine's top choice — you found the best move in this position. Well played!`;
    case "excellent":
      return `${playedMove} is an excellent move, very close to the engine's best. Strong play!`;
    default:
      return `${playedMove} is a solid move in this position. The engine's preferred choice was ${bestMove}, which maintains slightly better piece coordination.`;
  }
}
