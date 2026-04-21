import { NextRequest } from "next/server";
import { Content } from "@google/genai";
import type { Flashcard } from "@/lib/mock-data";
import type { CardOperation } from "@/lib/card-manager";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";

export const dynamic = "force-dynamic";

const ALLOWED_UPDATE_KEYS: (keyof Flashcard)[] = [
  "gameId",
  "opponent",
  "moveNumber",
  "timeRemaining",
  "fen",
  "yourMove",
  "bestMove",
  "evaluation",
  "mistakeType",
  "explanation",
  "status",
  "nextReview",
  "interval",
  "easeFactor",
];

function pickAllowedUpdates(input: unknown): Partial<Flashcard> {
  if (!input || typeof input !== "object") return {};
  const updates: Partial<Flashcard> = {};
  const raw = input as Record<string, unknown>;
  for (const key of ALLOWED_UPDATE_KEYS) {
    if (raw[key] !== undefined) {
      (updates as Record<string, unknown>)[key] = raw[key];
    }
  }
  return updates;
}

function sanitizeOperations(raw: unknown, knownCardIds: Set<string>): CardOperation[] {
  if (!Array.isArray(raw)) return [];

  const ops: CardOperation[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const type = item.type;

    if (type === "update" && typeof item.id === "string" && knownCardIds.has(item.id)) {
      const updates = pickAllowedUpdates(item.updates);
      if (Object.keys(updates).length > 0) {
        ops.push({ type: "update", id: item.id, updates });
      }
      continue;
    }

    if (type === "delete" && typeof item.id === "string" && knownCardIds.has(item.id)) {
      ops.push({ type: "delete", id: item.id });
      continue;
    }

    if (type === "create" && item.card && typeof item.card === "object") {
      const card = item.card as Record<string, unknown>;
      if (
        typeof card.id === "string" &&
        typeof card.gameId === "string" &&
        typeof card.opponent === "string" &&
        typeof card.moveNumber === "number" &&
        typeof card.fen === "string" &&
        typeof card.yourMove === "string" &&
        typeof card.bestMove === "string" &&
        typeof card.evaluation === "string" &&
        typeof card.mistakeType === "string" &&
        typeof card.explanation === "string" &&
        typeof card.status === "string" &&
        typeof card.nextReview === "string" &&
        typeof card.interval === "number" &&
        typeof card.easeFactor === "number"
      ) {
        ops.push({ type: "create", card: card as unknown as Flashcard });
      }
    }
  }

  return ops;
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // ignore
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // ignore
    }
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // ignore
    }
  }

  return null;
}

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function fallbackOperations(instruction: string, cards: Flashcard[]): { summary: string; operations: CardOperation[] } {
  const lower = instruction.toLowerCase();
  const operations: CardOperation[] = [];

  if (lower.includes("mastered")) {
    for (const c of cards) {
      operations.push({ type: "update", id: c.id, updates: { status: "mastered" } });
    }
    return { summary: "Marked selected cards as mastered.", operations };
  }

  if (lower.includes("due") && lower.includes("today")) {
    const today = todayIsoDate();
    for (const c of cards) {
      operations.push({ type: "update", id: c.id, updates: { nextReview: today } });
    }
    return { summary: "Set selected cards to be due today.", operations };
  }

  if (lower.includes("delete") && lower.includes("blunder")) {
    for (const c of cards) {
      if (c.mistakeType === "blunder") operations.push({ type: "delete", id: c.id });
    }
    return { summary: "Deleted blunder cards in the selected set.", operations };
  }

  if (lower.includes("again") || lower.includes("reset")) {
    for (const c of cards) {
      operations.push({
        type: "update",
        id: c.id,
        updates: { status: "learning", interval: 0, nextReview: todayIsoDate() },
      });
    }
    return { summary: "Reset selected cards back to learning.", operations };
  }

  return {
    summary:
      "I couldn't confidently parse that instruction with fallback mode. Try commands like: 'mark these as mastered', 'set due today', 'reset cards', or 'delete blunder cards'.",
    operations,
  };
}

async function generateWithRetry(contents: Content[], systemInstruction: string, maxAttempts = 4): Promise<string> {
  if (!gemini) throw new Error("Gemini client unavailable");

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
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
      const isRetryable = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("overload");
      if (!isRetryable || attempt === maxAttempts) throw err;
    }

    await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
  }

  throw lastErr;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instruction, cards } = body as {
      instruction?: string;
      cards?: Flashcard[];
    };

    if (!instruction?.trim()) {
      return Response.json({ error: "Instruction is required." }, { status: 400 });
    }

    if (!cards || !Array.isArray(cards)) {
      return Response.json({ error: "Cards array is required." }, { status: 400 });
    }

    const knownCardIds = new Set(cards.map((c) => c.id));

    if (!gemini) {
      const fallback = fallbackOperations(instruction, cards);
      return Response.json(fallback);
    }

    const compactCards = cards.map((c) => ({
      id: c.id,
      gameId: c.gameId,
      opponent: c.opponent,
      moveNumber: c.moveNumber,
      yourMove: c.yourMove,
      bestMove: c.bestMove,
      evaluation: c.evaluation,
      mistakeType: c.mistakeType,
      explanation: c.explanation,
      status: c.status,
      nextReview: c.nextReview,
      interval: c.interval,
      easeFactor: c.easeFactor,
    }));

    const systemInstruction = [
      "You are an assistant that edits flashcards through JSON operations only.",
      "Output strict JSON with shape:",
      '{"summary":"...","operations":[{"type":"update","id":"...","updates":{...}} | {"type":"delete","id":"..."} | {"type":"create","card":{...}}]}',
      "Do not include markdown fences.",
      "Only use card ids present in input for update/delete.",
      "Keep operations minimal and deterministic.",
      "If unsure, return empty operations with an explanatory summary.",
    ].join("\n");

    const contents: Content[] = [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              instruction,
              cards: compactCards,
            }),
          },
        ],
      },
    ];

    const modelText = await generateWithRetry(contents, systemInstruction);
    const parsed = extractJson(modelText) as
      | { summary?: string; operations?: unknown }
      | null;

    if (!parsed) {
      const fallback = fallbackOperations(instruction, cards);
      return Response.json({
        ...fallback,
        summary:
          "I couldn't parse a structured AI response, so I used fallback command mode. " +
          fallback.summary,
      });
    }

    const operations = sanitizeOperations(parsed.operations, knownCardIds);
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary
        : operations.length > 0
          ? `Prepared ${operations.length} card operation${operations.length === 1 ? "" : "s"}.`
          : "No safe operations were generated.";

    return Response.json({ summary, operations });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to generate card operations.",
      },
      { status: 500 }
    );
  }
}
