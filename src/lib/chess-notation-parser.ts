import { Chess } from "chess.js";

export type Segment =
  | { type: "text"; value: string }
  | { type: "square"; value: string; square: string }
  | { type: "move"; value: string; square: string; fromSquare?: string }
  | { type: "line"; value: string; moves: string[]; fromFen: string };

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Strict SAN move token — avoids false positives like ordinary words
const MOVE_TOKEN = `(?:[NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQK])?[+#]?|[a-h]x?[a-h]?[1-8](?:=[NBRQK])?[+#]?|O-O-O[+#]?|O-O[+#]?)`;
// One white move + optional black response
const HALF_MOVE_PAIR = `${MOVE_TOKEN}(?:\\s+${MOVE_TOKEN})?`;
// Full numbered line: "1. e4 e5 2. Nf3 Nc6 ..." (also handles "3...dxc4" with no space)
const LINE_PATTERN_SRC = `\\b\\d+\\.{1,3}\\s*${HALF_MOVE_PAIR}(?:\\s+\\d+\\.{1,3}\\s*${HALF_MOVE_PAIR})*`;
const LINE_PATTERN = new RegExp(LINE_PATTERN_SRC, "g");

// Matches piece moves in SAN (for inline highlighting in plain text)
const PIECE_MOVE_PATTERN =
  /\b([NBRQK][a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQK])?[+#]?|[a-h]x[a-h][1-8](?:=[NBRQK])?[+#]?)\b/g;

// Matches bare square references like "e4", "f3"
const SQUARE_PATTERN = /\b([a-h][1-8])\b/g;

/** Strip annotation symbols that chess.js won't accept */
function cleanToken(token: string): string {
  return token.replace(/[!?]/g, "");
}

/** Extract move tokens from a numbered move sequence, stripping move numbers.
 *  Handles fused tokens like "3...dxc4" by splitting off the number+dots prefix. */
function extractMoveTokens(lineText: string): string[] {
  return lineText
    .trim()
    .split(/\s+/)
    .flatMap((t) => {
      // Pure move number like "3." or "3..." → drop
      if (/^\d+\.+$/.test(t)) return [];
      // Fused token like "3...dxc4" → strip number+dots prefix
      const fused = t.match(/^\d+\.{1,3}(.+)$/);
      if (fused) return [fused[1]];
      return [t];
    })
    .map(cleanToken)
    .filter((t) => t.length > 0);
}

/**
 * Try to play the tokens from each provided FEN (in order).
 * Returns [canonicalMoves, usedFen] for the first FEN that works, else null.
 */
function tryPlayLine(
  tokens: string[],
  ...fens: string[]
): [string[], string] | null {
  for (const fen of fens) {
    try {
      const chess: InstanceType<typeof Chess> = new Chess(fen);
      const results: string[] = [];
      let ok = true;
      for (const token of tokens) {
        const result = chess.move(token);
        if (!result) {
          ok = false;
          break;
        }
        results.push(result.san);
      }
      if (ok) return [results, fen];
    } catch {
      // try next fen
    }
  }
  return null;
}

/** Extract the destination square from a SAN move string */
function destinationSquare(san: string): string | null {
  // Skip castling for simplicity (destination depends on color context)
  if (san.startsWith("O-O")) return null;
  const matches = san.match(/[a-h][1-8]/g);
  return matches ? matches[matches.length - 1] : null;
}

/**
 * Resolve the origin square for a SAN move against the given FEN.
 * Returns the `from` square if the move is legal, otherwise null.
 */
function resolveFromSquare(san: string, fen: string): string | null {
  try {
    const chess: InstanceType<typeof Chess> = new Chess(fen);
    const result = chess.move(cleanToken(san));
    return result ? result.from : null;
  } catch {
    return null;
  }
}

/**
 * Parse a plain-text segment into interactive segments (squares + piece moves).
 * Does NOT detect numbered move lines — those should be stripped first.
 *
 * @param fens  FENs to try when resolving origin squares (in priority order).
 *              A sequential "running FEN" is also maintained so that future
 *              moves mentioned after earlier ones can be resolved.
 */
function parseInlineRefs(text: string, fens: string[]): Segment[] {
  if (!text) return [];

  const intervals: {
    start: number;
    end: number;
    seg: Segment;
  }[] = [];

  // Find piece move references (e.g. "Nf3", "Bxe4+", "exd5")
  PIECE_MOVE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PIECE_MOVE_PATTERN.exec(text)) !== null) {
    const dest = destinationSquare(m[1]);
    if (dest) {
      intervals.push({
        start: m.index,
        end: m.index + m[0].length,
        seg: { type: "move", value: m[0], square: dest },
      });
    }
  }

  // Find bare square references — skip positions already covered by a piece move
  SQUARE_PATTERN.lastIndex = 0;
  while ((m = SQUARE_PATTERN.exec(text)) !== null) {
    const overlaps = intervals.some(
      (iv) => m!.index >= iv.start && m!.index < iv.end
    );
    if (!overlaps) {
      intervals.push({
        start: m.index,
        end: m.index + m[0].length,
        seg: { type: "square", value: m[0], square: m[1] },
      });
    }
  }

  intervals.sort((a, b) => a.start - b.start);

  // Sequential forward-resolution pass: try each move from the provided FENs,
  // then from a running position that advances as moves are successfully played.
  // This lets future moves (e.g. "...dxc4 followed by Nf3") resolve correctly.
  if (fens.length > 0) {
    let runningFen: string | null = null;
    for (const iv of intervals) {
      if (iv.seg.type !== "move") continue;
      const san = iv.seg.value;
      let from: string | null = null;
      let usedFen: string | null = null;

      // Try each provided FEN first
      for (const fen of fens) {
        from = resolveFromSquare(san, fen);
        if (from) { usedFen = fen; break; }
      }
      // Fall back to running FEN (built from previous moves)
      if (!from && runningFen) {
        from = resolveFromSquare(san, runningFen);
        if (from) usedFen = runningFen;
      }

      if (from && usedFen) {
        iv.seg = { ...iv.seg, fromSquare: from };
        // Advance the running FEN so subsequent moves can resolve
        try {
          const chess: InstanceType<typeof Chess> = new Chess(usedFen);
          chess.move(cleanToken(san));
          runningFen = chess.fen();
        } catch {
          // couldn't advance — keep previous runningFen
        }
      }
    }
  }

  const segments: Segment[] = [];
  let pos = 0;
  for (const iv of intervals) {
    if (iv.start > pos) {
      segments.push({ type: "text", value: text.slice(pos, iv.start) });
    }
    segments.push(iv.seg);
    pos = iv.end;
  }
  if (pos < text.length) {
    segments.push({ type: "text", value: text.slice(pos) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}

/**
 * Parse an AI message text into interactive segments.
 *
 * - Numbered move sequences (e.g. "1. e4 e5 2. Nf3 Nc6") become clickable line chips.
 *   Validated against `currentFen` first, then the starting position as fallback.
 * - Individual square refs (e.g. "e4") and SAN piece moves (e.g. "Nf3") become hover-highlights.
 *
 * @param text      Raw text to parse (a single text node from react-markdown)
 * @param currentFen FEN for the board position before the current move
 * @param afterFen  Optional FEN for the position after the current move
 */
export function parseChessReferences(
  text: string,
  currentFen: string,
  afterFen?: string,
): Segment[] {
  // Build ordered list of FENs to try when validating moves / lines
  const fens = [currentFen, ...(afterFen ? [afterFen] : []), STARTING_FEN];

  // Step 1: locate valid numbered move lines
  LINE_PATTERN.lastIndex = 0;
  const lineMatches: {
    start: number;
    end: number;
    value: string;
    moves: string[];
    fromFen: string;
  }[] = [];

  let m: RegExpExecArray | null;
  while ((m = LINE_PATTERN.exec(text)) !== null) {
    const tokens = extractMoveTokens(m[0]);
    if (tokens.length === 0) continue;
    const result = tryPlayLine(tokens, ...fens);
    if (result) {
      lineMatches.push({
        start: m.index,
        end: m.index + m[0].length,
        value: m[0].trim(),
        moves: result[0],
        fromFen: result[1],
      });
    }
  }

  // FENs for inline move resolution (exclude STARTING_FEN — it would
  // give misleading arrows for moves that happen to be legal from the start)
  const inlineFens = [currentFen, ...(afterFen ? [afterFen] : [])];

  // Step 2: emit inline refs for text between / around line matches
  const segments: Segment[] = [];
  let pos = 0;
  for (const lm of lineMatches) {
    if (lm.start > pos) {
      segments.push(...parseInlineRefs(text.slice(pos, lm.start), inlineFens));
    }
    segments.push({
      type: "line",
      value: lm.value,
      moves: lm.moves,
      fromFen: lm.fromFen,
    });
    pos = lm.end;
  }
  if (pos < text.length) {
    segments.push(...parseInlineRefs(text.slice(pos), inlineFens));
  }

  return segments;
}
