import type { Flashcard } from "@/lib/mock-data";

export type CardOperation =
  | { type: "update"; id: string; updates: Partial<Flashcard> }
  | { type: "delete"; id: string }
  | { type: "create"; card: Flashcard };

export function applyCardOperations(
  cards: Flashcard[],
  operations: CardOperation[]
): Flashcard[] {
  let next = [...cards];

  for (const op of operations) {
    if (op.type === "update") {
      next = next.map((card) =>
        card.id === op.id ? { ...card, ...op.updates } : card
      );
      continue;
    }

    if (op.type === "delete") {
      next = next.filter((card) => card.id !== op.id);
      continue;
    }

    if (op.type === "create") {
      const exists = next.some((card) => card.id === op.card.id);
      if (!exists) {
        next = [op.card, ...next];
      }
    }
  }

  return next;
}
