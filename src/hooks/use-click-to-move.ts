import { useState, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import { Chess, type Square } from "chess.js";

const SELECTED_COLOR = "rgba(255, 255, 0, 0.4)";
const LEGAL_DOT = "radial-gradient(circle, rgba(0,0,0,0.25) 25%, transparent 25%)";
const LEGAL_CAPTURE_RING =
  "radial-gradient(circle, transparent 55%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.25) 68%, transparent 68%)";

type OnMoveAttempt = (from: string, to: string) => boolean;

export function useClickToMove({
  fen,
  enabled,
  onMoveAttempt,
}: {
  fen: string;
  enabled: boolean;
  onMoveAttempt: OnMoveAttempt;
}) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  const legalMoves = useMemo(() => {
    if (!selectedSquare || !enabled) return [];
    try {
      const chess = new Chess(fen);
      return chess.moves({ square: selectedSquare as Square, verbose: true });
    } catch {
      return [];
    }
  }, [selectedSquare, fen, enabled]);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
  }, []);

  const handleSquareClick = useCallback(
    ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (!enabled) return;

      // If a piece is already selected and this square is a legal target → attempt the move
      if (selectedSquare && selectedSquare !== square) {
        const isLegalTarget = legalMoves.some((m) => m.to === square);
        if (isLegalTarget) {
          const accepted = onMoveAttempt(selectedSquare, square);
          setSelectedSquare(null);
          if (accepted) return;
          // If rejected (e.g. wrong answer in drill but still legal chess),
          // fall through to clear
        }
      }

      // Click on own piece → select it (or toggle off if same square)
      if (piece) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
        } else {
          // Only select if it's the side to move's piece
          try {
            const chess = new Chess(fen);
            const sideToMove = chess.turn(); // 'w' or 'b'
            const pieceOnSquare = chess.get(square as Square);
            if (pieceOnSquare && pieceOnSquare.color === sideToMove) {
              setSelectedSquare(square);
            } else {
              setSelectedSquare(null);
            }
          } catch {
            setSelectedSquare(null);
          }
        }
      } else {
        // Clicked empty square that wasn't a legal target → deselect
        setSelectedSquare(null);
      }
    },
    [enabled, selectedSquare, legalMoves, onMoveAttempt, fen]
  );

  const clickToMoveStyles = useMemo((): Record<string, CSSProperties> => {
    if (!selectedSquare || !enabled) return {};
    const styles: Record<string, CSSProperties> = {
      [selectedSquare]: { background: SELECTED_COLOR },
    };
    for (const move of legalMoves) {
      const isCapture = move.captured !== undefined;
      styles[move.to] = {
        background: isCapture ? LEGAL_CAPTURE_RING : LEGAL_DOT,
      };
    }
    return styles;
  }, [selectedSquare, legalMoves, enabled]);

  return {
    selectedSquare,
    clearSelection,
    handleSquareClick,
    clickToMoveStyles,
  };
}
