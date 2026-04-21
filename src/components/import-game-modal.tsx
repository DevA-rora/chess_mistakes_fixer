"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Chess } from "chess.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Download } from "lucide-react";
import type { Game } from "@/lib/mock-data";
import { useSettingsStore } from "@/hooks/use-settings-store";

type Format = "PGN" | "FEN";

const formats: Format[] = ["PGN", "FEN"];

export function ImportGameModal({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (game: Game) => void;
}) {
  const [format, setFormat] = useState<Format>("PGN");
  const [value, setValue] = useState("");
  const { settings } = useSettingsStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a game</DialogTitle>
          <DialogDescription>
            Paste your game in {format} format below.
          </DialogDescription>
        </DialogHeader>

        {/* Segmented toggle */}
        <div className="relative flex h-10 w-full rounded-lg bg-muted p-1">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFormat(f);
                setValue("");
              }}
              className="relative z-10 flex-1 cursor-pointer text-sm font-medium transition-colors duration-200"
              style={{
                color:
                  format === f
                    ? "var(--primary-foreground)"
                    : "var(--muted-foreground)",
              }}
            >
              {f}
            </button>
          ))}

          {/* Animated highlight pill */}
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute top-1 bottom-1 rounded-md bg-primary"
            style={{
              width: `${100 / formats.length}%`,
              left: `${(formats.indexOf(format) * 100) / formats.length}%`,
            }}
          />
        </div>

        <Textarea
          placeholder={
            format === "PGN"
              ? `[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2025.11.14"]\n[Round "?"]\n[White "QweryPleaseMe"]\n[Black "utkulukluluk"]\n[Result "1-0"]\n[TimeControl "60+1"]\n[WhiteElo "628"]\n[BlackElo "587"]\n[Termination "QweryPleaseMe won - game abandoned"]\n[ECO "D07"]\n[EndTime "9:40:48 GMT+0000"]\n[Link "https://www.chess.com/game/live/145495811202?move=0"]\n\n1. d4 d5 2. c4 Nc6 3. Nc3 dxc4 4. e4 Nf6 5. Bxc4 e6 6. Nf3 Bd6 7. Bg5 h6 8. e5 hxg5 9. exd6 Qxd6 10. O-O e5 11. d5 Nb4 12. a3 Nbxd5 13. Bxd5 Nxd5 14. Nxg5 Nxc3 15. Qxd6 cxd6 16. bxc3 O-O 17. Rad1 Rd8 18. Rfe1 Bf5 19. h3 Bc2 20. Rd2 Bh7 21. c4 f6 22. Ne6 Re8 23. Rxd6 Rad8 24. Rxd8 1-0`
              : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={format === "PGN" ? 10 : 2}
          className="font-mono text-sm"
        />

        <DialogFooter>
          <Button
            disabled={!value.trim()}
            onClick={() => {
              const trimmed = value.trim();
              const id = `game-${Date.now()}`;
              const today = new Date().toISOString().slice(0, 10);

              let pgn = trimmed;
              let opponent = "Unknown";
              let opponentRating = 0;
              let playerRating = 0;
              let playerColor: Game["playerColor"] = "white";
              let result: Game["result"] = "draw";
              let timeControl = "—";
              let date = today;
              let playerTimeLeftParsed = "—";
              let opponentTimeLeftParsed = "—";

              if (format === "PGN") {
                // Parse headers manually first (chess.js may reject some PGNs)
                const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
                const headers: Record<string, string> = {};
                let m;
                while ((m = headerRegex.exec(trimmed)) !== null) {
                  headers[m[1]] = m[2];
                }

                // Try loading via chess.js for validation; merge any extra headers
                try {
                  const chess = new Chess();
                  chess.loadPgn(trimmed);
                  const parsed = chess.header();
                  for (const [k, v] of Object.entries(parsed)) {
                    if (v) headers[k] = v;
                  }
                } catch {
                  // Header-only parse is still usable
                }

                // Detect player color from connected usernames
                const white = headers["White"] || "";
                const black = headers["Black"] || "";
                const connectedNames = [
                  settings.chessComUsername,
                  settings.lichessUsername,
                ].filter(Boolean).map((n) => n!.toLowerCase());

                if (connectedNames.length > 0 && white && black) {
                  if (connectedNames.includes(black.toLowerCase())) {
                    playerColor = "black";
                    opponent = white;
                  } else {
                    playerColor = "white";
                    opponent = black;
                  }
                } else if (white && black) {
                  // No connected account — default to white
                  opponent = black;
                } else if (black) {
                  opponent = black;
                } else if (white) {
                  opponent = white;
                }

                // Ratings — based on detected player color
                if (playerColor === "black") {
                  if (headers["BlackElo"]) playerRating = parseInt(headers["BlackElo"], 10) || 0;
                  if (headers["WhiteElo"]) opponentRating = parseInt(headers["WhiteElo"], 10) || 0;
                } else {
                  if (headers["BlackElo"]) opponentRating = parseInt(headers["BlackElo"], 10) || 0;
                  if (headers["WhiteElo"]) playerRating = parseInt(headers["WhiteElo"], 10) || 0;
                }

                // Result — based on detected player color
                const r = headers["Result"];
                if (playerColor === "white") {
                  if (r === "1-0") result = "win";
                  else if (r === "0-1") result = "loss";
                  else result = "draw";
                } else {
                  if (r === "0-1") result = "win";
                  else if (r === "1-0") result = "loss";
                  else result = "draw";
                }

                // Date (PGN uses "2026.04.10" or "????.??.??")
                if (headers["Date"] && !headers["Date"].includes("?")) {
                  date = headers["Date"].replace(/\./g, "-");
                }

                // Time control — convert seconds to human-friendly
                if (headers["TimeControl"] && headers["TimeControl"] !== "-") {
                  const tc = headers["TimeControl"];
                  const parts = tc.split("+");
                  const base = parseInt(parts[0], 10);
                  const inc = parts[1] ? parseInt(parts[1], 10) : 0;
                  if (!isNaN(base)) {
                    const mins = Math.floor(base / 60);
                    let label = "Custom";
                    if (mins <= 2) label = "Bullet";
                    else if (mins <= 5) label = "Blitz";
                    else if (mins <= 15) label = "Rapid";
                    else label = "Classical";
                    timeControl = `${label} ${mins}+${inc}`;
                  } else {
                    timeControl = tc;
                  }
                }

                // Extract per-move clock times from PGN comments
                const clockRegex = /\[%clk\s+(\d+:\d{2}:\d{2}(?:\.\d+)?)\]/g;
                const clocks: string[] = [];
                let cm;
                while ((cm = clockRegex.exec(trimmed)) !== null) {
                  clocks.push(cm[1]);
                }
                if (clocks.length >= 2) {
                  // Clocks alternate: white move 1, black move 1, white move 2, ...
                  const lastWhiteClock = clocks.filter((_, i) => i % 2 === 0).pop();
                  const lastBlackClock = clocks.filter((_, i) => i % 2 === 1).pop();
                  if (playerColor === "white") {
                    playerTimeLeftParsed = lastWhiteClock ?? "—";
                    opponentTimeLeftParsed = lastBlackClock ?? "—";
                  } else {
                    playerTimeLeftParsed = lastBlackClock ?? "—";
                    opponentTimeLeftParsed = lastWhiteClock ?? "—";
                  }
                }
              } else {
                // FEN — single position, minimal metadata
                try {
                  new Chess(trimmed); // validate
                } catch {
                  pgn = "";
                }
                opponent = "Position";
                timeControl = "FEN";
              }

              const game: Game = {
                id,
                opponent,
                opponentRating,
                playerRating,
                playerColor,
                date,
                timeControl,
                playerTimeLeft: playerTimeLeftParsed,
                opponentTimeLeft: opponentTimeLeftParsed,
                result,
                blunders: 0,
                mistakes: 0,
                inaccuracies: 0,
                mistakesFixed: 0,
                totalMistakes: 0,
                pgn,
                reviewStatus: "not-reviewed",
              };

              onImport(game);
              setValue("");
              setFormat("PGN");
              onOpenChange(false);
            }}
            className="cursor-pointer"
          >
            <Download className="mr-2 h-4 w-4" />
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
