"use client";

import type React from "react";
import { defaultPieces } from "react-chessboard";

type PieceProps = {
  fill?: string;
  square?: string;
  svgStyle?: React.CSSProperties;
};

const WHITE_FILL = "#f0e6d0"; // warm cream instead of pure white
const BLACK_FILL = "#1c1816"; // warm near-black instead of pure black

const PIECE_KEYS = [
  "wP", "wN", "wB", "wR", "wQ", "wK",
  "bP", "bN", "bB", "bR", "bQ", "bK",
] as const;

export const styledPieces: Record<
  string,
  (props?: PieceProps) => React.JSX.Element
> = {};

for (const key of PIECE_KEYS) {
  const Default = defaultPieces[key];
  const fill = key.startsWith("w") ? WHITE_FILL : BLACK_FILL;

  styledPieces[key] = (props?: PieceProps) =>
    Default({ ...props, fill: props?.fill ?? fill });
}
