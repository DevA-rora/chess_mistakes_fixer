import { useState, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";

// Match react-chessboard default arrow colors exactly
const ORANGE = "rgba(255, 170, 0, 0.8)";  // #ffaa00 — default arrow
const GREEN  = "rgba(76, 175, 80, 0.8)";   // #4caf50 — shift arrow

function circleStyle(color: string): CSSProperties {
  return {
    background: `radial-gradient(circle, transparent 55%, ${color} 55%, ${color} 76%, transparent 76%)`,
  };
}

type CircleColor = "orange" | "green";

/** Walk up the DOM from `el` and return the first `data-square` value found. */
function getSquareFromElement(el: Element | null): string | null {
  let node: Element | null = el;
  while (node) {
    const sq = node.getAttribute("data-square");
    if (sq) return sq;
    node = node.parentElement;
  }
  return null;
}

export function useSquareHighlights() {
  const [circledSquares, setCircledSquares] = useState<Map<string, CircleColor>>(
    new Map()
  );

  /**
   * Wire to onSquareMouseDown.
   *
   * On right-mousedown we attach a one-shot global mouseup listener.
   * When mouseup fires we check where the cursor ended:
   *   - same square  → pure right-click → toggle circle
   *   - diff square  → the user dragged an arrow → do nothing
   *
   * This completely bypasses onSquareRightClick, which fires from the
   * contextmenu event. On macOS, contextmenu can fire on mousedown rather
   * than mouseup, making it impossible to distinguish a click from a drag
   * at that point.
   */
  const handleSquareMouseDown = useCallback(
    ({ square }: { square: string; piece: unknown }, e: React.MouseEvent) => {
      if (e.button !== 2) return;

      const startSquare = square;
      const shift = e.shiftKey;

      const onGlobalMouseUp = (upEvent: MouseEvent) => {
        const endSquare = getSquareFromElement(
          document.elementFromPoint(upEvent.clientX, upEvent.clientY)
        );

        // Only circle when mouse released on the same square (no drag)
        if (endSquare === startSquare) {
          const color: CircleColor = shift ? "green" : "orange";
          setCircledSquares((prev) => {
            const next = new Map(prev);
            if (next.get(startSquare) === color) {
              next.delete(startSquare); // same color → toggle off
            } else {
              next.set(startSquare, color); // new or different color → set
            }
            return next;
          });
        }
      };

      window.addEventListener("mouseup", onGlobalMouseUp, { once: true });
    },
    []
  );

  const clearHighlights = useCallback(() => {
    setCircledSquares((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const highlightStyles = useMemo((): Record<string, CSSProperties> => {
    const styles: Record<string, CSSProperties> = {};
    circledSquares.forEach((color, sq) => {
      styles[sq] = circleStyle(color === "green" ? GREEN : ORANGE);
    });
    return styles;
  }, [circledSquares]);

  return {
    circledSquares,
    handleSquareMouseDown,
    clearHighlights,
    highlightStyles,
  };
}
