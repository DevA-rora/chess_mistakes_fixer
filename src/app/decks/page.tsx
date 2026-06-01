"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, Bot, Pencil, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { CardStatus, Flashcard, MistakeType } from "@/lib/mock-data";
import type { CardOperation } from "@/lib/card-manager";
import { useFlashcardsStore } from "@/hooks/use-flashcards-store";
import { useGamesStore } from "@/hooks/use-games-store";
import { RequireAuth } from "@/components/require-auth";

type ChatMessage = { role: "user" | "ai"; content: string };

function isoToday() {
  return new Date().toISOString().split("T")[0];
}

const statuses: CardStatus[] = ["new", "learning", "review", "mastered"];
const mistakeTypes: MistakeType[] = ["blunder", "mistake", "inaccuracy"];

export default function DecksPage() {
  return (
    <RequireAuth title="Sign in to see your decks" description="Your flashcard decks live in your account.">
      <DecksPageContent />
    </RequireAuth>
  );
}

function DecksPageContent() {
  const {
    flashcards,
    createFlashcard,
    updateFlashcard,
    removeFlashcard,
    applyFlashcardOperations,
  } = useFlashcardsStore();
  const { games } = useGamesStore();

  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    flashcards[0]?.id ?? null
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingOps, setPendingOps] = useState<CardOperation[]>([]);

  const deckOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    for (const card of flashcards) {
      const game = games.find((g) => g.id === card.gameId);
      const label = game ? `vs ${game.opponent} (${game.date})` : card.gameId;
      const prev = map.get(card.gameId);
      map.set(card.gameId, {
        id: card.gameId,
        label,
        count: (prev?.count ?? 0) + 1,
      });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [flashcards, games]);

  const filteredCards = useMemo(() => {
    if (deckFilter === "all") return flashcards;
    return flashcards.filter((c) => c.gameId === deckFilter);
  }, [flashcards, deckFilter]);

  const selectedCard = useMemo(
    () => filteredCards.find((c) => c.id === selectedCardId) ?? filteredCards[0] ?? null,
    [filteredCards, selectedCardId]
  );

  const manualDraft = selectedCard;

  const updateSelected = <K extends keyof Flashcard>(key: K, value: Flashcard[K]) => {
    if (!selectedCard) return;
    updateFlashcard(selectedCard.id, { [key]: value } as Partial<Flashcard>);
  };

  const handleCreateCard = () => {
    const fallbackDeck = deckFilter !== "all" ? deckFilter : deckOptions[0]?.id;
    const game = games.find((g) => g.id === fallbackDeck);
    const id = `manual-${Date.now()}`;
    const newCard: Flashcard = {
      id,
      gameId: fallbackDeck ?? "manual-deck",
      opponent: game?.opponent ?? "Manual Deck",
      moveNumber: 1,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      yourMove: "e4",
      bestMove: "d4",
      evaluation: "0.0",
      mistakeType: "inaccuracy",
      explanation: "Edit this card manually.",
      status: "new",
      nextReview: isoToday(),
      interval: 0,
      easeFactor: 2.5,
    };

    createFlashcard(newCard);
    setSelectedCardId(id);
  };

  const handleDeleteCard = () => {
    if (!selectedCard) return;
    removeFlashcard(selectedCard.id);
    setSelectedCardId(null);
  };

  const handleAskAI = async () => {
    const instruction = aiInput.trim();
    if (!instruction || aiLoading) return;

    const nextMessages = [...messages, { role: "user" as const, content: instruction }];
    setMessages(nextMessages);
    setAiInput("");
    setAiLoading(true);

    try {
      const res = await fetch("/api/cards/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          cards: filteredCards,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessages([
          ...nextMessages,
          { role: "ai", content: data.error || "Failed to generate AI changes." },
        ]);
        return;
      }

      const ops = Array.isArray(data.operations) ? (data.operations as CardOperation[]) : [];
      setPendingOps(ops);
      setMessages([
        ...nextMessages,
        {
          role: "ai",
          content:
            `${data.summary || "I prepared changes for your cards."}\n` +
            (ops.length > 0
              ? `Ready to apply ${ops.length} operation${ops.length === 1 ? "" : "s"}.`
              : "No safe operations were generated."),
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        { role: "ai", content: "Network error while contacting AI manager." },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyPending = () => {
    if (pendingOps.length === 0) return;
    applyFlashcardOperations(pendingOps);
    setMessages((prev) => [
      ...prev,
      {
        role: "ai",
        content: `Applied ${pendingOps.length} operation${pendingOps.length === 1 ? "" : "s"}.`,
      },
    ]);
    setPendingOps([]);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-4rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Deck Manager</h1>
          <p className="text-sm text-muted-foreground">
            Edit your cards manually (Anki-style) or ask AI to apply bulk changes.
          </p>
        </div>
        <Link href="/drill">
          <Button variant="outline" className="cursor-pointer gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Practice
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_380px] gap-4 min-h-0 flex-1">
        <Card className="min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Decks</CardTitle>
          </CardHeader>
          <CardContent className="h-full flex flex-col gap-3">
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button className="w-full cursor-pointer gap-2" onClick={handleCreateCard}>
                <Plus className="h-4 w-4" />
                New Card
              </Button>
            </motion.div>

            <div className="space-y-2">
              <button
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                  deckFilter === "all" ? "bg-primary/15 border-primary/30" : "bg-background border-border hover:bg-muted/40"
                }`}
                onClick={() => setDeckFilter("all")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">All cards</span>
                  <Badge variant="outline">{flashcards.length}</Badge>
                </div>
              </button>

              <ScrollArea className="h-36">
                <div className="space-y-2 pr-2">
                  {deckOptions.map((deck) => (
                    <button
                      key={deck.id}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                        deckFilter === deck.id
                          ? "bg-primary/15 border-primary/30"
                          : "bg-background border-border hover:bg-muted/40"
                      }`}
                      onClick={() => setDeckFilter(deck.id)}
                    >
                      <div className="text-sm font-medium truncate">{deck.label}</div>
                      <div className="text-xs text-muted-foreground">{deck.count} cards</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="pt-2 border-t border-border min-h-0 flex-1 flex flex-col">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Cards in selection
              </h3>
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {filteredCards.map((card) => (
                    <button
                      key={card.id}
                      className={`w-full text-left px-2.5 py-2 rounded-md border transition-colors cursor-pointer ${
                        selectedCard?.id === card.id
                          ? "bg-primary/15 border-primary/30"
                          : "bg-background border-border hover:bg-muted/40"
                      }`}
                      onClick={() => setSelectedCardId(card.id)}
                    >
                      <div className="font-mono text-xs">#{card.moveNumber} · {card.yourMove} → {card.bestMove}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{card.explanation}</div>
                    </button>
                  ))}
                  {filteredCards.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No cards in this deck.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Manual Editor
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 h-full">
            {!manualDraft ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                Select or create a card to edit.
              </div>
            ) : (
              <ScrollArea className="h-full pr-2">
                <div className="space-y-3 pb-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Your move</label>
                      <Input
                        value={manualDraft.yourMove}
                        onChange={(e) => updateSelected("yourMove", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Best move</label>
                      <Input
                        value={manualDraft.bestMove}
                        onChange={(e) => updateSelected("bestMove", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Mistake type</label>
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                        value={manualDraft.mistakeType}
                        onChange={(e) => updateSelected("mistakeType", e.target.value as MistakeType)}
                      >
                        {mistakeTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Status</label>
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                        value={manualDraft.status}
                        onChange={(e) => updateSelected("status", e.target.value as CardStatus)}
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Move #</label>
                      <Input
                        type="number"
                        value={manualDraft.moveNumber}
                        onChange={(e) => updateSelected("moveNumber", Number(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Interval</label>
                      <Input
                        type="number"
                        value={manualDraft.interval}
                        onChange={(e) => updateSelected("interval", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Ease</label>
                      <Input
                        type="number"
                        step="0.05"
                        value={manualDraft.easeFactor}
                        onChange={(e) => updateSelected("easeFactor", Number(e.target.value) || 1.3)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Evaluation</label>
                      <Input
                        value={manualDraft.evaluation}
                        onChange={(e) => updateSelected("evaluation", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Next review</label>
                      <Input
                        type="date"
                        value={manualDraft.nextReview}
                        onChange={(e) => updateSelected("nextReview", e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Position (FEN)</label>
                    <Input value={manualDraft.fen} onChange={(e) => updateSelected("fen", e.target.value)} />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Explanation (Anki-style back)</label>
                    <Textarea
                      rows={5}
                      value={manualDraft.explanation}
                      onChange={(e) => updateSelected("explanation", e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <motion.div whileTap={{ scale: 0.98 }}>
                      <Button className="cursor-pointer gap-2" onClick={() => setSelectedCardId(manualDraft.id)}>
                        <Save className="h-4 w-4" />
                        Saved
                      </Button>
                    </motion.div>
                    <motion.div whileTap={{ scale: 0.98 }}>
                      <Button variant="destructive" className="cursor-pointer gap-2" onClick={handleDeleteCard}>
                        <Trash2 className="h-4 w-4" />
                        Delete Card
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI Deck Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="h-full flex flex-col gap-3 min-h-0">
            <div className="text-xs text-muted-foreground">
              Ask in plain language: “mark all blunder cards as mastered”, “set all cards due today”, “delete blunder cards”, etc.
            </div>

            <ScrollArea className="flex-1 border border-border rounded-lg p-2">
              <div className="space-y-2 pr-1">
                {messages.map((m, i) => (
                  <div key={i} className={`rounded-md px-2.5 py-2 text-xs ${m.role === "user" ? "bg-primary/15" : "bg-muted/50"}`}>
                    <div className="font-semibold mb-1">{m.role === "user" ? "You" : "AI"}</div>
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No AI instructions yet.</p>
                )}
              </div>
            </ScrollArea>

            <Textarea
              rows={3}
              placeholder="Tell AI what to change in this deck..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
            />

            <div className="flex items-center gap-2">
              <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                <Button className="w-full cursor-pointer gap-2" onClick={handleAskAI} disabled={aiLoading || !aiInput.trim()}>
                  <Sparkles className="h-4 w-4" />
                  {aiLoading ? "Thinking..." : "Generate Changes"}
                </Button>
              </motion.div>
              <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                <Button
                  variant="outline"
                  className="w-full cursor-pointer"
                  disabled={pendingOps.length === 0}
                  onClick={handleApplyPending}
                >
                  Apply ({pendingOps.length})
                </Button>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
